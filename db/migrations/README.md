# SUOXI CRM — Database Migrations Architecture & Prerequisites

## Overview
This directory contains SQL migration files for the SUOXI Skin Care & Aesthetic Center CRM.

In accordance with **Engineering Rule 11 (SCHEMA GATE)**:
- No database DDL may be applied automatically.
- No DDL has been executed against any database.
- Core infrastructure tables (`schema_migrations`, `login_attempts`, `idempotency_keys`) reside in `0000_infrastructure.sql`, and `staff_sessions` resides in `0002_foundation_users_and_files.sql` (after `staff_users` is created).

---

## Mandatory Prerequisites Before Running Migrations

Before database migrations can be executed against any environment (local, testing, staging, or production), the following prerequisites MUST be completely satisfied:

1. **Schema Specification & Verification Table**:
   - The verified MySQL 8 schema specification must be provided and confirmed by the project owner.
   - A Schema Verification Table mapping each clinical/business entity to its definition must be approved.
   - All migration files (beginning with `0000_infrastructure.sql` through `0020_reports_and_export_logs.sql`) must be reviewed before executing against target environments.

2. **Environment & Safe Database Credentials**:
   - `DATABASE_URL` or individual connection parameters (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`) must be configured.
   - **Destructive-Test Safeguard**: For test suites, the target database name MUST include `_test` or `_testing`, and must never match production or staging database names.
   - Migration runner requires the dedicated `suoxi_migrator` user account with DDL permissions, not the application runtime user `suoxi_app`.

3. **Database Engine & Encoding**:
   - MySQL 8.0+ running with InnoDB storage engine.
   - Default character set: `utf8mb4` with collation `utf8mb4_unicode_ci`.
   - Timezone: UTC for storage; clinic wall-clock times stored with appropriate timezone alignment (Asia/Dhaka UTC+6).

4. **Checksum & Ordering Verification**:
   - All migration files in `db/migrations/` follow the numeric format `NNNN_description.sql` (e.g. `0001_initial_schema.sql`).
   - Each migration file's SHA-256 checksum is calculated and compared against recorded hashes in `schema_migrations`. If a file has been modified after execution, the runner will abort with an error.

---

## Migration Runner Capabilities
The migration runner in `apps/api/src/db/migrator.ts` supports:
- **Dry-Run Mode (`plan`)**: Inspects pending migrations, computes SHA-256 hashes, verifies ordering and integrity, without executing DDL or requiring live database modifications.
- **Strict Checksum Protection**: Prevents tamper or out-of-order execution.
- **Rollback Safety**: Transactional DDL wrapping where supported by the database engine.
