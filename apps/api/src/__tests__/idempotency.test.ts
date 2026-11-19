import express from 'express';
import type { Server } from 'node:http';
import {
  idempotencyMiddleware,
  InMemoryIdempotencyStore,
} from '../middleware/idempotency.js';
import { requestIdMiddleware } from '../middleware/requestId.js';
import { errorHandlerMiddleware } from '../middleware/errorHandler.js';

export async function runIdempotencyTests(): Promise<void> {
  console.log('[TEST-SUITE] Running Idempotency Middleware Tests...');

  const store = new InMemoryIdempotencyStore();
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());

  let businessLogicExecutions = 0;

  // Sensitive mutating payment route requiring idempotency
  app.post(
    '/api/v1/payments',
    idempotencyMiddleware({ required: true, store }),
    async (req, res) => {
      businessLogicExecutions++;
      // Simulate minor processing latency
      await new Promise((r) => setTimeout(r, 20));
      res.status(201).json({
        data: {
          paymentId: `PAY-${businessLogicExecutions}`,
          amount: req.body.amount,
          status: 'recorded',
        },
      });
    }
  );

  app.use(errorHandlerMiddleware);

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to get test server address');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Missing Idempotency-Key header returns 400 Bad Request
    const resNoKey = await fetch(`${baseUrl}/api/v1/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 5000 }),
    });
    if (resNoKey.status !== 400) {
      throw new Error(`Expected 400 for missing Idempotency-Key, got ${resNoKey.status}`);
    }
    console.log('  ✓ Missing Idempotency-Key header is rejected with HTTP 400 Bad Request');

    // 2. Initial request with valid key executes business logic and returns 201
    const testKey = 'test-idempotency-key-001';
    const res1 = await fetch(`${baseUrl}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testKey,
      },
      body: JSON.stringify({ amount: 5000, patientId: 'PAT-101' }),
    });

    if (res1.status !== 201) {
      throw new Error(`Expected 201 on first mutation, got ${res1.status}`);
    }
    const json1 = (await res1.json()) as { data: { paymentId: string; amount: number } };
    if (businessLogicExecutions !== 1 || json1.data.paymentId !== 'PAY-1') {
      throw new Error(`Expected business logic to execute once, got ${businessLogicExecutions}`);
    }
    if (res1.headers.get('Idempotent-Replay')) {
      throw new Error('First response should NOT have Idempotent-Replay header');
    }
    console.log('  ✓ Initial request executes handler and successfully commits response');

    // 3. Second request with same key replays cached response without re-executing business logic
    const res2 = await fetch(`${baseUrl}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testKey,
      },
      body: JSON.stringify({ amount: 5000, patientId: 'PAT-101' }),
    });

    if (res2.status !== 201) {
      throw new Error(`Expected 201 on cached replay, got ${res2.status}`);
    }
    const replayHeader = res2.headers.get('Idempotent-Replay');
    if (replayHeader !== 'true') {
      throw new Error(`Expected Idempotent-Replay: true header, got ${replayHeader}`);
    }
    const json2 = (await res2.json()) as { data: { paymentId: string } };
    if (json2.data.paymentId !== 'PAY-1') {
      throw new Error('Replayed response body mismatch');
    }
    if (businessLogicExecutions !== 1) {
      throw new Error(`Handler was re-executed! Count: ${businessLogicExecutions}`);
    }
    console.log('  ✓ Identical request replays cached response with Idempotent-Replay: true');

    // 4. Request with same key but different payload returns 409 Conflict
    const resMismatch = await fetch(`${baseUrl}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': testKey,
      },
      body: JSON.stringify({ amount: 9999, patientId: 'PAT-DIFFERENT' }),
    });

    if (resMismatch.status !== 422) {
      throw new Error(`Expected 422 Unprocessable Entity for payload mismatch, got ${resMismatch.status}`);
    }
    console.log('  ✓ Reusing same Idempotency-Key with different payload rejects with 422 Unprocessable Entity');

    // 5. In-flight concurrent request conflict check
    const inFlightKey = 'test-inflight-key-999';
    await store.setPending(inFlightKey, '/api/v1/payments', 'some_payload_hash');

    const resInFlight = await fetch(`${baseUrl}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': inFlightKey,
      },
      body: JSON.stringify({ amount: 2000 }),
    });

    if (resInFlight.status !== 409) {
      throw new Error(`Expected 409 Conflict for in-flight request, got ${resInFlight.status}`);
    }
    console.log('  ✓ Concurrent in-flight request on same key returns HTTP 409 Conflict');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
