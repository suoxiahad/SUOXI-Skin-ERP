/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * PostgreSQL Connection Pool & ACID Transaction Helper
 *
 * Uses `DATABASE_URL` (or standard `PGHOST`/`PGDATABASE`/`PGUSER`/`PGPASSWORD`).
 * Safely reports `isPostgresConfigured() === false` in preview environments where
 * PostgreSQL is not provisioned, while running full pooled PostgreSQL on VPS.
 */

import pg, { type Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

const { Pool: PgPool } = pg;

let poolInstance: Pool | null = null;

export function isPostgresConfigured(): boolean {
  const url = process.env.DATABASE_URL?.trim();
  if (url && (url.startsWith('postgres://') || url.startsWith('postgresql://'))) {
    return true;
  }
  return Boolean(process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER);
}

export function getPgPool(): Pool {
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

  poolInstance = new PgPool(
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

  poolInstance.on('error', (err) => {
    console.error('[SUOXI PG] Unexpected idle client error:', err.message);
  });

  return poolInstance;
}

export async function pgQuery<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const pool = getPgPool();
  return pool.query<T>(text, params);
}

/**
 * Runs a callback inside an ACID PostgreSQL transaction (`BEGIN` / `COMMIT` / `ROLLBACK`).
 * Required for billing payments, invoice voiding, and non-duplicate package deductions.
 */
export async function withPgTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const pool = getPgPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('[SUOXI PG] Rollback failed:', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function checkPgHealth(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  if (!isPostgresConfigured()) {
    return { ok: false, error: 'DATABASE_URL not configured' };
  }
  const started = Date.now();
  try {
    await pgQuery('SELECT 1 AS ok');
    return { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function closePgPool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}
