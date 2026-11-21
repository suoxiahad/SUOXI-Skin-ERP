# SUOXI Skin ERP — Implementation Changelog (Phases 0–8)

## Phase 0 — Architecture Audit & Consolidation
- Audited root `server.ts`, `server/`, `src/`, `apps/api`, `apps/web`, `apps/worker`, `packages/shared-types`, `db/`, and deployment configs.
- Established canonical production runtime: root `server.ts` (API + SPA) + `server/worker.ts` (background worker) backed exclusively by PostgreSQL 16 + optional Redis/BullMQ.
- Removed 39 stale compiled `.js` shadow files inside `apps/api/src/` and fixed `apps/api/tsconfig.json`.
- Documented architecture and legacy removal plan in `docs/ARCHITECTURE.md`.

## Phase 1 — PostgreSQL Foundation & MySQL Decommissioning
- Created immutable migration `db/postgres/migrations/0003_complete_erp_modules_and_integrity.sql` (49 new normalized tables + constraints + concurrency indexes; `0001` and `0002` untouched).
- Upgraded `server/db/pgPool.ts` with `Asia/Dhaka` timezone enforcement, deadlock/serialization retry (`40P01`/`40001`), health/readiness probe, and injectable `setPgPoolOverride()`.
- Upgraded `server/db/migrate.ts` with PostgreSQL advisory lock, transactional rollback, SHA-256 checksum tamper detection, and `--status`.
- Created production-only `server/db/createAdmin.ts` (`npm run pg:create-admin`, Argon2id, strong password validation, `must_change_password = TRUE`); blocked `server/db/seedDefaults.ts` in `NODE_ENV=production`.
- Removed `mysql2` from root `package.json` and `apps/api/package.json`; deleted `apps/api/src/db/mysqlMigrationStore.ts`; migrated `apps/api/src/db/*` to `pg`; updated `docker-compose.yml` to PostgreSQL 16 + Redis 7.

## Phase 2 — Complete PostgreSQL Business Repositories & Extended Router
- Built PostgreSQL repositories covering all remaining modules:
  - `server/repositories/pgSecurityStoreRepo.ts` (CSRF, Idempotency-Key, Login Lockout, atomic `code_sequences`)
  - `server/repositories/pgCatalogCalendarRepo.ts` (Catalog categories/services/follow-up rules, guidance approval workflow, calendar/resources/schedules)
  - `server/repositories/pgClinicalSessionsRepo.ts` (Medical history/entries/notes/duplicates, treatment plans, consents, sessions, consumables, photos)
  - `server/repositories/pgPortalRepo.ts` (Isolated patient portal accounts, sessions, single-use tokens, rate-limited contact OTPs)
  - `server/repositories/pgNotificationsReportsRepo.ts` (`SKIP LOCKED` notifications queue, webhook dedupe, staff alerts, call logs, real SQL reports + CSV export)
- Built `server/routes/pgExtendedRoutes.ts` and mounted it in `server.ts`, followed immediately by a `NODE_ENV=production` fail-closed `404` barrier blocking all prototype in-memory routes.

## Phase 3 — Security Hardening
- Created `server/config/securityConfig.ts` (fail-closed production validator, AES-256-GCM encryption/decryption, secret masking, log redaction, CSV formula shield, timing-safe HMAC verification).
- Created `server/auth/rbacMiddleware.ts` (effective permission resolver with overrides, branch access enforcement, `requireRoles`, `requirePermission`).
- Hardened `server.ts` (startup fail-closed gate, `x-powered-by` disabled, `trust proxy`, strict `CORS_ORIGIN`, defensive headers, persistent PG+Redis CSRF & Idempotency, `/healthz`, removed hardcoded SMS API key & SMTP password).
- Hardened `server/auth/productionAuth.ts`, `server/routes/pgCoreRoutes.ts`, `server/routes/pgOpsRoutes.ts`, `server/routes/phase4PlatformRoutes.ts` (authenticated private file streaming + `/readyz`), `server/storage/localFileStorage.ts` (magic-byte inspection), and `server/repositories/pgOpsSettingsRepo.ts` (at-rest AES-256-GCM encryption + masking).
- Removed unauthenticated `super_admin` fallback bypass in `apps/api/src/middleware/requireAuth.ts`.
- Hardened `apps/api/src/services/{referralService,integrationService,notificationService}.ts` to refuse fallback dev keys in production.

## Phase 4 — Financial, Inventory & Concurrency Integrity
- Upgraded `server/repositories/pgBillingPackageRepo.ts` (server-derived 2-decimal math, normalized `invoice_items` & `payment_allocations`, transactional `domain_outbox_events`, `createRefund` enforcing refund <= paid without mutating payments, `processPaymentWebhook` with HMAC + BDT + dedupe + terminal-state protection).
- Upgraded `server/repositories/pgCallCenterReferralsRepo.ts` (`processCommissionOutbox()` with `FOR UPDATE SKIP LOCKED` and partial-index `ON CONFLICT (accrual_key) WHERE accrual_key IS NOT NULL DO NOTHING`).
- Upgraded `server/repositories/pgInventoryRepo.ts` (row-locked `inventory_items`, `product_batches`, `stock_movements`, `purchase_order_items`).
- Upgraded `server/repositories/pgPatientClinicalRepo.ts` (`23505` → `409 SLOT_CONFLICT`, `appointment_status_history`, eliminated nested pool checkout inside transactions by propagating `client`).

## Phase 5 — Canonical Background Worker
- Created `server/worker.ts` (standalone PM2 process `suoxi-worker` running BullMQ `suoxi-clinic-jobs`, PostgreSQL `SKIP LOCKED` notifications, `domain_outbox_events` → commission processor, tomorrow call refresh, graceful `SIGTERM`/`SIGINT` shutdown, and exported `runSingleWorkerPass()`).

## Phase 6 — Frontend Security & API Contract Hardening
- Hardened `src/api/client.ts` (removed `'fallback-csrf-token'`, added 403 `CSRF_INVALID` token refresh & single retry, relative base URL with optional `VITE_API_ORIGIN`).
- Removed hardcoded SMS API key from `src/components/modules/integration/SMSGatewayView.tsx` and hardcoded SMTP password from `src/components/modules/integration/EmailGatewayView.tsx`.
- Updated `apps/web/.env.example` to `VITE_API_BASE_URL=/api/v1`.

## Phase 7 — Production Config (LiteSpeed & PM2)
- Updated `.env.example`, `.env.production.example` (`https://erp.suoxi.tech`), `apps/api/.env.example` (PostgreSQL-only), and `ecosystem.config.cjs` (`suoxi-crm` + `suoxi-worker`).
- Created `deploy/litespeed/erp.suoxi.tech.conf` (LiteSpeed / OpenLiteSpeed reverse proxy configuration).

## Phase 8 — Real-PostgreSQL QA Verification, Bug Fixes & Final Documentation
- Created `server/__tests__/productionReadiness.test.ts` (11 real-PostgreSQL PGlite tests covering migrations, checksum tampering, restart durability, fail-closed startup, persistent CSRF/idempotency/lockout, transaction rollback, concurrent stock anti-oversell, concurrent appointment 409 conflict, end-to-end billing/refund/outbox-commission/webhook-dedupe/late-void, file magic-byte + encryption/masking + CSV shield, and live Express HTTP security/IDOR/portal isolation).
- Fixed real SQL/concurrency defects uncovered by the test suite (nested pool queries inside transactions, partial index `ON CONFLICT` predicate on `accrual_key`, `createInvoice` default `vatPercent`/`discountBDT`, worker summary mapping, and `apps/api` PostgreSQL test mocks & TypeScript types).
- Verified all tests, typechecks, lint, and production build; authored all 9 production documents in `docs/`.
