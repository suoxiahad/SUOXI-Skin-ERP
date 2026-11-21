import {
  withTransaction,
  isRetryableError,
  RETRYABLE_PG_ERROR_CODES,
} from '../db/transaction.js';
import type { Pool, PoolClient } from 'pg';

export async function runTransactionTests(): Promise<void> {
  console.log('[TEST-SUITE] Running PostgreSQL Transaction & Deadlock Retry Tests...');

  if (!RETRYABLE_PG_ERROR_CODES.has('40P01') || !RETRYABLE_PG_ERROR_CODES.has('40001')) {
    throw new Error('Expected PostgreSQL deadlock (40P01) and serialization (40001) codes in retryable set');
  }
  if (!isRetryableError({ code: '40P01' })) {
    throw new Error('40P01 should be detected as retryable deadlock');
  }
  if (!isRetryableError({ code: '40001' })) {
    throw new Error('40001 should be detected as retryable serialization failure');
  }
  if (!isRetryableError({ code: '55P03' })) {
    throw new Error('55P03 should be detected as retryable lock_not_available');
  }
  if (isRetryableError({ code: '23505' })) {
    throw new Error('23505 (unique_violation) must not be retryable');
  }
  console.log('  ✓ Retryable PostgreSQL deadlock (40P01) and serialization (40001) errors correctly classified');

  let beginCalls = 0;
  let commitCalls = 0;
  let rollbackCalls = 0;
  let releaseCalls = 0;

  const mockClient = {
    query: async (sql: string) => {
      if (sql === 'BEGIN') beginCalls++;
      else if (sql === 'COMMIT') commitCalls++;
      else if (sql === 'ROLLBACK') rollbackCalls++;
      return { rows: [] };
    },
    release: () => {
      releaseCalls++;
    },
  } as unknown as PoolClient;

  const mockPool = {
    connect: async () => mockClient,
  } as unknown as Pool;

  let executionCount = 0;

  const result = await withTransaction(
    async () => {
      executionCount++;
      if (executionCount === 1) {
        const deadlockError = new Error('deadlock detected');
        (deadlockError as unknown as Record<string, unknown>).code = '40P01';
        throw deadlockError;
      }
      return { success: true, processedItem: 'invoice_session_txn' };
    },
    {
      maxRetries: 2,
      baseDelayMs: 5,
      pool: mockPool,
    }
  );

  if (result.processedItem !== 'invoice_session_txn') {
    throw new Error(`Unexpected transaction result: ${JSON.stringify(result)}`);
  }
  if (executionCount !== 2 || beginCalls !== 2 || rollbackCalls !== 1 || commitCalls !== 1 || releaseCalls !== 2) {
    throw new Error(
      `Unexpected counts: exec=${executionCount}, begin=${beginCalls}, rollback=${rollbackCalls}, commit=${commitCalls}, release=${releaseCalls}`
    );
  }
  console.log('  ✓ Transaction retries after PostgreSQL deadlock (40P01) and succeeds on next attempt');

  let nonRetryableExecutions = 0;
  try {
    await withTransaction(
      async () => {
        nonRetryableExecutions++;
        throw new Error('Non-retryable business logic validation failure');
      },
      {
        maxRetries: 3,
        baseDelayMs: 5,
        pool: mockPool,
      }
    );
    throw new Error('Should have thrown non-retryable error');
  } catch (err: unknown) {
    if ((err as Error).message !== 'Non-retryable business logic validation failure') {
      throw err;
    }
  }

  if (nonRetryableExecutions !== 1) {
    throw new Error(`Non-retryable error should only execute once, executed ${nonRetryableExecutions} times`);
  }
  console.log('  ✓ Non-retryable errors fail immediately without wasteful retries');
}
