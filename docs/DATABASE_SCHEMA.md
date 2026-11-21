# SUOXI Skin ERP — PostgreSQL Database Schema Reference

## 1. Overview & Standards

- **Engine:** PostgreSQL 16+ (ONLY relational database).
- **Timezone:** Explicit `Asia/Dhaka` (`+06:00`) set on every pooled connection (`SET TIME ZONE 'Asia/Dhaka'`) with `TIMESTAMPTZ` for all event/audit timestamps and `DATE` for clinical/accounting wall-clock dates.
- **Financial Precision:** `NUMERIC(12, 2)` (never `FLOAT`/`DOUBLE PRECISION`) for all BDT amounts, prices, discounts, VAT, refunds, commissions, and payouts.
- **Referential Integrity:** Foreign keys (`ON DELETE RESTRICT` on financial/clinical ledger references, `ON DELETE CASCADE` on owned child rows), `CHECK` constraints (non-negative stock, positive quantities, valid state enums), and partial unique indexes for concurrency invariants.
- **Total Schema Size:** **85 domain tables** + `schema_migrations` tracking table across **3 immutable numbered migrations**:
  1. `db/postgres/migrations/0001_initial_schema.sql` — 36 core tables (immutable, untouched)
  2. `db/postgres/migrations/0002_referrals_and_ops_columns.sql` — Referrals & ops column additions + partial unique `accrual_key` index (immutable, untouched)
  3. `db/postgres/migrations/0003_complete_erp_modules_and_integrity.sql` — 49 additional normalized tables, concurrency unique indexes, financial allocation/refund/webhook tables, persistent security stores, and isolated patient portal tables

---

## 2. Complete Table Inventory by Domain

### A. Organization, Branches, Identity, RBAC & Security Stores (13 tables)
| Table | Migration | Key Constraints & Purpose |
|---|---|---|
| `organizations` | 0003 | Organization master (`code` UNIQUE, `timezone = 'Asia/Dhaka'`, `currency = 'BDT'`) |
| `branches` | 0001 + 0003 | Clinic branches (`code` UNIQUE, FK `organization_id`) |
| `clinic_roles` | 0001 | System & custom role definitions + JSONB permission bundles |
| `users` | 0001 | Staff accounts (`email` UNIQUE, Argon2id `password_hash`, `must_change_password`, FK `branch_id`) |
| `user_branch_assignments` | 0003 | Multi-branch access scope (`UNIQUE (user_id, branch_id)`) |
| `user_permission_overrides` | 0003 | Per-user `allow`/`deny` RBAC overrides (`UNIQUE (user_id, permission_code)`) |
| `staff_duty_roster` | 0001 | Daily staff branch shift schedules |
| `active_sessions` | 0001 | Server-side opaque staff session store (`suoxi_sid`, expiry, revocation) |
| `user_security_logs` | 0001 | Login, logout, password change & security audit history |
| `password_reset_tokens` | 0003 | Single-use SHA-256 hashed staff password reset tokens |
| `csrf_tokens` | 0003 | Persistent CSRF token hashes bound to `realm IN ('staff', 'portal')` and expiry |
| `idempotency_keys` | 0003 | Persistent HTTP `Idempotency-Key` lock & replay store (`PK (idempotency_key, method, route_path, actor_scope)`) |
| `login_attempts` | 0003 | Persistent brute-force lockout counters (`attempt_key` PK, `locked_until`) |

### B. Patients, Medical Records & Private Files (7 tables)
| Table | Migration | Key Constraints & Purpose |
|---|---|---|
| `patients` | 0001 | Master patient registry (`patient_id_code` UNIQUE, FK `branch_id`, duplicate flag) |
| `patient_medical_histories` | 0003 | Structured allergies, chronic conditions, Fitzpatrick skin type, contraindications (1:1 FK `patient_id`) |
| `patient_medical_entries` | 0003 | Append-only clinical medical history entries |
| `patient_notes` | 0003 | Staff general & clinical notes (`is_clinical` visibility flag) |
| `patient_duplicate_candidates` | 0003 | Duplicate phone/name review workflow (`CHECK (patient_id <> matched_patient_id)`) |
| `medical_attachments` | 0001 | Clinical attachments, lab reports, before/after photos, consent documents |
| `file_assets` | 0003 | Private storage metadata (`storage_path` UNIQUE, `sha256_hash`, `size_bytes <= 15MB`, `is_confidential`, `patient_visible`) |

### C. Scheduling, Service Catalog & Clinical Execution (15 tables)
| Table | Migration | Key Constraints & Purpose |
|---|---|---|
| `appointments` | 0001 + 0003 | Core appointments with **DB-level double-booking guard**: `uq_appointments_active_doctor_slot` partial unique index on `(branch_id, doctor_id, appointment_date, appointment_time) WHERE status NOT IN ('cancelled', 'no_show', 'rescheduled')` |
| `appointment_status_history` | 0003 | Immutable state transition audit log per appointment |
| `appointment_sources` | 0003 | Walk-in, Phone, Facebook, WhatsApp, Referral, Portal sources |
| `clinic_resources` | 0003 | Branch rooms, laser machines, chairs (`CHECK (resource_type IN (...))`) |
| `provider_schedules` | 0003 | Weekly doctor/therapist working windows (`UNIQUE (branch_id, provider_id, day_of_week, start_time)`) |
| `catalog_categories` | 0003 | Service catalog categories (`code` UNIQUE) |
| `treatment_services` | 0003 | Clinical services (`code` UNIQUE, `base_price_bdt NUMERIC(12,2) >= 0`) |
| `treatment_followup_rules` | 0003 | Automated post-treatment follow-up schedules |
| `guidance_templates` | 0003 | Bilingual Food & Lifestyle Guidance approval workflow (`draft` → `pending_approval` → `approved`) |
| `consultations` | 0001 | Doctor consultation records & skin analysis |
| `treatment_plans` | 0003 | Multi-session treatment plans & estimated BDT totals |
| `consent_records` | 0003 | Signed procedure consent records linked to private `file_assets` |
| `prescriptions` | 0001 | Bilingual digital prescriptions with frozen lifestyle snapshots |
| `rx_protocols` | 0001 | Reusable clinical prescription protocols |
| `treatment_sessions` | 0003 | Clinical treatment session execution records (`session_code` UNIQUE) |
| `session_consumables` | 0003 | Per-session inventory consumables linked to `inventory_items` |
| `treatment_photos` | 0003 | Before/during/after clinical photos with `patient_visible` gate |

*(Total in Section C: 17 tables)*

### D. Treatment Packages, Billing, Payments, Refunds & Daily Closing (12 tables)
| Table | Migration | Key Constraints & Purpose |
|---|---|---|
| `master_packages` | 0001 | Package catalog templates |
| `treatment_packages` | 0001 | Enrolled patient packages with `sessions_completed <= total_sessions` |
| `package_deductions` | 0001 | Append-only session deduction ledger |
| `package_cancellations` | 0003 | Non-destructive package cancellation records (`package_id` UNIQUE) |
| `payment_methods` | 0003 | Cash, Card, bKash, Nagad, Bank Transfer master |
| `invoices` | 0001 | Invoices (`invoice_number` UNIQUE, `NUMERIC(12,2)` totals, status lifecycle) |
| `invoice_items` | 0003 | Normalized invoice line items (`quantity > 0`, `unit_price_bdt >= 0`, `line_total_bdt >= 0`) |
| `payment_records` | 0001 + 0003 | Immutable payment receipts (`currency = 'BDT'`, partial unique `(provider_name, provider_reference)`) |
| `payment_allocations` | 0003 | Normalized payment-to-invoice allocation rows (`ON DELETE RESTRICT`, `allocated_amount_bdt > 0`) |
| `payment_refunds` | 0003 | Append-only refunds (`refund_number` UNIQUE, `amount_bdt > 0`, `ON DELETE RESTRICT`) |
| `payment_webhook_events` | 0003 | Gateway callback idempotency ledger (`UNIQUE (provider, provider_event_id)`) |
| `daily_closing_reports` | 0001 | Cashier shift closing reconciliation snapshots |

### E. Inventory, Procurement & Stock Ledger (9 tables)
| Table | Migration | Key Constraints & Purpose |
|---|---|---|
| `inventory_categories` | 0003 | Inventory categories (`code` UNIQUE) |
| `inventory_items` | 0001 + 0003 | Master stock items with **`CHECK (current_stock >= 0)`** anti-oversell invariant |
| `product_batches` | 0003 | Batch & expiry tracking (`UNIQUE (branch_id, inventory_item_id, batch_number)`, `CHECK (quantity_on_hand >= 0)`) |
| `stock_adjustments` | 0001 | Non-destructive stock adjustment ledger |
| `stock_movements` | 0003 | Immutable stock movement audit trail (`CHECK (balance_after >= 0)`) |
| `suppliers` | 0001 | Vendor master & BDT payables |
| `purchase_orders` | 0001 | Purchase orders (`po_number` UNIQUE) |
| `purchase_order_items` | 0003 | Normalized PO line items (`ordered_qty > 0`, `received_qty >= 0`) |
| `goods_received_notes` | 0001 | GRN receipts updating stock, batches, movements, and supplier payables atomically |

### F. Call Center & Referral Commissions (8 tables)
| Table | Migration | Key Constraints & Purpose |
|---|---|---|
| `call_center_tasks` | 0001 | Follow-up call queue & tomorrow reminder tasks |
| `call_contact_logs` | 0003 | Call outcomes, reschedule requests & agent logs |
| `follow_up_rules` | 0003 | Branch-configurable call follow-up rules |
| `referrers` | 0001 + 0002 | Doctor/staff/patient/external referrers (`payout_account_encrypted` AES-256-GCM) |
| `commission_rules` | 0001 + 0002 | Percentage/fixed commission rules, basis, refund policy, withholding tax |
| `patient_referrals` | 0001 + 0002 | Patient-to-referrer attribution records |
| `referral_commissions` | 0001 + 0002 | Append-only accrual & negative reversal ledger with partial unique index **`uq_referral_commissions_accrual_key`** (`WHERE accrual_key IS NOT NULL`) |
| `commission_payouts` | 0001 + 0002 | Payout batches settling approved commissions |

### G. Isolated Patient Portal Realm (4 tables)
| Table | Migration | Key Constraints & Purpose |
|---|---|---|
| `patient_portal_accounts` | 0003 | Isolated patient login (`patient_id` UNIQUE, `login_identifier` UNIQUE, Argon2id `password_hash`, lockout fields) |
| `patient_portal_sessions` | 0003 | Separate `portal_sid` session table (never mixed with staff `active_sessions`) |
| `patient_portal_tokens` | 0003 | Single-use SHA-256 setup/reset tokens (`used_at`) |
| `patient_contact_otps` | 0003 | Rate-limited mobile/email verification OTP hashes (`attempts`) |

### H. Notifications, Outbox, Integrations, Settings, Reports & Audit (15 tables)
| Table | Migration | Key Constraints & Purpose |
|---|---|---|
| `notifications` | 0003 | Durable PostgreSQL job queue (`idempotency_key` UNIQUE, `locked_until`/`locked_by` for `FOR UPDATE SKIP LOCKED`, bounded `attempts`) |
| `notification_event_rules` | 0003 | Channel routing & Dhaka quiet-hours rules |
| `webhook_events` | 0003 | Deduplicated external provider webhook log (`UNIQUE (provider, provider_event_id)`) |
| `staff_alerts` | 0003 | Branch/role/user operational alerts |
| `domain_outbox_events` | 0003 | Transactional outbox (`dedupe_key` UNIQUE) linking payments/refunds to async commission accruals/reversals |
| `sms_templates` | 0001 | Bilingual SMS templates |
| `sms_logs` | 0001 | Outbound SMS delivery audit logs |
| `email_templates` | 0001 | Email notification templates |
| `email_logs` | 0001 | Outbound email delivery audit logs |
| `clinic_settings` | 0001 | Clinic configuration JSONB (with AES-256-GCM encrypted `enc:v1:...` gateway secrets) |
| `integration_configs` | 0003 | Normalized integration registry (`integration_type` UNIQUE, `credentials_encrypted` JSONB) |
| `code_sequences` | 0003 | Atomic gap-free sequence counter (`INSERT ... ON CONFLICT DO UPDATE`) |
| `backup_records` | 0001 | Backup metadata & checksum records |
| `data_export_logs` | 0003 | Audit log of every CSV/report export |
| `audit_events` | 0001 | Immutable system-wide actor/action/entity/IP audit trail |
