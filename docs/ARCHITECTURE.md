# SUOXI Skin ERP — System Architecture

## 1. Executive Architectural Decision

SUOXI Skin Care & Aesthetic Center ERP runs on a **single canonical PostgreSQL-only full-stack architecture** deployed behind **LiteSpeed / OpenLiteSpeed** on Linux VPS with **PM2** process management (`erp.suoxi.tech`).

### Canonical Runtime Stack
| Layer | Technology | Canonical Entrypoint | Responsibility |
|---|---|---|---|
| **Frontend SPA** | React 19 + TypeScript + Vite 8 + Tailwind CSS v4 | `index.html` → `src/main.tsx` → `src/App.tsx` (built to `dist/`) | Clinical, Billing, Inventory, Call Center, Referrals, Patient Portal, Reports & Settings UI |
| **Canonical API Server** | Node.js + Express 5 + TypeScript (`tsx`) | `server.ts` (PM2 process `suoxi-crm`) | Serves static SPA (`dist/` in production), `/api/v1/*` and `/portal/*` REST APIs, cookie sessions, RBAC, persistent CSRF/idempotency, private file streaming |
| **Canonical Background Worker** | Node.js + TypeScript + BullMQ (`ioredis`) | `server/worker.ts` (PM2 process `suoxi-worker`) | Dispatches queued notifications (`FOR UPDATE SKIP LOCKED`), processes transactional `domain_outbox_events` into `referral_commissions`, runs BullMQ `suoxi-clinic-jobs`, refreshes tomorrow's call list |
| **Primary Database (Source of Truth)** | **PostgreSQL 16 ONLY** (`pg` connection pool) | `server/db/pgPool.ts` + `db/postgres/migrations/0001..0003` | 100% of durable business, clinical, financial, inventory, portal, notification, security, and audit state (85 tables) |
| **Cache / Queue Acceleration** | Redis 7 + BullMQ (`ioredis`) | `server/cache/redisClient.ts`, `server/queue/jobQueue.ts` | Optional acceleration for CSRF, login-failure counters, and async jobs; PostgreSQL remains durable source of truth |
| **Private File Storage** | Local VPS filesystem (`UPLOAD_DIR`) | `server/storage/localFileStorage.ts` | Non-public storage of clinical photos, attachments, and PDFs verified by magic-byte inspection and served only via authenticated streaming routes |
| **Reverse Proxy & TLS** | LiteSpeed / OpenLiteSpeed | `deploy/litespeed/erp.suoxi.tech.conf` | TLS termination, HTTP/2 & HTTP/3, HSTS, reverse proxy to the chosen local Express port |

> **Legacy Workspace Note:** `apps/api`, `apps/web`, and `apps/worker` are maintained in the workspace with PostgreSQL-only dependencies (`mysql2` removed; all 27 API unit/integration suites and all 4 workspace TypeScript builds passing), while root `server.ts` + `server/worker.ts` + root `src/` form the single canonical production deployment runtime.

---

## 2. High-Level Architecture Diagram

```text
                       Internet (HTTPS :443, erp.suoxi.tech)
                                        │
                                        ▼
                    ┌────────────────────────────────────────┐
                    │   LiteSpeed / OpenLiteSpeed Reverse    │
                    │   Proxy (TLS, HSTS, Gzip/Brotli, IP    │
                    │   Forwarding: X-Forwarded-For/Proto)   │
                    └───────────────────┬────────────────────┘
                                        │ HTTP 127.0.0.1:<PORT>
                                        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│              PM2 Process 1: suoxi-crm (`server.ts`, Express 5)            │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │ Startup Gate: assertProductionSecurityOrThrow() — FAIL CLOSED       │  │
│  │ Security Middleware: trust proxy, strict CORS allowlist, headers,   │  │
│  │   Persistent CSRF (PG+Redis), Persistent Idempotency-Key (PG)       │  │
│  └──────────────────────────┬──────────────────────────────────────────┘  │
│                             │                                             │
│   ┌─────────────────────────┼─────────────────────────────────────────┐   │
│   ▼                         ▼                                         ▼   │
│ Static SPA (`dist/`)   Auth & RBAC Layer                        Route Routers
│ - React 19 UI          - productionAuth.ts (Argon2id,           - phase4PlatformRoutes
│ - Zero hardcoded keys    suoxi_sid cookie, lockout)             - pgCoreRoutes
│ - Relative /api paths  - rbacMiddleware.ts (branch scope,       - pgOpsRoutes
│                          permission overrides)                  - pgExtendedRoutes
│                        - Portal realm (`portal_sid` isolated)   - Prod 404 Barrier
└─────────────────────────────┬─────────────────────────────────────────┬───┘
                              │                                         │
              ┌───────────────┴──────────────┐                          │
              ▼                              ▼                          ▼
┌───────────────────────────┐  ┌───────────────────────────┐  ┌───────────────────┐
│     PostgreSQL 16 (PG)    │  │   Redis 7 + BullMQ        │  │ Private Disk      │
│  85 Normalized Tables     │  │   (Cache / Queue / Locks) │  │ UPLOAD_DIR        │
│  ACID TX + FOR UPDATE     │  └─────────────┬─────────────┘  │ /var/data/suoxi/  │
│  Asia/Dhaka (+06:00)      │                │                │ uploads (0700)    │
└─────────────▲─────────────┘                │                └───────────────────┘
              │                              │
              │    ┌─────────────────────────┴──────────────────────────┐
              └────┤  PM2 Process 2: suoxi-worker (`server/worker.ts`)  │
                   │  - `notifications` SKIP LOCKED dispatcher          │
                   │  - `domain_outbox_events` -> `referral_commissions`│
                   │  - BullMQ `suoxi-clinic-jobs` worker               │
                   │  - Tomorrow call-center queue refresher            │
                   └────────────────────────────────────────────────────┘
```

---

## 3. Production Fail-Closed Route Isolation

In `NODE_ENV=production`:
1. `assertProductionSecurityOrThrow()` runs before HTTP binding and refuses startup if `DATABASE_URL` is missing or not PostgreSQL, `SESSION_SECRET` / `APP_MASTER_KEY` are missing or weak, or `ENABLE_DEMO_ROLE_SWITCHER=true`.
2. All production API routes are served by the four PostgreSQL-backed routers:
   - `server/routes/phase4PlatformRoutes.ts` (Auth, Sessions, Health/Readiness, Authenticated Private File Streaming)
   - `server/routes/pgCoreRoutes.ts` (Patients, Appointments, Consultations, Prescriptions, Medical Attachments, Packages, Invoices, Payments, Refunds, Payment Webhooks, Daily Closing)
   - `server/routes/pgOpsRoutes.ts` (Inventory, Batches, Stock Adjustments, Suppliers, POs, GRN, Call Center, Referrals, Commission Rules/Ledger/Outbox/Payouts, SMS/Email Gateways & Logs, Branches, Users, Roles, Duty Roster, Settings, Backups, Audit Events)
   - `server/routes/pgExtendedRoutes.ts` (Patient Medical History/Entries/Notes/Duplicates, Catalog Categories/Services/Follow-Up Rules/Guidance, Calendar & Provider Schedules/Resources, Treatment Plans/Consents/Sessions/Consumables/Photos, Isolated Patient Portal Auth & Self-Service API, Notification Queue & Delivery Webhooks, Staff Alerts, Real Reports Hub & CSV Export)
3. Immediately after `pgExtendedRoutes`, `server.ts` mounts a **Production API Barrier** returning `404 API_ENDPOINT_NOT_FOUND` for any unmatched `/api/*` or `/portal/*` path, guaranteeing zero prototype/in-memory fallback code can ever execute in production.

---

## 4. Module-to-PostgreSQL Repository Mapping

| Business Module | PostgreSQL Repository | Primary Tables |
|---|---|---|
| Auth, Sessions, Lockout, CSRF, Idempotency | `server/auth/productionAuth.ts`, `server/repositories/pgSecurityStoreRepo.ts`, `server/auth/rbacMiddleware.ts` | `users`, `clinic_roles`, `active_sessions`, `user_security_logs`, `user_branch_assignments`, `user_permission_overrides`, `csrf_tokens`, `idempotency_keys`, `login_attempts`, `code_sequences` |
| Patients, Medical Records, Attachments, Appointments, Consultations, Prescriptions | `server/repositories/pgPatientClinicalRepo.ts`, `server/repositories/pgClinicalSessionsRepo.ts` | `patients`, `patient_medical_histories`, `patient_medical_entries`, `patient_notes`, `patient_duplicate_candidates`, `medical_attachments`, `file_assets`, `appointments`, `appointment_status_history`, `consultations`, `treatment_plans`, `consent_records`, `prescriptions`, `rx_protocols`, `treatment_sessions`, `session_consumables`, `treatment_photos` |
| Service Catalog, Guidance & Calendar | `server/repositories/pgCatalogCalendarRepo.ts` | `catalog_categories`, `treatment_services`, `treatment_followup_rules`, `guidance_templates`, `appointment_sources`, `clinic_resources`, `provider_schedules` |
| Packages, Invoicing, Payments, Refunds, Webhooks & Daily Closing | `server/repositories/pgBillingPackageRepo.ts` | `master_packages`, `treatment_packages`, `package_deductions`, `package_cancellations`, `payment_methods`, `invoices`, `invoice_items`, `payment_records`, `payment_allocations`, `payment_refunds`, `payment_webhook_events`, `daily_closing_reports`, `domain_outbox_events` |
| Inventory, Batches, Suppliers, POs & GRN | `server/repositories/pgInventoryRepo.ts` | `inventory_categories`, `inventory_items`, `product_batches`, `stock_adjustments`, `stock_movements`, `suppliers`, `purchase_orders`, `purchase_order_items`, `goods_received_notes` |
| Call Center & Referral Commissions | `server/repositories/pgCallCenterReferralsRepo.ts` | `call_center_tasks`, `call_contact_logs`, `follow_up_rules`, `referrers`, `commission_rules`, `patient_referrals`, `referral_commissions`, `commission_payouts` |
| Isolated Patient Portal | `server/repositories/pgPortalRepo.ts` | `patient_portal_accounts`, `patient_portal_sessions`, `patient_portal_tokens`, `patient_contact_otps` |
| Notifications, Webhooks, Alerts & Reports | `server/repositories/pgNotificationsReportsRepo.ts` | `notifications`, `notification_event_rules`, `webhook_events`, `staff_alerts`, `data_export_logs` |
| Settings, Encrypted Integrations, Branches, Staff, Backups & Audit | `server/repositories/pgOpsSettingsRepo.ts`, `server/repositories/pgHelpers.ts` | `organizations`, `branches`, `staff_duty_roster`, `clinic_settings`, `integration_configs`, `sms_templates`, `sms_logs`, `email_templates`, `email_logs`, `backup_records`, `audit_events` |
