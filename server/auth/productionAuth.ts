/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * Production Authentication & Redis + PostgreSQL Session Manager
 *
 * Security Policy:
 *  - Activates full login enforcement when PostgreSQL is configured AND
 *    `ENABLE_DEMO_ROLE_SWITCHER !== 'true'` (or when `REQUIRE_AUTH === 'true'`).
 *  - Passwords hashed & verified strictly with Argon2id.
 *  - Sessions stored in Redis (fast sub-ms lookup & instant revocation) +
 *    mirrored in PostgreSQL `active_sessions` (audit trail & Security Settings view).
 *  - HttpOnly, SameSite=Lax cookie (`suoxi_sid`), Secure when behind HTTPS in production.
 *  - Redis-backed brute-force login rate limiting (10 failed attempts / 15 min).
 */

import crypto from 'node:crypto';
import argon2 from 'argon2';
import type { Request, Response } from 'express';
import type { User, UserRole } from '../../src/types/index.ts';
import { getRedisClient } from '../cache/redisClient.ts';
import { isPostgresConfigured, pgQuery } from '../db/pgPool.ts';
import { extractClientIp, pgLogAuditEvent, pgLogSecurityEvent } from '../repositories/pgHelpers.ts';

export const SESSION_COOKIE_NAME = 'suoxi_sid';
const REDIS_SESSION_PREFIX = 'suoxi:sess:';
const REDIS_LOGIN_FAIL_PREFIX = 'suoxi:loginfail:';
const MAX_FAILED_LOGINS = 10;
const LOGIN_LOCKOUT_SECONDS = 15 * 60;

export interface AuthenticatedSession {
  sessionId: string;
  user: User;
  mustChangePassword: boolean;
  expiresAt: string;
}

export interface AuthedRequest extends Request {
  authUser?: User;
  sessionId?: string;
}

export function isProductionAuthEnabled(): boolean {
  if (process.env.REQUIRE_AUTH === 'true') return true;
  if (process.env.ENABLE_DEMO_ROLE_SWITCHER === 'true') return false;
  return isPostgresConfigured();
}

export function isDemoRoleSwitcherAllowed(): boolean {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEMO_ROLE_SWITCHER !== 'true') {
    return false;
  }
  return !isProductionAuthEnabled();
}

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

export function getSessionIdFromRequest(req: Request): string | null {
  const cookies = parseCookieHeader(req.headers.cookie);
  const sid = cookies[SESSION_COOKIE_NAME];
  if (sid && /^[a-f0-9]{32,128}$/i.test(sid)) {
    return sid;
  }
  return null;
}

export function setSessionCookie(res: Response, sessionId: string, ttlSeconds: number, req: Request): void {
  const isSecure =
    process.env.NODE_ENV === 'production' &&
    (req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.COOKIE_SECURE === 'true');

  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(60, ttlSeconds)}`,
  ];
  if (isSecure) {
    parts.push('Secure');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(res: Response): void {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
  );
}

async function getSessionTimeoutSeconds(): Promise<number> {
  try {
    const res = await pgQuery<{ value: { sessionTimeoutMinutes?: number } }>(
      `SELECT value FROM clinic_settings WHERE setting_key = 'security'`
    );
    const mins = Number(res.rows[0]?.value?.sessionTimeoutMinutes || 60);
    return Math.min(Math.max(mins, 15), 24 * 60) * 60;
  } catch {
    return 60 * 60;
  }
}

function mapPgUserToSessionUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    name: String(row.name),
    nameBn: row.name_bn ? String(row.name_bn) : undefined,
    email: String(row.email),
    role: row.role as UserRole,
    phone: String(row.phone || ''),
    branchId: String(row.branch_id || 'br-dhanmondi'),
    branchName: String(row.branch_name || 'Dhanmondi Main Center'),
    specialization: row.specialization ? String(row.specialization) : undefined,
    bmdcRegNo: row.bmdc_reg_no ? String(row.bmdc_reg_no) : undefined,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : undefined,
    roomNumber: row.room_number ? String(row.room_number) : undefined,
    status: (row.status as User['status']) || 'active',
    permissions: Array.isArray(row.permissions) ? (row.permissions as string[]) : [],
    designation: row.designation ? String(row.designation) : undefined,
  };
}

async function checkLoginRateLimit(key: string): Promise<{ blocked: boolean; attempts: number }> {
  const redis = getRedisClient();
  if (!redis) return { blocked: false, attempts: 0 };
  try {
    const val = await redis.get(`${REDIS_LOGIN_FAIL_PREFIX}${key}`);
    const attempts = val ? parseInt(val, 10) : 0;
    return { blocked: attempts >= MAX_FAILED_LOGINS, attempts };
  } catch {
    return { blocked: false, attempts: 0 };
  }
}

async function recordLoginFailure(key: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    const fullKey = `${REDIS_LOGIN_FAIL_PREFIX}${key}`;
    const next = await redis.incr(fullKey);
    if (next === 1) {
      await redis.expire(fullKey, LOGIN_LOCKOUT_SECONDS);
    }
  } catch {
    // non-fatal
  }
}

async function clearLoginFailures(key: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.del(`${REDIS_LOGIN_FAIL_PREFIX}${key}`);
  } catch {
    // non-fatal
  }
}

export async function loginWithPassword(params: {
  email: string;
  password: string;
  req: Request;
  res: Response;
}): Promise<AuthenticatedSession> {
  const email = params.email.trim().toLowerCase();
  const ipAddress = extractClientIp(params.req.headers, params.req.ip || '127.0.0.1');
  const deviceInfo = String(params.req.headers['user-agent'] || 'Web Browser').slice(0, 180);
  const rateKey = `${ipAddress}:${email}`;

  const rate = await checkLoginRateLimit(rateKey);
  if (rate.blocked) {
    const err = new Error('Too many failed login attempts. Please wait 15 minutes before retrying.') as Error & {
      statusCode?: number;
      code?: string;
    };
    err.statusCode = 429;
    err.code = 'TOO_MANY_REQUESTS';
    throw err;
  }

  const userRes = await pgQuery('SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1', [email]);
  if (userRes.rowCount === 0) {
    await recordLoginFailure(rateKey);
    const err = new Error('Invalid email or password') as Error & { statusCode?: number; code?: string };
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const row = userRes.rows[0] as Record<string, unknown>;
  const user = mapPgUserToSessionUser(row);

  if (row.status !== 'active') {
    const err = new Error('Your staff account is inactive or suspended. Contact the clinic administrator.') as Error & {
      statusCode?: number;
      code?: string;
    };
    err.statusCode = 403;
    err.code = 'ACCOUNT_INACTIVE';
    throw err;
  }

  const storedHash = row.password_hash ? String(row.password_hash) : '';
  let verified = false;
  if (storedHash) {
    try {
      verified = await argon2.verify(storedHash, params.password);
    } catch {
      verified = false;
    }
  }

  if (!verified) {
    await recordLoginFailure(rateKey);
    await pgLogSecurityEvent(
      user,
      'LOGIN',
      `Failed password verification attempt for ${email}`,
      'failed',
      ipAddress,
      deviceInfo
    );
    const err = new Error('Invalid email or password') as Error & { statusCode?: number; code?: string };
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  await clearLoginFailures(rateKey);

  const ttlSeconds = await getSessionTimeoutSeconds();
  const sessionId = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const sessionPayload: AuthenticatedSession = {
    sessionId,
    user,
    mustChangePassword: Boolean(row.must_change_password),
    expiresAt,
  };

  // 1. Persist in PostgreSQL active_sessions
  await pgQuery(
    `
    INSERT INTO active_sessions (
      id, user_id, user_name, role, ip_address, device_info,
      login_time, last_active_time, expires_at, revoked_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW(), $7::timestamptz, NULL)
    `,
    [sessionId, user.id, user.name, user.role, ipAddress, deviceInfo, expiresAt]
  );

  await pgQuery('UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1', [user.id]);

  // 2. Store in Redis for sub-millisecond verification & instant revocation
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.set(
        `${REDIS_SESSION_PREFIX}${sessionId}`,
        JSON.stringify(sessionPayload),
        'EX',
        ttlSeconds
      );
    } catch (err) {
      console.warn('[SUOXI Auth] Redis session write fallback:', err instanceof Error ? err.message : err);
    }
  }

  setSessionCookie(params.res, sessionId, ttlSeconds, params.req);

  await pgLogSecurityEvent(
    user,
    'LOGIN',
    `Authenticated session established for ${user.email} (${user.role})`,
    'success',
    ipAddress,
    deviceInfo
  );

  return sessionPayload;
}

export async function resolveSessionFromRequest(req: Request): Promise<AuthenticatedSession | null> {
  const sessionId = getSessionIdFromRequest(req);
  if (!sessionId) return null;

  // 1. Fast path: Redis lookup
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(`${REDIS_SESSION_PREFIX}${sessionId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as AuthenticatedSession;
        if (new Date(parsed.expiresAt).getTime() > Date.now()) {
          return parsed;
        }
        await redis.del(`${REDIS_SESSION_PREFIX}${sessionId}`);
        return null;
      }
    } catch (err) {
      console.warn('[SUOXI Auth] Redis session lookup warning:', err instanceof Error ? err.message : err);
    }
  }

  // 2. Fallback / Cold-start path: PostgreSQL active_sessions + users
  if (!isPostgresConfigured()) return null;

  const res = await pgQuery(
    `
    SELECT
      s.id AS session_id,
      s.expires_at,
      u.*
    FROM active_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = $1
      AND s.revoked_at IS NULL
      AND (s.expires_at IS NULL OR s.expires_at > NOW())
      AND u.status = 'active'
    LIMIT 1
    `,
    [sessionId]
  );

  if (res.rowCount === 0) return null;

  const row = res.rows[0] as Record<string, unknown>;
  const user = mapPgUserToSessionUser(row);
  const expiresAt = row.expires_at
    ? new Date(String(row.expires_at)).toISOString()
    : new Date(Date.now() + 3600 * 1000).toISOString();

  const payload: AuthenticatedSession = {
    sessionId,
    user,
    mustChangePassword: Boolean(row.must_change_password),
    expiresAt,
  };

  // Re-warm Redis cache & touch last_active_time
  const remainingSec = Math.max(60, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
  if (redis) {
    redis.set(`${REDIS_SESSION_PREFIX}${sessionId}`, JSON.stringify(payload), 'EX', remainingSec).catch(() => {});
  }
  pgQuery('UPDATE active_sessions SET last_active_time = NOW() WHERE id = $1', [sessionId]).catch(() => {});

  return payload;
}

export async function revokeRedisSession(sessionId: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;
  try {
    await redis.del(`${REDIS_SESSION_PREFIX}${sessionId}`);
  } catch (err) {
    console.warn('[SUOXI Auth] Redis revoke warning:', err instanceof Error ? err.message : err);
  }
}

export async function revokeAllRedisSessionsExcept(keepSessionId?: string): Promise<number> {
  const redis = getRedisClient();
  if (!redis) return 0;
  let deleted = 0;
  try {
    let cursor = '0';
    const keepKey = keepSessionId ? `${REDIS_SESSION_PREFIX}${keepSessionId}` : '';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${REDIS_SESSION_PREFIX}*`, 'COUNT', 100);
      cursor = nextCursor;
      const toDelete = keepKey ? keys.filter((k) => k !== keepKey) : keys;
      if (toDelete.length > 0) {
        deleted += await redis.del(...toDelete);
      }
    } while (cursor !== '0');
  } catch (err) {
    console.warn('[SUOXI Auth] Redis bulk revoke warning:', err instanceof Error ? err.message : err);
  }
  return deleted;
}

export async function logoutSession(req: Request, res: Response, actor?: User): Promise<void> {
  const sessionId = getSessionIdFromRequest(req);
  const ipAddress = extractClientIp(req.headers, req.ip || '127.0.0.1');
  const deviceInfo = String(req.headers['user-agent'] || 'Web Browser').slice(0, 180);

  if (sessionId) {
    await revokeRedisSession(sessionId);
    if (isPostgresConfigured()) {
      await pgQuery('UPDATE active_sessions SET revoked_at = NOW() WHERE id = $1', [sessionId]);
    }
  }

  clearSessionCookie(res);

  if (actor && isPostgresConfigured()) {
    await pgLogSecurityEvent(actor, 'LOGOUT', `User ${actor.email} signed out cleanly`, 'success', ipAddress, deviceInfo);
  }
}

export async function changeOwnPassword(params: {
  user: User;
  currentPassword: string;
  newPassword: string;
  ipAddress: string;
  deviceInfo: string;
}): Promise<void> {
  if (params.newPassword.length < 8) {
    const err = new Error('New password must be at least 8 characters long') as Error & {
      statusCode?: number;
      code?: string;
    };
    err.statusCode = 400;
    err.code = 'WEAK_PASSWORD';
    throw err;
  }

  const userRes = await pgQuery<{ password_hash: string | null }>(
    'SELECT password_hash FROM users WHERE id = $1',
    [params.user.id]
  );
  if (userRes.rowCount === 0) {
    const err = new Error('User not found') as Error & { statusCode?: number; code?: string };
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  const storedHash = userRes.rows[0].password_hash || '';
  const ok = storedHash ? await argon2.verify(storedHash, params.currentPassword) : false;
  if (!ok) {
    const err = new Error('Current password is incorrect') as Error & { statusCode?: number; code?: string };
    err.statusCode = 401;
    err.code = 'INVALID_CREDENTIALS';
    throw err;
  }

  const newHash = await argon2.hash(params.newPassword);
  await pgQuery(
    'UPDATE users SET password_hash = $2, must_change_password = FALSE, updated_at = NOW() WHERE id = $1',
    [params.user.id, newHash]
  );

  await pgLogSecurityEvent(
    params.user,
    'PASSWORD_RESET',
    `User ${params.user.email} updated their own password`,
    'success',
    params.ipAddress,
    params.deviceInfo
  );
  await pgLogAuditEvent(
    params.user,
    'PASSWORD_CHANGED',
    'user',
    params.user.id,
    `Staff password updated by ${params.user.name}`,
    params.ipAddress
  );
}
