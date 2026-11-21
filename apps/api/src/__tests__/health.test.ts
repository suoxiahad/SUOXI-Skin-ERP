import assert from 'node:assert/strict';
import { createApiApp } from '../app.js';
import { setDbPool } from '../db/pool.js';
import type { Server } from 'node:http';

export async function runHealthAndReadinessTests(): Promise<void> {
  console.log('[TEST-SUITE] Running Health, Readiness & Security Header Tests...');

  const app = createApiApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to obtain server test address');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Test GET /api/v1/health
    const healthRes = await fetch(`${baseUrl}/api/v1/health`);
    if (healthRes.status !== 200) {
      throw new Error(`GET /api/v1/health returned status ${healthRes.status}, expected 200`);
    }
    const healthJson = (await healthRes.json()) as {
      data?: { status?: string; service?: string };
      meta?: { requestId?: string };
    };
    if (healthJson.data?.status !== 'healthy' || healthJson.data?.service !== 'suoxi-api') {
      throw new Error(`GET /api/v1/health returned unexpected payload: ${JSON.stringify(healthJson)}`);
    }
    if (!healthJson.meta?.requestId) {
      throw new Error('GET /api/v1/health missing meta.requestId in envelope');
    }
    console.log('  ✓ GET /api/v1/health returns HTTP 200 with healthy service status and requestId');

    // 2. Test GET /api/v1/ready & GET /readyz when ping fails -> 503 with status 'error' (never pending_schema)
    setDbPool({
      query: async () => {
        throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), { code: 'ECONNREFUSED' });
      },
    } as any);

    const errReadyRes = await fetch(`${baseUrl}/api/v1/ready`);
    assert.equal(errReadyRes.status, 503, 'GET /api/v1/ready must return 503 on DB connection error');
    const errReadyJson = (await errReadyRes.json()) as any;
    assert.equal(errReadyJson.data.status, 'not_ready');
    assert.equal(errReadyJson.data.dependencies.database.status, 'error');
    assert.match(errReadyJson.data.dependencies.database.message, /ECONNREFUSED/);

    const errReadyzRes = await fetch(`${baseUrl}/readyz`);
    assert.equal(errReadyzRes.status, 503, 'GET /readyz must return 503 on DB connection error');
    const errReadyzJson = (await errReadyzRes.json()) as any;
    assert.equal(errReadyzJson.status, 'not_ready');
    assert.equal(errReadyzJson.database.status, 'error');
    console.log('  ✓ /api/v1/ready and /readyz return 503 with status="error" when DB ping fails');

    // 3a. Test ping succeeds but schema_migrations is missing -> 503 with status 'pending_schema'
    setDbPool({
      query: async (sql: string) => {
        if (/SELECT 1 AS ping/i.test(sql)) return { rows: [{ ping: 1 }], rowCount: 1 };
        throw Object.assign(new Error('relation "schema_migrations" does not exist'), {
          code: '42P01',
        });
      },
    } as any);

    const missingTableReadyRes = await fetch(`${baseUrl}/api/v1/ready`);
    assert.equal(missingTableReadyRes.status, 503);
    const missingTableJson = (await missingTableReadyRes.json()) as any;
    assert.equal(missingTableJson.data.status, 'not_ready');
    assert.equal(missingTableJson.data.dependencies.database.status, 'pending_schema');
    assert.match(missingTableJson.data.dependencies.database.message, /migration/i);

    // 3b. Test ping succeeds and schema_migrations exists but empty -> 503 with status 'pending_schema'
    setDbPool({
      query: async (sql: string) => {
        if (/SELECT 1 AS ping/i.test(sql)) return { rows: [{ ping: 1 }], rowCount: 1 };
        return { rows: [], rowCount: 0 };
      },
    } as any);

    const emptyMigReadyRes = await fetch(`${baseUrl}/api/v1/ready`);
    assert.equal(emptyMigReadyRes.status, 503);
    const emptyMigJson = (await emptyMigReadyRes.json()) as any;
    assert.equal(emptyMigJson.data.status, 'not_ready');
    assert.equal(emptyMigJson.data.dependencies.database.status, 'pending_schema');
    assert.match(emptyMigJson.data.dependencies.database.message, /migration/i);

    const emptyMigReadyzRes = await fetch(`${baseUrl}/readyz`);
    assert.equal(emptyMigReadyzRes.status, 503);
    const emptyMigReadyzJson = (await emptyMigReadyzRes.json()) as any;
    assert.equal(emptyMigReadyzJson.database.status, 'pending_schema');
    console.log('  ✓ /api/v1/ready and /readyz return 503 with status="pending_schema" when schema_migrations is missing or empty');

    // 4. Test ping succeeds and schema_migrations has >= 1 row -> 200 with status 'ready'
    setDbPool({
      query: async (sql: string) => {
        if (/SELECT 1 AS ping/i.test(sql)) return { rows: [{ ping: 1 }], rowCount: 1 };
        return { rows: [{ '?column?': 1 }], rowCount: 1 };
      },
    } as any);

    const readyRes = await fetch(`${baseUrl}/api/v1/ready`);
    assert.equal(readyRes.status, 200, 'GET /api/v1/ready must return 200 when ping and schema_migrations succeed');
    const readyJson = (await readyRes.json()) as any;
    assert.equal(readyJson.data.status, 'ready');
    assert.equal(readyJson.data.dependencies.database.status, 'ready');

    const readyzRes = await fetch(`${baseUrl}/readyz`);
    assert.equal(readyzRes.status, 200, 'GET /readyz must return 200 when DB is ready');
    const readyzJson = (await readyzRes.json()) as any;
    assert.equal(readyzJson.status, 'ready');
    assert.equal(readyzJson.database.status, 'ready');
    console.log('  ✓ /api/v1/ready and /readyz return 200 with status="ready" once migrations exist');

    // 4. Test Security Headers & Request ID propagation
    const customReqId = 'custom-test-trace-id-999';
    const probeRes = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { 'X-Request-Id': customReqId },
    });
    if (probeRes.headers.get('X-Request-Id') !== customReqId) {
      throw new Error('X-Request-Id header was not preserved and echoed back');
    }
    if (probeRes.headers.get('X-Content-Type-Options') !== 'nosniff') {
      throw new Error('Missing X-Content-Type-Options security header');
    }
    if (probeRes.headers.get('X-Frame-Options') !== 'SAMEORIGIN') {
      throw new Error('Missing X-Frame-Options security header');
    }
    console.log('  ✓ Security headers and X-Request-Id propagation verified');

    // 5. Test 404 API-CONV fallback
    const notFoundRes = await fetch(`${baseUrl}/api/v1/non-existent-route`);
    if (notFoundRes.status !== 404) {
      throw new Error(`Expected 404, got ${notFoundRes.status}`);
    }
    const notFoundJson = (await notFoundRes.json()) as { error: { code: string; message: string; requestId: string } };
    if (notFoundJson.error.code !== 'NOT_FOUND' || !notFoundJson.error.requestId) {
      throw new Error(`Expected API-CONV 404 envelope, got: ${JSON.stringify(notFoundJson)}`);
    }
    console.log('  ✓ 404 fallback returns standard API-CONV error envelope');
  } finally {
    setDbPool(null);
    await new Promise((resolve) => server.close(resolve));
  }
}

// Allow direct execution
if (process.argv[1]?.endsWith('health.test.ts')) {
  runHealthAndReadinessTests().catch((err) => {
    console.error('[TEST-ERROR]', err);
    process.exit(1);
  });
}
