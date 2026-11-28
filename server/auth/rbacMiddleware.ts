/**
 * SUOXI Skin Care & Aesthetic Center ERP
 * Server-Side RBAC, Permission Resolver & Multi-Branch Isolation Guards
 */

import type { NextFunction, Request, Response } from 'express';
import type { User, UserRole } from '../../src/types/index.ts';
import type { AuthedRequest } from './productionAuth.ts';
import { getRequestAuthUser } from './requestContext.ts';
import { isPostgresConfigured, pgQuery } from '../db/pgPool.ts';
import { sendPgError } from '../repositories/pgHelpers.ts';

export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin: ['*'],
  admin_manager: [
    'patients:*',
    'appointments:*',
    'catalog:*',
    'consultations:read',
    'prescriptions:read',
    'sessions:*',
    'billing:*',
    'invoices:*',
    'payments:*',
    'refunds:*',
    'packages:*',
    'inventory:*',
    'suppliers:*',
    'purchase_orders:*',
    'referrals:*',
    'call_center:*',
    'notifications:*',
    'reports:*',
    'users:read',
    'users:update',
    'settings:read',
    'audit:read',
    'files:*',
    'portal_accounts:*',
    'store:*',
  ],
  doctor: [
    'patients:read',
    'patients:update',
    'appointments:read',
    'appointments:update',
    'catalog:read',
    'consultations:*',
    'prescriptions:*',
    'rx_protocols:*',
    'sessions:*',
    'packages:read',
    'files:read',
    'files:upload',
    'reports:read',
    'store:read',
    'store:request',
  ],
  receptionist: [
    'patients:read',
    'patients:create',
    'patients:update',
    'appointments:*',
    'catalog:read',
    'packages:read',
    'invoices:read',
    'call_center:read',
    'call_center:update',
    'files:read',
    'files:upload',
    'portal_accounts:*',
    'store:request',
  ],
  therapist: [
    'patients:read',
    'appointments:read',
    'catalog:read',
    'sessions:*',
    'packages:read',
    'packages:deduct',
    'inventory:read',
    'files:read',
    'files:upload',
    'store:read',
    'store:request',
  ],
  cashier: [
    'patients:read',
    'appointments:read',
    'catalog:read',
    'billing:*',
    'invoices:*',
    'payments:*',
    'refunds:request',
    'packages:read',
    'packages:create',
    'packages:payment',
    'daily_closing:*',
    'referrals:read',
    'referrals:payout',
    'reports:read',
    'store:request',
  ],
  inventory_manager: [
    'inventory:*',
    'suppliers:*',
    'purchase_orders:*',
    'reports:read',
    'store:*',
  ],
  call_center: [
    'patients:read',
    'appointments:read',
    'appointments:create',
    'appointments:update',
    'call_center:*',
    'notifications:read',
    'notifications:send',
    'store:request',
  ],
  patient: [],
};

export function hasPermissionCode(granted: string[], required: string): boolean {
  if (granted.includes('*')) return true;
  if (granted.includes(required)) return true;
  const [domain] = required.split(':');
  if (domain && granted.includes(`${domain}:*`)) return true;
  return false;
}

export async function resolveEffectivePermissions(user: User): Promise<Set<string>> {
  const perms = new Set<string>(ROLE_DEFAULT_PERMISSIONS[user.role] || []);
  for (const p of user.permissions || []) {
    perms.add(p);
  }

  if (isPostgresConfigured()) {
    try {
      const [roleRes, overrideRes] = await Promise.all([
        pgQuery<{ permissions: unknown }>('SELECT permissions FROM clinic_roles WHERE id = $1 LIMIT 1', [
          user.role,
        ]),
        pgQuery<{ permission_code: string; effect: 'allow' | 'deny' }>(
          'SELECT permission_code, effect FROM user_permission_overrides WHERE user_id = $1',
          [user.id]
        ),
      ]);
      const rolePerms = roleRes.rows[0]?.permissions;
      if (Array.isArray(rolePerms)) {
        for (const p of rolePerms) perms.add(String(p));
      }
      for (const ov of overrideRes.rows) {
        if (ov.effect === 'allow') perms.add(ov.permission_code);
        else if (ov.effect === 'deny') perms.delete(ov.permission_code);
      }
    } catch {
      // Fall back to static defaults if override tables unavailable
    }
  }
  return perms;
}

export async function getUserAllowedBranches(user: User): Promise<Set<string>> {
  if (user.role === 'super_admin') {
    return new Set(['*']);
  }
  const allowed = new Set<string>();
  if (user.branchId) allowed.add(user.branchId);

  if (isPostgresConfigured()) {
    try {
      const res = await pgQuery<{ branch_id: string }>(
        'SELECT branch_id FROM user_branch_assignments WHERE user_id = $1',
        [user.id]
      );
      for (const r of res.rows) allowed.add(r.branch_id);
    } catch {
      // Fallback to primary user.branchId
    }
  }
  return allowed;
}

export async function canUserAccessBranch(user: User, targetBranchId?: string | null): Promise<boolean> {
  if (!targetBranchId || targetBranchId === 'all') {
    return user.role === 'super_admin';
  }
  const allowed = await getUserAllowedBranches(user);
  return allowed.has('*') || allowed.has(targetBranchId);
}

/**
 * Resolves the effective branch scope for a request:
 *  - Super Admin can query any branch or 'all'.
 *  - Branch-scoped staff requesting another branch receive a 403 error.
 */
export async function resolveAuthorizedBranchScope(
  user: User,
  requestedBranchId?: string | null
): Promise<{ branchId: string | undefined; allowed: boolean }> {
  if (user.role === 'super_admin') {
    const clean = requestedBranchId && requestedBranchId !== 'all' ? requestedBranchId : undefined;
    return { branchId: clean, allowed: true };
  }

  const allowedSet = await getUserAllowedBranches(user);
  if (!requestedBranchId || requestedBranchId === 'all') {
    return { branchId: user.branchId, allowed: true };
  }

  if (!allowedSet.has(requestedBranchId)) {
    return { branchId: undefined, allowed: false };
  }
  return { branchId: requestedBranchId, allowed: true };
}

export function resolveRequestActor(req: Request, fallbackUser?: () => User): User | undefined {
  const authed = req as AuthedRequest;
  return authed.authUser || getRequestAuthUser() || (fallbackUser ? fallbackUser() : undefined);
}

export function requireRoles(roles: UserRole[], fallbackUser?: () => User) {
  return (req: Request, res: Response, next: NextFunction) => {
    const actor = resolveRequestActor(req, fallbackUser);
    if (!actor) {
      return sendPgError(res, 401, 'AUTH_REQUIRED', 'Authentication required');
    }
    if (!roles.includes(actor.role)) {
      return sendPgError(
        res,
        403,
        'FORBIDDEN',
        `Access denied. Role '${actor.role}' is not permitted for this operation.`
      );
    }
    return next();
  };
}

export function requirePermission(permissionCode: string, fallbackUser?: () => User) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const actor = resolveRequestActor(req, fallbackUser);
    if (!actor) {
      return sendPgError(res, 401, 'AUTH_REQUIRED', 'Authentication required');
    }
    const granted = Array.from(await resolveEffectivePermissions(actor));
    if (!hasPermissionCode(granted, permissionCode)) {
      return sendPgError(
        res,
        403,
        'FORBIDDEN',
        `Missing required permission '${permissionCode}'`
      );
    }
    return next();
  };
}
