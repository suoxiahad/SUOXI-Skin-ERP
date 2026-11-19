import express from 'express';
import type { Server } from 'node:http';
import { z } from 'zod';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  errorHandlerMiddleware,
} from '../middleware/errorHandler.js';
import { validateBody } from '../middleware/validation.js';
import { requestIdMiddleware } from '../middleware/requestId.js';

export async function runErrorTests(): Promise<void> {
  console.log('[TEST-SUITE] Running API-CONV Error Handling Tests...');

  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());

  // Test route 1: AppError (400 Bad Request)
  app.get('/test/bad-request', () => {
    throw new BadRequestError('Invalid filter parameter provided', { field: 'filter' });
  });

  // Test route 2: AppError (409 Conflict)
  app.get('/test/conflict', () => {
    throw new ConflictError('Patient record already exists with phone number');
  });

  // Test route 3: Zod validation error (422)
  const userSchema = z.object({
    phone: z.string().regex(/^\+8801[3-9]\d{8}$/, 'Must be valid Bangladesh phone'),
    amount: z.number().positive(),
  });
  app.post('/test/validate', validateBody(userSchema), (req, res) => {
    res.json({ success: true, body: req.body });
  });

  // Test route 4: Unexpected database / system error (500)
  app.get('/test/raw-sql-error', () => {
    const rawSqlError = new Error(
      "Table 'suoxi_crm.patients_private' doesn't exist in SELECT * FROM patients_private WHERE secret_hash = 'abcdef'"
    );
    (rawSqlError as unknown as Record<string, unknown>).code = 'ER_NO_SUCH_TABLE';
    (rawSqlError as unknown as Record<string, unknown>).errno = 1146;
    (rawSqlError as unknown as Record<string, unknown>).sql = 'SELECT * FROM patients_private';
    throw rawSqlError;
  });

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
    // 1. Verify 400 Bad Request
    const res1 = await fetch(`${baseUrl}/test/bad-request`);
    if (res1.status !== 400) {
      throw new Error(`Expected status 400, got ${res1.status}`);
    }
    const json1 = (await res1.json()) as { error: { code: string; message: string; requestId: string } };
    if (json1.error.code !== 'BAD_REQUEST' || !json1.error.requestId) {
      throw new Error(`Invalid error envelope: ${JSON.stringify(json1)}`);
    }
    console.log('  ✓ 400 Bad Request returns standard API-CONV error envelope');

    // 2. Verify 409 Conflict
    const res2 = await fetch(`${baseUrl}/test/conflict`);
    if (res2.status !== 409) {
      throw new Error(`Expected status 409, got ${res2.status}`);
    }
    const json2 = (await res2.json()) as { error: { code: string; message: string } };
    if (json2.error.code !== 'CONFLICT') {
      throw new Error(`Expected code CONFLICT, got ${json2.error.code}`);
    }
    console.log('  ✓ 409 Conflict returns standard API-CONV error envelope');

    // 3. Verify Zod validation error returns 422 with issues
    const res3 = await fetch(`${baseUrl}/test/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: 'invalid-phone', amount: -50 }),
    });
    if (res3.status !== 422) {
      throw new Error(`Expected status 422, got ${res3.status}`);
    }
    const json3 = (await res3.json()) as {
      error: { code: string; details: Array<{ path: string; message: string }> };
    };
    if (json3.error.code !== 'VALIDATION_ERROR' || !Array.isArray(json3.error.details)) {
      throw new Error(`Expected VALIDATION_ERROR details, got ${JSON.stringify(json3)}`);
    }
    console.log('  ✓ Zod validation errors return HTTP 422 with field paths');

    // 4. Verify 500 error does NOT leak raw SQL or stack traces to client
    const res4 = await fetch(`${baseUrl}/test/raw-sql-error`);
    if (res4.status !== 500) {
      throw new Error(`Expected status 500, got ${res4.status}`);
    }
    const json4Text = await res4.text();
    if (json4Text.includes('patients_private') || json4Text.includes('secret_hash') || json4Text.includes('ER_NO_SUCH_TABLE')) {
      throw new Error('LEAK DETECTED: Response body leaked raw database table names/SQL errors!');
    }
    const json4 = JSON.parse(json4Text) as { error: { code: string; message: string; requestId: string } };
    if (json4.error.code !== 'INTERNAL_ERROR' || json4.error.message !== 'Internal server error occurred') {
      throw new Error(`Expected masked internal error, got: ${json4Text}`);
    }
    console.log('  ✓ Unexpected SQL errors are securely masked without leaking table names or stack traces');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
