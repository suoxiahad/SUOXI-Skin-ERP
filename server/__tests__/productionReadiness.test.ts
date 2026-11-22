/**
 * SUOXI Skin Care & Aesthetic Center ERP
 * Real PostgreSQL End-to-End Production Readiness, Security & Concurrency QA Suite
 *
 * Uses `@electric-sql/pglite` (real compiled PostgreSQL engine) persisted to a
 * temporary filesystem directory so migrations, constraints, transactions,
 * restart durability, RBAC, branch isolation, financial integrity, concurrency,
 * private file streaming, and worker cycles are verified against real SQL without mocks.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { QueryResult, QueryResultRow } from 'pg';

// Ensure server.ts does not auto-listen when imported
process.env.SUOXI_NO_AUTOSTART = '1';
process.env.NODE_ENV = 'test';
process.env.APP_MASTER_KEY = crypto.randomBytes(32).toString('hex');
process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
process.env.PAYMENT_WEBHOOK_SECRET = 'test_pg_webhook_secret_32_bytes_minimum_value';
process.env.ENABLE_DEMO_ROLE_SWITCHER = 'false';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'suoxi-pg-qa-'));
const pgDataDir = path.join(tempRoot, 'pgdata');
const uploadDir = path.join(tempRoot, 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
process.env.UPLOAD_DIR = uploadDir;

import argon2 from 'argon2';
import {
  assertProductionSecurityOrThrow,
  sanitizeCsvCell,
  validateProductionSecurity,
} from '../config/securityConfig.ts';

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}
import { getMigrationStatus, runPgMigrations } from '../db/migrate.ts';
import {
  checkPgHealth,
  closePgPool,
  type PgLikeClient,
  type PgLikePool,
  pgQuery,
  setPgPoolOverride,
  withPgTransaction,
} from '../db/pgPool.ts';
import { pgBillingPackageRepo } from '../repositories/pgBillingPackageRepo.ts';
import { pgCallCenterReferralsRepo } from '../repositories/pgCallCenterReferralsRepo.ts';
import { pgInventoryRepo } from '../repositories/pgInventoryRepo.ts';
import {
  pgEnqueueNotification,
  pgGenerateReport,
} from '../repositories/pgNotificationsReportsRepo.ts';
import {
  INITIAL_SHANTINAGAR_BRANCH,
  provisionSuperAdminAndInitialBranch,
} from '../db/createAdmin.ts';
import { pgOpsSettingsRepo } from '../repositories/pgOpsSettingsRepo.ts';
import { pgOrgRepo } from '../repositories/pgOrgRepo.ts';
import { pgPatientClinicalRepo } from '../repositories/pgPatientClinicalRepo.ts';
import {
  pgCompletePortalSetup,
  pgProvisionPortalAccount,
} from '../repositories/pgPortalRepo.ts';
import {
  acquireIdempotencyKey,
  completeIdempotencyKey,
  issuePersistentCsrfToken,
  recordPersistentLoginFailure,
  validatePersistentCsrfToken,
} from '../repositories/pgSecurityStoreRepo.ts';
import { savePrivateFileBuffer } from '../storage/localFileStorage.ts';
import { runSingleWorkerPass } from '../worker.ts';

/**
 * Wraps a real PGlite PostgreSQL instance into `PgLikePool` with serialized
 * transaction checkout so `Promise.all` concurrent `withPgTransaction` calls
 * faithfully test ACID locking and database constraints.
 */
function createPGlitePool(db: PGlite): PgLikePool {
  let txChain: Promise<void> = Promise.resolve();

  const execSql = async <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> => {
    const trimmed = text.trim();
    const hasParams = Array.isArray(params) && params.length > 0;
    // Multi-statement SQL scripts (migrations) use PGlite.exec()
    const looksMultiStatement =
      !hasParams &&
      trimmed.replace(/--[^\n]*\n/g, '').split(';').filter((s) => s.trim().length > 0).length > 1;

    if (looksMultiStatement) {
      const results = await db.exec(text);
      const last = results[results.length - 1];
      const rows = (last?.rows || []) as T[];
      return {
        command: 'EXEC',
        oid: 0,
        fields: [],
        rows,
        rowCount: rows.length,
      };
    }

    const res = await db.query<T>(text, hasParams ? params : undefined);
    return {
      command: trimmed.split(/\s+/)[0]?.toUpperCase() || 'QUERY',
      oid: 0,
      fields: [],
      rows: res.rows,
      rowCount: res.rows.length > 0 ? res.rows.length : (res.affectedRows ?? 0),
    };
  };

  const acquireClientLock = async (): Promise<() => void> => {
    let releaseFn!: () => void;
    const next = new Promise<void>((resolve) => {
      releaseFn = resolve;
    });
    const prev = txChain;
    txChain = txChain.then(() => next);
    await prev;
    return releaseFn;
  };

  return {
    async query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> {
      const release = await acquireClientLock();
      try {
        return await execSql<T>(text, params);
      } finally {
        release();
      }
    },
    async connect(): Promise<PgLikeClient> {
      const release = await acquireClientLock();
      let released = false;
      return {
        query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) {
          return execSql<T>(text, params);
        },
        release() {
          if (!released) {
            released = true;
            release();
          }
        },
      };
    },
    async end() {
      await db.close();
    },
  };
}

async function seedCoreFixtures() {
  // Branches
  await pgQuery(
    `INSERT INTO branches (id, name, name_bn, code, address, city, phone, email, is_active)
     VALUES
       ('br-dhanmondi', 'Dhanmondi Main Center', 'ধানমন্ডি', 'DHN', 'House 42, Dhanmondi', 'Dhaka', '+88029671122', 'dhn@suoxi.tech', TRUE),
       ('br-gulshan', 'Gulshan Lounge', 'গুলশান', 'GLS', 'Road 71, Gulshan-2', 'Dhaka', '+88029881122', 'gls@suoxi.tech', TRUE)
     ON CONFLICT (id) DO NOTHING`
  );

  const adminHash = await hashPassword('AdminStrong#2026!');
  const docHash = await hashPassword('DoctorStrong#2026!');
  const recepHash = await hashPassword('RecepStrong#2026!');

  // Users
  await pgQuery(
    `INSERT INTO users (id, employee_id, name, email, role, phone, branch_id, branch_name, status, password_hash, must_change_password)
     VALUES
       ('usr-admin', 'SX-1001', 'Super Admin', 'admin@suoxi.tech', 'super_admin', '+8801700000001', 'br-dhanmondi', 'Dhanmondi Main Center', 'active', $1, FALSE),
       ('usr-doc-dhn', 'SX-1002', 'Dr. Nusrat Jahan', 'doctor.dhn@suoxi.tech', 'doctor', '+8801700000002', 'br-dhanmondi', 'Dhanmondi Main Center', 'active', $2, FALSE),
       ('usr-recep-dhn', 'SX-1003', 'Fatima Reception', 'recep.dhn@suoxi.tech', 'receptionist', '+8801700000003', 'br-dhanmondi', 'Dhanmondi Main Center', 'active', $3, FALSE),
       ('usr-recep-gls', 'SX-1004', 'Gulshan Desk', 'recep.gls@suoxi.tech', 'receptionist', '+8801700000004', 'br-gulshan', 'Gulshan Lounge', 'active', $3, FALSE)
     ON CONFLICT (id) DO NOTHING`,
    [adminHash, docHash, recepHash]
  );

  await pgQuery(
    `INSERT INTO clinic_roles (id, name, description, is_system_role, permissions)
     VALUES
       ('super_admin', 'Super Admin', 'Full access', TRUE, '["*"]'::jsonb),
       ('receptionist', 'Receptionist', 'Front desk', TRUE, '["patients.read","patients.write","appointments.read","appointments.write"]'::jsonb)
     ON CONFLICT (id) DO NOTHING`
  );

  // Two patients in different branches
  await pgQuery(
    `INSERT INTO patients (id, patient_id_code, name, phone, gender, age, city, branch_id)
     VALUES
       ('pt-dhn-1', 'SX-2026-0001', 'Taslima Akter', '+8801712345678', 'female', 29, 'Dhaka', 'br-dhanmondi'),
       ('pt-gls-1', 'SX-2026-0002', 'Nadia Karim', '+8801712345679', 'female', 34, 'Dhaka', 'br-gulshan')
     ON CONFLICT (id) DO NOTHING`
  );
}

interface HttpResp {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: any;
  text: string;
}

async function httpReq(
  baseUrl: string,
  method: string,
  urlPath: string,
  opts: { headers?: Record<string, string>; body?: unknown } = {}
): Promise<HttpResp> {
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  const headers: http.IncomingHttpHeaders = {};
  res.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v;
  });
  return { status: res.status, headers, body, text };
}

function extractCookie(setCookieHeader: string | string[] | undefined, name: string): string {
  const raw = Array.isArray(setCookieHeader) ? setCookieHeader.join('; ') : String(setCookieHeader || '');
  const match = raw.match(new RegExp(`${name}=([^;]+)`));
  return match ? `${name}=${match[1]}` : '';
}

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  [FAIL] ${name}:`, err instanceof Error ? err.stack || err.message : err);
  }
}

async function main() {
  console.log('========================================================================');
  console.log('SUOXI Skin ERP — Real PostgreSQL Production Readiness & QA Test Suite');
  console.log('========================================================================');

  let pgDb = new PGlite(pgDataDir);
  await pgDb.waitReady;
  setPgPoolOverride(createPGlitePool(pgDb));

  // 1. Clean-database migrations + idempotency + checksum verification
  await test('1. Clean PostgreSQL migrations (0001 -> 0004) & idempotency', async () => {
    const first = await runPgMigrations({ silent: true, useAdvisoryLock: false });
    assert.equal(first.applied.length, 4, `Expected 4 migrations applied, got ${first.applied.join(',')}`);
    assert.deepEqual(first.applied, [
      '0001_initial_schema.sql',
      '0002_referrals_and_ops_columns.sql',
      '0003_complete_erp_modules_and_integrity.sql',
      '0004_staff_employee_id.sql',
    ]);

    const second = await runPgMigrations({ silent: true, useAdvisoryLock: false });
    assert.equal(second.applied.length, 0);
    assert.equal(second.skipped.length, 4);

    const status = await getMigrationStatus();
    assert.equal(status.every((s) => s.status === 'applied'), true);

    const health = await checkPgHealth();
    assert.equal(health.ok, true);
    assert.equal(health.schemaReady, true);
    assert.equal(health.migrationsApplied, 4);
  });

  await test('2. Migration checksum tampering detection rejects modified applied migrations', async () => {
    const original = await pgQuery<{ checksum: string }>(
      "SELECT checksum FROM schema_migrations WHERE filename = '0003_complete_erp_modules_and_integrity.sql'"
    );
    await pgQuery(
      "UPDATE schema_migrations SET checksum = 'deadbeef' WHERE filename = '0003_complete_erp_modules_and_integrity.sql'"
    );
    await assert.rejects(
      () => runPgMigrations({ silent: true, useAdvisoryLock: false }),
      /checksum mismatch/i
    );
    // Restore original checksum
    await pgQuery(
      "UPDATE schema_migrations SET checksum = $1 WHERE filename = '0003_complete_erp_modules_and_integrity.sql'",
      [original.rows[0].checksum]
    );
  });

  await seedCoreFixtures();

  // 3. Persistence across simulated server & DB restart
  await test('3. Durability proof: data survives PostgreSQL close & full reopen (restart simulation)', async () => {
    await pgQuery(
      `INSERT INTO patients (id, patient_id_code, name, phone, gender, age, city, branch_id)
       VALUES ('pt-restart-proof', 'SX-2026-9999', 'Restart Durable Patient', '+8801799999999', 'male', 31, 'Dhaka', 'br-dhanmondi')`
    );
    await closePgPool();
    // Reopen from same filesystem directory
    pgDb = new PGlite(pgDataDir);
    await pgDb.waitReady;
    setPgPoolOverride(createPGlitePool(pgDb));

    const fetched = await pgPatientClinicalRepo.findPatientByIdentifier('pt-restart-proof');
    assert.ok(fetched, 'Patient must survive DB close & reopen');
    assert.equal(fetched.name, 'Restart Durable Patient');
  });

  // 4. Production fail-closed startup configuration validation
  await test('4. Production security validator fails closed on missing secrets, MySQL URL, or demo flag', async () => {
    const badMysql = validateProductionSecurity({
      NODE_ENV: 'production',
      DATABASE_URL: 'mysql://root:pass@localhost:3306/db',
    });
    assert.equal(badMysql.valid, false);
    assert.ok(badMysql.errors.some((e) => /MySQL/i.test(e)));

    const badDemo = validateProductionSecurity({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/suoxi',
      ENABLE_DEMO_ROLE_SWITCHER: 'true',
      SESSION_SECRET: 'a'.repeat(32),
      APP_MASTER_KEY: 'b'.repeat(32),
    });
    assert.equal(badDemo.valid, false);
    assert.ok(badDemo.errors.some((e) => /ENABLE_DEMO_ROLE_SWITCHER/i.test(e)));

    const missingSecrets = validateProductionSecurity({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/suoxi',
    });
    assert.equal(missingSecrets.valid, false);
    assert.throws(() =>
      assertProductionSecurityOrThrow({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/suoxi',
      })
    );

    const goodProd = validateProductionSecurity({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@127.0.0.1:5432/suoxi',
      SESSION_SECRET: 'a'.repeat(64),
      APP_MASTER_KEY: 'b'.repeat(64),
      CORS_ORIGIN: 'https://erp.suoxi.tech',
    });
    assert.equal(goodProd.valid, true);
  });

  // 5. Persistent CSRF, Idempotency & Brute-force Lockout in PostgreSQL
  await test('5. Persistent PG CSRF tokens, Idempotency replay/conflict, and login lockout', async () => {
    const csrfToken = await issuePersistentCsrfToken({ sessionId: 'sess-test-1' });
    assert.equal(await validatePersistentCsrfToken(csrfToken), true);
    assert.equal(await validatePersistentCsrfToken('bogus-token'), false);

    const idemKey = `idem-test-${Date.now()}`;
    const first = await acquireIdempotencyKey({
      key: idemKey,
      method: 'POST',
      routePath: '/api/v1/invoices',
      actorScope: 'usr-admin',
      requestPayload: { amount: 5000 },
    });
    assert.equal(first.state, 'acquired');
    await completeIdempotencyKey({
      key: idemKey,
      method: 'POST',
      routePath: '/api/v1/invoices',
      actorScope: 'usr-admin',
      statusCode: 201,
      responseBody: { data: { id: 'inv-1' } },
    });

    const replay = await acquireIdempotencyKey({
      key: idemKey,
      method: 'POST',
      routePath: '/api/v1/invoices',
      actorScope: 'usr-admin',
      requestPayload: { amount: 5000 },
    });
    assert.equal(replay.state, 'replay');
    if (replay.state === 'replay') {
      assert.equal(replay.statusCode, 201);
    }

    const conflict = await acquireIdempotencyKey({
      key: idemKey,
      method: 'POST',
      routePath: '/api/v1/invoices',
      actorScope: 'usr-admin',
      requestPayload: { amount: 9999 },
    });
    assert.equal(conflict.state, 'conflict');

    let lockoutRes = { blocked: false, failedCount: 0 };
    for (let i = 0; i < 10; i += 1) {
      lockoutRes = await recordPersistentLoginFailure('locked-user@suoxi.tech:10.0.0.1', 'combined');
    }
    assert.equal(lockoutRes.blocked, true);
  });

  // 6. Transaction Rollback Atomicity Proof
  await test('6. ACID transaction rollback atomicity leaves zero partial rows on failure', async () => {
    await assert.rejects(
      () =>
        withPgTransaction(async (client) => {
          await client.query(
            `INSERT INTO patients (id, patient_id_code, name, phone, gender, city, branch_id)
             VALUES ('pt-rollback-1', 'SX-2026-8888', 'Should Rollback', '+8801788888888', 'female', 'Dhaka', 'br-dhanmondi')`
          );
          throw new Error('SIMULATED_MID_TX_CRASH');
        }),
      /SIMULATED_MID_TX_CRASH/
    );
    const check = await pgQuery("SELECT id FROM patients WHERE id = 'pt-rollback-1'");
    assert.equal(check.rowCount, 0);
  });

  // 7. Concurrent Inventory Stock Deduction (Anti-Overselling)
  await test('7. Concurrent inventory deductions cannot oversell or produce negative stock', async () => {
    const admin = {
      id: 'usr-admin',
      name: 'Super Admin',
      email: 'admin@suoxi.tech',
      role: 'super_admin' as const,
      phone: '+8801700000001',
      branchId: 'br-dhanmondi',
      branchName: 'Dhanmondi Main Center',
    };
    const item = await pgInventoryRepo.createInventoryItem(
      {
        name: 'HydraFacial Serum Vial',
        category: 'Serums & Peels',
        brand: 'SuoxiLab',
        productType: 'consumable',
        currentStock: 5,
        unit: 'vials',
        reorderLevel: 2,
        unitCostBDT: 800,
        sellingPriceBDT: 2000,
        batchNumber: 'BATCH-CONC-1',
        expiryDate: '2027-12-31',
        branchId: 'br-dhanmondi',
        branchName: 'Dhanmondi Main Center',
      },
      admin,
      '127.0.0.1'
    );

    // Fire 4 concurrent deductions of 2 vials each against 5 in stock -> max 2 can succeed!
    const outcomes = await Promise.allSettled([
      pgInventoryRepo.adjustStock({ itemId: item.id, adjustmentType: 'clinic_use', quantityDelta: -2, reason: 'Concurrent session 1' }, admin, '127.0.0.1'),
      pgInventoryRepo.adjustStock({ itemId: item.id, adjustmentType: 'clinic_use', quantityDelta: -2, reason: 'Concurrent session 2' }, admin, '127.0.0.1'),
      pgInventoryRepo.adjustStock({ itemId: item.id, adjustmentType: 'clinic_use', quantityDelta: -2, reason: 'Concurrent session 3' }, admin, '127.0.0.1'),
      pgInventoryRepo.adjustStock({ itemId: item.id, adjustmentType: 'clinic_use', quantityDelta: -2, reason: 'Concurrent session 4' }, admin, '127.0.0.1'),
    ]);

    const succeeded = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');
    assert.equal(succeeded.length, 2, `Expected exactly 2 deductions to succeed, got ${succeeded.length}`);
    assert.equal(rejected.length, 2, `Expected exactly 2 deductions to reject, got ${rejected.length}`);

    const row = await pgQuery<{ current_stock: number }>('SELECT current_stock FROM inventory_items WHERE id = $1', [item.id]);
    assert.equal(Number(row.rows[0].current_stock), 1);

    const movements = await pgQuery<{ cnt: string }>('SELECT COUNT(*)::text AS cnt FROM stock_movements WHERE inventory_item_id = $1', [item.id]);
    assert.ok(Number(movements.rows[0].cnt) >= 3); // 1 opening + 2 deductions
  });

  // 8. Concurrent Appointment Booking Conflict (Anti-Double-Booking)
  await test('8. Concurrent appointment bookings on identical doctor/date/time enforce 409 SLOT_CONFLICT', async () => {
    const admin = {
      id: 'usr-admin',
      name: 'Super Admin',
      email: 'admin@suoxi.tech',
      role: 'super_admin' as const,
      phone: '+8801700000001',
      branchId: 'br-dhanmondi',
      branchName: 'Dhanmondi Main Center',
    };
    const slot = {
      patient_id: 'pt-dhn-1',
      provider_id: 'usr-doc-dhn',
      branch_id: 'br-dhanmondi',
      appointment_date: '2026-12-15',
      start_time: '11:00',
      service_name: 'Laser Toning',
    };
    const results = await Promise.allSettled([
      pgPatientClinicalRepo.createAppointment(slot, admin, '127.0.0.1'),
      pgPatientClinicalRepo.createAppointment(slot, admin, '127.0.0.1'),
      pgPatientClinicalRepo.createAppointment(slot, admin, '127.0.0.1'),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    const fails = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    assert.equal(ok.length, 1, 'Exactly one booking must win the doctor slot');
    assert.equal(fails.length, 2);
    for (const f of fails) {
      assert.equal((f.reason as any).statusCode, 409);
      assert.equal((f.reason as any).code, 'SLOT_CONFLICT');
    }
  });

  // 9. Financial Integrity: Invoice -> Payment -> Refund Cap -> Commission Outbox -> Reversal -> Webhook Dedupe & Late Callback
  await test('9. Financial integrity: billing, refunds, commission outbox accrual/reversal, webhook idempotency & late void protection', async () => {
    const admin = {
      id: 'usr-admin',
      name: 'Super Admin',
      email: 'admin@suoxi.tech',
      role: 'super_admin' as const,
      phone: '+8801700000001',
      branchId: 'br-dhanmondi',
      branchName: 'Dhanmondi Main Center',
    };

    // Referrer + Rule + Patient Attribution
    const referrer = await pgCallCenterReferralsRepo.createReferrer(
      {
        referrerType: 'doctor',
        fullName: 'Dr. External Partner',
        mobile: '+8801755001122',
        payoutMethod: 'bKash',
        payoutAccountDetails: '01755001122-personal',
      },
      admin,
      '127.0.0.1'
    );
    await pgCallCenterReferralsRepo.createCommissionRule(
      {
        ruleName: 'Doctor 10% Referral',
        referrerType: 'doctor',
        calculationType: 'percentage',
        rateValue: 10,
        basis: 'paid_amount',
        appliesTo: 'all',
        firstPurchaseOnly: false,
        minBaseAmount: 0,
        refundPolicy: 'proportional',
        withholdingTaxPercent: 0,
        validFrom: '2026-01-01',
        isActive: true,
      },
      admin,
      '127.0.0.1'
    );
    await pgCallCenterReferralsRepo.assignPatientReferrer(
      'pt-dhn-1',
      { referrerId: referrer.id, attributionReason: 'Direct doctor referral' },
      admin,
      '127.0.0.1'
    );

    // Create invoice & pay 10,000 BDT
    const inv = await pgBillingPackageRepo.createInvoice(
      {
        patientId: 'pt-dhn-1',
        branchId: 'br-dhanmondi',
        items: [{ description: 'Carbon Laser Peel', quantity: 1, unitPriceBDT: 10000, discountBDT: 0 }],
        discountBDT: 0,
        vatPercent: 0,
      },
      admin,
      '127.0.0.1'
    );
    const payRes = await pgBillingPackageRepo.recordInvoicePayment(
      inv.id,
      { amountBDT: 10000, method: 'bkash', transactionRef: 'BK-9001' },
      admin,
      '127.0.0.1'
    );
    assert.equal(payRes.invoice.status, 'paid');

    // Run canonical worker pass -> processes outbox -> accrues 1000 BDT commission!
    await pgEnqueueNotification({
      channel: 'sms',
      recipient: '+8801712345678',
      body: 'Payment receipt confirmed',
      patientId: 'pt-dhn-1',
      branchId: 'br-dhanmondi',
    });
    const workerPass1 = await runSingleWorkerPass();
    assert.equal(workerPass1.commissionsCreated, 1);
    assert.equal(workerPass1.notificationsSent, 1);

    // Refund 4,000 BDT -> allowed; refund another 7,000 BDT -> MUST reject (422 REFUND_EXCEEDS_PAID)
    const ref1 = await pgBillingPackageRepo.createRefund(
      { invoiceId: inv.id, paymentId: payRes.payment.id, amountBDT: 4000, reason: 'Partial treatment cancellation' },
      admin,
      '127.0.0.1'
    );
    assert.equal(Number(ref1.amount_bdt), 4000);
    await assert.rejects(
      () =>
        pgBillingPackageRepo.createRefund(
          { invoiceId: inv.id, paymentId: payRes.payment.id, amountBDT: 7000, reason: 'Excess refund attempt' },
          admin,
          '127.0.0.1'
        ),
      (err: any) => err.statusCode === 422 && err.code === 'REFUND_EXCEEDS_PAID'
    );

    // Run worker pass 2 -> processes refund outbox -> creates -400 BDT commission reversal
    const workerPass2 = await runSingleWorkerPass();
    assert.equal(workerPass2.reversalsCreated, 1);

    const comms = await pgCallCenterReferralsRepo.listCommissions({ referrerId: referrer.id });
    assert.equal(comms.length, 2);
    const netComm = comms.reduce((s, c) => s + Number(c.netAmount), 0);
    assert.equal(netComm, 600); // 1000 - 400

    // Payment webhook deduplication + late webhook after void ignored
    const inv2 = await pgBillingPackageRepo.createInvoice(
      {
        patientId: 'pt-dhn-1',
        branchId: 'br-dhanmondi',
        items: [{ description: 'HydraFacial', quantity: 1, unitPriceBDT: 5000, discountBDT: 0 }],
      },
      admin,
      '127.0.0.1'
    );
    const payload = {
      provider: 'sslcommerz',
      providerEventId: 'evt-ssl-1001',
      invoiceId: inv2.id,
      amountBDT: 5000,
      currency: 'BDT',
      eventStatus: 'paid',
      transactionRef: 'SSL-TRX-1001',
    };
    const rawPayload = JSON.stringify(payload);
    const sig = crypto
      .createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET!)
      .update(rawPayload)
      .digest('hex');

    const wh1 = await pgBillingPackageRepo.processPaymentWebhook({
      ...payload,
      rawPayload,
      signatureHeader: sig,
      webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET,
      payload,
    });
    assert.equal(wh1.deduplicated, false);
    assert.ok(wh1.paymentId, 'First webhook must create a payment record');

    // Duplicate replay -> deduplicated
    const whDup = await pgBillingPackageRepo.processPaymentWebhook({
      ...payload,
      rawPayload,
      signatureHeader: sig,
      webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET,
      payload,
    });
    assert.equal(whDup.deduplicated, true);

    // Late webhook against voided invoice -> ignored safely
    const inv3 = await pgBillingPackageRepo.createInvoice(
      {
        patientId: 'pt-dhn-1',
        branchId: 'br-dhanmondi',
        items: [{ description: 'Chemical Peel', quantity: 1, unitPriceBDT: 3000, discountBDT: 0 }],
      },
      admin,
      '127.0.0.1'
    );
    await pgBillingPackageRepo.voidInvoice(inv3.id, 'Patient cancelled before payment', admin, '127.0.0.1');
    const latePayload = {
      provider: 'sslcommerz',
      providerEventId: 'evt-ssl-late-1',
      invoiceId: inv3.id,
      amountBDT: 3000,
      currency: 'BDT',
      eventStatus: 'paid',
    };
    const lateRaw = JSON.stringify(latePayload);
    const lateSig = crypto
      .createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET!)
      .update(lateRaw)
      .digest('hex');
    const whLate = await pgBillingPackageRepo.processPaymentWebhook({
      ...latePayload,
      rawPayload: lateRaw,
      signatureHeader: lateSig,
      webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET,
      payload: latePayload,
    });
    assert.equal(whLate.ignored, true);
  });

  // 10. Private File Magic-Byte Rejection + Secret Encryption/Masking + CSV Injection Shield
  await test('10. File magic-byte validation, secret masking/encryption, and CSV formula shield', async () => {
    // Reject spoofed executable pretending to be PNG
    await assert.rejects(
      () =>
        savePrivateFileBuffer({
          buffer: Buffer.from('#!/bin/sh\necho pwned'),
          mimeType: 'image/png',
          categoryOrType: 'clinical',
        }),
      /binary signature/i
    );

    // Accept valid PNG magic bytes
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const saved = await savePrivateFileBuffer({
      buffer: validPng,
      mimeType: 'image/png',
      categoryOrType: 'clinical',
    });
    assert.equal(saved.fileFormat, 'PNG');

    // Secret encryption & masking
    const admin = {
      id: 'usr-admin',
      name: 'Super Admin',
      email: 'admin@suoxi.tech',
      role: 'super_admin' as const,
      phone: '+8801700000001',
      branchId: 'br-dhanmondi',
      branchName: 'Dhanmondi Main Center',
    };
    const updatedSms = await pgOpsSettingsRepo.updateSmsConfig(
      { apiKey: 'test_secret_api_key_9988', senderId: 'SUOXI' },
      admin,
      '127.0.0.1'
    );
    assert.ok(updatedSms.apiKey.includes('••••'), 'SMS API key must be masked in API responses');
    assert.ok(!updatedSms.apiKey.includes('test_secret_api_key'));

    const rawRow = await pgQuery<{ value: { apiKey: string } }>(
      "SELECT value FROM clinic_settings WHERE setting_key = 'sms_gateway'"
    );
    assert.ok(rawRow.rows[0].value.apiKey.startsWith('enc:v1:'), 'SMS API key must be encrypted at rest in PG');

    // CSV formula neutralization
    assert.equal(sanitizeCsvCell('=SUM(A1:A10)'), "'=SUM(A1:A10)");
    assert.equal(sanitizeCsvCell('+cmd|"/c calc"!A0'), `"' +cmd|\"\"/c calc\"\"!A0"`.replace("' +", "'+"));
    assert.equal(sanitizeCsvCell('@HYPERLINK("http://evil")'), `"'@HYPERLINK(\"\"http://evil\"\")"`);

    // Real PG report aggregation
    const revReport = await pgGenerateReport({ reportType: 'revenue' });
    assert.ok(revReport.rows.length >= 1);
  });

  // 11. Live Express HTTP Security Tests (Auth Barrier, Demo Switcher Disabled, Cross-Branch IDOR, Portal Realm Isolation)
  const { app } = await import('../../server.ts');
  const httpServer = http.createServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
  const addr = httpServer.address();
  assert.ok(addr && typeof addr === 'object');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  try {
    await test('11. HTTP: Unauthenticated blocked (401), Demo Switcher blocked in prod (403), Security Headers present', async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const health = await httpReq(baseUrl, 'GET', '/healthz');
        assert.equal(health.status, 200);
        assert.equal(health.headers['x-content-type-options'], 'nosniff');
        assert.equal(health.headers['x-frame-options'], 'DENY');
        assert.equal(health.body.allowRoleSwitcher, false);

        const unauth = await httpReq(baseUrl, 'GET', '/api/v1/patients');
        assert.equal(unauth.status, 401);

        const csrfRes = await httpReq(baseUrl, 'GET', '/api/v1/csrf-token');
        const csrf = csrfRes.body.data.csrfToken;

        // Login as Dhanmondi Receptionist using Employee ID (case-insensitive)
        const loginRes = await httpReq(baseUrl, 'POST', '/api/v1/auth/login', {
          headers: { 'x-csrf-token': csrf },
          body: { identifier: 'sx-1003', password: 'RecepStrong#2026!' },
        });
        assert.equal(loginRes.status, 200);
        assert.equal(loginRes.body.data.user.employeeId, 'SX-1003');
        const staffCookie = extractCookie(loginRes.headers['set-cookie'], 'suoxi_sid');
        assert.ok(staffCookie.startsWith('suoxi_sid='));

        // Demo switcher MUST return 403 in production
        const demoRes = await httpReq(baseUrl, 'POST', '/api/v1/auth/switch-role', {
          headers: { 'x-csrf-token': csrf, Cookie: staffCookie },
          body: { role: 'super_admin' },
        });
        assert.equal(demoRes.status, 403);

        // Missing CSRF MUST return 403
        const noCsrf = await httpReq(baseUrl, 'POST', '/api/v1/patients', {
          headers: { Cookie: staffCookie },
          body: { name: 'Test', phone: '+8801711111111', gender: 'female' },
        });
        assert.equal(noCsrf.status, 403);

        // Cross-branch IDOR: Dhanmondi receptionist tries to read Gulshan patient -> 403 FORBIDDEN!
        const crossBranch = await httpReq(baseUrl, 'GET', '/api/v1/patients/pt-gls-1', {
          headers: { Cookie: staffCookie },
        });
        assert.equal(crossBranch.status, 403);

        // Same-branch patient read -> 200 OK
        const sameBranch = await httpReq(baseUrl, 'GET', '/api/v1/patients/pt-dhn-1', {
          headers: { Cookie: staffCookie },
        });
        assert.equal(sameBranch.status, 200);

        // Receptionist tries to read admin-only audit events -> 403 FORBIDDEN!
        const adminOnlyDenied = await httpReq(baseUrl, 'GET', '/api/v1/audit-events', {
          headers: { Cookie: staffCookie },
        });
        assert.equal(adminOnlyDenied.status, 403);

        // Path traversal on private files -> 404 or 400 (never 200)
        const traversal = await httpReq(baseUrl, 'GET', '/api/v1/files/view?path=../../etc/passwd', {
          headers: { Cookie: staffCookie },
        });
        assert.ok(traversal.status === 400 || traversal.status === 404);

        // Patient Portal Isolation: setup portal account for pt-dhn-1, login, verify staff cookie rejected on portal & portal cookie rejected on staff API
        const adminLogin = await httpReq(baseUrl, 'POST', '/api/v1/auth/login', {
          headers: { 'x-csrf-token': csrf },
          body: { email: 'admin@suoxi.tech', password: 'AdminStrong#2026!' },
        });
        assert.equal(adminLogin.status, 200);
        const adminCookie = extractCookie(adminLogin.headers['set-cookie'], 'suoxi_sid');

        const adminActor = {
          id: 'usr-admin',
          name: 'Super Admin',
          email: 'admin@suoxi.tech',
          role: 'super_admin' as const,
          phone: '+8801700000001',
          branchId: 'br-dhanmondi',
          branchName: 'Dhanmondi Main Center',
        };
        const provisioned = await pgProvisionPortalAccount(
          'pt-dhn-1',
          '+8801712345678',
          adminActor,
          '127.0.0.1'
        );
        await pgCompletePortalSetup(provisioned.setupToken, 'PatientStrong#2026!');

        // Staff cookie rejected on portal /me
        const staffOnPortal = await httpReq(baseUrl, 'GET', '/api/v1/portal/me', {
          headers: { Cookie: adminCookie },
        });
        assert.equal(staffOnPortal.status, 401);

        // Portal login gets portal_sid cookie
        const portalLogin = await httpReq(baseUrl, 'POST', '/api/v1/portal/auth/login', {
          headers: { 'x-csrf-token': csrf },
          body: { identifier: '+8801712345678', password: 'PatientStrong#2026!' },
        });
        assert.equal(portalLogin.status, 200);
        const portalCookie = extractCookie(portalLogin.headers['set-cookie'], 'portal_sid');
        assert.ok(portalCookie.startsWith('portal_sid='));

        // Portal cookie rejected on staff endpoint
        const portalOnStaff = await httpReq(baseUrl, 'GET', '/api/v1/patients', {
          headers: { Cookie: portalCookie },
        });
        assert.equal(portalOnStaff.status, 401);

        // Portal user sees ONLY their own data
        const portalMe = await httpReq(baseUrl, 'GET', '/api/v1/portal/me', {
          headers: { Cookie: portalCookie },
        });
        assert.equal(portalMe.status, 200);
        assert.equal(portalMe.body.data.profile.id, 'pt-dhn-1');
      } finally {
        process.env.NODE_ENV = prevEnv;
      }
    });

    await test('12. Super Admin provisioning creates br-shantinagar without invented fields & preserves existing details on re-run', async () => {
      const strongPassword = 'SuoxiAdmin!2026#Strong';
      const firstResult = await provisionSuperAdminAndInitialBranch({
        password: strongPassword,
      });

      assert.equal(firstResult.organizationId, 'org-suoxi');
      assert.equal(firstResult.branchId, INITIAL_SHANTINAGAR_BRANCH.id);
      assert.equal(firstResult.branchCode, 'SHN');
      assert.equal(firstResult.branchName, 'Shantinagar');
      assert.equal(firstResult.branchCreated, true);
      assert.equal(firstResult.employeeId, '24040823');
      assert.equal(firstResult.email, 'suoxiwork1@gmail.com');
      assert.equal(firstResult.mustChangePassword, true);

      const branchRes = await pgQuery('SELECT * FROM branches WHERE id = $1', ['br-shantinagar']);
      assert.equal(branchRes.rows.length, 1);
      const branchRow = branchRes.rows[0];
      assert.equal(branchRow.code, 'SHN');
      assert.equal(branchRow.name, 'Shantinagar');
      assert.equal(branchRow.name_bn, 'শান্তিনগর');
      assert.equal(branchRow.is_active, true);
      assert.equal(branchRow.address, '');
      assert.equal(branchRow.city, '');
      assert.equal(branchRow.phone, '');
      assert.equal(branchRow.email, null);
      assert.equal(branchRow.manager_name, null);
      assert.equal(branchRow.operating_hours, null);

      const adminRes = await pgQuery('SELECT * FROM users WHERE employee_id = $1', ['24040823']);
      assert.equal(adminRes.rows.length, 1);
      const adminRow = adminRes.rows[0];
      assert.equal(adminRow.name, 'Md Ahad Ali');
      assert.equal(adminRow.email, 'suoxiwork1@gmail.com');
      assert.equal(adminRow.phone, '01314113066');
      assert.equal(adminRow.role, 'super_admin');
      assert.equal(adminRow.branch_id, 'br-shantinagar');
      assert.equal(adminRow.branch_name, 'Shantinagar');
      assert.equal(adminRow.must_change_password, true);
      assert.ok(String(adminRow.password_hash).startsWith('$argon2id$'));
      assert.equal(await argon2.verify(String(adminRow.password_hash), strongPassword), true);

      const assignRes = await pgQuery(
        'SELECT is_primary FROM user_branch_assignments WHERE user_id = $1 AND branch_id = $2',
        [adminRow.id, 'br-shantinagar']
      );
      assert.equal(assignRes.rows.length, 1);
      assert.equal(assignRes.rows[0].is_primary, true);

      // Update optional details on br-shantinagar, then re-run provisioning: existing branch details must NOT be overwritten
      await pgQuery(
        `UPDATE branches SET address = '78 Shantinagar Road', city = 'Dhaka', phone = '01700000099', email = 'shn@suoxi.example' WHERE id = 'br-shantinagar'`
      );
      const secondResult = await provisionSuperAdminAndInitialBranch({
        password: strongPassword,
      });
      assert.equal(secondResult.branchCreated, false);

      const preservedRes = await pgQuery('SELECT address, city, phone, email FROM branches WHERE id = $1', [
        'br-shantinagar',
      ]);
      assert.equal(preservedRes.rows[0].address, '78 Shantinagar Road');
      assert.equal(preservedRes.rows[0].city, 'Dhaka');
      assert.equal(preservedRes.rows[0].phone, '01700000099');
      assert.equal(preservedRes.rows[0].email, 'shn@suoxi.example');
    });

    await test('13. Dynamic Branch Management CRUD, duplicate code protection, user sync, and activeOnly filtering', async () => {
      const adminActor = {
        id: 'usr-admin',
        name: 'Super Admin',
        email: 'admin@suoxi.tech',
        role: 'super_admin' as const,
        phone: '+8801700000001',
        branchId: 'br-shantinagar',
        branchName: 'Shantinagar',
      };

      const created = await pgOrgRepo.createBranch(
        {
          name: 'Banani',
          nameBn: 'বনানী',
          code: 'BNN',
        },
        adminActor,
        '127.0.0.1'
      );
      assert.equal(created.id, 'br-bnn');
      assert.equal(created.code, 'BNN');
      assert.equal(created.name, 'Banani');
      assert.equal(created.nameBn, 'বনানী');
      assert.equal(created.address, '');
      assert.equal(created.city, '');
      assert.equal(created.phone, '');
      assert.equal(created.email, undefined);
      assert.equal(created.operatingHours, undefined);
      assert.equal(created.isActive, true);

      // Duplicate code must throw 409
      await assert.rejects(
        () =>
          pgOrgRepo.createBranch(
            {
              name: 'Banani Duplicate',
              code: 'bnn',
            },
            adminActor,
            '127.0.0.1'
          ),
        (err: any) => err?.statusCode === 409
      );

      // Update optional details + rename branch -> should sync users.branch_name
      const updated = await pgOrgRepo.updateBranch(
        created.id,
        {
          name: 'Banani Center',
          address: 'Road 11, Banani',
          city: 'Dhaka',
          phone: '01800000000',
          email: 'banani@suoxi.example',
          operatingHours: '10:00 AM - 08:00 PM',
        },
        adminActor,
        '127.0.0.1'
      );
      assert.ok(updated);
      assert.equal(updated.name, 'Banani Center');
      assert.equal(updated.address, 'Road 11, Banani');
      assert.equal(updated.operatingHours, '10:00 AM - 08:00 PM');

      // Deactivate and check activeOnly filter
      const deactivated = await pgOrgRepo.setBranchStatus(created.id, false, adminActor, '127.0.0.1');
      assert.equal(deactivated?.isActive, false);
      const activeList = await pgOrgRepo.listBranches({ activeOnly: true });
      assert.equal(activeList.some((b) => b.id === created.id), false);

      // Reactivate
      const reactivated = await pgOrgRepo.setBranchStatus(created.id, true, adminActor, '127.0.0.1');
      assert.equal(reactivated?.isActive, true);
      const activeListAfter = await pgOrgRepo.listBranches({ activeOnly: true });
      assert.equal(activeListAfter.some((b) => b.id === created.id), true);
    });
  } finally {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await closePgPool();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log('========================================================================');
  console.log(`Real-PostgreSQL QA Summary: ${passed} passed, ${failed} failed`);
  console.log('========================================================================');
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test suite error:', err);
  process.exit(1);
});
