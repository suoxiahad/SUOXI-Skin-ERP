# SUOXI Skin ERP — PostgreSQL-Only Migration Guide

## 1. MySQL Decommissioning Summary

SUOXI Skin ERP has been fully migrated to **PostgreSQL 16 ONLY**:
- Removed `mysql2` from root `package.json` and `apps/api/package.json`.
- Replaced `docker-compose.yml` MySQL 8 container with **PostgreSQL 16 Alpine** (`postgres:16-alpine`) + **Redis 7 Alpine** (`redis:7-alpine`).
- Migrated `apps/api/src/db/{pool,transaction,migrator,codeSequence}.ts`, `apps/api/src/config/env.ts`, and `apps/api/src/__tests__/{health,migrator,transaction,securityHardeningPass}.test.ts` to `pg` (`40P01`/`40001` deadlock/serialization retry, `42P01` undefined table detection, `pg_advisory_lock`).
- Deleted legacy `apps/api/src/db/mysqlMigrationStore.ts` and 39 stale compiled `.js` shadow files inside `apps/api/src/`.
- Added production validation in `server/config/securityConfig.ts` that **fails closed** if `DATABASE_URL` starts with `mysql://` or `mysql2://`.
- Verified via repository-wide grep that **zero MySQL runtime imports or queries** exist anywhere in `server.ts`, `server/`, `src/`, `apps/`, or `packages/`.

---

## 2. Migration Runner, Checksums & Advisory Locking

Canonical migration CLI: `server/db/migrate.ts`

### Features
- **Advisory Lock (`pg_advisory_lock(842100991)`)**: Prevents concurrent PM2 instances or deploy scripts from applying migrations simultaneously.
- **Transactional Execution**: Every `.sql` migration file executes inside `BEGIN ... COMMIT` and rolls back cleanly on any SQL failure.
- **SHA-256 Checksum Verification**: Computes SHA-256 of each applied migration file and stores it in `schema_migrations(version, filename, checksum, applied_at)`. If any previously applied migration file is altered on disk, the runner **aborts immediately** with a checksum mismatch error.
- **Immutable History**: `0001_initial_schema.sql` and `0002_referrals_and_ops_columns.sql` remain unmodified; all schema extensions live in `0003_complete_erp_modules_and_integrity.sql` (and future `0004_*.sql` files).

### Commands
```bash
# Apply all pending migrations (idempotent, safe to run on every deploy)
npm run pg:migrate

# Inspect applied vs pending migration status without mutating schema
npm run pg:status
```

---

## 3. Production Bootstrap vs. Development Seeding

### Production Initial Super Admin (`pg:create-admin`)
Production **NEVER** seeds demo patients, demo invoices, demo inventory, demo referrers, or default passwords.

Run once after `npm run pg:migrate` on a fresh production database:
```bash
ADMIN_EMAIL="admin@suoxi.tech" \
ADMIN_PASSWORD="<12+-char-mixed-case-number-symbol-password>" \
ADMIN_NAME="SUOXI Managing Director" \
ADMIN_PHONE="+88017XXXXXXXX" \
npm run pg:create-admin
```
What `server/db/createAdmin.ts` does:
1. Enforces strong password complexity (`>= 12` chars, upper, lower, digit, special char).
2. Hashes password with **Argon2id** (`memoryCost: 65536`, `timeCost: 3`, `parallelism: 1`).
3. Seeds only mandatory structural lookup tables if empty (`organizations`, primary `branches` row, 8 `clinic_roles`, 5 `payment_methods`, 6 `appointment_sources`).
4. Creates or updates the `super_admin` user with `must_change_password = TRUE` and assigns primary branch membership.

### Development-Only Fixture Seeding (`pg:seed`)
`server/db/seedDefaults.ts` is strictly blocked in production:
- Checks `process.env.NODE_ENV === 'production'` and **exits with code 1** (`Refusing to seed demo clinic fixtures in NODE_ENV=production`).
- Intended strictly for local development and staging sandboxes.

---

## 4. Connection Pool & Deadlock Resilience

`server/db/pgPool.ts`:
- Reads `DATABASE_URL` (`postgresql://...`) or `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD`.
- Sets `SET TIME ZONE 'Asia/Dhaka'` on every new client connection.
- `withPgTransaction()` wraps `BEGIN`/`COMMIT`/`ROLLBACK` with automatic exponential-backoff retry (up to 3 retries) on PostgreSQL error codes:
  - `40P01` (`deadlock_detected`)
  - `40001` (`serialization_failure`)
- Supports injectable `setPgPoolOverride()` so automated tests run real PostgreSQL SQL via `@electric-sql/pglite` without mocking repositories.
