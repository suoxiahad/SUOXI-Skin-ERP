# SUOXI Skin ERP — Production Readiness Test & Verification Report

**Date:** 2026-11-19  
**Repository:** `https://github.com/suoxiahad/SUOXI-Skin-ERP`  
**Canonical Runtime:** Root `server.ts` (Express 5 + Vite/dist SPA, PM2 `suoxi-crm`) + `server/worker.ts` (PostgreSQL `SKIP LOCKED` + BullMQ worker, PM2 `suoxi-worker`)  
**Database Engine Tested:** Real PostgreSQL engine (`@electric-sql/pglite` embedded PostgreSQL 16 engine for isolated CI/local integration execution)

---

## 1. Executive Test Summary

| Verification Gate | Command / Tool | Status | Observed Result |
| :--- | :--- | :---: | :--- |
| **Real PostgreSQL Production Readiness & QA Suite** | `npm run test:pg` | **PASS** | **11 passed, 0 failed** (real PostgreSQL execution, full migrations `0001`–`0003`, durability across DB close/reopen, ACID rollbacks, concurrency, security, HTTP checks) |
| **API Domain, Security & Hardening Suite** | `npm run test:api` | **PASS** | **27 passed, 0 failed** (27 total suites, including Prompt 21 Security & Hardening 11/11) |
| **Workspace TypeScript Check (All 4 Workspaces)** | `npm run typecheck` | **PASS** | **0 errors** across `@suoxi/shared-types`, `@suoxi/web`, `@suoxi/worker`, `@suoxi/api` |
| **Root TypeScript Strict Lint** | `npm run lint` (`tsc --noEmit`) | **PASS** | **0 errors** (clean exit 0) |
| **Frontend Production Bundle Build** | `npm run build` (`vite build`) | **PASS** | **Build succeeded** (clean production `dist/` bundle) |
| **Admin Bootstrap CLI Validation** | `ADMIN_EMAIL="admin@suoxi.tech" ADMIN_PASSWORD="weak" DATABASE_URL="..." npm run pg:create-admin` | **PASS** | Cleanly rejected weak password (`ADMIN_PASSWORD must be at least 12 characters long.`) before touching DB |
| **MySQL Runtime Dependency Audit** | `grep` across `server.ts`, `server/`, `src/`, `apps/`, `packages/`, `package.json`, `apps/api/package.json` | **PASS** | **0 MySQL runtime imports or dependencies** (`mysql2` completely removed from runtime manifests and code) |

---

## 2. Real PostgreSQL Integration & Production Readiness Suite (`npm run test:pg`)

**Test Harness:** `server/__tests__/productionReadiness.test.ts` running against a real embedded PostgreSQL engine (`PGlite`) executing the exact production SQL migrations (`db/postgres/migrations/0001_initial_schema.sql`, `0002_referrals_and_ops_columns.sql`, `0003_complete_erp_modules_and_integrity.sql`) and canonical PostgreSQL repositories.

### Verbatim Observed Output

```text
> suoxi-crm@0.1.0 test:pg
> tsx server/__tests__/productionReadiness.test.ts

========================================================================
SUOXI Skin ERP — Real PostgreSQL Production Readiness & QA Test Suite
========================================================================
  [PASS] 1. Clean PostgreSQL migrations (0001 -> 0002 -> 0003) & idempotency
  [PASS] 2. Migration checksum tampering detection rejects modified applied migrations
  [PASS] 3. Durability proof: data survives PostgreSQL close & full reopen (restart simulation)
  [PASS] 4. Production security validator fails closed on missing secrets, MySQL URL, or demo flag
  [PASS] 5. Persistent PG CSRF tokens, Idempotency replay/conflict, and login lockout
  [PASS] 6. ACID transaction rollback atomicity leaves zero partial rows on failure
  [PASS] 7. Concurrent inventory deductions cannot oversell or produce negative stock
  [PASS] 8. Concurrent appointment bookings on identical doctor/date/time enforce 409 SLOT_CONFLICT
  [PASS] 9. Financial integrity: billing, refunds, commission outbox accrual/reversal, webhook idempotency & late void protection
  [PASS] 10. File magic-byte validation, secret masking/encryption, and CSV formula shield
  [PASS] 11. HTTP: Unauthenticated blocked (401), Demo Switcher blocked in prod (403), Security Headers present
========================================================================
Real-PostgreSQL QA Summary: 11 passed, 0 failed
========================================================================
```

### Real Defects Caught & Fixed by This Suite During QA
1. **Nested Transaction Pool Deadlock (`pgPatientClinicalRepo.ts`, `pgOpsSettingsRepo.ts`):** Six methods previously called pool-level `pgQuery()` inside an active `withPgTransaction()` callback (`updatePatient`, `createAppointment`, `createConsultation`, `createPrescription`, `createMedicalAttachment`, `createBackupRecord`), which risked deadlocking single-connection/saturated pools. Fixed by threading the active `PoolClient` through helper lookups and pre-reading counts before acquiring the transaction.
2. **Partial Unique Index `ON CONFLICT` Clause (`pgCallCenterReferralsRepo.ts`):** `uq_referral_commissions_accrual_key` is a partial unique index (`WHERE accrual_key IS NOT NULL`). PostgreSQL requires the matching `WHERE` predicate in `ON CONFLICT (accrual_key) WHERE accrual_key IS NOT NULL DO NOTHING`. Fixed and verified.
3. **Invoice `vat_percent` NOT NULL Default & Line ID Uniqueness (`pgBillingPackageRepo.ts`):** Omitting optional `vatPercent` or `discountBDT` violated `NOT NULL` constraints on `invoices.vat_percent`, and millisecond-based line IDs could collide in batch inserts. Fixed with safe `0` defaults, 2-decimal rounding, and collision-proof UUID line IDs.
4. **Worker Commission Outbox Result Mapping (`server/worker.ts`):** Mapped `outbox.accrued` and `outbox.reversed` accurately onto worker summary fields (`commissionsCreated`, `reversalsCreated`).

---

## 3. API Domain & Security Hardening Suite (`npm run test:api`)

**Test Runner:** `apps/api/src/__tests__/runAllTests.ts`  
**Observed Result:** **27 passed, 0 failed (27 total suites)**

### Highlights Verified
- **Prompt 21 Security & Data-Integrity Hardening Audit (11/11 PASS):**
  1. Authorization matrix verified across all 8 staff roles, unauthenticated callers, and patient portal sessions.
  2. IDOR / BOLA cross-branch and cross-patient isolation verified (`404` returned on unauthorized cross-branch patient lookup).
  3. Sensitive clinical and financial DTO filtering verified (`403` on missing `medical_history.view`).
  4. Append-only immutability on `audit_events`, `stock_movements`, and `package_session_ledger` verified.
  5. AES-256-GCM encryption (12-byte IV, 16-byte auth tag) verified for stored integration credentials.
  6. File upload security (magic-byte inspection, path traversal prevention, signed URL expiry) verified.
  7. Concurrent parallel submission protected by `Idempotency-Key` replay cache.
  8. PostgreSQL deadlock (`40P01`) transaction retry verified across 3 consecutive deterministic iterations.
  9. `Asia/Dhaka` (`+06:00`) wall-clock and UTC midnight boundary conversions verified.
  10. Defensive security headers (CSP, X-Content-Type-Options, CORS credential reflection, CSRF enforcement returning `403 CSRF_FAILED`) verified.
  11. Payment/notification webhook HMAC-SHA256 verification and SSRF IP blocklist verified.
- **Critical Defect Caught & Fixed:** Removed a legacy dev authentication bypass in `apps/api/src/middleware/requireAuth.ts` that previously fell back to `super_admin` when cookies were missing/invalid; unauthenticated requests now unconditionally return `401 UnauthorizedError`.

---

## 4. Type Safety, Linting & Production Build Verification

### 4.1 Monorepo Workspace Typechecks (`npm run typecheck`)
```text
> @suoxi/shared-types@0.1.0 typecheck  -> tsc -p tsconfig.json --noEmit  [0 errors]
> @suoxi/web@0.1.0 typecheck           -> tsc -p tsconfig.json --noEmit  [0 errors]
> @suoxi/worker@0.1.0 typecheck        -> tsc -p tsconfig.json --noEmit  [0 errors]
> @suoxi/api@0.1.0 typecheck           -> tsc -p tsconfig.json --noEmit  [0 errors]
```

### 4.2 Root Strict TypeScript Check (`npm run lint`)
```text
$ tsc --noEmit
Linting completed successfully (0 errors)
```
*(Fixed Express 5 `req.params` `string | string[]` narrowing in `server/routes/pgExtendedRoutes.ts` and `server/routes/pgOpsRoutes.ts`, exhaustive `UserRole` mapping including `'patient'` in `server/auth/rbacMiddleware.ts`, and `savePrivateFileBuffer` test signature alignment.)*

### 4.3 Production Bundle Build (`npm run build`)
```text
Build succeeded - the applet is compiled
```

---

## 5. Security & Hygiene Verification Notes

- **Hardcoded Secrets Removed:** Previously hardcoded SMS gateway API key and SMTP password were stripped from source code and environment templates. Secrets must be injected exclusively via VPS `.env` (`chmod 600`) and stored encrypted (`enc:v1:...` AES-256-GCM) in PostgreSQL `clinic_settings`. **The system owner must immediately revoke and rotate the previously exposed SMS gateway API key and cPanel SMTP password.**
- **Zero Production Demo Fallback:** In `NODE_ENV=production`, `validateProductionEnvironment()` fails closed on missing `DATABASE_URL`, non-PostgreSQL URLs, missing/weak `SESSION_SECRET` / `ENCRYPTION_MASTER_KEY`, or `ALLOW_DEMO_AUTH=true`. The `/api/v1/auth/switch-role` endpoint unconditionally returns `403` in production.
- **Zero Automatic Demo Seeding:** Migrations `0001`–`0003` contain schema DDL and minimal lookup metadata only; no demo patients, invoices, payments, inventory items, referral accounts, or default staff passwords are ever auto-seeded in production. Initial admin provisioning uses the dedicated CLI (`npm run pg:create-admin`).

---

## 6. Known Testing Scope & Environment Caveats

1. **Embedded vs. Standalone PostgreSQL Server:** Local automated tests run against real PostgreSQL (`PGlite`) rather than a remote Linux VPS PostgreSQL 16 TCP daemon. Before go-live, the operator must run `npm run pg:migrate` and `npm run pg:migrate:status` against the target VPS PostgreSQL 16 instance and verify `/api/v1/health` returns `200 OK` with `"database": "connected"`.
2. **Live Redis & LiteSpeed Reverse Proxy:** Redis connectivity (`REDIS_URL`), BullMQ queue round-trips against a live Redis server, PM2 process supervision (`ecosystem.config.cjs`), and LiteSpeed / OpenLiteSpeed TLS reverse-proxy headers (`X-Forwarded-Proto`, `X-Forwarded-For`, port availability via `ss -tulpn`) must be smoke-tested on the target VPS per `docs/PRODUCTION_DEPLOYMENT.md`.
3. **Legacy `apps/api` Workspace Test Harness:** The canonical production API runtime is root `server.ts` + `server/worker.ts` (100% PostgreSQL-backed). The `apps/api` workspace retains in-memory test doubles for its 27 unit/security contract test suites and is not the deployed production entrypoint.
4. **Lockfile Cleanup Note:** `mysql2` is completely removed from root `package.json` and `apps/api/package.json` as well as all runtime code; a stale lockfile entry in `apps/api/package-lock.json` will be regenerated cleanly on the next `npm install` inside `apps/api` if that workspace is ever installed independently.
