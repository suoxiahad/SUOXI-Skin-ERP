/**
 * SUOXI Skin Care & Aesthetic Center ERP
 * Persistent Security & Concurrency Stores (PostgreSQL + Redis Acceleration)
 *
 * Replaces process-memory Maps/Sets for:
 *  - CSRF token issuance & cryptographic verification (`csrf_tokens`)
 *  - HTTP Idempotency-Key locking & response replay (`idempotency_keys`)
 *  - Brute-force login lockout tracking (`login_attempts`)
 *  - Atomic gap-free sequence code generation (`code_sequences`)
 */

import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import { getRedisClient } from '../cache/redisClient.ts';
import { isPostgresConfigured, pgQuery, withPgTransaction } from '../db/pgPool.ts';

const CSRF_TTL_SECONDS = 12 * 60 * 60; // 12 hours
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const MAX_LOGIN_FAILURES = 10;
const LOCKOUT_WINDOW_MINUTES = 15;

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

// ============================================================================
// 1. PERSISTENT CSRF TOKENS
// ============================================================================

export async function issuePersistentCsrfToken(params?: {
  sessionId?: string | null;
  realm?: 'staff' | 'portal';
}): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256(rawToken);
  const realm = params?.realm || 'staff';
  const sessionId = params?.sessionId || null;

  const redis = getRedisClient();
  if (redis) {
    await redis
      .set(
        `suoxi:csrf:${tokenHash}`,
        JSON.stringify({ sessionId, realm }),
        'EX',
        CSRF_TTL_SECONDS
      )
      .catch(() => {});
  }

  if (isPostgresConfigured()) {
    await pgQuery(
      `
      INSERT INTO csrf_tokens (token_hash, session_id, realm, expires_at)
      VALUES ($1, $2, $3, NOW() + ($4::int || ' seconds')::interval)
      ON CONFLICT (token_hash) DO UPDATE SET expires_at = EXCLUDED.expires_at
      `,
      [tokenHash, sessionId, realm, CSRF_TTL_SECONDS]
    );
    // Occasional lightweight expiry sweep
    if (Math.random() < 0.05) {
      pgQuery('DELETE FROM csrf_tokens WHERE expires_at < NOW()').catch(() => {});
    }
  }

  return rawToken;
}

export async function validatePersistentCsrfToken(
  rawToken: string | undefined,
  realm: 'staff' | 'portal' = 'staff'
): Promise<boolean> {
  if (!rawToken || rawToken.trim().length < 16) return false;
  const tokenHash = sha256(rawToken.trim());

  const redis = getRedisClient();
  if (redis) {
    try {
      const hit = await redis.get(`suoxi:csrf:${tokenHash}`);
      if (hit) {
        const parsed = JSON.parse(hit) as { realm?: string };
        return !parsed.realm || parsed.realm === realm;
      }
    } catch {
      // Fall through to PostgreSQL
    }
  }

  if (!isPostgresConfigured()) return false;

  const res = await pgQuery<{ realm: string }>(
    `
    SELECT realm FROM csrf_tokens
    WHERE token_hash = $1 AND expires_at > NOW()
    LIMIT 1
    `,
    [tokenHash]
  );
  if ((res.rowCount || 0) === 0) return false;
  return res.rows[0].realm === realm;
}

// ============================================================================
// 2. PERSISTENT IDEMPOTENCY KEYS
// ============================================================================

export type IdempotencyCheckResult =
  | { state: 'acquired' }
  | { state: 'replay'; statusCode: number; body: unknown }
  | { state: 'conflict'; message: string }
  | { state: 'in_progress'; message: string };

export async function acquireIdempotencyKey(params: {
  key: string;
  method: string;
  routePath: string;
  actorScope: string;
  requestPayload: unknown;
}): Promise<IdempotencyCheckResult> {
  if (!isPostgresConfigured()) {
    return { state: 'acquired' };
  }

  const requestHash = sha256(JSON.stringify(params.requestPayload ?? {}));

  return withPgTransaction(async (client) => {
    const existing = await client.query<{
      request_hash: string;
      status: string;
      response_status: number | null;
      response_body: unknown;
      expires_at: string;
    }>(
      `
      SELECT request_hash, status, response_status, response_body, expires_at
      FROM idempotency_keys
      WHERE idempotency_key = $1 AND method = $2 AND route_path = $3 AND actor_scope = $4
      FOR UPDATE
      `,
      [params.key, params.method.toUpperCase(), params.routePath, params.actorScope]
    );

    if ((existing.rowCount || 0) > 0) {
      const row = existing.rows[0];
      const expired = new Date(row.expires_at).getTime() <= Date.now();
      if (!expired) {
        if (row.request_hash !== requestHash) {
          return {
            state: 'conflict',
            message: 'Idempotency-Key was previously used with a different request payload',
          };
        }
        if (row.status === 'completed' && row.response_status !== null) {
          return {
            state: 'replay',
            statusCode: row.response_status,
            body: row.response_body,
          };
        }
        if (row.status === 'processing') {
          return {
            state: 'in_progress',
            message: 'A request with this Idempotency-Key is currently being processed',
          };
        }
      } else {
        await client.query(
          `
          DELETE FROM idempotency_keys
          WHERE idempotency_key = $1 AND method = $2 AND route_path = $3 AND actor_scope = $4
          `,
          [params.key, params.method.toUpperCase(), params.routePath, params.actorScope]
        );
      }
    }

    await client.query(
      `
      INSERT INTO idempotency_keys (
        idempotency_key, method, route_path, actor_scope, request_hash,
        status, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, 'processing', NOW() + ($6::int || ' seconds')::interval)
      ON CONFLICT (idempotency_key, method, route_path, actor_scope)
      DO UPDATE SET
        request_hash = EXCLUDED.request_hash,
        status = 'processing',
        response_status = NULL,
        response_body = NULL,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
      `,
      [
        params.key,
        params.method.toUpperCase(),
        params.routePath,
        params.actorScope,
        requestHash,
        IDEMPOTENCY_TTL_SECONDS,
      ]
    );

    return { state: 'acquired' };
  });
}

export async function completeIdempotencyKey(params: {
  key: string;
  method: string;
  routePath: string;
  actorScope: string;
  statusCode: number;
  responseBody: unknown;
}): Promise<void> {
  if (!isPostgresConfigured()) return;
  const finalStatus = params.statusCode >= 500 ? 'failed' : 'completed';
  await pgQuery(
    `
    UPDATE idempotency_keys
    SET status = $5,
        response_status = $6,
        response_body = $7::jsonb,
        updated_at = NOW()
    WHERE idempotency_key = $1 AND method = $2 AND route_path = $3 AND actor_scope = $4
    `,
    [
      params.key,
      params.method.toUpperCase(),
      params.routePath,
      params.actorScope,
      finalStatus,
      params.statusCode,
      JSON.stringify(params.responseBody ?? null),
    ]
  );
}

// ============================================================================
// 3. PERSISTENT BRUTE-FORCE LOGIN LOCKOUT (PG + REDIS)
// ============================================================================

export async function checkPersistentLoginLockout(attemptKey: string): Promise<{
  blocked: boolean;
  failedCount: number;
  lockedUntil?: string;
}> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const val = await redis.get(`suoxi:loginfail:${attemptKey}`);
      const count = val ? parseInt(val, 10) : 0;
      if (count >= MAX_LOGIN_FAILURES) {
        return { blocked: true, failedCount: count };
      }
    } catch {
      // Fall through to PostgreSQL
    }
  }

  if (!isPostgresConfigured()) {
    return { blocked: false, failedCount: 0 };
  }

  const res = await pgQuery<{ failed_count: number; locked_until: string | null }>(
    `SELECT failed_count, locked_until FROM login_attempts WHERE attempt_key = $1 LIMIT 1`,
    [attemptKey]
  );
  if ((res.rowCount || 0) === 0) return { blocked: false, failedCount: 0 };

  const row = res.rows[0];
  if (row.locked_until && new Date(row.locked_until).getTime() > Date.now()) {
    return { blocked: true, failedCount: row.failed_count, lockedUntil: row.locked_until };
  }
  return { blocked: false, failedCount: row.failed_count };
}

export async function recordPersistentLoginFailure(
  attemptKey: string,
  attemptType: 'user' | 'ip' | 'combined' = 'combined'
): Promise<{ failedCount: number; blocked: boolean }> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const fullKey = `suoxi:loginfail:${attemptKey}`;
      const next = await redis.incr(fullKey);
      if (next === 1) await redis.expire(fullKey, LOCKOUT_WINDOW_MINUTES * 60);
    } catch {
      // non-fatal
    }
  }

  if (!isPostgresConfigured()) {
    return { failedCount: 1, blocked: false };
  }

  const res = await pgQuery<{ failed_count: number; locked_until: string | null }>(
    `
    INSERT INTO login_attempts (attempt_key, attempt_type, failed_count, first_failed_at, locked_until, updated_at)
    VALUES ($1, $2, 1, NOW(), NULL, NOW())
    ON CONFLICT (attempt_key) DO UPDATE SET
      failed_count = CASE
        WHEN login_attempts.updated_at < NOW() - ($3::int || ' minutes')::interval THEN 1
        ELSE login_attempts.failed_count + 1
      END,
      first_failed_at = CASE
        WHEN login_attempts.updated_at < NOW() - ($3::int || ' minutes')::interval THEN NOW()
        ELSE login_attempts.first_failed_at
      END,
      locked_until = CASE
        WHEN (
          CASE
            WHEN login_attempts.updated_at < NOW() - ($3::int || ' minutes')::interval THEN 1
            ELSE login_attempts.failed_count + 1
          END
        ) >= $4 THEN NOW() + ($3::int || ' minutes')::interval
        ELSE login_attempts.locked_until
      END,
      updated_at = NOW()
    RETURNING failed_count, locked_until
    `,
    [attemptKey, attemptType, LOCKOUT_WINDOW_MINUTES, MAX_LOGIN_FAILURES]
  );

  const count = res.rows[0]?.failed_count ?? 1;
  return { failedCount: count, blocked: count >= MAX_LOGIN_FAILURES };
}

export async function clearPersistentLoginFailures(attemptKey: string): Promise<void> {
  const redis = getRedisClient();
  if (redis) {
    await redis.del(`suoxi:loginfail:${attemptKey}`).catch(() => {});
  }
  if (isPostgresConfigured()) {
    await pgQuery('DELETE FROM login_attempts WHERE attempt_key = $1', [attemptKey]).catch(() => {});
  }
}

// ============================================================================
// 4. ATOMIC GAP-FREE SEQUENCE GENERATOR
// ============================================================================

export async function pgNextSequenceCode(
  sequenceKey: string,
  prefix: string,
  padding = 6,
  client?: PoolClient
): Promise<string> {
  const run = async (c: PoolClient) => {
    const res = await c.query<{ last_value: string }>(
      `
      INSERT INTO code_sequences (sequence_key, prefix, last_value, updated_at)
      VALUES ($1, $2, 1, NOW())
      ON CONFLICT (sequence_key) DO UPDATE
      SET last_value = code_sequences.last_value + 1,
          updated_at = NOW()
      RETURNING last_value::text AS last_value
      `,
      [sequenceKey, prefix]
    );
    const val = Number(res.rows[0]?.last_value || 1);
    return `${prefix}${String(val).padStart(padding, '0')}`;
  };

  if (client) return run(client);
  return withPgTransaction(run);
}
