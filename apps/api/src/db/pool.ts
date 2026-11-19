import mysql, { Pool, PoolOptions } from 'mysql2/promise';
import { getConfig } from '../config/env.js';
import { logger } from '../logger/logger.js';

let activePool: Pool | null = null;
let isConfigured = false;

export function getPoolConfig(): PoolOptions {
  const config = getConfig();

  // If a full DATABASE_URL is provided, prioritize it
  if (config.DATABASE_URL && config.DATABASE_URL.startsWith('mysql://')) {
    return {
      uri: config.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: config.DB_POOL_MAX,
      queueLimit: 0,
      connectTimeout: config.DB_CONNECTION_TIMEOUT_MS,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      charset: 'utf8mb4',
    };
  }

  return {
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    waitForConnections: true,
    connectionLimit: config.DB_POOL_MAX,
    queueLimit: 0,
    connectTimeout: config.DB_CONNECTION_TIMEOUT_MS,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    charset: 'utf8mb4',
  };
}

export function getDbPool(): Pool {
  if (!activePool) {
    const poolConfig = getPoolConfig();
    activePool = mysql.createPool(poolConfig);
    isConfigured = true;
    logger.info({ host: poolConfig.host, database: poolConfig.database }, 'MySQL connection pool initialized');
  }
  return activePool;
}

export function setDbPool(mockPool: Pool | null): void {
  activePool = mockPool;
  isConfigured = !!mockPool;
}

export async function closeDbPool(): Promise<void> {
  if (activePool) {
    try {
      await activePool.end();
    } catch (err) {
      logger.warn({ err }, 'Error closing MySQL connection pool');
    } finally {
      activePool = null;
      isConfigured = false;
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
    const anyErr = err as Error & { code?: string; errors?: unknown[] };
    const codePrefix = anyErr.code ? `[${anyErr.code}] ` : '';
    const nested = Array.isArray(anyErr.errors)
      ? anyErr.errors
          .map((e) => (e instanceof Error ? e.message : String(e)))
          .filter(Boolean)
          .join('; ')
      : '';
    const msg = anyErr.message || nested || String(err);
    return `${codePrefix}${msg}`.trim();
  }
  return String(err);
}

/**
 * Checks real MySQL connectivity and migration schema state:
 * 1. Ping succeeds + schema_migrations exists with >= 1 row -> 'ready'
 * 2. Ping succeeds, but schema_migrations is missing or empty -> 'pending_schema'
 * 3. Ping or connection fails -> 'error' with actual error message (never masked as pending_schema)
 */
export async function checkDbHealth(): Promise<DbHealthResult> {
  const start = Date.now();
  const pool = getDbPool();

  try {
    const [pingRows] = await pool.query('SELECT 1 as ping');
    if (!Array.isArray(pingRows) || pingRows.length === 0) {
      return {
        status: 'error',
        message: 'Empty response from database ping query',
        latencyMs: Date.now() - start,
      };
    }
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const errorMessage = formatDbError(err);
    logger.debug({ err: errorMessage }, 'Database health check ping failed');

    return {
      status: 'error',
      message: errorMessage,
      latencyMs,
    };
  }

  try {
    const [migRows] = await pool.query('SELECT 1 FROM schema_migrations LIMIT 1');
    const latencyMs = Date.now() - start;

    if (Array.isArray(migRows) && migRows.length > 0) {
      return {
        status: 'ready',
        message: 'Database connected and migrations verified',
        latencyMs,
      };
    }

    return {
      status: 'pending_schema',
      message: 'Database connected, but no migrations have been applied yet. Please run database migrations.',
      latencyMs,
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const dbErr = err as { code?: string; errno?: number } | null;

    if (dbErr?.code === 'ER_NO_SUCH_TABLE' || dbErr?.errno === 1146) {
      return {
        status: 'pending_schema',
        message: 'Database connected, but schema_migrations table does not exist. Please run database migrations.',
        latencyMs,
      };
    }

    const errorMessage = formatDbError(err);
    logger.debug({ err: errorMessage }, 'Database schema_migrations verification failed');

    return {
      status: 'error',
      message: errorMessage,
      latencyMs,
    };
  }
}
