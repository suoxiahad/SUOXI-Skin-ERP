import { nextCode } from '../services/codeSequenceService.js';
import type { PoolClient } from 'pg';

export async function runCodeSequenceTests(): Promise<void> {
  console.log('[TEST-SUITE] Running Concurrency-Safe Code Sequence Tests (PostgreSQL)...');

  let currentNum = 0;
  let isLocked = false;
  const lockQueue: Array<() => void> = [];

  const acquireLock = async () => {
    if (!isLocked) {
      isLocked = true;
      return;
    }
    await new Promise<void>((resolve) => lockQueue.push(resolve));
    isLocked = true;
  };

  const releaseLock = () => {
    isLocked = false;
    const next = lockQueue.shift();
    if (next) next();
  };

  const createMockClient = (): PoolClient => {
    return {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes('FOR UPDATE')) {
          await acquireLock();
          if (currentNum === 0) {
            return { rows: [] };
          }
          return { rows: [{ current_number: currentNum, prefix: 'PAT-', padding: 5 }] };
        }
        if (sql.includes('INSERT INTO code_sequences')) {
          currentNum = Number(params?.[3] ?? 1);
          releaseLock();
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('UPDATE code_sequences')) {
          currentNum = Number(params?.[0] ?? currentNum + 1);
          releaseLock();
          return { rows: [], rowCount: 1 };
        }
        return { rows: [] };
      },
      release: () => {},
    } as unknown as PoolClient;
  };

  const concurrentCalls = 20;
  const promises: Promise<string>[] = [];

  for (let i = 0; i < concurrentCalls; i++) {
    const client = createMockClient();
    promises.push(nextCode(client, 'PATIENT'));
  }

  const generatedCodes = await Promise.all(promises);

  if (generatedCodes.length !== 20) {
    throw new Error(`Expected 20 generated codes, got ${generatedCodes.length}`);
  }

  const uniqueCodes = new Set(generatedCodes);
  if (uniqueCodes.size !== 20) {
    throw new Error(`Duplicate codes detected! Unique: ${uniqueCodes.size}, Total: 20`);
  }

  for (let i = 1; i <= 20; i++) {
    const expected = `PAT-${String(i).padStart(5, '0')}`;
    if (!uniqueCodes.has(expected)) {
      throw new Error(`Missing expected sequence code: ${expected}`);
    }
  }

  console.log('  ✓ 20 concurrent nextCode("PATIENT") invocations produced 20 unique, sequential, gap-free codes');
}
