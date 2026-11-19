-- ==============================================================================
-- MIGRATION 0012: BILLING — INVOICES, PAYMENTS, REFUNDS & TRANSACTIONAL OUTBOX
-- ==============================================================================

-- 1. Payment Methods Table & Seeds
CREATE TABLE IF NOT EXISTS payment_methods (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  name_bn VARCHAR(100) NULL,
  requires_reference BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed Standard Bangladesh Clinic Payment Methods (business key: code)
INSERT INTO payment_methods (code, name, name_bn, requires_reference, is_active, sort_order)
VALUES
  ('CASH', 'Cash', 'নগদ ক্যাশ', FALSE, TRUE, 1),
  ('BKASH', 'bKash Merchant / Personal', 'বিকাশ', TRUE, TRUE, 2),
  ('NAGAD', 'Nagad', 'নগদ', TRUE, TRUE, 3),
  ('CARD', 'POS Card (Visa / Mastercard / Amex)', 'কার্ড', TRUE, TRUE, 4),
  ('BANK_TRANSFER', 'Bank Transfer / EFT', 'ব্যাংক ট্রান্সফার', TRUE, TRUE, 5)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- 2. Invoices Table
CREATE TABLE IF NOT EXISTS invoices (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_no VARCHAR(32) NOT NULL UNIQUE,
  patient_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  appointment_id BIGINT UNSIGNED NULL,
  consultation_id BIGINT UNSIGNED NULL,
  invoice_date DATE NOT NULL,
  due_date DATE NULL,
  status ENUM('draft', 'issued', 'paid', 'partially_paid', 'unpaid', 'void') NOT NULL DEFAULT 'draft',
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  discount_reason VARCHAR(255) NULL,
  discount_authorized_by BIGINT UNSIGNED NULL,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  tax_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  void_reason VARCHAR(255) NULL,
  voided_at DATETIME(3) NULL,
  voided_by BIGINT UNSIGNED NULL,
  issued_at DATETIME(3) NULL,
  issued_by BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  
  CONSTRAINT fk_invoices_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_invoices_branch FOREIGN KEY (branch_id)
    REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_invoices_discount_authorizer FOREIGN KEY (discount_authorized_by)
    REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_invoices_creator FOREIGN KEY (created_by)
    REFERENCES staff_users(id) ON DELETE RESTRICT,

  CONSTRAINT chk_invoice_discount CHECK (discount_amount <= subtotal),
  CONSTRAINT chk_invoice_total CHECK (total_amount = subtotal - discount_amount + tax_amount),
  CONSTRAINT chk_invoice_void CHECK (status != 'void' OR (void_reason IS NOT NULL AND voided_at IS NOT NULL AND voided_by IS NOT NULL)),

  INDEX idx_invoices_patient (patient_id, invoice_date),
  INDEX idx_invoices_branch (branch_id, invoice_date),
  INDEX idx_invoices_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Invoice Items Table
CREATE TABLE IF NOT EXISTS invoice_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  invoice_id BIGINT UNSIGNED NOT NULL,
  item_type ENUM('treatment', 'package', 'product', 'other') NOT NULL,
  service_id BIGINT UNSIGNED NULL,
  package_id BIGINT UNSIGNED NULL,
  product_id BIGINT UNSIGNED NULL,
  description VARCHAR(255) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  line_total DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  sort_order INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  CONSTRAINT fk_invoice_items_invoice FOREIGN KEY (invoice_id)
    REFERENCES invoices(id) ON DELETE RESTRICT,
  CONSTRAINT chk_item_quantity CHECK (quantity > 0),
  CONSTRAINT chk_item_discount CHECK (discount_amount <= (unit_price * quantity)),
  CONSTRAINT chk_item_line_total CHECK (line_total = (unit_price * quantity) - discount_amount),

  INDEX idx_invoice_items_invoice (invoice_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add deferred Foreign Key from Prompt 11 patient_packages -> invoice_items
ALTER TABLE patient_packages
  ADD CONSTRAINT fk_patient_packages_invoice_item
  FOREIGN KEY (invoice_item_id) REFERENCES invoice_items(id)
  ON DELETE SET NULL;

-- 4. Payments Table (RECEIPTS)
CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_no VARCHAR(32) NOT NULL UNIQUE,
  patient_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  payment_method_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_date DATETIME(3) NOT NULL,
  transaction_reference VARCHAR(128) NULL,
  notes TEXT NULL,
  is_advance BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('completed', 'partially_refunded', 'fully_refunded', 'reversed') NOT NULL DEFAULT 'completed',
  recorded_by BIGINT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(128) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  CONSTRAINT fk_payments_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_branch FOREIGN KEY (branch_id)
    REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_method FOREIGN KEY (payment_method_id)
    REFERENCES payment_methods(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_recorder FOREIGN KEY (recorded_by)
    REFERENCES staff_users(id) ON DELETE RESTRICT,

  CONSTRAINT chk_payment_amount CHECK (amount > 0),
  UNIQUE KEY uq_payment_method_reference (payment_method_id, transaction_reference),
  INDEX idx_payments_patient (patient_id, payment_date),
  INDEX idx_payments_date (payment_date),
  INDEX idx_payments_method (payment_method_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Payment Allocations Table
CREATE TABLE IF NOT EXISTS payment_allocations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_id BIGINT UNSIGNED NOT NULL,
  invoice_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  allocated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  allocated_by BIGINT UNSIGNED NOT NULL,

  CONSTRAINT fk_allocations_payment FOREIGN KEY (payment_id)
    REFERENCES payments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_allocations_invoice FOREIGN KEY (invoice_id)
    REFERENCES invoices(id) ON DELETE RESTRICT,
  CONSTRAINT fk_allocations_allocator FOREIGN KEY (allocated_by)
    REFERENCES staff_users(id) ON DELETE RESTRICT,

  CONSTRAINT chk_allocation_amount CHECK (amount > 0),
  INDEX idx_allocations_invoice (invoice_id),
  INDEX idx_allocations_payment (payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Refunds Table
CREATE TABLE IF NOT EXISTS refunds (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  refund_no VARCHAR(32) NOT NULL UNIQUE,
  source_payment_id BIGINT UNSIGNED NOT NULL,
  invoice_id BIGINT UNSIGNED NULL,
  patient_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  status ENUM('requested', 'approved', 'paid', 'rejected') NOT NULL DEFAULT 'requested',
  refund_method_id BIGINT UNSIGNED NULL,
  transaction_reference VARCHAR(128) NULL,
  requested_by BIGINT UNSIGNED NOT NULL,
  requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME(3) NULL,
  paid_by BIGINT UNSIGNED NULL,
  paid_at DATETIME(3) NULL,
  rejection_reason VARCHAR(255) NULL,
  notes TEXT NULL,
  idempotency_key VARCHAR(128) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  CONSTRAINT fk_refunds_payment FOREIGN KEY (source_payment_id)
    REFERENCES payments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_refunds_invoice FOREIGN KEY (invoice_id)
    REFERENCES invoices(id) ON DELETE RESTRICT,
  CONSTRAINT fk_refunds_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_refunds_branch FOREIGN KEY (branch_id)
    REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_refunds_requester FOREIGN KEY (requested_by)
    REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_refunds_approver FOREIGN KEY (approved_by)
    REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_refunds_payer FOREIGN KEY (paid_by)
    REFERENCES staff_users(id) ON DELETE RESTRICT,

  CONSTRAINT chk_refund_amount CHECK (amount > 0),
  INDEX idx_refunds_payment (source_payment_id),
  INDEX idx_refunds_patient (patient_id),
  INDEX idx_refunds_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Transactional Outbox: Domain Events Table (PACK-PROPOSED)
CREATE TABLE IF NOT EXISTS domain_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(64) NOT NULL,
  aggregate_type VARCHAR(64) NOT NULL,
  aggregate_id VARCHAR(64) NOT NULL,
  payload JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  processed_at DATETIME(3) NULL,
  
  INDEX idx_domain_events_pending (processed_at, created_at),
  INDEX idx_domain_events_aggregate (aggregate_type, aggregate_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Derived Balance Views (Hard Rule 4: Paid and Due are ALWAYS derived)

CREATE OR REPLACE VIEW v_invoice_balances AS
SELECT
  i.id AS invoice_id,
  i.invoice_no,
  i.patient_id,
  i.branch_id,
  i.invoice_date,
  i.due_date,
  i.status AS stored_status,
  i.subtotal,
  i.discount_amount,
  i.tax_amount,
  i.total_amount,
  COALESCE(pa.total_allocated, 0.00) AS total_allocated,
  COALESCE(rf.total_refunded, 0.00) AS total_refunded,
  GREATEST(0.00, COALESCE(pa.total_allocated, 0.00) - COALESCE(rf.total_refunded, 0.00)) AS paid_amount,
  CASE
    WHEN i.status = 'void' THEN 0.00
    ELSE GREATEST(0.00, i.total_amount - GREATEST(0.00, COALESCE(pa.total_allocated, 0.00) - COALESCE(rf.total_refunded, 0.00)))
  END AS due_amount,
  CASE
    WHEN i.status = 'void' THEN 'void'
    WHEN i.status = 'draft' THEN 'draft'
    WHEN GREATEST(0.00, i.total_amount - GREATEST(0.00, COALESCE(pa.total_allocated, 0.00) - COALESCE(rf.total_refunded, 0.00))) = 0.00 AND i.total_amount > 0 THEN 'paid'
    WHEN GREATEST(0.00, COALESCE(pa.total_allocated, 0.00) - COALESCE(rf.total_refunded, 0.00)) > 0.00 THEN 'partially_paid'
    ELSE 'unpaid'
  END AS payment_status
FROM invoices i
LEFT JOIN (
  SELECT invoice_id, SUM(amount) AS total_allocated
  FROM payment_allocations
  GROUP BY invoice_id
) pa ON pa.invoice_id = i.id
LEFT JOIN (
  SELECT invoice_id, SUM(amount) AS total_refunded
  FROM refunds
  WHERE status = 'paid' AND invoice_id IS NOT NULL
  GROUP BY invoice_id
) rf ON rf.invoice_id = i.id;

CREATE OR REPLACE VIEW v_payment_unallocated AS
SELECT
  p.id AS payment_id,
  p.payment_no,
  p.patient_id,
  p.branch_id,
  p.payment_method_id,
  p.amount AS total_amount,
  COALESCE(pa.total_allocated, 0.00) AS total_allocated,
  COALESCE(rf.total_refunded, 0.00) AS total_refunded,
  GREATEST(0.00, p.amount - COALESCE(pa.total_allocated, 0.00) - COALESCE(rf.total_refunded, 0.00)) AS unallocated_amount
FROM payments p
LEFT JOIN (
  SELECT payment_id, SUM(amount) AS total_allocated
  FROM payment_allocations
  GROUP BY payment_id
) pa ON pa.payment_id = p.id
LEFT JOIN (
  SELECT source_payment_id, SUM(amount) AS total_refunded
  FROM refunds
  WHERE status = 'paid'
  GROUP BY source_payment_id
) rf ON rf.source_payment_id = p.id;

CREATE OR REPLACE VIEW v_patient_dues AS
SELECT
  p.id AS patient_id,
  COALESCE(inv.total_invoiced, 0.00) AS total_invoiced,
  COALESCE(inv.total_paid, 0.00) AS total_paid,
  COALESCE(inv.total_due, 0.00) AS total_due,
  COALESCE(unalloc.total_unallocated, 0.00) AS total_unallocated_advance,
  GREATEST(0.00, COALESCE(inv.total_due, 0.00) - COALESCE(unalloc.total_unallocated, 0.00)) AS net_patient_due
FROM patients p
LEFT JOIN (
  SELECT
    patient_id,
    SUM(total_amount) AS total_invoiced,
    SUM(paid_amount) AS total_paid,
    SUM(due_amount) AS total_due
  FROM v_invoice_balances
  WHERE stored_status != 'void'
  GROUP BY patient_id
) inv ON inv.patient_id = p.id
LEFT JOIN (
  SELECT
    patient_id,
    SUM(unallocated_amount) AS total_unallocated
  FROM v_payment_unallocated
  GROUP BY patient_id
) unalloc ON unalloc.patient_id = p.id;

CREATE OR REPLACE VIEW v_daily_collections AS
SELECT
  DATE(p.payment_date) AS collection_date,
  p.branch_id,
  b.name AS branch_name,
  p.payment_method_id,
  pm.name AS payment_method_name,
  pm.code AS payment_method_code,
  SUM(p.amount) AS total_received,
  COALESCE(r.total_refunded, 0.00) AS total_refunded,
  SUM(p.amount) - COALESCE(r.total_refunded, 0.00) AS net_collected,
  COUNT(p.id) AS payment_count
FROM payments p
JOIN branches b ON b.id = p.branch_id
JOIN payment_methods pm ON pm.id = p.payment_method_id
LEFT JOIN (
  SELECT
    DATE(paid_at) AS ref_date,
    branch_id,
    refund_method_id,
    SUM(amount) AS total_refunded
  FROM refunds
  WHERE status = 'paid'
  GROUP BY DATE(paid_at), branch_id, refund_method_id
) r ON r.ref_date = DATE(p.payment_date)
   AND r.branch_id = p.branch_id
   AND r.refund_method_id = p.payment_method_id
GROUP BY DATE(p.payment_date), p.branch_id, b.name, p.payment_method_id, pm.name, pm.code, r.total_refunded;

-- 9. Append-Only Triggers for Financial Safety

DELIMITER $$

CREATE TRIGGER trg_payments_no_delete
BEFORE DELETE ON payments
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Rule 6 violation: payments table is append-only. DELETE is strictly prohibited.';
END$$

CREATE TRIGGER trg_invoices_immutable_issued
BEFORE UPDATE ON invoices
FOR EACH ROW
BEGIN
  IF OLD.status IN ('issued', 'paid', 'partially_paid') AND NEW.status != 'void' THEN
    IF OLD.subtotal != NEW.subtotal OR OLD.discount_amount != NEW.discount_amount OR OLD.tax_amount != NEW.tax_amount OR OLD.total_amount != NEW.total_amount THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Rule 6 violation: issued invoices are immutable. Void and re-issue required.';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_allocations_no_update
BEFORE UPDATE ON payment_allocations
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Rule 6 violation: payment_allocations are immutable. UPDATE is strictly prohibited.';
END$$

CREATE TRIGGER trg_allocations_no_delete
BEFORE DELETE ON payment_allocations
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Rule 6 violation: payment_allocations are immutable. DELETE is strictly prohibited.';
END$$

DELIMITER ;
