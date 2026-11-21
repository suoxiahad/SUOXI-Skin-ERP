import type { Pool, PoolClient } from 'pg';
import { getDbPool } from './pool.js';
import { logger } from '../logger/logger.js';

export const RETRYABLE_PG_ERROR_CODES = new Set([
  '40P01', // deadlock_detected
  '40001', // serialization_failure
  '55P03', // lock_not_available
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
  if (typeof anyErr.code === 'string' && RETRYABLE_PG_ERROR_CODES.has(anyErr.code)) {
    return true;
  }
  return false;
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes operations inside a PostgreSQL ACID transaction with automatic retry
 * on PostgreSQL deadlock (40P01), serialization failure (40001), and lock timeout (55P03).
 */
export async function withTransaction<T>(
  action: (client: PoolClient) => Promise<T>,
  options: TransactionOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 50;
  const maxDelayMs = options.maxDelayMs ?? 1000;
  const pool = options.pool ?? getDbPool();

  let attempt = 0;

  while (attempt <= maxRetries) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await action(client);

      await client.query('COMMIT');
      return result;
    } catch (err: unknown) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        logger.warn({ rollbackErr }, 'Error during PostgreSQL transaction rollback');
      }

      if (isRetryableError(err) && attempt < maxRetries) {
        attempt++;
        const jitter = Math.random() * 20;
        const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt) + jitter);

        logger.warn(
          { attempt, maxRetries, delayMs: Math.round(delay), err },
          'PostgreSQL deadlock or serialization conflict encountered. Retrying transaction...'
        );

        await sleep(delay);
        continue;
      }

      throw err;
    } finally {
      client.release();
    }
  }

  throw new Error(`Transaction failed after ${maxRetries} retry attempts`);
}
