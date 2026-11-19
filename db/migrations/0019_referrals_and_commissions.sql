-- SUOXI Skin Care & Aesthetic Center CRM (Dhaka, Bangladesh)
-- Migration 0019: Referrals and Commission Management (Prompt 19)
-- In accordance with Rule 11 (Schema Gate), K1, and K2 design standards.
-- Storage engine: InnoDB, Charset: utf8mb4, Money: DECIMAL(12,2)

-- 1. Referrers Registry
CREATE TABLE IF NOT EXISTS referrers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  referrer_code VARCHAR(32) NOT NULL UNIQUE,
  referrer_type ENUM('doctor', 'patient', 'staff', 'agent', 'organization') NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  full_name_bn VARCHAR(150) NULL,
  mobile VARCHAR(20) NOT NULL,
  email VARCHAR(100) NULL,
  organization_name VARCHAR(150) NULL,
  status ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
  payout_method ENUM('bank_transfer', 'bKash', 'Nagad', 'cash', 'cheque') NOT NULL DEFAULT 'bank_transfer',
  -- Encrypted payout account details (AES-256-GCM) per Hard Rule 10
  payout_details_ciphertext TEXT NULL,
  payout_details_iv VARCHAR(64) NULL,
  payout_details_tag VARCHAR(64) NULL,
  payout_details_key_version INT UNSIGNED NOT NULL DEFAULT 1,
  total_pending_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  total_paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_referrers_type (referrer_type),
  INDEX idx_referrers_status (status),
  INDEX idx_referrers_mobile (mobile)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Referrer Accounts (Left unused per Open Decision A-07)
CREATE TABLE IF NOT EXISTS referrer_accounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  referrer_id BIGINT UNSIGNED NOT NULL,
  login_identifier VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  status ENUM('pending_setup', 'active', 'suspended') NOT NULL DEFAULT 'pending_setup',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ref_acc_referrer FOREIGN KEY (referrer_id) REFERENCES referrers(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Patient Referrals Attribution History (Exactly ONE current row per patient)
CREATE TABLE IF NOT EXISTS patient_referrals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id BIGINT UNSIGNED NOT NULL,
  referrer_id BIGINT UNSIGNED NOT NULL,
  is_current TINYINT(1) NOT NULL DEFAULT 1,
  -- Stored generated column enforcing single current referrer per patient
  current_flag BIGINT UNSIGNED GENERATED ALWAYS AS (IF(is_current = 1, patient_id, NULL)) STORED,
  effective_from TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  effective_to TIMESTAMP NULL,
  attribution_reason VARCHAR(255) NOT NULL,
  assigned_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_patient_single_current_referrer (current_flag),
  INDEX idx_patient_referrals_patient (patient_id),
  INDEX idx_patient_referrals_referrer (referrer_id),
  CONSTRAINT fk_pref_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pref_referrer FOREIGN KEY (referrer_id) REFERENCES referrers(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Commission Rules
CREATE TABLE IF NOT EXISTS commission_rules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rule_code VARCHAR(32) NOT NULL UNIQUE,
  rule_name VARCHAR(150) NOT NULL,
  description TEXT NULL,
  referrer_type ENUM('doctor', 'patient', 'staff', 'agent', 'organization', 'all') NOT NULL DEFAULT 'all',
  calculation_type ENUM('percentage', 'fixed') NOT NULL DEFAULT 'percentage',
  rate_value DECIMAL(12,2) NOT NULL, -- e.g. 10.00% or 500.00 BDT
  basis ENUM('paid_amount', 'invoice_total', 'service_price', 'package_price') NOT NULL DEFAULT 'paid_amount',
  applies_to ENUM('all', 'service', 'package') NOT NULL DEFAULT 'all',
  service_id BIGINT UNSIGNED NULL,
  package_id BIGINT UNSIGNED NULL,
  first_purchase_only TINYINT(1) NOT NULL DEFAULT 0,
  min_base_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  max_commission_amount DECIMAL(12,2) NULL, -- Cap
  refund_policy ENUM('none', 'full_reversal', 'proportional') NOT NULL DEFAULT 'proportional',
  withholding_tax_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  valid_from DATE NOT NULL,
  valid_to DATE NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_comm_rules_active (is_active, valid_from, valid_to),
  INDEX idx_comm_rules_referrer_type (referrer_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Commission Payouts (Batched settlement)
CREATE TABLE IF NOT EXISTS commission_payouts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payout_number VARCHAR(32) NOT NULL UNIQUE,
  referrer_id BIGINT UNSIGNED NOT NULL,
  gross_amount DECIMAL(12,2) NOT NULL,
  withholding_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  net_payout_amount DECIMAL(12,2) NOT NULL,
  payout_method ENUM('bank_transfer', 'bKash', 'Nagad', 'cash', 'cheque') NOT NULL,
  payment_reference VARCHAR(100) NOT NULL,
  paid_date DATE NOT NULL,
  authorized_by BIGINT UNSIGNED NOT NULL,
  authorized_by_name VARCHAR(150) NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_payouts_referrer (referrer_id),
  INDEX idx_payouts_date (paid_date),
  CONSTRAINT fk_payout_referrer FOREIGN KEY (referrer_id) REFERENCES referrers(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Commissions Ledger
CREATE TABLE IF NOT EXISTS commissions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  commission_code VARCHAR(32) NOT NULL UNIQUE,
  referrer_id BIGINT UNSIGNED NOT NULL,
  patient_id BIGINT UNSIGNED NOT NULL,
  invoice_id BIGINT UNSIGNED NOT NULL,
  payment_id BIGINT UNSIGNED NULL,
  refund_id BIGINT UNSIGNED NULL,
  rule_id BIGINT UNSIGNED NOT NULL,
  parent_commission_id BIGINT UNSIGNED NULL, -- Linked for adjustment/reversal rows
  kind ENUM('accrual', 'adjustment', 'reversal') NOT NULL DEFAULT 'accrual',
  status ENUM('pending', 'approved', 'paid', 'adjusted', 'reversed') NOT NULL DEFAULT 'pending',
  -- Snapshot of calculation rules applied at computation time
  applied_calculation_type ENUM('percentage', 'fixed') NOT NULL,
  applied_rate DECIMAL(12,2) NOT NULL,
  applied_basis ENUM('paid_amount', 'invoice_total', 'service_price', 'package_price') NOT NULL,
  base_amount DECIMAL(12,2) NOT NULL,
  computed_amount DECIMAL(12,2) NOT NULL, -- Negative for reversal
  withholding_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  withholding_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  net_amount DECIMAL(12,2) NOT NULL,
  payout_id BIGINT UNSIGNED NULL,
  -- Idempotency key guaranteeing same payment/refund never accrues twice
  accrual_key VARCHAR(128) NOT NULL UNIQUE,
  approved_by BIGINT UNSIGNED NULL,
  approved_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_comm_referrer (referrer_id),
  INDEX idx_comm_patient (patient_id),
  INDEX idx_comm_invoice (invoice_id),
  INDEX idx_comm_status (status),
  INDEX idx_comm_payout (payout_id),
  CONSTRAINT fk_comm_referrer FOREIGN KEY (referrer_id) REFERENCES referrers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_comm_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_comm_rule FOREIGN KEY (rule_id) REFERENCES commission_rules(id) ON DELETE RESTRICT,
  CONSTRAINT fk_comm_parent FOREIGN KEY (parent_commission_id) REFERENCES commissions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_comm_payout FOREIGN KEY (payout_id) REFERENCES commission_payouts(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
