-- =============================================================================
-- SUOXI Skin Care & Aesthetic Center CRM (Dhaka, Bangladesh)
-- PostgreSQL Migration 0002: Referrals, Commissions & Operational Columns
-- =============================================================================

-- 1. Referrers: Bengali name, masked payout preview, encrypted flag & creator
ALTER TABLE referrers
  ADD COLUMN IF NOT EXISTS name_bn VARCHAR(255),
  ADD COLUMN IF NOT EXISTS payout_details_masked VARCHAR(255),
  ADD COLUMN IF NOT EXISTS has_payout_details BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS created_by TEXT;

CREATE INDEX IF NOT EXISTS idx_referrers_type_status ON referrers(referrer_type, status);

-- 2. Commission Rules: full rule configuration fields matching CommissionRuleDto
ALTER TABLE commission_rules
  ADD COLUMN IF NOT EXISTS rule_code VARCHAR(60),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS referrer_type VARCHAR(50) NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS basis VARCHAR(50) NOT NULL DEFAULT 'paid_amount',
  ADD COLUMN IF NOT EXISTS applies_to VARCHAR(50) NOT NULL DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS service_id TEXT,
  ADD COLUMN IF NOT EXISTS package_id TEXT,
  ADD COLUMN IF NOT EXISTS first_purchase_only BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS min_base_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_commission_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS refund_policy VARCHAR(40) NOT NULL DEFAULT 'proportional',
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_rules_code
  ON commission_rules(rule_code)
  WHERE rule_code IS NOT NULL;

-- 3. Patient Referrals: Single-current-referrer invariant per patient
ALTER TABLE patient_referrals
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS assigned_by_name VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS uq_patient_referrals_current
  ON patient_referrals(patient_id)
  WHERE is_current = TRUE;

CREATE INDEX IF NOT EXISTS idx_patient_referrals_referrer
  ON patient_referrals(referrer_id, is_current);

-- 4. Referral Commissions: Full accrual/reversal ledger & payout link fields
ALTER TABLE referral_commissions
  ADD COLUMN IF NOT EXISTS commission_code VARCHAR(60),
  ADD COLUMN IF NOT EXISTS referrer_code VARCHAR(60),
  ADD COLUMN IF NOT EXISTS patient_code VARCHAR(60),
  ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(80),
  ADD COLUMN IF NOT EXISTS payment_id TEXT,
  ADD COLUMN IF NOT EXISTS rule_id TEXT,
  ADD COLUMN IF NOT EXISTS rule_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS kind VARCHAR(30) NOT NULL DEFAULT 'accrual',
  ADD COLUMN IF NOT EXISTS applied_calculation_type VARCHAR(30) NOT NULL DEFAULT 'percentage',
  ADD COLUMN IF NOT EXISTS applied_basis VARCHAR(40) NOT NULL DEFAULT 'paid_amount',
  ADD COLUMN IF NOT EXISTS withholding_percent NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payout_number VARCHAR(80),
  ADD COLUMN IF NOT EXISTS accrual_key VARCHAR(120),
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS uq_referral_commissions_accrual_key
  ON referral_commissions(accrual_key)
  WHERE accrual_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_referral_commissions_referrer_status
  ON referral_commissions(referrer_id, status);

CREATE INDEX IF NOT EXISTS idx_referral_commissions_patient
  ON referral_commissions(patient_id, created_at DESC);

-- 5. Commission Payouts: Referrer snapshot & authorization metadata
ALTER TABLE commission_payouts
  ADD COLUMN IF NOT EXISTS referrer_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS referrer_code VARCHAR(60),
  ADD COLUMN IF NOT EXISTS paid_date DATE,
  ADD COLUMN IF NOT EXISTS authorized_by TEXT,
  ADD COLUMN IF NOT EXISTS authorized_by_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_commission_payouts_referrer
  ON commission_payouts(referrer_id, created_at DESC);
