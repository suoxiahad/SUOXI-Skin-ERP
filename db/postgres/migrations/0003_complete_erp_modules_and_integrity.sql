-- =============================================================================
-- SUOXI Skin Care & Aesthetic Center ERP (Dhaka, Bangladesh)
-- PostgreSQL Migration 0003: Complete ERP Modules, Referential Integrity,
-- Financial/Inventory/Scheduling Invariants & Persistent Security Stores
-- =============================================================================
-- NOTE: Migrations 0001 and 0002 are immutable. All additions live here.

-- -----------------------------------------------------------------------------
-- 1. Organization, Branch Assignments, Permission Overrides & Sequences
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  code VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  name_bn VARCHAR(255) NOT NULL DEFAULT '',
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Dhaka',
  currency VARCHAR(10) NOT NULL DEFAULT 'BDT',
  bin_number VARCHAR(100),
  trade_license_no VARCHAR(120),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS user_branch_assignments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_branch_assignment UNIQUE (user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_user_branch_assignments_user ON user_branch_assignments(user_id);

CREATE TABLE IF NOT EXISTS user_permission_overrides (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_code VARCHAR(120) NOT NULL,
  effect VARCHAR(10) NOT NULL CHECK (effect IN ('allow', 'deny')),
  reason TEXT,
  granted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_user_permission_override UNIQUE (user_id, permission_code)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS code_sequences (
  sequence_key VARCHAR(120) PRIMARY KEY,
  prefix VARCHAR(40) NOT NULL DEFAULT '',
  last_value BIGINT NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. Persistent Security Stores (CSRF, Idempotency, Login Brute-Force Lockout)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS csrf_tokens (
  token_hash VARCHAR(128) PRIMARY KEY,
  session_id TEXT,
  realm VARCHAR(20) NOT NULL DEFAULT 'staff' CHECK (realm IN ('staff', 'portal')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_csrf_tokens_expires ON csrf_tokens(expires_at);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_key VARCHAR(180) NOT NULL,
  method VARCHAR(12) NOT NULL,
  route_path VARCHAR(255) NOT NULL,
  actor_scope VARCHAR(120) NOT NULL DEFAULT 'global',
  request_hash VARCHAR(128) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  response_status INTEGER,
  response_body JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (idempotency_key, method, route_path, actor_scope)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires ON idempotency_keys(expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  attempt_key VARCHAR(255) PRIMARY KEY,
  attempt_type VARCHAR(20) NOT NULL CHECK (attempt_type IN ('user', 'ip', 'combined')),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  first_failed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_locked ON login_attempts(locked_until);

-- -----------------------------------------------------------------------------
-- 3. Patient Medical Records, Timeline Notes, Duplicate Candidates & File Assets
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS patient_medical_histories (
  patient_id TEXT PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  allergies JSONB NOT NULL DEFAULT '[]'::jsonb,
  chronic_conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_medications JSONB NOT NULL DEFAULT '[]'::jsonb,
  skin_type VARCHAR(40),
  fitzpatrick_type VARCHAR(20),
  pregnancy_lactation BOOLEAN NOT NULL DEFAULT FALSE,
  contraindications TEXT,
  notes TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patient_medical_entries (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  entry_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  clinical_notes TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_by TEXT NOT NULL,
  recorded_by_name VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_medical_entries_patient ON patient_medical_entries(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS patient_notes (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  note_type VARCHAR(40) NOT NULL DEFAULT 'general',
  is_clinical BOOLEAN NOT NULL DEFAULT FALSE,
  content TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_by_name VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_notes_patient ON patient_notes(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS patient_duplicate_candidates (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  matched_patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  match_reason TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed_not_duplicate', 'merged')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_duplicate_distinct_patients CHECK (patient_id <> matched_patient_id)
);

CREATE TABLE IF NOT EXISTS file_assets (
  id TEXT PRIMARY KEY,
  branch_id TEXT REFERENCES branches(id),
  patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  document_id TEXT REFERENCES medical_attachments(id) ON DELETE SET NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'general',
  original_filename VARCHAR(255) NOT NULL DEFAULT 'upload',
  storage_path TEXT NOT NULL UNIQUE,
  mime_type VARCHAR(120) NOT NULL,
  file_ext VARCHAR(20) NOT NULL,
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 15728640),
  sha256_hash VARCHAR(64) NOT NULL,
  is_confidential BOOLEAN NOT NULL DEFAULT TRUE,
  patient_visible BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_by TEXT NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_assets_patient ON file_assets(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_assets_branch ON file_assets(branch_id);

-- -----------------------------------------------------------------------------
-- 4. Appointments Concurrency Invariant, Sources, Resources & Provider Schedules
-- -----------------------------------------------------------------------------

-- Database-level double-booking guard for active doctor appointment slots
CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_active_doctor_slot
  ON appointments(branch_id, doctor_id, appointment_date, appointment_time)
  WHERE status NOT IN ('cancelled', 'no_show', 'rescheduled');

CREATE TABLE IF NOT EXISTS appointment_status_history (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  from_status VARCHAR(30),
  to_status VARCHAR(30) NOT NULL,
  reason TEXT,
  changed_by TEXT NOT NULL,
  changed_by_name VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_apt_status_history_apt ON appointment_status_history(appointment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS appointment_sources (
  id TEXT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  name_bn VARCHAR(120),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinic_resources (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  code VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  resource_type VARCHAR(40) NOT NULL DEFAULT 'room' CHECK (resource_type IN ('room', 'machine', 'device', 'chair')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_resources_branch ON clinic_resources(branch_id);

CREATE TABLE IF NOT EXISTS provider_schedules (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  slot_duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (slot_duration_minutes >= 5 AND slot_duration_minutes <= 240),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_provider_schedule_day UNIQUE (branch_id, provider_id, day_of_week, start_time)
);

-- -----------------------------------------------------------------------------
-- 5. Treatment Catalog, Follow-Up Rules & Food/Lifestyle Guidance Library
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS catalog_categories (
  id TEXT PRIMARY KEY,
  code VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  name_bn VARCHAR(150),
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS treatment_services (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES catalog_categories(id) ON DELETE RESTRICT,
  code VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  name_bn VARCHAR(255),
  description TEXT NOT NULL DEFAULT '',
  default_duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (default_duration_minutes > 0),
  base_price_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (base_price_bdt >= 0),
  requires_doctor BOOLEAN NOT NULL DEFAULT FALSE,
  requires_consent BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_treatment_services_category ON treatment_services(category_id);

CREATE TABLE IF NOT EXISTS treatment_followup_rules (
  id TEXT PRIMARY KEY,
  treatment_id TEXT NOT NULL REFERENCES treatment_services(id) ON DELETE CASCADE,
  trigger_event VARCHAR(60) NOT NULL DEFAULT 'session_completed',
  delay_days INTEGER NOT NULL DEFAULT 7 CHECK (delay_days >= 0),
  channel VARCHAR(30) NOT NULL DEFAULT 'call' CHECK (channel IN ('call', 'sms', 'email', 'portal')),
  instructions TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guidance_templates (
  id TEXT PRIMARY KEY,
  code VARCHAR(60) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  title_bn VARCHAR(255),
  category VARCHAR(80) NOT NULL DEFAULT 'general',
  treatment_id TEXT REFERENCES treatment_services(id) ON DELETE SET NULL,
  recommended_foods JSONB NOT NULL DEFAULT '[]'::jsonb,
  prohibited_foods JSONB NOT NULL DEFAULT '[]'::jsonb,
  lifestyle_precautions JSONB NOT NULL DEFAULT '[]'::jsonb,
  sun_protection TEXT NOT NULL DEFAULT '',
  water_liters NUMERIC(4, 1) NOT NULL DEFAULT 3.0,
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'archived')),
  submitted_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 6. Treatment Plans, Consents, Clinical Treatment Sessions & Consumables
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS treatment_plans (
  id TEXT PRIMARY KEY,
  consultation_id TEXT REFERENCES consultations(id) ON DELETE SET NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  doctor_id TEXT NOT NULL,
  title VARCHAR(255) NOT NULL,
  planned_procedures JSONB NOT NULL DEFAULT '[]'::jsonb,
  estimated_total_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (estimated_total_bdt >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS consent_records (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  consultation_id TEXT REFERENCES consultations(id) ON DELETE SET NULL,
  treatment_name VARCHAR(255) NOT NULL,
  consent_text TEXT NOT NULL,
  signed_by_patient BOOLEAN NOT NULL DEFAULT FALSE,
  signed_at TIMESTAMPTZ,
  witnessed_by TEXT,
  file_asset_id TEXT REFERENCES file_assets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS treatment_sessions (
  id TEXT PRIMARY KEY,
  session_code VARCHAR(60) NOT NULL UNIQUE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  package_id TEXT REFERENCES treatment_packages(id) ON DELETE SET NULL,
  service_id TEXT REFERENCES treatment_services(id) ON DELETE SET NULL,
  service_name VARCHAR(255) NOT NULL,
  provider_id TEXT NOT NULL,
  provider_name VARCHAR(255) NOT NULL DEFAULT '',
  session_number INTEGER NOT NULL DEFAULT 1 CHECK (session_number > 0),
  status VARCHAR(30) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  clinical_notes TEXT NOT NULL DEFAULT '',
  machine_settings TEXT,
  next_session_date DATE,
  next_session_notes TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_treatment_sessions_patient ON treatment_sessions(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_treatment_sessions_branch ON treatment_sessions(branch_id, status);

CREATE TABLE IF NOT EXISTS session_consumables (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES treatment_sessions(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  batch_number VARCHAR(100),
  quantity NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
  unit_cost_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_cost_bdt >= 0),
  recorded_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_consumables_session ON session_consumables(session_id);

CREATE TABLE IF NOT EXISTS treatment_photos (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES treatment_sessions(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  file_asset_id TEXT REFERENCES file_assets(id) ON DELETE SET NULL,
  photo_stage VARCHAR(20) NOT NULL CHECK (photo_stage IN ('before', 'during', 'after', 'followup')),
  patient_visible BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS package_cancellations (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL UNIQUE REFERENCES treatment_packages(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  refund_eligible_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (refund_eligible_bdt >= 0),
  cancelled_by TEXT NOT NULL,
  cancelled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 7. Billing Integrity: Normalized Invoice Items, Payment Methods, Allocations,
--    Refunds & Idempotent Payment Callbacks
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS payment_methods (
  id TEXT PRIMARY KEY,
  code VARCHAR(40) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  requires_reference BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_type VARCHAR(40) NOT NULL DEFAULT 'service',
  service_id TEXT,
  product_id TEXT,
  package_id TEXT,
  description VARCHAR(255) NOT NULL,
  quantity NUMERIC(10, 2) NOT NULL CHECK (quantity > 0),
  unit_price_bdt NUMERIC(12, 2) NOT NULL CHECK (unit_price_bdt >= 0),
  discount_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount_bdt >= 0),
  line_total_bdt NUMERIC(12, 2) NOT NULL CHECK (line_total_bdt >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

ALTER TABLE payment_records
  ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'BDT',
  ADD COLUMN IF NOT EXISTS provider_name VARCHAR(60),
  ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(180);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_records_provider_ref
  ON payment_records(provider_name, provider_reference)
  WHERE provider_name IS NOT NULL AND provider_reference IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_allocations (
  id TEXT PRIMARY KEY,
  payment_id TEXT NOT NULL REFERENCES payment_records(id) ON DELETE RESTRICT,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  allocated_amount_bdt NUMERIC(12, 2) NOT NULL CHECK (allocated_amount_bdt > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_invoice ON payment_allocations(invoice_id);

CREATE TABLE IF NOT EXISTS payment_refunds (
  id TEXT PRIMARY KEY,
  refund_number VARCHAR(80) NOT NULL UNIQUE,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  payment_id TEXT NOT NULL REFERENCES payment_records(id) ON DELETE RESTRICT,
  amount_bdt NUMERIC(12, 2) NOT NULL CHECK (amount_bdt > 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'BDT',
  method VARCHAR(40) NOT NULL DEFAULT 'cash',
  transaction_ref VARCHAR(150),
  reason TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'completed' CHECK (status IN ('requested', 'approved', 'completed', 'rejected')),
  requested_by TEXT NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_refunds_invoice ON payment_refunds(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment ON payment_refunds(payment_id);

CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id TEXT PRIMARY KEY,
  provider VARCHAR(60) NOT NULL,
  provider_event_id VARCHAR(180) NOT NULL,
  invoice_id TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  payment_id TEXT REFERENCES payment_records(id) ON DELETE SET NULL,
  amount_bdt NUMERIC(12, 2) NOT NULL CHECK (amount_bdt > 0),
  currency VARCHAR(10) NOT NULL DEFAULT 'BDT',
  event_status VARCHAR(40) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_payment_webhook_provider_event UNIQUE (provider, provider_event_id)
);

-- -----------------------------------------------------------------------------
-- 8. Inventory Integrity: Categories, Batches, Expiry, Purchase Items & Movements
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inventory_categories (
  id TEXT PRIMARY KEY,
  code VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_inventory_items_non_negative_stock'
  ) THEN
    ALTER TABLE inventory_items
      ADD CONSTRAINT chk_inventory_items_non_negative_stock CHECK (current_stock >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS product_batches (
  id TEXT PRIMARY KEY,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  batch_number VARCHAR(100) NOT NULL,
  expiry_date DATE,
  unit_cost_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_cost_bdt >= 0),
  quantity_received INTEGER NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
  quantity_on_hand INTEGER NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  grn_id TEXT REFERENCES goods_received_notes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_product_batch_branch_item UNIQUE (branch_id, inventory_item_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_product_batches_expiry ON product_batches(expiry_date, branch_id);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id TEXT PRIMARY KEY,
  purchase_order_id TEXT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  ordered_qty INTEGER NOT NULL CHECK (ordered_qty > 0),
  received_qty INTEGER NOT NULL DEFAULT 0 CHECK (received_qty >= 0),
  unit_cost_bdt NUMERIC(12, 2) NOT NULL CHECK (unit_cost_bdt >= 0),
  line_total_bdt NUMERIC(12, 2) NOT NULL CHECK (line_total_bdt >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  batch_id TEXT REFERENCES product_batches(id) ON DELETE SET NULL,
  batch_number VARCHAR(100),
  movement_type VARCHAR(40) NOT NULL,
  quantity_delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  unit_cost_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  reference_type VARCHAR(50),
  reference_id TEXT,
  reason TEXT NOT NULL DEFAULT '',
  performed_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(inventory_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_branch ON stock_movements(branch_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 9. Patient Portal Realm (Isolated Accounts, Sessions, Tokens & Contact OTPs)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS patient_portal_accounts (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL UNIQUE REFERENCES patients(id) ON DELETE CASCADE,
  login_identifier VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending_setup' CHECK (status IN ('pending_setup', 'active', 'inactive', 'locked')),
  failed_login_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patient_portal_sessions (
  id TEXT PRIMARY KEY,
  portal_account_id TEXT NOT NULL REFERENCES patient_portal_accounts(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  ip_address VARCHAR(100) NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_sessions_account ON patient_portal_sessions(portal_account_id);

CREATE TABLE IF NOT EXISTS patient_portal_tokens (
  id TEXT PRIMARY KEY,
  portal_account_id TEXT NOT NULL REFERENCES patient_portal_accounts(id) ON DELETE CASCADE,
  token_type VARCHAR(20) NOT NULL CHECK (token_type IN ('setup', 'reset')),
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patient_contact_otps (
  id TEXT PRIMARY KEY,
  portal_account_id TEXT NOT NULL REFERENCES patient_portal_accounts(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('mobile', 'email')),
  target_value VARCHAR(255) NOT NULL,
  otp_hash VARCHAR(128) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 10. Call Center Contact Logs, Follow-Up Rules, Notifications, Webhooks,
--     Staff Alerts, Domain Outbox, Encrypted Integrations & Report Export Logs
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS call_contact_logs (
  id TEXT PRIMARY KEY,
  task_id TEXT REFERENCES call_center_tasks(id) ON DELETE SET NULL,
  appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES branches(id),
  outcome VARCHAR(60) NOT NULL,
  patient_intent VARCHAR(100),
  call_notes TEXT NOT NULL DEFAULT '',
  reschedule_requested_date DATE,
  reschedule_requested_time VARCHAR(10),
  agent_id TEXT NOT NULL,
  agent_name VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_contact_logs_patient ON call_contact_logs(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS follow_up_rules (
  id TEXT PRIMARY KEY,
  branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  rule_type VARCHAR(60) NOT NULL,
  trigger_offset_hours INTEGER NOT NULL DEFAULT 24,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_event_rules (
  id TEXT PRIMARY KEY,
  event_key VARCHAR(100) NOT NULL UNIQUE,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('sms', 'email', 'in_app')),
  template_id TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  quiet_hours_start VARCHAR(10),
  quiet_hours_end VARCHAR(10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  idempotency_key VARCHAR(180) UNIQUE,
  branch_id TEXT REFERENCES branches(id),
  patient_id TEXT REFERENCES patients(id) ON DELETE SET NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('sms', 'email', 'in_app')),
  recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(255),
  body TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'sent', 'delivered', 'failed', 'cancelled')),
  provider_message_id VARCHAR(180),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_until TIMESTAMPTZ,
  locked_by VARCHAR(120),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_dispatch ON notifications(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_notifications_provider_msg ON notifications(provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  provider VARCHAR(60) NOT NULL,
  provider_event_id VARCHAR(180) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'processed',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_webhook_events_provider_event UNIQUE (provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS staff_alerts (
  id TEXT PRIMARY KEY,
  branch_id TEXT REFERENCES branches(id),
  target_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  target_role VARCHAR(50),
  severity VARCHAR(20) NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  resource_type VARCHAR(80),
  resource_id TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_alerts_user ON staff_alerts(target_user_id, is_read, created_at DESC);

CREATE TABLE IF NOT EXISTS domain_outbox_events (
  id TEXT PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  aggregate_type VARCHAR(80) NOT NULL,
  aggregate_id TEXT NOT NULL,
  dedupe_key VARCHAR(180) UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_domain_outbox_pending ON domain_outbox_events(status, created_at ASC);

CREATE TABLE IF NOT EXISTS integration_configs (
  id TEXT PRIMARY KEY,
  integration_type VARCHAR(40) NOT NULL UNIQUE CHECK (integration_type IN ('sms_gateway', 'email_smtp', 'payment_gateway', 'whatsapp')),
  provider_name VARCHAR(80) NOT NULL,
  config_public JSONB NOT NULL DEFAULT '{}'::jsonb,
  credentials_encrypted JSONB,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_export_logs (
  id TEXT PRIMARY KEY,
  report_type VARCHAR(80) NOT NULL,
  format VARCHAR(20) NOT NULL DEFAULT 'csv',
  branch_id TEXT,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_count INTEGER NOT NULL DEFAULT 0,
  exported_by TEXT NOT NULL,
  exported_by_name VARCHAR(255) NOT NULL DEFAULT '',
  ip_address VARCHAR(100) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_export_logs_time ON data_export_logs(created_at DESC);
