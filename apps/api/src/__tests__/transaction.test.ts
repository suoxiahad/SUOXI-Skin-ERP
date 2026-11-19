import {
  withTransaction,
  isRetryableError,
  RETRYABLE_MYSQL_ERROR_CODES,
} from '../db/transaction.js';
import type { Pool, PoolConnection } from 'mysql2/promise';

export async function runTransactionTests(): Promise<void> {
  console.log('[TEST-SUITE] Running Transaction & Deadlock Retry Tests...');

  // 1. Verify retryable error detection
  if (!isRetryableError({ errno: 1213 })) {
    throw new Error('errno 1213 should be detected as retryable deadlock');
  }
  if (!isRetryableError({ code: 'ER_LOCK_DEADLOCK' })) {
    throw new Error('ER_LOCK_DEADLOCK should be detected as retryable');
  }
  if (!isRetryableError({ errno: 1205 })) {
    throw new Error('errno 1205 should be detected as retryable lock timeout');
  }
  if (!isRetryableError({ code: 'ER_LOCK_WAIT_TIMEOUT' })) {
    throw new Error('ER_LOCK_WAIT_TIMEOUT should be detected as retryable');
  }
  if (isRetryableError({ errno: 1062, code: 'ER_DUP_ENTRY' })) {
    throw new Error('ER_DUP_ENTRY must not be retryable');
  }
  console.log('  ✓ Retryable deadlock (1213) and lock wait timeout (1205) correctly classified');

  // 2. Mock Pool & Connection to simulate deadlock on attempt 1, success on attempt 2
  let connectionAcquisitions = 0;
  let beginTransactionCalls = 0;
  let commitCalls = 0;
  let rollbackCalls = 0;
  let releaseCalls = 0;

  const mockConnection = {
    beginTransaction: async () => {
      beginTransactionCalls++;
    },
    commit: async () => {
      commitCalls++;
    },
    rollback: async () => {
      rollbackCalls++;
    },
    release: () => {
      releaseCalls++;
    },
  } as unknown as PoolConnection;

  const mockPool = {
    getConnection: async () => {
      connectionAcquisitions++;
      return mockConnection;
    },
  } as unknown as Pool;

  let executionCount = 0;

  const result = await withTransaction(
    async () => {
      executionCount++;
      if (executionCount === 1) {
        // First attempt: simulate MySQL 1213 deadlock
        const deadlockError = new Error('Deadlock found when trying to get lock; try restarting transaction');
        (deadlockError as unknown as Record<string, unknown>).errno = 1213;
        (deadlockError as unknown as Record<string, unknown>).code = 'ER_LOCK_DEADLOCK';
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
  if (executionCount !== 2) {
    throw new Error(`Expected exactly 2 executions (1 retry), got ${executionCount}`);
  }
  if (rollbackCalls !== 1) {
    throw new Error(`Expected 1 rollback on failed attempt, got ${rollbackCalls}`);
  }
  if (commitCalls !== 1) {
    throw new Error(`Expected 1 commit on successful attempt, got ${commitCalls}`);
  }
  if (releaseCalls !== 2) {
    throw new Error(`Expected 2 connection releases, got ${releaseCalls}`);
  }
  console.log('  ✓ Transaction retries after deadlock (1213) and succeeds on next attempt');

  // 3. Test non-retryable error is not retried
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
