-- =============================================================================
-- SUOXI Skin Care & Aesthetic Center ERP (Dhaka, Bangladesh)
-- PostgreSQL Migration 0005: Standalone Clinic Store Module
--   - Internal non-sellable supplies (hygiene, consumables, stationery)
--   - Department / room supply requisitions & atomic store dispatch
--   - Reusable clinical instruments custody, assignment & maintenance tracking
--   - Separate Clinic Store OPEX movement ledger
-- =============================================================================

CREATE TABLE IF NOT EXISTS clinic_store_items (
  id TEXT PRIMARY KEY,
  item_code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  sub_category VARCHAR(100),
  unit VARCHAR(40) NOT NULL DEFAULT 'pieces',
  current_stock INT NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  reorder_level INT NOT NULL DEFAULT 5 CHECK (reorder_level >= 0),
  unit_cost_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  vendor_name VARCHAR(255),
  storage_location VARCHAR(150),
  is_sellable BOOLEAN NOT NULL DEFAULT FALSE,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  branch_name VARCHAR(255) NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'in_stock',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_items_branch ON clinic_store_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_store_items_category ON clinic_store_items(category);
CREATE INDEX IF NOT EXISTS idx_store_items_status ON clinic_store_items(status);

CREATE TABLE IF NOT EXISTS clinic_store_requisitions (
  id TEXT PRIMARY KEY,
  req_number VARCHAR(80) NOT NULL UNIQUE,
  department VARCHAR(120) NOT NULL,
  room_number VARCHAR(80),
  priority VARCHAR(30) NOT NULL DEFAULT 'normal',
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  requested_by_id TEXT NOT NULL,
  requested_by_name VARCHAR(255) NOT NULL,
  requested_by_role VARCHAR(50) NOT NULL,
  approved_by_name VARCHAR(255),
  approved_at TIMESTAMPTZ,
  issued_by_name VARCHAR(255),
  issued_at TIMESTAMPTZ,
  received_by_name VARCHAR(255),
  received_at TIMESTAMPTZ,
  rejection_reason TEXT,
  notes TEXT,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_estimated_cost_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  branch_name VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_req_branch ON clinic_store_requisitions(branch_id);
CREATE INDEX IF NOT EXISTS idx_store_req_status ON clinic_store_requisitions(status);
CREATE INDEX IF NOT EXISTS idx_store_req_requester ON clinic_store_requisitions(requested_by_id);

CREATE TABLE IF NOT EXISTS clinic_store_instruments (
  id TEXT PRIMARY KEY,
  asset_tag VARCHAR(80) NOT NULL UNIQUE,
  item_id TEXT REFERENCES clinic_store_items(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(120) NOT NULL DEFAULT 'Clinical Instruments & Tools',
  serial_number VARCHAR(120),
  condition VARCHAR(30) NOT NULL DEFAULT 'good',
  custody_status VARCHAR(30) NOT NULL DEFAULT 'in_store',
  assigned_room VARCHAR(120),
  assigned_to_user_id TEXT,
  assigned_to_user_name VARCHAR(255),
  assigned_at TIMESTAMPTZ,
  purchase_cost_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  last_service_date DATE,
  notes TEXT,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  branch_name VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_inst_branch ON clinic_store_instruments(branch_id);
CREATE INDEX IF NOT EXISTS idx_store_inst_custody ON clinic_store_instruments(custody_status);

CREATE TABLE IF NOT EXISTS clinic_store_ledger (
  id TEXT PRIMARY KEY,
  item_id TEXT REFERENCES clinic_store_items(id) ON DELETE SET NULL,
  item_code VARCHAR(80),
  item_name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  movement_type VARCHAR(40) NOT NULL,
  quantity_delta INT NOT NULL DEFAULT 0,
  balance_after INT NOT NULL DEFAULT 0,
  unit_cost_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_value_bdt NUMERIC(12, 2) NOT NULL DEFAULT 0,
  department VARCHAR(120),
  room_number VARCHAR(80),
  reference_no VARCHAR(100),
  reason TEXT NOT NULL DEFAULT '',
  performed_by_name VARCHAR(255) NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id),
  branch_name VARCHAR(255) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_store_ledger_branch ON clinic_store_ledger(branch_id);
CREATE INDEX IF NOT EXISTS idx_store_ledger_created ON clinic_store_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_ledger_type ON clinic_store_ledger(movement_type);
