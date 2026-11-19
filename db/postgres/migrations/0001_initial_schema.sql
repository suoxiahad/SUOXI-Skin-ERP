-- =============================================================================
-- SUOXI Skin Care & Aesthetic Center CRM (Dhaka, Bangladesh)
-- PostgreSQL Migration 0001: Complete Core, Clinical, Billing, Inventory,
-- Referrals, Call Center, Portal, Integrations, Settings & Audit Schema
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Organization, Staff, Roles & Sessions
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  name_bn VARCHAR(255) NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city VARCHAR(100) NOT NULL DEFAULT 'Dhaka',
  phone VARCHAR(50) NOT NULL DEFAULT '',
  email VARCHAR(255),
  manager_name VARCHAR(255),
  manager_phone VARCHAR(50),
  operating_hours VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clinic_roles (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  name_bn VARCHAR(120),
  description TEXT NOT NULL DEFAULT '',
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_system_role BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  name_bn VARCHAR(255),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  role VARCHAR(50) NOT NULL,
  phone VARCHAR(50) NOT NULL DEFAULT '',
  branch_id TEXT NOT NULL REFERENCES branches(id),
  branch_name VARCHAR(255) NOT NULL DEFAULT '',
  specialization VARCHAR(255),
  bmdc_reg_no VARCHAR(100),
  avatar_url TEXT,
  consultation_fee_bdt NUMERIC(12, 2),
  follow_up_fee_bdt NUMERIC(12, 2),
  room_number VARCHAR(50),
  signature_url TEXT,
  certifications JSONB NOT NULL DEFAULT '[]'::jsonb,
  shift VARCHAR(30) DEFAULT 'full_day',
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  designation VARCHAR(255),
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_branch_id ON users(branch_id);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

CREATE TABLE IF NOT EXISTS staff_duty_roster (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  staff_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  branch_name VARCHAR(255) NOT NULL DEFAULT '',
  duty_date DATE NOT NULL,
  shift VARCHAR(30) NOT NULL DEFAULT 'full_day',
  room_number VARCHAR(50),
  assigned_doctor_name VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_roster_date_branch ON staff_duty_roster(duty_date, branch_id);

CREATE TABLE IF NOT EXISTS user_security_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  action VARCHAR(60) NOT NULL,
  ip_address VARCHAR(100) NOT NULL DEFAULT '',
  device_info TEXT NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'success',
  details TEXT NOT NULL DEFAULT '',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_security_logs_time ON user_security_logs(occurred_at DESC);

CREATE TABLE IF NOT EXISTS active_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL,
  ip_address VARCHAR(100) NOT NULL DEFAULT '',
  device_info TEXT NOT NULL DEFAULT '',
  login_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_user ON active_sessions(user_id);

-- -----------------------------------------------------------------------------
-- 2. Patients & Clinical Documents (Files stored privately on VPS disk)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  patient_id_code VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  name_bn VARCHAR(255),
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(255),
  gender VARCHAR(20) NOT NULL DEFAULT 'female',
  date_of_birth DATE,
  age INTEGER,
  blood_group VARCHAR(10),
  address TEXT,
  city VARCHAR(100) NOT NULL DEFAULT 'Dhaka',
  branch_id TEXT NOT NULL REFERENCES branches(id),
  allergies JSONB NOT NULL DEFAULT '[]'::jsonb,
  medical_history TEXT,
  skin_type VARCHAR(30),
  referred_by VARCHAR(255),
  referrer_doctor_id TEXT,
  is_flagged_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
  duplicate_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients(phone);
CREATE INDEX IF NOT EXISTS idx_patients_branch ON patients(branch_id);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_patients_created_at ON patients(created_at DESC);

CREATE TABLE IF NOT EXISTS medical_attachments (
  id TEXT PRIMARY KEY,
  document_code VARCHAR(80) NOT NULL UNIQUE,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  patient_name VARCHAR(255) NOT NULL,
  patient_phone VARCHAR(50) NOT NULL DEFAULT '',
  doc_type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  title_bn VARCHAR(255),
  category VARCHAR(80) NOT NULL,
  procedure_name VARCHAR(255),
  session_number INTEGER,
  photo_type VARCHAR(20),
  storage_path TEXT,
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  file_size VARCHAR(40) NOT NULL DEFAULT '',
  file_format VARCHAR(20) NOT NULL DEFAULT 'PNG',
  doctor_name VARCHAR(255) NOT NULL DEFAULT '',
  signed_by_patient BOOLEAN NOT NULL DEFAULT FALSE,
  signature_date TIMESTAMPTZ,
  clinical_notes TEXT,
  is_confidential BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attachments_patient ON medical_attachments(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_attachments_category ON medical_attachments(category);

-- -----------------------------------------------------------------------------
-- 3. Appointments & Call Center Follow-up
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  patient_name VARCHAR(255) NOT NULL,
  patient_phone VARCHAR(50) NOT NULL,
  patient_age INTEGER,
  patient_gender VARCHAR(20),
  patient_address TEXT,
  patient_blood_group VARCHAR(10),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  branch_name VARCHAR(255) NOT NULL DEFAULT '',
  doctor_id TEXT NOT NULL,
  doctor_name VARCHAR(255) NOT NULL,
  disease_name VARCHAR(255),
  booking_method VARCHAR(80),
  service_category VARCHAR(100) NOT NULL,
  service_name VARCHAR(255) NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time VARCHAR(10) NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  status VARCHAR(30) NOT NULL DEFAULT 'booked',
  status_reason TEXT,
  call_reference VARCHAR(120),
  notes TEXT,
  created_by VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_date_branch ON appointments(appointment_date, branch_id);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date ON appointments(doctor_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

CREATE TABLE IF NOT EXISTS call_center_tasks (
  id TEXT PRIMARY KEY,
  appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  patient_name VARCHAR(255) NOT NULL,
  patient_phone VARCHAR(50) NOT NULL,
  appointment_date DATE NOT NULL,
  appointment_time VARCHAR(10) NOT NULL,
  doctor_name VARCHAR(255) NOT NULL DEFAULT '',
  service_name VARCHAR(255) NOT NULL DEFAULT '',
  branch_name VARCHAR(255) NOT NULL DEFAULT '',
  call_status VARCHAR(40) NOT NULL DEFAULT 'pending',
  sms_status VARCHAR(40) NOT NULL DEFAULT 'pending',
  call_attempts INTEGER NOT NULL DEFAULT 0,
  last_called_at TIMESTAMPTZ,
  call_notes TEXT,
  agent_id TEXT,
  agent_name VARCHAR(255),
  followup_purpose VARCHAR(120),
  call_outcome VARCHAR(120),
  patient_intent VARCHAR(120),
  next_followup_date DATE,
  next_followup_time VARCHAR(10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_tasks_date_status ON call_center_tasks(appointment_date, call_status);
CREATE INDEX IF NOT EXISTS idx_call_tasks_patient ON call_center_tasks(patient_id);

-- -----------------------------------------------------------------------------
-- 4. Doctor Consultations, Prescriptions & Rx Protocols
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS consultations (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  patient_name VARCHAR(255) NOT NULL,
  doctor_id TEXT NOT NULL,
  doctor_name VARCHAR(255) NOT NULL,
  appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  consultation_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  chief_complaints TEXT NOT NULL DEFAULT '',
  examination_notes TEXT NOT NULL DEFAULT '',
  clinical_diagnosis TEXT NOT NULL DEFAULT '',
  skin_analysis JSONB,
  recommended_procedures JSONB NOT NULL DEFAULT '[]'::jsonb,
  next_session_date DATE,
  next_session_notes TEXT,
  prescription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consultations_patient ON consultations(patient_id, consultation_date DESC);
CREATE INDEX IF NOT EXISTS idx_consultations_doctor ON consultations(doctor_id);

CREATE TABLE IF NOT EXISTS prescriptions (
  id TEXT PRIMARY KEY,
  prescription_code VARCHAR(60) NOT NULL UNIQUE,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  patient_code VARCHAR(60),
  patient_name VARCHAR(255) NOT NULL,
  patient_age INTEGER,
  patient_gender VARCHAR(20),
  patient_phone VARCHAR(50),
  patient_address TEXT,
  doctor_id TEXT NOT NULL,
  doctor_name VARCHAR(255) NOT NULL,
  doctor_credentials VARCHAR(255) NOT NULL DEFAULT '',
  consultation_id TEXT REFERENCES consultations(id) ON DELETE SET NULL,
  chief_complaints TEXT,
  past_history TEXT,
  operation_history TEXT,
  investigations TEXT,
  diagnosis TEXT NOT NULL DEFAULT '',
  skin_analysis JSONB,
  recommended_procedures JSONB NOT NULL DEFAULT '[]'::jsonb,
  advice_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  plan_notes TEXT,
  medicines JSONB NOT NULL DEFAULT '[]'::jsonb,
  lifestyle_guidance JSONB NOT NULL DEFAULT '{}'::jsonb,
  next_session_date DATE,
  version INTEGER NOT NULL DEFAULT 1,
  is_finalized BOOLEAN NOT NULL DEFAULT TRUE,
  language VARCHAR(10) NOT NULL DEFAULT 'both',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor ON prescriptions(doctor_id);

CREATE TABLE IF NOT EXISTS rx_protocols (
  id TEXT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subtitle VARCHAR(255) NOT NULL DEFAULT '',
  category VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_default_baseline BOOLEAN NOT NULL DEFAULT FALSE,
  diagnosis TEXT NOT NULL DEFAULT '',
  chief_complaints TEXT NOT NULL DEFAULT '',
  investigations TEXT NOT NULL DEFAULT '',
  examination_notes TEXT NOT NULL DEFAULT '',
  skin_type VARCHAR(30) NOT NULL DEFAULT 'combination',
  target_zones JSONB NOT NULL DEFAULT '[]'::jsonb,
  procedures JSONB NOT NULL DEFAULT '[]'::jsonb,
  medicines JSONB NOT NULL DEFAULT '[]'::jsonb,
  advice_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  sun_instructions TEXT NOT NULL DEFAULT '',
  sun_instructions_bn TEXT NOT NULL DEFAULT '',
  water_liters NUMERIC(4, 1) NOT NULL DEFAULT 3.0,
  follow_up_days INTEGER NOT NULL DEFAULT 14,
  morning_routine JSONB NOT NULL DEFAULT '[]'::jsonb,
  evening_routine JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended_foods JSONB NOT NULL DEFAULT '[]'::jsonb,
  prohibited_foods JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by VARCHAR(255),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 5. Treatment Packages & Session Ledger (Strict Non-Duplicate Deduction)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS master_packages (
  id TEXT PRIMARY KEY,
  code VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  name_bn VARCHAR(255),
  service_category VARCHAR(120) NOT NULL,
  total_sessions INTEGER NOT NULL CHECK (total_sessions > 0),
  regular_price_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  package_price_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  savings_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  validity_months INTEGER NOT NULL DEFAULT 6,
  min_interval_days INTEGER NOT NULL DEFAULT 14,
  description TEXT NOT NULL DEFAULT '',
  description_bn TEXT,
  included_services JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS treatment_packages (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  patient_name VARCHAR(255) NOT NULL,
  package_name VARCHAR(255) NOT NULL,
  service_category VARCHAR(120) NOT NULL,
  total_sessions INTEGER NOT NULL CHECK (total_sessions > 0),
  completed_sessions INTEGER NOT NULL DEFAULT 0 CHECK (completed_sessions >= 0),
  remaining_sessions INTEGER NOT NULL CHECK (remaining_sessions >= 0),
  price_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  paid_amount_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  due_amount_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  per_session_price_bdt NUMERIC(12, 2),
  unlocked_sessions INTEGER,
  advance_credit_bdt NUMERIC(12, 2) DEFAULT 0,
  purchase_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  invoice_id TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_package_session_math CHECK (completed_sessions + remaining_sessions = total_sessions)
);

CREATE INDEX IF NOT EXISTS idx_treatment_packages_patient ON treatment_packages(patient_id);
CREATE INDEX IF NOT EXISTS idx_treatment_packages_status ON treatment_packages(status);

CREATE TABLE IF NOT EXISTS package_deductions (
  id TEXT PRIMARY KEY,
  package_id TEXT NOT NULL REFERENCES treatment_packages(id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  session_number INTEGER NOT NULL CHECK (session_number > 0),
  deducted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  therapist_id TEXT NOT NULL,
  therapist_name VARCHAR(255) NOT NULL,
  treatment_notes TEXT NOT NULL DEFAULT '',
  machine_settings TEXT,
  CONSTRAINT uq_package_session_deduction UNIQUE (package_id, session_number)
);

CREATE INDEX IF NOT EXISTS idx_package_deductions_patient ON package_deductions(patient_id, deducted_at DESC);

-- -----------------------------------------------------------------------------
-- 6. Billing, Invoices, Payments & Daily Closing (Immutable Financial Ledger)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  invoice_number VARCHAR(60) NOT NULL UNIQUE,
  patient_id TEXT NOT NULL REFERENCES patients(id),
  patient_name VARCHAR(255) NOT NULL,
  patient_phone VARCHAR(50),
  patient_age INTEGER,
  patient_gender VARCHAR(20),
  patient_code VARCHAR(60),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  branch_name VARCHAR(255) NOT NULL DEFAULT '',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  vat_percent NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
  vat_amount_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_amount_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  paid_amount_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  due_amount_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'unpaid',
  void_reason TEXT,
  voided_at TIMESTAMPTZ,
  voided_by VARCHAR(255),
  payment_method VARCHAR(40),
  bank_name VARCHAR(120),
  account_number VARCHAR(120),
  created_by VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_patient ON invoices(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_branch_status ON invoices(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC);

CREATE TABLE IF NOT EXISTS payment_records (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  receipt_number VARCHAR(80) NOT NULL UNIQUE,
  amount_bdt NUMERIC(12, 2) NOT NULL CHECK (amount_bdt > 0),
  method VARCHAR(30) NOT NULL,
  transaction_ref VARCHAR(150),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  received_by VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'valid',
  reversal_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payment_records(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payment_records(paid_at DESC);

CREATE TABLE IF NOT EXISTS daily_closing_reports (
  id TEXT PRIMARY KEY,
  closing_date DATE NOT NULL,
  cashier_id TEXT NOT NULL,
  cashier_name VARCHAR(255) NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  branch_name VARCHAR(255) NOT NULL DEFAULT '',
  opening_cash_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  expected_cash_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  actual_cash_counted_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cash_difference_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  card_settlement_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  mfs_bkash_settlement_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  mfs_nagad_settlement_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  bank_transfer_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_collected_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_invoices_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_closing_date_branch ON daily_closing_reports(closing_date DESC, branch_id);

-- -----------------------------------------------------------------------------
-- 7. Product Catalog, Inventory, Suppliers, POs & GRNs
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  item_code VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  brand VARCHAR(120) NOT NULL DEFAULT '',
  product_type VARCHAR(30) DEFAULT 'dual_use',
  barcode VARCHAR(100),
  sku VARCHAR(100),
  description TEXT,
  current_stock INTEGER NOT NULL DEFAULT 0,
  unit VARCHAR(40) NOT NULL DEFAULT 'pieces',
  reorder_level INTEGER NOT NULL DEFAULT 5,
  unit_cost_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  selling_price_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  batch_number VARCHAR(100) NOT NULL DEFAULT '',
  expiry_date DATE,
  batches JSONB NOT NULL DEFAULT '[]'::jsonb,
  usage_protocol TEXT,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  branch_name VARCHAR(255) NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'in_stock',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_branch_status ON inventory_items(branch_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory_items(category);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES inventory_items(id),
  item_name VARCHAR(255) NOT NULL,
  batch_number VARCHAR(100) NOT NULL DEFAULT '',
  adjustment_type VARCHAR(40) NOT NULL,
  quantity_delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  unit_cost_bdt NUMERIC(12, 2),
  reason TEXT NOT NULL,
  adjusted_by VARCHAR(255) NOT NULL,
  adjusted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_adjustments_item ON stock_adjustments(item_id, adjusted_at DESC);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  code VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  contact_person VARCHAR(255) NOT NULL DEFAULT '',
  phone VARCHAR(50) NOT NULL DEFAULT '',
  email VARCHAR(255) NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  brands_supplied JSONB NOT NULL DEFAULT '[]'::jsonb,
  payment_terms VARCHAR(50) NOT NULL DEFAULT 'Net 30',
  balance_due_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  po_number VARCHAR(80) NOT NULL UNIQUE,
  invoice_no VARCHAR(80),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  supplier_name VARCHAR(255) NOT NULL,
  order_date DATE NOT NULL,
  expected_delivery_date DATE,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  paid_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  due_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'ordered',
  payment_status VARCHAR(30) NOT NULL DEFAULT 'unpaid',
  notes TEXT,
  created_by VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id, order_date DESC);

CREATE TABLE IF NOT EXISTS goods_received_notes (
  id TEXT PRIMARY KEY,
  grn_number VARCHAR(80) NOT NULL UNIQUE,
  po_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
  po_number VARCHAR(80),
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  supplier_name VARCHAR(255) NOT NULL,
  received_date DATE NOT NULL,
  received_by VARCHAR(255) NOT NULL,
  invoice_ref_number VARCHAR(100),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_cost_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 8. Referrals & Commissions
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS referrers (
  id TEXT PRIMARY KEY,
  code VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  referrer_type VARCHAR(50) NOT NULL,
  phone VARCHAR(50),
  email VARCHAR(255),
  organization VARCHAR(255),
  default_payout_method VARCHAR(50),
  payout_account_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commission_rules (
  id TEXT PRIMARY KEY,
  referrer_id TEXT REFERENCES referrers(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  service_category VARCHAR(120),
  calculation_type VARCHAR(30) NOT NULL DEFAULT 'percentage',
  rate_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
  withholding_tax_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patient_referrals (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  referrer_id TEXT NOT NULL REFERENCES referrers(id),
  attribution_reason TEXT,
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  assigned_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_referrals_patient ON patient_referrals(patient_id);

CREATE TABLE IF NOT EXISTS referral_commissions (
  id TEXT PRIMARY KEY,
  referrer_id TEXT REFERENCES referrers(id),
  referrer_name VARCHAR(255) NOT NULL,
  referrer_type VARCHAR(60) NOT NULL,
  phone VARCHAR(50) NOT NULL DEFAULT '',
  patient_id TEXT NOT NULL REFERENCES patients(id),
  patient_name VARCHAR(255) NOT NULL,
  invoice_id TEXT NOT NULL,
  service_category VARCHAR(120) NOT NULL DEFAULT '',
  bill_amount_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  commission_percentage NUMERIC(5, 2) NOT NULL DEFAULT 0,
  commission_amount_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  withholding_amount_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_amount_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  payout_id TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commission_payouts (
  id TEXT PRIMARY KEY,
  payout_number VARCHAR(80) NOT NULL UNIQUE,
  referrer_id TEXT NOT NULL REFERENCES referrers(id),
  payout_method VARCHAR(50) NOT NULL,
  transaction_ref VARCHAR(150),
  gross_amount_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  withholding_amount_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_payout_amount_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  commission_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  paid_by VARCHAR(255),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 9. Integrations (SMS & Email Gateways), System Settings, Backups & Audit Log
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sms_templates (
  id TEXT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  msg_type VARCHAR(20) NOT NULL DEFAULT 'unicode',
  label VARCHAR(30) NOT NULL DEFAULT 'transactional',
  content TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sms_logs (
  id TEXT PRIMARY KEY,
  recipient_phone VARCHAR(50) NOT NULL,
  recipient_name VARCHAR(255),
  message_content TEXT NOT NULL,
  message_type VARCHAR(20) NOT NULL DEFAULT 'unicode',
  label VARCHAR(30) NOT NULL DEFAULT 'transactional',
  sender_id VARCHAR(50) NOT NULL DEFAULT 'SUOXI',
  shoot_id VARCHAR(120),
  status VARCHAR(30) NOT NULL DEFAULT 'sent',
  error_code VARCHAR(50),
  error_message TEXT,
  chars_count INTEGER NOT NULL DEFAULT 0,
  sms_count INTEGER NOT NULL DEFAULT 1,
  cost_bdt NUMERIC(10, 4) DEFAULT 0,
  trigger_event VARCHAR(100),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_sent_at ON sms_logs(sent_at DESC);

CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  html_preview TEXT NOT NULL DEFAULT '',
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_logs (
  id TEXT PRIMARY KEY,
  recipient_email VARCHAR(255) NOT NULL,
  recipient_name VARCHAR(255),
  subject VARCHAR(255) NOT NULL,
  template_category VARCHAR(50) NOT NULL DEFAULT 'other',
  status VARCHAR(30) NOT NULL DEFAULT 'sent',
  error_message TEXT,
  trigger_event VARCHAR(100),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at DESC);

CREATE TABLE IF NOT EXISTS clinic_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by VARCHAR(255),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS backup_records (
  id TEXT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  file_size VARCHAR(50) NOT NULL DEFAULT '',
  backup_type VARCHAR(30) NOT NULL DEFAULT 'auto_daily',
  storage_target VARCHAR(30) NOT NULL DEFAULT 'r2',
  status VARCHAR(30) NOT NULL DEFAULT 'completed',
  total_records INTEGER NOT NULL DEFAULT 0,
  tables_included JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by VARCHAR(255) NOT NULL DEFAULT 'system',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id TEXT NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  user_role VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(80) NOT NULL,
  resource_id TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  ip_address VARCHAR(100) NOT NULL DEFAULT '',
  branch_id TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_audit_events_time ON audit_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events(user_id);
