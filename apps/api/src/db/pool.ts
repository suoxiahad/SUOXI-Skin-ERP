import pg, { type Pool, type PoolConfig } from 'pg';
import { getConfig } from '../config/env.js';
import { logger } from '../logger/logger.js';

const { Pool: PgPool } = pg;

let activePool: Pool | null = null;

export function getPoolConfig(): PoolConfig {
  const config = getConfig();

  if (
    config.DATABASE_URL &&
    (config.DATABASE_URL.startsWith('postgresql://') || config.DATABASE_URL.startsWith('postgres://'))
  ) {
    return {
      connectionString: config.DATABASE_URL,
      max: config.DB_POOL_MAX,
      connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT_MS,
      idleTimeoutMillis: 30000,
    };
  }

  return {
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    max: config.DB_POOL_MAX,
    connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: 30000,
  };
}

export function getDbPool(): Pool {
  if (!activePool) {
    const poolConfig = getPoolConfig();
    activePool = new PgPool(poolConfig);
    logger.info(
      { host: poolConfig.host || 'connectionString', database: poolConfig.database || 'from_url' },
      'PostgreSQL connection pool initialized'
    );
  }
  return activePool;
}

export function setDbPool(mockPool: Pool | null): void {
  activePool = mockPool;
}

export async function closeDbPool(): Promise<void> {
  if (activePool) {
    try {
      await activePool.end();
    } catch (err) {
      logger.warn({ err }, 'Error closing PostgreSQL connection pool');
    } finally {
      activePool = null;
    }
  }
}

export interface DbHealthResult {
  status: 'ready' | 'pending_schema' | 'error';
  message?: string;
  latencyMs?: number;
}

function formatDbError(err: unknown): string {
  if (err instanceof Error) {
    const anyErr = err as Error & { code?: string };
    const codePrefix = anyErr.code ? `[${anyErr.code}] ` : '';
    return `${codePrefix}${anyErr.message || String(err)}`.trim();
  }
  return String(err);
}

export async function checkDbHealth(): Promise<DbHealthResult> {
  const start = Date.now();
  const pool = getDbPool();

  try {
    const pingRes = await pool.query('SELECT 1 AS ping');
    const rows = Array.isArray(pingRes) ? pingRes[0] : pingRes?.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return {
        status: 'error',
        message: 'Empty response from database ping query',
        latencyMs: Date.now() - start,
      };
    }
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const errorMessage = formatDbError(err);
    logger.debug({ err: errorMessage }, 'PostgreSQL health check ping failed');
    return {
      status: 'error',
      message: errorMessage,
      latencyMs,
    };
  }

  try {
    const migRes = await pool.query('SELECT 1 FROM schema_migrations LIMIT 1');
    const rows = Array.isArray(migRes) ? migRes[0] : migRes?.rows;
    const latencyMs = Date.now() - start;

    if (Array.isArray(rows) && rows.length > 0) {
      return {
        status: 'ready',
        message: 'PostgreSQL connected and migrations verified',
        latencyMs,
      };
    }

    return {
      status: 'pending_schema',
      message: 'PostgreSQL connected, but no migrations have been applied yet. Please run database migrations.',
      latencyMs,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const dbErr = err as { code?: string } | null;

    // 42P01 = PostgreSQL undefined_table
    if (dbErr?.code === '42P01') {
      return {
        status: 'pending_schema',
        message: 'PostgreSQL connected, but schema_migrations table does not exist. Please run database migrations.',
        latencyMs,
      };
    }

    const errorMessage = formatDbError(err);
    logger.debug({ err: errorMessage }, 'PostgreSQL schema_migrations verification failed');
    return {
      status: 'error',
      message: errorMessage,
      latencyMs,
    };
  }
}
