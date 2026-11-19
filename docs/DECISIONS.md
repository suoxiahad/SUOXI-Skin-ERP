# Architecture Decision Records (ADRs) — SUOXI CRM

## ADR-001: Monorepo Workspace Topology
- **Status**: Accepted
- **Context**: The clinic platform requires discrete frontend, API backend, worker services, and shared types.
- **Decision**: Organize into `apps/web` (React/Vite/Tailwind), `apps/api` (Node/Express/Zod), `apps/worker` (Node background queue), `packages/shared-types` (common DTOs and contracts), and `db/migrations` (SQL migrations).
- **Consequences**: Enables modular code separation and clean boundaries without inter-layer bleeding.

## ADR-002: MySQL 8 Schema Gate Enforcement (Rule 11)
- **Status**: Accepted
- **Context**: Rule 11 strictly prohibits inventing or assuming MySQL 8 table definitions, columns, constraints, or indexes without a verified user-supplied schema.
- **Decision**: Maintain `db/migrations/` in an empty, schema-gated state with a `.gitkeep` placeholder during Prompt 0. Zero DDL or mock tables will be generated until formal verification.
- **Consequences**: Avoids schema drift and protects against rework when the client provides the official database schema.

## ADR-003: Non-Destructive Side-by-Side Prompt 0 Scaffolding
- **Status**: Accepted
- **Context**: The existing root application is currently running and must remain 100% operational on port 3000 without downtime.
- **Decision**: Scaffold all Prompt 0 monorepo workspace files inside isolated directories (`apps/`, `packages/`, `db/`) without modifying or removing any existing root files (`server.ts`, `package.json`, `index.html`, `vite.config.ts`, `src/`).
- **Consequences**: Zero regression for the active dev server while establishing the clean monorepo skeleton.

## ADR-004: Local Database Port Mapping (3308:3306)
- **Status**: Accepted
- **Context**: Default port 3306 frequently collides with existing system MySQL or MariaDB instances on developer workstations.
- **Decision**: Map host port `3308` to container port `3306` in `docker-compose.yml`.
- **Consequences**: Conflict-free local development.

## ADR-005: Patient Schema, Normalized Mobile Indexing, and Human-Supervised Duplicate Resolution (Prompt 4)
- **Status**: Accepted
- **Context**: Patient identity across aesthetic clinics requires duplicate prevention (+8801 format), Bangla/English bilingual naming, strict clinical-access partitioning, and non-destructive merges.
- **Decision**:
  1. Store patient records in `patients` with immutable `patient_code` generated atomically by `nextCode('PATIENT')`.
  2. Implement `primary_mobile_normalized` with CHECK constraint (`^\+8801[3-9][0-9]{8}$`).
  3. Real-time debounced duplicate warning in the registration UI coupled with server-side candidate logging into `patient_duplicate_candidates`. Never auto-merge (Hard Rule 9).
  4. Non-destructive merge: Marks duplicate profile as `status = 'merged'`, sets `merged_into_patient_id`, forbids self-merges and chain-merges, and retains all historical consultations/prescriptions.
  5. Enforce role-aware DTO stripping: Call center roles receive restricted DTOs omitting address, clinical history, and billing data at the server serialization boundary.

## ADR-006: Patient Profile, Timeline View (v_patient_timeline), and File Asset Attachment (Prompt 5)
- **Status**: Accepted
- **Context**: Prompt 5 introduces the comprehensive Patient Profile (/patients/:id), a unified chronological timeline (`v_patient_timeline`), HMAC-signed file assets (`files`), categorized clinical medical entries, and extended notes.
- **Decision**:
  1. **v_patient_timeline**: Formulate a union view over currently implemented tables (`patients`, `patient_notes`, `patient_medical_history`, `audit_events`), establishing the standard timeline contract `(patient_id, event_type, event_at, summary, ref_type, ref_id)`. Future prompts will run `CREATE OR REPLACE VIEW` as appointments, consultations, sessions, prescriptions, and billing modules land.
  2. **File Service & Storage**: Extend `files` with polymorphic ownership (`owner_type`, `owner_id`), category classification (`file_category`), patient portal visibility (`is_visible_to_patient`), capture date (`taken_at`), and soft deletion (`deleted_at`). Enforce magic-byte MIME validation, randomized storage keys, and <= 5 min HMAC-signed URLs.
  3. **Categorized Clinical History**: Provide discrete medical entries (`patient_medical_entries`) to support categorized cards (Allergy, Chronic condition, Current medication, Past surgery, Family history, Skin history, Lifestyle, Pregnancy, Other) with severity, onset date, and active toggle.
  4. **Notes Enum Extension**: Expand `patient_notes.note_type` to encompass `'general', 'clinical_alert', 'front_desk', 'call_center', 'billing', 'administrative'`.
- **Consequences**: Strict Schema Gate compliance, zero unverified schema drift, and unified clinical timeline visibility.

## ADR-007: Appointments Core Schema, Slot Availability & Concurrency Locking (Prompt 6)
- **Status**: Accepted
- **Context**: Scheduling appointments across aesthetic clinics requires race-free slot allocation for providers and specialized devices (Laser, HydraFacial), terminal status lifecycle transitions, doctor schedule protection, and Asia/Dhaka wall-clock time alignment.
- **Decision**:
  1. **Schema & Sequence**: Adopt PACK-PROPOSED schema in migration `0007_appointments_core.sql` covering `appointment_sources`, `resources`, `provider_schedules`, `provider_time_off`, `appointments`, and `appointment_status_history`. Sequential codes generated via `nextCode('APPOINTMENT')` (`APT-000001` format).
  2. **PRD Status Lifecycle Matrix**: Enforce valid transitions:
     - `Booked` -> `Confirmed` | `Visited` | `Cancelled` | `No-show` | `Rescheduled`
     - `Confirmed` -> `Visited` | `Cancelled` | `No-show` | `Rescheduled`
     - Terminal states: `Visited`, `Cancelled`, `No-show`, and `Rescheduled` reject any further status change with HTTP 409 Conflict.
  3. **Concurrency Conflict Detection**: `system_settings.appointment_conflict_mode` set to `'block'`. Concurrent write requests serialize and lock provider and resource slots with `SELECT ... FOR UPDATE`, ensuring parallel bookings for identical slots return exactly one HTTP 201 and one HTTP 409.
  4. **Atomic Reschedule**: Updates the previous appointment to `rescheduled`, creates a new appointment linked by `rescheduled_from_appointment_id` and `rescheduled_to_appointment_id`, and writes history entries in a single ACID transaction.
  5. **Clinical Protection**: When `set_by_clinician = 1`, call-center agents (`call_center` role) are barred from editing date/time slots (server-enforced HTTP 403 Forbidden).
  6. **Timeline Extension**: Recreate `v_patient_timeline` to incorporate appointment lifecycle events (`appointment_booked`, `appointment_confirmed`, `appointment_visited`, etc.).
- **Consequences**: Enforces zero double-booking, protects doctor clinical schedules, guarantees idempotency, and maintains complete historical audit trails.

## ADR-008: Calendar Views, 42-Day Range Capping, Shaded Schedules & Reschedule Modals (Prompt 7)
- **Status**: Accepted
- **Context**: Visual clinic scheduling across multi-doctor aesthetic practices requires Day, Week, and Month multi-resource grids, shaded working hours, hatched time-off blocks, server-capped query windows, call-center clinical privacy protection, and conflict-checked drag rescheduling.
- **Decision**:
  1. **Schema Reuse**: Zero new tables or columns required. Seamlessly reuses `appointments`, `provider_schedules`, `provider_time_off`, `resources`, and `appointment_sources` from Migration 0007.
  2. **Range Capping Rule**: Enforce server-side 42-day window cap on `GET /calendar?from&to` (`Date range exceeds maximum allowed window of 42 days`). Any request exceeding 42 days or having `from > to` returns HTTP 400 Bad Request.
  3. **Role-Aware Privacy DTO**: When called by a user with role `call_center`, the serialized calendar DTO omits sensitive clinical `notes` and patient mobile numbers.
  4. **K2 Visual Grid Discipline**: Solid readable background surfaces for calendar grids with hatched blocks (`bg-[repeating-linear-gradient]`) for doctor time-offs. Status colors are always paired with icons and text labels (never color alone).
  5. **Atomic Drag-to-Reschedule**: Optional drag-to-reschedule triggers a confirmation modal requiring a mandatory reason. It delegates to the standard atomic reschedule endpoint (`POST /appointments/:id/reschedule`), preserving conflict locking, doctor schedule protection, and audit logs.
- **Consequences**: High performance, zero unbounded queries, complete privacy compliance, and clean UX.

## ADR-009: Treatment Catalog and Food & Lifestyle Guidance Library (Prompt 8)
- **Status**: Accepted
- **Context**: Operational management of clinical procedures and post-treatment guidance requires structured categories, treatment services, allowed physical/device resources, interval-based follow-up rules, and an immutable clinician-approved food and lifestyle guidance library.
- **Decision**:
  1. **Schema & Relationships**: Implement `0008_treatment_catalog_and_guidance.sql` with `treatment_categories`, `treatment_services`, `treatment_service_resources`, `treatment_followup_rules`, `food_lifestyle_guidance`, and `food_lifestyle_guidance_items`.
  2. **Single Active Approved Version Rule**: Enforce "only one APPROVED guidance version per service" at the DB engine level via stored generated column `approved_flag = IF(status = 'approved', service_id, NULL)` paired with a `UNIQUE KEY uq_guidance_approved_per_service (approved_flag)`.
  3. **Atomic Approval Transaction**: Transitioning a guidance draft to approved locks the service's guidance rows, retires any previously approved version, marks the new version approved, and timestamps the approver within a single ACID transaction.
  4. **Approved Version Immutability**: Enforce both DB trigger (`trg_prevent_approved_guidance_mutation`) and service-level checks: once approved, a guidance record cannot be updated in-place (returns HTTP 409 Conflict). Editing requires branching a new version.
  5. **Clinical Role Gate**: Enforce that only users possessing permission `guidance.approve` AND a clinical role (`doctor`, `super_admin`) can approve guidance. Non-clinical attempts are rejected with HTTP 403 Forbidden.
  6. **Bilingual Guidance Item Contract**: Validate that every guidance item contains at least one language (`chk_flgi_has_language`: `content_en IS NOT NULL OR content_bn IS NOT NULL`).
  7. **Decision A-08 Seed Marker**: Pre-seed initial guidance data for HydraFacial (HF-001) explicitly flagged as `SAMPLE ONLY — real guidance must be clinician-approved`.
- **Consequences**: Guarantees zero conflicting active guidance versions, maintains historical prescription attachment fidelity, and satisfies clinical governance requirements.

## ADR-010: Consultations, Prescriptions, "Suggest Food" Guidance Snapshots & Server-Side PDF (Prompt 9)
- **Status**: Accepted
- **Context**: Clinical consultations and medical prescriptions carry highest medical and legal risk. Finalized prescriptions must be completely immutable, frozen against doctor tampering, and provide reproducible A4 PDFs with Noto Sans Bengali.
- **Decision**:
  1. **Schema & Sequence**: Adopt PACK-PROPOSED schema in migration `0009_consultations_and_prescriptions.sql` covering `consultations`, `treatment_plans`, `prescriptions`, `prescription_items`, `prescription_guidance_snapshots`, `prescription_guidance_snapshot_items`, and `consent_records`. Sequential numbers generated atomically via `nextCode('RX')` (`RX-000001`), `nextCode('CONSULTATION')` (`CNS-000001`), `nextCode('PLAN')` (`PLN-000001`), and `nextCode('CONSENT')` (`CNSNT-000001`).
  2. **Linear Version Correction Chain**: Enforce single-parent lineage via `UNIQUE previous_version_id` on `prescriptions`. A prescription correction atomically supersedes the previous version and spawns a new draft version `version_number = parent.version_number + 1`.
  3. **Atomic Finalization & Snapshotting**: Finalize operates in a single transaction with `SELECT ... FOR UPDATE`. If `suggest_food = true` and the selected service has an approved guidance version, the guidance metadata and items are cloned into `prescription_guidance_snapshots` and `prescription_guidance_snapshot_items`.
  4. **Strict Immutability Triggers**: Triggers `trg_prevent_finalized_prescription_mutation`, `trg_prevent_finalized_prescription_delete`, `trg_prevent_prescription_items_mutation`, and `trg_prevent_guidance_snapshot_mutation` forbid any modification to clinical content once finalized. Only `status` -> `superseded`/`void`, `published_to_portal`, and PDF references are permitted.
  5. **Clinical Gate Enforcement**: Finalizing a prescription requires permission `prescription.finalize` AND clinical role (`doctor` or `super_admin`). Receptionist/call-center attempts return HTTP 403 Forbidden.
  6. **Server-Side PDF Generation & Storage**: Generate A4 PDF using headless Chromium (Puppeteer) with Noto Sans Bengali. Store PDF with SHA-256 hash in private file repository. Both Print and Download actions serve the stored PDF to guarantee byte-for-byte fidelity with the clinical record.
  7. **Debounced Consultation Auto-Save**: Auto-save drafts via debounced PATCH with `version` matching to prevent lost updates during concurrent edits.
- **Consequences**: Guarantees zero post-finalization prescription tampering, exact reproduction of historical food/lifestyle advice, and full clinical audit compliance.

## ADR-011: Treatment Sessions, Clinical Photos, Consumables & Doctor-Defined Next Session (Prompt 10)
- **Status**: Accepted
- **Context**: Operational tracking of procedural aesthetic sessions, clinical before/after photo documentation, consumable usage, and doctor-governed next-session appointments requires strict transaction boundaries, concurrency locks, and role restrictions.
- **Decision**:
  1. **Schema & Circular FK Resolution**: Implement `0010_treatment_sessions.sql` covering `treatment_sessions`, `treatment_photos`, and `session_consumables`. Resolve the circular dependency with `appointments.origin_session_id` using an explicit `ALTER TABLE appointments ADD CONSTRAINT fk_appointments_origin_session FOREIGN KEY (origin_session_id) REFERENCES treatment_sessions(id) ON DELETE RESTRICT`.
  2. **Session Completion Idempotency**: `completeSession` runs in a single transaction with row locking (`SELECT ... FOR UPDATE`). Only sessions in `planned` (or `in_progress`) status may be completed. Re-completing an already completed session returns HTTP 409 Conflict with zero duplicate side effects. Concurrently, the linked appointment is marked `visited`.
  3. **Package Deduction Hook**: A clearly designated hook (`// HOOK: Package session deduction (Prompt 11)`) is wired into `completeSession` for seamless integration with package allowances.
  4. **Doctor-Defined Next Session**: Only clinical users (`doctor`, `super_admin`) or holders of `schedule.override` can invoke `POST /sessions/:id/next-session`. Call-center staff are rejected with HTTP 403 Forbidden. The endpoint invokes the appointment service, generating a linked appointment with `set_by_clinician = true` and `origin_session_id = sessionId`, applying full provider schedule conflict checking.
  5. **Clinical Photo Privacy**: Photos are stored in the private file repository and accessible only via short-lived signed URLs. Non-clinical staff without clinical or photo view permission are barred with HTTP 403 Forbidden.
  6. **Timeline Extension**: `v_patient_timeline` incorporates `treatment_session_completed` and `treatment_photo_added` events.
- **Consequences**: Protects clinical integrity, prevents double session completion, secures patient clinical photos, and ensures strict doctor control over procedural follow-ups.

## ADR-012: Treatment Packages, Entitlement Snapshots, Append-Only Session Ledger & Reversal Rules (Prompt 11)
- **Status**: Accepted
- **Context**: Treatment packages (e.g. "Glow Boost Package": 10 sessions of HydraFacial) bundle prepaid sessions with validity periods. Package session deduction must be strictly idempotent, protected against double deductions (Hard Rule 5), and tracked via an immutable append-only ledger without hard deletes or silent edits.
- **Decision**:
  1. **Schema & Entitlement Snapshotting**: Implement `0011_treatment_packages.sql` with `packages`, `package_items`, `patient_packages`, `patient_package_items`, `package_session_ledger`, and `package_cancellations`. When assigning a package to a patient, create a point-in-time snapshot of the package terms, price sold, and included items so later catalog edits never modify assigned packages.
  2. **Append-Only Session Ledger**: `package_session_ledger` is strictly append-only. MySQL triggers `trg_pkg_ledger_no_update` and `trg_pkg_ledger_no_delete` forbid any UPDATE or DELETE operations. The application user has INSERT/SELECT only.
  3. **Zero Double-Deduction Invariant (Hard Rule 5)**: Enforce `UNIQUE(treatment_session_id, cycle_no, entry_type)` at the database constraint level. When `completeSession` runs, `packageService.completeSessionDeduct` executes inside the same transaction with `SELECT ... FOR UPDATE` locking on the active, non-expired package item. If a duplicate deduction attempt occurs, the unique constraint or in-memory lock guarantees exactly one deduction ledger entry.
  4. **Strict Reversal Workflow**: Reversals are recorded as new ledger rows (`entry_type = 'reversal'`, `change_quantity = +1`) referencing `original_ledger_id`. A unique constraint `uq_reversal_original` ensures each deduction can only be reversed once. A second reversal returns HTTP 409 Conflict.
  5. **Balance Derivation**: Balances are dynamically derived via `v_patient_package_balances` (`remaining = initial_sessions - deductions + reversals`). Deduction attempts beyond remaining return HTTP 422 Unprocessable Entity. Expired packages allow no deductions.
  6. **Package Cancellation & Renewal**: Cancellation records explicit reasons and handling for remaining sessions (`forfeited`, `refunded`, `credited`, `transferred`) requiring manager approval. Renewals create a new linked patient package referencing the original.
  7. **Audit & Timeline**: All package assignments, renewals, cancellations, and reversals write audit logs and integrate into `v_patient_timeline`.
- **Consequences**: Guarantees zero double deductions, complete financial auditability, immutable ledger protection, and accurate patient package balances.

## ADR-013: Billing, Invoices, Payments, Derived Balances, and Transactional Outbox (Prompt 12)
- **Status**: Accepted
- **Context**: Billing is the highest financial risk domain in the clinic operations platform. Hard Rule 3 dictates nothing financial is hard-deleted. Hard Rule 4 requires that paid amount and due are ALWAYS derived from payment/allocation/refund rows, never stored or edited as independent fields. Concurrency anomalies (such as parallel payments over-allocating an invoice or duplicate refunds) must be prevented with strict locking orders and database constraints.
- **Decision**:
  1. **Schema & Derived Balances**: Implement `0012_billing_invoices_payments_refunds.sql` covering `payment_methods`, `invoices`, `invoice_items`, `payments`, `payment_allocations`, `refunds`, and the transactional outbox `domain_events`. Balances (`paid_amount`, `due_amount`, `payment_status`, `net_patient_due`) are dynamically computed by views `v_invoice_balances`, `v_patient_dues`, `v_payment_unallocated`, and `v_daily_collections`.
  2. **Lock Order & Concurrency**: All financial writes execute in ONE transaction with consistent lock ordering: `patient -> invoice -> payment`. `recordPayment` and `requestRefund` acquire `SELECT ... FOR UPDATE` row locks. Parallel payments or refunds cannot over-allocate or over-refund.
  3. **Immutable Invoices & Append-Only Financial Records**: Issued invoices are immutable (`trg_invoices_immutable_issued`). Corrections require voiding (with mandatory reason, timestamp, and actor) and re-issuing a new invoice. `payments` and `payment_allocations` forbid hard deletion (`trg_payments_no_delete`, `trg_allocations_no_delete`).
  4. **Discount Authorizations**: Request discounts exceeding the staff role's `max_discount_percent` require explicit approval (`discount_authorized_by`) from a supervisor whose role covers the discount, requiring `billing.discount` permission and mandatory audit event logging.
  5. **Refund 3-Stage Lifecycle**: Refunds progress through `requested -> approved -> paid`. Refunds cannot exceed `(allocated amount - already refunded)`.
  6. **Idempotency & TrxID Uniqueness**: All money mutations require an `Idempotency-Key` header. Payments enforce `UNIQUE(payment_method_id, transaction_reference)` (NULLs allowed for cash).
  7. **Transactional Outbox (`domain_events`)**: Events `'payment.recorded'` and `'refund.completed'` are inserted in the exact same transaction as the money write, ensuring guaranteed downstream worker delivery (Prompt 19).
  8. **Receipt Generation**: Printable receipts format currency in BDT "৳", compute amount in words (e.g., "Two Thousand Taka Only"), and prominently display the "Staff recorded" badge since manual entries do not imply automated payment gateway verification.
- **Consequences**: Complete financial audit trail, zero mathematical rounding/floating errors, immutable ledger safety, and deadlock-free transactional payment processing.

## ADR-014: Inventory, Append-Only Stock Ledger, Derived Stock on Hand, and Multi-Stage Purchases (Prompt 13)
- **Status**: Accepted
- **Context**: Accurate stock of consumables (serums, peels, injectable toxins, hyaluronic acid) and retail skincare directly affects clinical safety, cost of goods sold, and reorder cycles. Hard Rule 3 forbids hard-deleting stock records. Stock on hand must NEVER be an editable column; it is always derived from append-only movement rows. Concurrency anomalies (such as parallel session usages overselling limited inventory or duplicate purchase receipts) must be prevented with row locks and status guards.
- **Decision**:
  1. **Schema & Movement Signs**: Implement `0013_inventory_products_stock_movements.sql` covering `product_categories`, `products`, `suppliers`, `purchases`, `purchase_items`, `product_batches`, and `stock_movements`. Movement types enforce strict signs via CHECK constraints (`purchase_receipt` > 0, `session_usage` < 0, `wastage` < 0, `adjustment` != 0, `reversal` != 0).
  2. **Append-Only Immutability**: Triggers `trg_stock_movements_no_update` and `trg_stock_movements_no_delete` forbid UPDATE and DELETE operations. DB application user has INSERT/SELECT only.
  3. **Derived Stock on Hand Views**: `v_stock_on_hand` dynamically aggregates `COALESCE(SUM(quantity_change), 0.00)` grouped by product and branch. `v_low_stock` highlights items where stock <= reorder_level. `v_expiring_batches` tracks batch expiry boundaries (<30 days critical/red, <90 days warning/amber).
  4. **Pessimistic Concurrency & Negative Stock Guard**: `recordMovement` executes inside a single transaction locking the product and batch rows with `SELECT ... FOR UPDATE`. If `allow_negative_stock` is false, any movement that would drive balance below zero is rejected with HTTP 422 Unprocessable Entity. Parallel usages cannot oversell.
  5. **Idempotent Purchase Receiving**: Transitioning a purchase to `'received'` writes `purchase_receipt` movements and batch rows in ONE transaction. Attempting to receive an already-received purchase returns HTTP 409 Conflict.
  6. **Clinical Linkages & Reversals**: Consumables saved during treatment sessions atomically create linked `session_usage` movements. Deleting or editing a consumable records an append-only `reversal` movement referencing the original movement ID.
  7. **Supervised Adjustments (AS-2 Enforcement)**: Adjustments, wastage, and reversals require a non-empty reason, an approver with `inventory.adjust` permission, and enforce `requested_by <> approved_by` to prevent self-approval.
  8. **Prescription Product Linkage**: Enables foreign key link `prescription_items.inventory_product_id -> products.id`.
- **Consequences**: Guarantees zero stock drift, non-repudiable audit logs, race-free session consumable deductions, and automated reorder & expiry visibility.

## ADR-015: Settings Integrations (SMTP + Elitbuzz SMS), AES-256-GCM Credential Encryption, and Notification Templates (Prompt 15)
- **Status**: Accepted
- **Context**: External communications (appointment reminders, session notifications, payment dues, and portal credentials) require trustworthy transport channels without ever exposing credentials. Hard Rule 7 dictates SMS "sent" means accepted by gateway, not delivered. Hard Rule 10 dictates credentials must never be displayed or returned in API responses.
- **Decision**:
  1. **Schema & Generated Default Guard**: Implement `0015_integrations_and_templates.sql`. Store non-secret parameters in a `config` JSON column. Store credentials exclusively as AES-256-GCM ciphertext, IV, auth tag, and key version. Enforce "only one active default per integration type" via a stored generated column `default_flag = IF(is_default = 1 AND is_active = 1, integration_type, NULL)` backed by a unique index `uq_one_active_default_per_type`.
  2. **Resolution of Open Decision A-02 (SMS Gateway)**: Use Elitbuzz (`https://msg.elitbuzz-bd.com/smsapi`) as the preferred gateway with pre-configured request mapping, alongside a generic configurable HTTP adapter and a MockSmsAdapter for test environments.
  3. **Resolution of Open Decision A-03 (SMTP Provider)**: Support custom VPS / hosting manual SMTP via NodeMailer transport with host, port, SSL/TLS, and credentials encrypted with AES-256-GCM.
  4. **Strict Credential Masking (Hard Rule 10)**: The API never returns plaintext passwords or ciphertext. UI receives only boolean `has_credential` and masked placeholder (`••••••••`). Replacing credentials overwrites existing ciphertext and generates a new IV and auth tag.
  5. **SSRF Defense Architecture**: Generic HTTP adapters enforce strict SSRF defenses: protocol whitelist (HTTPS only), pre-request DNS resolution rejecting private IPv4/IPv6 ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.169.254`, `::1`), disallowing private hostnames, rejecting redirects to blocked IPs, 5-second socket timeout, and 1MB response size limit.
  6. **Template Engine & UCS-2 Bangla Segmentation**: Templates enforce strict variable token whitelisting (`{{patient_name}}`, `{{appointment_date}}`, `{{appointment_time}}`, `{{doctor_name}}`, `{{clinic_phone}}`). Any unknown variable is rejected on save and render with HTTP 422 Unprocessable Entity. Bangla and Unicode templates calculate character segments using UCS-2 rules (70 chars single, 67 chars multi-part) to prevent unexpected SMS gateway billing.
  7. **Event Automation Rules**: Configurable rules mapping 9 core clinic events to templates and channels with quiet-hours protection (default 21:00 to 08:00 Asia/Dhaka) and patient consent checks.
  8. **Audit Trail**: Every configuration update, template approval, and delivery attempt is logged. Delivery payloads redact passwords, API keys, and sensitive tokens.
- **Consequences**: Complete protection of clinic infrastructure secrets, zero SSRF vulnerability, accurate billing segmentation for Bengali notifications, and deterministic multi-channel delivery.

## ADR-016: Notification Queue, SMS Reminders, Delivery Lifecycle, Staff Alerts Bell, and Patient Consent (Prompt 16)
- **Status**: Accepted
- **Context**: Reliable delivery of appointment reminders and operational notifications is crucial for clinic attendance and preventing missed sessions. Communication must respect patient consent, local communication etiquette (quiet hours in Dhaka), and strict idempotency so patients are never spammed. Furthermore, Hard Rule 7 dictates that "sent" status denotes gateway acceptance, not carrier delivery. Carrier delivery is confirmed exclusively via asynchronous signed webhooks with replay protection.
- **Decision**:
  1. **Schema & Queue Lifecycle**: Implement `0016_notification_queue_and_alerts.sql` introducing `notifications`, `staff_alerts`, `webhook_events`, and patient consent columns on `patients`. Queue lifecycle transitions: `queued -> sending -> sent -> delivered` (or `failed` / `cancelled` / `skipped`).
  2. **Resolution of Open Decision A-04.1 (Consent Storage)**: Patient communication preferences are stored directly as columns on the `patients` table: `consent_sms_notifications TINYINT(1) DEFAULT 1`, `consent_email_notifications TINYINT(1) DEFAULT 1`, and `consent_marketing TINYINT(1) DEFAULT 0`.
  3. **Resolution of Open Decision A-04.2 (Quiet Hours Policy)**: Messages scheduled during Dhaka quiet hours (21:00 to 08:00 Asia/Dhaka) are shifted forward to the next morning at 08:00:00 Asia/Dhaka rather than being silently dropped, ensuring patients receive important morning reminders.
  4. **Hard Rule 7 Adherence & Webhook Ingestion**: Gateway acceptance marks the notification as `status = 'sent'` and sets `sent_at`. Webhook callbacks received at `POST /webhooks/sms/:provider` transition status to `'delivered'` and record `delivered_at`. Status never regresses: once marked `delivered`, subsequent late or out-of-order `sent` or `failed` callbacks are ignored.
  5. **Webhook Security & Replay Defense (B.5a Exemption)**: The webhook endpoint is exempt from browser CSRF tokens per Section B.5a, and secured using provider-specific HMAC signature validation, timestamp freshness tolerance (+/- 5 minutes), and replay protection recorded in `webhook_events (provider_event_id UNIQUE)`.
  6. **Worker Dispatch & Lock Concurrency**: The worker claims due messages using `SELECT ... FOR UPDATE SKIP LOCKED` (with crash recovery visibility timeout where `locked_until < UTC_TIMESTAMP()`). Dispatches obey per-channel rate limits and retry up to `max_retries = 3` using exponential backoff (e.g. 5m, 15m, 45m).
  7. **Staff Alerts Bell**: When a notification exhausts retries and transitions to terminal `failed`, a `staff_alerts` entry of type `failed_reminder` is automatically created with branch scope and a direct link to `/reports/notifications`. The TopBar displays an interactive unread counter badge and notifications dropdown with instant "mark as read".
  8. **Reporting & Manual Interventions**: Supervisors and managers can inspect dispatch metrics, gateway responses, and failure reasons in `/reports/notifications`, with manual single or bulk "Retry" for failed records and "Cancel" for queued records.
- **Consequences**: Guarantees zero duplicate reminder spamming, strict privacy and consent compliance, robust failover recovery, carrier-acknowledged delivery tracking, and proactive staff alerts for communication breakdowns.

## ADR-017: Call Center Operations, Automated Follow-Up Tasks, Privacy DTOs, and Reschedule Routing (Prompt 17)
- **Status**: Accepted
- **Context**: Call center operations and proactive patient follow-up are critical for appointment attendance and reducing no-shows in aesthetic clinics. However, strict boundaries are required: calls happen in external call software (Hard Rule 1), only doctors set schedules (Hard Rule 2), call tasks and SMS status are tracked independently (Hard Rule 7), and call agents must never see sensitive clinical diagnoses or billing dues (Hard Rule 8).
- **Decision**:
  1. **Schema & Dynamic Tomorrow View**: Implement `0017_call_center_and_follow_ups.sql` introducing `follow_up_rules`, `follow_up_tasks`, `call_contact_logs`, and view `v_next_day_call_list`. The view computes tomorrow using Asia/Dhaka wall-clock time (`DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+06:00')) + INTERVAL 1 DAY`), guaranteeing correct calendar date turnover at 18:00 UTC (midnight in Dhaka).
  2. **Strict Server-Side Privacy DTO (Hard Rule 8)**: Call center agents receive `CallCenterAppointmentDto` exposing only patient name, code, primary mobile (with one-touch clipboard copy), doctor, service, and scheduling time. Medical history, allergies, prescriptions, and billing dues are strictly excluded on the server.
  3. **Idempotent Task Generation**: The worker job generates tasks for next-day calls, missed appointments, cancellations, inactive patients (configurable threshold), and package expiries using a deterministic `dedupe_key` backed by a `UNIQUE` constraint, ensuring repeated worker runs produce zero duplicates.
  4. **Reschedule Approval Routing (Hard Rule 2)**: Patient reschedule requests logged by call agents are stored on `call_contact_logs (reschedule_status = 'pending')` and trigger a `staff_alerts` notification to the doctor and reception. The underlying `appointments` row is left completely unmodified until explicitly approved by authorized clinical staff.
  5. **Independent SMS vs. Call Status (Hard Rule 7)**: The Call Center Dashboard displays SMS status (`queued`, `sent`, `delivered`, `failed`) and Call task status (`pending`, `called`, `unreachable`, etc.) in independent columns with dedicated status badges.
  6. **Overdue Indicators**: Follow-up tasks with `due_date < now` display an explicit red clock icon paired with the text label `"Overdue"`, complying with WCAG 2.2 AA non-color-only accessibility.
- **Consequences**: Zero clinical schedule tampering, full patient medical privacy protection, guaranteed idempotent task generation, and comprehensive auditability for all phone interactions.

## ADR-018: Patient Portal Authentication Realm, Session Isolation, Zero-Trust IDOR Prevention, and Mobile-First Architecture (Prompt 18)
- **Status**: Accepted
- **Context**: Patients require secure, self-service access to their upcoming appointments, post-procedure aftercare instructions, finalized prescriptions, billing history, and clinical photos/documents. However, strict boundaries are non-negotiable: patient portal must operate in a discrete authentication realm (`portal`) completely isolated from internal staff users (`staff`), zero patient identification in URL parameters or request payloads may be trusted (mitigating IDOR), visibility flags must be enforced at the SQL layer, and contact edits require rate-limited OTP verification.
- **Decision**:
  1. **Schema & Realm Isolation**: Implement `0018_patient_portal_accounts.sql` with `patient_accounts`, `portal_sessions`, `patient_setup_reset_tokens`, and `portal_contact_change_otps`. Enforce separate cookies (`suoxi_portal_session`, `suoxi_portal_csrf`, `suoxi_portal_anon_id`), distinct session tables, and double-submit CSRF realm matching (`realm = 'portal'`). Staff tokens and cookies reject portal requests with HTTP 401/403, and portal tokens reject staff endpoints.
  2. **Resolution of Open Decision A-05 (Patient Initial Access & Passwordless Flow)**: Initial portal access is granted via secure single-use setup links sent via SMS/Email (`/portal/setup?token=<token>`). Links expire in 24 hours. The portal account is activated upon initial password creation. Passwords use Argon2id hashing with rate-limited account lockout (15 minutes after repeated failed attempts).
  3. **Zero-Trust IDOR Defense (Server-Side Session Resolution)**: Every portal API route (`/portal/*`) derives `patient_id` exclusively from the authenticated portal session. Any request attempting to access or download another patient's invoice, prescription, or document by ID fails with HTTP 404 (not disclosing existence).
  4. **Strict Visibility Gates**: Queries enforce clinical filters:
     - Prescriptions: `status = 'finalized' AND published_to_portal = 1`
     - Treatment Sessions: `publish_aftercare_to_portal = 1`
     - Files & Documents: `is_visible_to_patient = 1`
     Unpublished or draft records are strictly invisible.
  5. **Contact Change OTP Verification**: Edits to primary mobile or email require a 6-digit OTP hashed with SHA-256 and capped at 3 failed attempts before permanent invalidation.
  6. **Mobile-First UX**: Dedicated `/portal` route tree with fixed bottom navigation (Home, Sessions, Prescriptions, Billing, Profile), min 44px touch targets, bilingual Bangla/English copy, and soft glass aesthetics.
- **Consequences**: Guaranteed isolation between staff and patient realms, ironclad IDOR protection, patient privacy compliance, and responsive mobile-first patient self-service.


## ADR-019: Referrals, Commission Accrual, Payout Batches, and Attribution History (Prompt 19)
- **Status**: Accepted
- **Context**: Aesthetic clinic referrals from external doctors, satisfied patients, staff, and marketing agents require dependable attribution, automated commission accrual upon payment realization, single-payout safety, non-destructive refund reversals, and secure handling of banking details.
- **Decision**:
  1. **Resolution of Open Decision A-06 (Accrual Timing & Calculation Basis)**: Commissions accrue upon payment realization (`paid_amount`) by default rather than invoice issuance, ensuring commissions are never paid out on unpaid patient debt. All rule terms (calculation_type, rate, basis, min base, max cap, withholding tax) applied at calculation time are snapshot directly onto the `commissions` row, ensuring subsequent rule updates never alter historical commissions.
  2. **Resolution of Open Decision A-07 (Referrer Portal Accounts)**: Table `referrer_accounts` is defined in DDL for future schema compatibility, but left inactive and unused during this phase. All referrer and commission workflows are managed internally by clinic staff (Super Admin, Admin, Accounts).
  3. **Patient Attribution Invariant & History**: Enforce at most ONE current referrer per patient via stored generated column `patient_referrals.current_flag = IF(is_current = 1, patient_id, NULL)` backed by unique index `uq_patient_single_current_referrer`. Reassigning a referrer deactivates the current row (`is_current = 0, effective_to = NOW()`) and inserts a new attribution row with mandatory reason, assigned_by actor, and audit event. Attribution changes apply strictly to future transactions; past commission allocations remain untouched.
  4. **Idempotent Accrual via Transactional Outbox**: The worker processes `'payment.recorded'` and `'refund.completed'` domain events from `domain_events` using `SELECT ... FOR UPDATE SKIP LOCKED`. Commissions are created with a deterministic `accrual_key` (`${paymentId || invoiceId}_${referrerId}_${ruleId}_${kind}`). Reprocessed events hit unique constraint violations and are gracefully skipped, preventing duplicate commissions.
  5. **Proportional Refund Reversals (Hard Rule 3)**: In compliance with Hard Rule 3 (nothing financial is hard-deleted), refunds generate append-only negative commission rows (`kind = 'reversal'`, `computed_amount = -X`, `parent_commission_id = origComm.id`) linked to the original accrual row.
  6. **Single Payout Invariant & Atomic Settlement**: Payout batches lock candidate commissions in ONE transaction with `SELECT ... FOR UPDATE WHERE id IN (...) AND status = 'approved' AND payout_id IS NULL`. The system calculates gross, withholding tax, and net payout atomically, marks commissions as `'paid'` linked to `payout_id`, and updates referrer aggregate balances.
  7. **Sensitive Account Encryption & Masking (Hard Rule 10)**: Referrer payout accounts (Bank account, bKash, Nagad) are stored encrypted via AES-256-GCM. The API masks payout details (`••••••••`) by default and only decrypts if the user holds `commission.payout_details` permission.
- **Consequences**: Zero duplicate payouts, immutable commission snapshots, non-destructive refund accounting, protected payout credentials, and complete audit trail for patient attribution.

## ADR-020: Reports Hub, Server-Side SQL Aggregation, CSV Formula Sanitization, Export Logging, and Strict 90-Day Query Capping (Prompt 20)
- **Status**: Accepted
- **Context**: Clinic operations require high-performance business intelligence across Revenue, Doctor Activity, Follow-ups, Inventory, Referrals, and SMS. However, unbounded reporting queries create database contention, client-side list aggregation violates zero-trust security and crashes browsers on high-volume datasets, CSV exports risk formula injection attacks (CSV Injection / CWE-1236), and unauthorized export of sensitive financial or clinical records violates patient and business confidentiality.
- **Decision**:
  1. **Server-Side SQL Aggregation with Zero Browser Computation**: All reporting metrics, KPI summaries, and chart data series are aggregated on the server over indexed columns and views (`v_daily_collections`, `invoices`, `payments`, `appointments`, `follow_up_tasks`, `inventory_stock_movements`, `commissions`, `notification_logs`). The browser receives pre-aggregated, role-filtered DTOs.
  2. **Strict Date Range Capping (Max 90 Days)**: All reporting endpoints enforce a strict date range filter where `to_date - from_date <= 90 days` and `from_date <= to_date`. Requests exceeding 90 days are rejected immediately with HTTP 400 Bad Request (`Date range exceeds 90-day limit`), safeguarding server resources.
  3. **Granular RBAC Permission Matrix**:
     - `report.revenue.view`: Super Admin, Admin, Accounts/Cashier (Receptionist strictly blocked with HTTP 403 Forbidden).
     - `report.clinical.view`: Super Admin, Admin, Doctor.
     - `report.call_center.view`: Super Admin, Admin, Call Center Agent.
     - `report.inventory.view`: Super Admin, Admin, Inventory Manager.
     - `report.referral.view`: Super Admin, Admin, Accounts/Cashier.
     - `report.notifications.view`: Super Admin, Admin.
     - `export.run`: Required to generate CSV or PDF export. Requests lacking `export.run` return HTTP 403 Forbidden.
  4. **Formula Injection Sanitization (CSV Shield)**: In compliance with OWASP / CWE-1236, all exported CSV cell strings starting with `=`, `+`, `-`, `@`, `\t`, or `\r` are sanitized by prepending a single quote (`'`), neutralizing executable spreadsheet macros and DDE payloads.
  5. **Dual Audit & Export Logging**: Every export request writes an immutable record to the approved table `data_export_logs` (`actor_user_id`, `report_type`, `export_format`, `filters_json`, `row_count`, `file_name`, `ip_address`, `user_agent`) AND creates an entry in `audit_events`.
  6. **Financial Reconciliation Invariant**: The Revenue report's daily collections and payment method breakdowns strictly reconcile with the `v_daily_collections` view and payment transaction ledgers.
- **Consequences**: Zero browser performance degradation, strict RBAC isolation, ironclad CSV injection defense, complete regulatory export auditability, and mathematically reconciled revenue reports.

