import type { Pool, PoolConnection } from 'mysql2/promise';
import { getDbPool } from './pool.js';
import { logger } from '../logger/logger.js';

export const RETRYABLE_MYSQL_ERROR_CODES = new Set([
  '1213',
  1213,
  'ER_LOCK_DEADLOCK',
  '1205',
  1205,
  'ER_LOCK_WAIT_TIMEOUT',
]);

export interface TransactionOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  pool?: Pool;
}

export function isRetryableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as Record<string, unknown>;

  if (anyErr.errno && RETRYABLE_MYSQL_ERROR_CODES.has(anyErr.errno as string | number)) {
    return true;
  }
  if (anyErr.code && RETRYABLE_MYSQL_ERROR_CODES.has(anyErr.code as string | number)) {
    return true;
  }
  return false;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes operations inside a database transaction with automatic retry
 * on MySQL deadlock (ER_LOCK_DEADLOCK 1213) and lock wait timeout (ER_LOCK_WAIT_TIMEOUT 1205).
 * 
 * Consistent Lock Order Principle:
 * Callers must always acquire locks on entities in a globally consistent order
 * (e.g., patient -> invoice -> payment -> stock_item) to minimize deadlocks.
 */
export async function withTransaction<T>(
  action: (conn: PoolConnection) => Promise<T>,
  options: TransactionOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 50;
  const maxDelayMs = options.maxDelayMs ?? 1000;
  const pool = options.pool ?? getDbPool();

  let attempt = 0;

  while (attempt <= maxRetries) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const result = await action(conn);

      await conn.commit();
      return result;
    } catch (err: unknown) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        logger.warn({ rollbackErr }, 'Error during transaction rollback');
      }

      if (isRetryableError(err) && attempt < maxRetries) {
        attempt++;
        const jitter = Math.random() * 20;
        const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt) + jitter);

        logger.warn(
          { attempt, maxRetries, delayMs: Math.round(delay), err },
          'Deadlock or lock wait timeout encountered. Retrying transaction...'
        );

        await sleep(delay);
        continue;
      }

      throw err;
    } finally {
      conn.release();
    }
  }

  throw new Error(`Transaction failed after ${maxRetries} retry attempts`);
}
