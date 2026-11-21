/**
 * SUOXI Skin Care & Aesthetic Center ERP
 * PostgreSQL Connection Pool & ACID Transaction Helper (PostgreSQL ONLY)
 *
 * Features:
 *  - Uses `DATABASE_URL` (postgresql://...) or `PGHOST`/`PGDATABASE`/`PGUSER`/`PGPASSWORD`.
 *  - Supports injectable Pool override for automated clean-database PostgreSQL testing.
 *  - Automatic retry with exponential backoff on PostgreSQL deadlock (40P01) &
 *    serialization failure (40001).
 *  - Health & Readiness checks verifying connectivity and `schema_migrations`.
 */

import pg, { type Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

const { Pool: PgPool } = pg;

export interface PgLikeClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
  release(): void;
}

export interface PgLikePool {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
  connect(): Promise<PgLikeClient>;
  end(): Promise<void>;
}

const RETRYABLE_PG_CODES = new Set(['40P01', '40001']);

let poolInstance: PgLikePool | null = null;
let overrideActive = false;

export function isPostgresConfigured(): boolean {
  if (overrideActive && poolInstance) {
    return true;
  }
  const url = process.env.DATABASE_URL?.trim();
  if (url && (url.startsWith('postgres://') || url.startsWith('postgresql://'))) {
    return true;
  }
  return Boolean(process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER);
}

/**
 * Allows automated tests to inject an isolated PostgreSQL engine (e.g., PGlite or test pool)
 * without mocking business logic or SQL execution.
 */
export function setPgPoolOverride(customPool: PgLikePool | null): void {
  poolInstance = customPool;
  overrideActive = Boolean(customPool);
}

export function getPgPool(): PgLikePool {
  if (poolInstance) {
    return poolInstance;
  }

  if (!isPostgresConfigured()) {
    throw new Error(
      'PostgreSQL is not configured. Set DATABASE_URL (postgresql://...) or PGHOST/PGDATABASE/PGUSER in .env.'
    );
  }

  const max = Number.parseInt(process.env.PG_POOL_MAX || '20', 10);
  const idleTimeoutMillis = Number.parseInt(process.env.PG_IDLE_TIMEOUT_MS || '30000', 10);
  const connectionTimeoutMillis = Number.parseInt(process.env.PG_CONNECTION_TIMEOUT_MS || '5000', 10);

  const connectionString = process.env.DATABASE_URL?.trim();
  const sslEnabled =
    process.env.PGSSLMODE === 'require' || process.env.DATABASE_SSL === 'true';

  const realPool: Pool = new PgPool(
    connectionString
      ? {
          connectionString,
          max,
          idleTimeoutMillis,
          connectionTimeoutMillis,
          ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
        }
      : {
          host: process.env.PGHOST || '127.0.0.1',
          port: Number.parseInt(process.env.PGPORT || '5432', 10),
          database: process.env.PGDATABASE,
          user: process.env.PGUSER,
          password: process.env.PGPASSWORD,
          max,
          idleTimeoutMillis,
          connectionTimeoutMillis,
          ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
        }
  );

  realPool.on('connect', (client) => {
    client.query("SET TIME ZONE 'Asia/Dhaka'").catch(() => {});
  });

  realPool.on('error', (err) => {
    console.error('[SUOXI PG] Unexpected idle client error:', err.message);
  });

  poolInstance = realPool as unknown as PgLikePool;
  return poolInstance;
}

export async function pgQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const pool = getPgPool();
  return pool.query<T>(text, params);
}

function isRetryablePgError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  return Boolean(code && RETRYABLE_PG_CODES.has(code));
}

/**
 * Runs a callback inside an ACID PostgreSQL transaction (`BEGIN` / `COMMIT` / `ROLLBACK`)
 * with automatic exponential backoff retry on PostgreSQL deadlocks (40P01) & serialization conflicts (40001).
 */
export async function withPgTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  options: { maxRetries?: number } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const pool = getPgPool();

  let attempt = 0;
  while (true) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client as unknown as PoolClient);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('[SUOXI PG] Rollback failed:', rollbackErr);
      }

      if (isRetryablePgError(err) && attempt < maxRetries) {
        attempt += 1;
        const delayMs = Math.min(500, 30 * Math.pow(2, attempt) + Math.floor(Math.random() * 20));
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      throw err;
    } finally {
      client.release();
    }
  }
}

export async function checkPgHealth(): Promise<{
  ok: boolean;
  latencyMs?: number;
  migrationsApplied?: number;
  schemaReady?: boolean;
  error?: string;
}> {
  if (!isPostgresConfigured()) {
    return { ok: false, schemaReady: false, error: 'DATABASE_URL not configured' };
  }
  const started = Date.now();
  try {
    await pgQuery('SELECT 1 AS ok');
    try {
      const migRes = await pgQuery<{ cnt: string }>('SELECT COUNT(*)::text AS cnt FROM schema_migrations');
      const count = Number.parseInt(migRes.rows[0]?.cnt || '0', 10);
      return {
        ok: true,
        latencyMs: Date.now() - started,
        migrationsApplied: count,
        schemaReady: count > 0,
      };
    } catch {
      return {
        ok: true,
        latencyMs: Date.now() - started,
        migrationsApplied: 0,
        schemaReady: false,
      };
    }
  } catch (err) {
    return {
      ok: false,
      schemaReady: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function closePgPool(): Promise<void> {
  if (poolInstance) {
    const current = poolInstance;
    poolInstance = null;
    overrideActive = false;
    await current.end();
  }
}
