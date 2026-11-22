/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * Shared PostgreSQL Repository Helpers, Audit Logging & Derived Financial Math
 */

import crypto from 'node:crypto';
import type { Response } from 'express';
import type { PoolClient } from 'pg';
import type { TreatmentPackage, User, UserRole } from '../../src/types/index.ts';
import { pgQuery } from '../db/pgPool.ts';

export function sendPgSuccess(
  res: Response,
  data: unknown,
  metaExtras: Record<string, unknown> = {},
  statusCode = 200
) {
  const requestId = crypto.randomUUID();
  return res.status(statusCode).json({
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      ...metaExtras,
    },
  });
}

export function sendPgError(
  res: Response,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown
) {
  const requestId = crypto.randomUUID();
  return res.status(statusCode).json({
    error: {
      code,
      message,
      details,
      requestId,
    },
  });
}

export function toNumber(val: unknown, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

export function toIsoString(val: unknown): string {
  if (!val) return new Date().toISOString();
  if (val instanceof Date) return val.toISOString();
  return String(val);
}

export function toDateOnly(val: unknown): string {
  if (!val) return '';
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const str = String(val);
  return str.includes('T') ? str.slice(0, 10) : str;
}

export function generateCode(prefix: string): string {
  const year = new Date().getFullYear();
  const rand = crypto.randomInt(1000, 9999);
  const suffix = Date.now().toString().slice(-3);
  return `${prefix}-${year}-${rand}${suffix}`;
}

export interface ResolvedBranchRef {
  id: string;
  name: string;
  code: string;
}

export async function pgResolveBranch(
  preferredBranchId?: string | null,
  client?: PoolClient
): Promise<ResolvedBranchRef | null> {
  const exec = <T extends Record<string, unknown>>(sql: string, params: unknown[]) =>
    client ? client.query<T>(sql, params) : pgQuery<T>(sql, params);

  const trimmed = preferredBranchId?.trim();
  if (trimmed) {
    const exact = await exec<{ id: string; name: string; code: string }>(
      'SELECT id, name, code FROM branches WHERE id = $1 LIMIT 1',
      [trimmed]
    );
    if (exact.rows[0]) {
      return {
        id: String(exact.rows[0].id),
        name: String(exact.rows[0].name),
        code: String(exact.rows[0].code),
      };
    }
  }

  const active = await exec<{ id: string; name: string; code: string }>(
    'SELECT id, name, code FROM branches WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 1',
    []
  );
  if (active.rows[0]) {
    return {
      id: String(active.rows[0].id),
      name: String(active.rows[0].name),
      code: String(active.rows[0].code),
    };
  }

  const anyRow = await exec<{ id: string; name: string; code: string }>(
    'SELECT id, name, code FROM branches ORDER BY created_at ASC LIMIT 1',
    []
  );
  if (anyRow.rows[0]) {
    return {
      id: String(anyRow.rows[0].id),
      name: String(anyRow.rows[0].name),
      code: String(anyRow.rows[0].code),
    };
  }

  return null;
}

export async function pgRequireBranch(
  preferredBranchId?: string | null,
  client?: PoolClient
): Promise<ResolvedBranchRef> {
  const branch = await pgResolveBranch(preferredBranchId, client);
  if (!branch) {
    const err = new Error('No clinic branch is configured in PostgreSQL. Create a branch first.') as Error & {
      statusCode?: number;
      code?: string;
    };
    err.statusCode = 400;
    err.code = 'NO_BRANCH_CONFIGURED';
    throw err;
  }
  return branch;
}

export async function pgLogAuditEvent(
  actor: Pick<User, 'id' | 'name' | 'role' | 'branchId'>,
  action: string,
  resourceType: string,
  resourceId: string,
  details: string,
  ipAddress = '127.0.0.1',
  client?: PoolClient
): Promise<void> {
  const id = `aud-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const sql = `
    INSERT INTO audit_events (
      id, occurred_at, user_id, user_name, user_role,
      action, resource_type, resource_id, details, ip_address, branch_id
    )
    VALUES ($1, NOW(), $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `;
  const params = [
    id,
    actor.id,
    actor.name,
    actor.role,
    action,
    resourceType,
    resourceId,
    details,
    ipAddress,
    actor.branchId || '',
  ];
  if (client) {
    await client.query(sql, params);
  } else {
    await pgQuery(sql, params);
  }
}

export async function pgLogSecurityEvent(
  actor: Pick<User, 'id' | 'name' | 'role'>,
  action:
    | 'LOGIN'
    | 'LOGOUT'
    | 'PASSWORD_RESET'
    | 'ROLE_CHANGED'
    | 'STATUS_CHANGED'
    | 'PERMISSION_OVERRIDE'
    | 'EXPORT_DATA',
  details: string,
  status: 'success' | 'failed' | 'flagged' = 'success',
  ipAddress = '127.0.0.1',
  deviceInfo = 'Clinical CRM Console',
  client?: PoolClient
): Promise<void> {
  const id = `sec-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const sql = `
    INSERT INTO user_security_logs (
      id, user_id, user_name, role, action, ip_address, device_info, status, details, occurred_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
  `;
  const params = [id, actor.id, actor.name, actor.role, action, ipAddress, deviceInfo, status, details];
  if (client) {
    await client.query(sql, params);
  } else {
    await pgQuery(sql, params);
  }
}

/**
 * Computes derived package financials strictly from valid payment_records total.
 * Enforces Hard Rule: a session can never be unlocked or deducted on due.
 */
export function applyPackageFinancials(
  pkg: TreatmentPackage,
  derivedPaidBDT: number
): TreatmentPackage {
  const perSessionPriceBDT =
    pkg.totalSessions > 0 ? Math.round((pkg.priceBDT / pkg.totalSessions) * 100) / 100 : 0;
  const paidAmountBDT = Math.max(0, Math.round(derivedPaidBDT * 100) / 100);
  const dueAmountBDT = Math.max(0, Math.round((pkg.priceBDT - paidAmountBDT) * 100) / 100);

  const unlockedSessions =
    perSessionPriceBDT > 0
      ? Math.min(pkg.totalSessions, Math.floor((paidAmountBDT + 0.01) / perSessionPriceBDT))
      : pkg.totalSessions;

  const advanceCreditBDT = Math.max(
    0,
    Math.round((paidAmountBDT - pkg.completedSessions * perSessionPriceBDT) * 100) / 100
  );

  return {
    ...pkg,
    paidAmountBDT,
    dueAmountBDT,
    perSessionPriceBDT,
    unlockedSessions,
    advanceCreditBDT,
  };
}

export function extractClientIp(headers: Record<string, string | string[] | undefined>, fallback = '127.0.0.1'): string {
  const xff = headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim();
  }
  return fallback;
}

export function isDoctorOrAdmin(role: UserRole): boolean {
  return role === 'doctor' || role === 'super_admin';
}
