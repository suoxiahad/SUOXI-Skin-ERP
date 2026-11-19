# SUOXI Skin Care & Aesthetic Center CRM — Monorepo Architecture

Comprehensive clinical operations platform for SUOXI Skin Care & Aesthetic Center in Dhaka, Bangladesh.

## Monorepo Workspaces (Prompt 0 Infrastructure)

- **`apps/web`**: React 19 + TypeScript + Vite + Tailwind CSS v4 frontend.
- **`apps/api`**: Node.js 24 LTS + Express + TypeScript + Zod backend API (`/api/v1`).
- **`apps/worker`**: Background queue worker for scheduled tasks (SMS delivery tracking, session call queue).
- **`packages/shared-types`**: Canonical domain DTOs, API-CONV envelopes, and health check contracts.
- **`db/migrations`**: MySQL 8 database migrations (`0000_infrastructure.sql` through `0020_reports_and_export_logs.sql`).

## Prerequisites

- **Node.js**: `24.x LTS` (or compatible Node runtime)
- **MySQL**: `8.0+` (InnoDB, `utf8mb4_unicode_ci`)
- **Docker & Docker Compose**: For local containerized MySQL 8

## Local Development Database (Docker Compose)

The local MySQL 8 database is configured to listen on **host port 3308** (mapping to container port `3306`) to prevent host port collisions:

```bash
docker compose up -d mysql
```

- **Host**: `localhost`
- **Port**: `3308`
- **Database**: `suoxi_crm`
- **User**: `suoxi_dev_user`
- **Password**: `suoxi_dev_password_only` *(Development-only credential — replace before production)*

## Running the Monorepo (Workspace Commands)

Run all commands from the repository root:

- **Start API Server**: `npm run dev:api`
- **Start Web Frontend (Vite on port 3000)**: `npm run dev:web`
- **Start Background Worker**: `npm run dev:worker`
- **Build Web Frontend**: `npm run build`
- **Typecheck All Workspaces**: `npm run typecheck`
- **Run API Test Suite**: `npm run test:api`

## Database Migrations

- **Dry-run Migration Plan (no DDL executed)**:
  ```bash
  npm run migrate:plan
  ```
- **Apply Pending Migrations**:
  ```bash
  npm run migrate:up
  ```
- **Production Safety Guard**: When targeting a production database (`DATABASE_URL` or `DB_NAME` matching `production`/`prod`), `migrate:up` requires `CONFIRM_PRODUCTION_MIGRATION=yes`:
  ```bash
  CONFIRM_PRODUCTION_MIGRATION=yes npm run migrate:up
  ```
