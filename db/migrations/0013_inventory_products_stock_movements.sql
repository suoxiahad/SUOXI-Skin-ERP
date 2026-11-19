-- ==============================================================================
-- Migration 0013: Inventory — Categories, Products, Batches, Movements & Views
-- Engine: InnoDB | Charset: utf8mb4 COLLATE utf8mb4_unicode_ci
-- ==============================================================================

-- 1. Product Categories
CREATE TABLE IF NOT EXISTS product_categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_code VARCHAR(32) NOT NULL,
  name VARCHAR(150) NOT NULL,
  name_bn VARCHAR(150) NULL,
  description TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_prod_cat_code (category_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Products (Consumables & Retail Skincare)
CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  name_bn VARCHAR(200) NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  unit VARCHAR(32) NOT NULL COMMENT 'ml, vial, tube, bottle, pcs, syringe, box',
  cost_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  sale_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  reorder_level INT NOT NULL DEFAULT 10,
  allow_negative_stock BOOLEAN NOT NULL DEFAULT FALSE,
  track_batches BOOLEAN NOT NULL DEFAULT TRUE,
  track_expiry BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_products_sku (sku),
  INDEX idx_products_category (category_id),
  CONSTRAINT fk_products_category FOREIGN KEY (category_id)
    REFERENCES product_categories(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  supplier_code VARCHAR(32) NOT NULL,
  name VARCHAR(200) NOT NULL,
  name_bn VARCHAR(200) NULL,
  contact_person VARCHAR(150) NULL,
  phone VARCHAR(32) NOT NULL,
  email VARCHAR(150) NULL,
  address TEXT NULL,
  payment_terms VARCHAR(100) NULL DEFAULT 'Net 30' COMMENT 'Cash on Delivery, Net 15, Net 30, Advance',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_suppliers_code (supplier_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Purchases (Orders & Receipts)
CREATE TABLE IF NOT EXISTS purchases (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_no VARCHAR(32) NOT NULL,
  supplier_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  purchase_date DATE NOT NULL,
  supplier_invoice_no VARCHAR(100) NULL,
  status ENUM('draft', 'ordered', 'received', 'cancelled') NOT NULL DEFAULT 'draft',
  total_cost DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  document_file_id BIGINT UNSIGNED NULL,
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  received_at DATETIME NULL,
  received_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_purchases_no (purchase_no),
  INDEX idx_purchases_supplier (supplier_id),
  INDEX idx_purchases_branch (branch_id),
  CONSTRAINT fk_purchases_supplier FOREIGN KEY (supplier_id)
    REFERENCES suppliers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_purchases_branch FOREIGN KEY (branch_id)
    REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_purchases_doc FOREIGN KEY (document_file_id)
    REFERENCES files(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Purchase Items
CREATE TABLE IF NOT EXISTS purchase_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  unit_cost DECIMAL(12,2) NOT NULL,
  total_cost DECIMAL(12,2) NOT NULL,
  batch_no VARCHAR(100) NULL,
  expiry_date DATE NULL,
  received_quantity DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_purchase_items_purchase (purchase_id),
  INDEX idx_purchase_items_product (product_id),
  CONSTRAINT fk_purchase_items_purchase FOREIGN KEY (purchase_id)
    REFERENCES purchases(id) ON DELETE CASCADE,
  CONSTRAINT fk_purchase_items_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Product Batches
CREATE TABLE IF NOT EXISTS product_batches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  batch_no VARCHAR(100) NOT NULL,
  expiry_date DATE NOT NULL,
  cost_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  initial_quantity DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_product_branch_batch (product_id, branch_id, batch_no),
  INDEX idx_product_batches_expiry (expiry_date),
  CONSTRAINT fk_product_batches_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON DELETE RESTRICT,
  CONSTRAINT fk_product_batches_branch FOREIGN KEY (branch_id)
    REFERENCES branches(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Stock Movements (Append-Only Ledger)
CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  movement_code VARCHAR(32) NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  batch_id BIGINT UNSIGNED NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  movement_type ENUM(
    'purchase_receipt',
    'session_usage',
    'adjustment',
    'wastage',
    'reversal',
    'transfer_in',
    'transfer_out'
  ) NOT NULL,
  quantity_change DECIMAL(10,2) NOT NULL COMMENT 'Signed: + for inflows, - for outflows',
  unit_cost DECIMAL(12,2) NULL,
  reference_type ENUM('purchase', 'session_consumable', 'manual_adjustment', 'prescription', 'none') NOT NULL DEFAULT 'none',
  reference_id VARCHAR(64) NULL,
  original_movement_id BIGINT UNSIGNED NULL COMMENT 'For reversal movements',
  reason VARCHAR(500) NULL,
  requested_by BIGINT UNSIGNED NOT NULL,
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_stock_movements_code (movement_code),
  INDEX idx_stock_mov_product (product_id),
  INDEX idx_stock_mov_batch (batch_id),
  INDEX idx_stock_mov_branch (branch_id),
  INDEX idx_stock_mov_ref (reference_type, reference_id),
  CONSTRAINT fk_stock_mov_product FOREIGN KEY (product_id)
    REFERENCES products(id) ON DELETE RESTRICT,
  CONSTRAINT fk_stock_mov_batch FOREIGN KEY (batch_id)
    REFERENCES product_batches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_stock_mov_branch FOREIGN KEY (branch_id)
    REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_stock_mov_orig FOREIGN KEY (original_movement_id)
    REFERENCES stock_movements(id) ON DELETE RESTRICT,
  CONSTRAINT chk_purchase_receipt_sign CHECK (
    movement_type != 'purchase_receipt' OR quantity_change > 0
  ),
  CONSTRAINT chk_session_usage_sign CHECK (
    movement_type != 'session_usage' OR quantity_change < 0
  ),
  CONSTRAINT chk_wastage_sign CHECK (
    movement_type != 'wastage' OR quantity_change < 0
  ),
  CONSTRAINT chk_adjustment_sign CHECK (
    movement_type != 'adjustment' OR quantity_change != 0
  ),
  CONSTRAINT chk_reversal_sign CHECK (
    movement_type != 'reversal' OR quantity_change != 0
  ),
  CONSTRAINT chk_supervised_movements_reason CHECK (
    movement_type NOT IN ('adjustment', 'wastage', 'reversal') OR 
    (reason IS NOT NULL AND approved_by IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Immutable Append-Only Triggers for stock_movements
DELIMITER $$
CREATE TRIGGER trg_stock_movements_no_update
BEFORE UPDATE ON stock_movements
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'Rule 6 Violation: stock_movements is append-only. UPDATE operations are forbidden.';
END$$

CREATE TRIGGER trg_stock_movements_no_delete
BEFORE DELETE ON stock_movements
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
  SET MESSAGE_TEXT = 'Rule 6 Violation: stock_movements is append-only. DELETE operations are forbidden.';
END$$
DELIMITER ;

-- 9. Foreign Key Links from Prompts 9 & 10
ALTER TABLE session_consumables
  ADD CONSTRAINT fk_session_consumables_product
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

ALTER TABLE prescription_items
  ADD CONSTRAINT fk_prescription_items_product
  FOREIGN KEY (inventory_product_id) REFERENCES products(id) ON DELETE RESTRICT;

-- 10. Derived Stock Views

-- View: v_stock_on_hand
CREATE OR REPLACE VIEW v_stock_on_hand AS
SELECT 
  p.id AS product_id,
  p.sku,
  p.name AS product_name,
  p.name_bn AS product_name_bn,
  p.category_id,
  c.name AS category_name,
  p.unit,
  p.cost_price,
  p.sale_price,
  p.reorder_level,
  p.allow_negative_stock,
  p.track_batches,
  p.track_expiry,
  sm.branch_id,
  COALESCE(SUM(sm.quantity_change), 0.00) AS stock_on_hand,
  MAX(sm.created_at) AS last_movement_at
FROM products p
JOIN product_categories c ON c.id = p.category_id
LEFT JOIN stock_movements sm ON sm.product_id = p.id
GROUP BY p.id, p.sku, p.name, p.name_bn, p.category_id, c.name, p.unit, p.cost_price, p.sale_price, p.reorder_level, p.allow_negative_stock, p.track_batches, p.track_expiry, sm.branch_id;

-- View: v_low_stock
CREATE OR REPLACE VIEW v_low_stock AS
SELECT 
  v.*,
  (v.reorder_level - v.stock_on_hand) AS deficit_quantity
FROM v_stock_on_hand v
WHERE v.stock_on_hand <= v.reorder_level;

-- View: v_expiring_batches
CREATE OR REPLACE VIEW v_expiring_batches AS
SELECT 
  pb.id AS batch_id,
  pb.product_id,
  p.sku,
  p.name AS product_name,
  pb.branch_id,
  pb.batch_no,
  pb.expiry_date,
  DATEDIFF(pb.expiry_date, CURRENT_DATE) AS days_to_expiry,
  COALESCE(SUM(sm.quantity_change), 0.00) AS batch_stock_on_hand,
  CASE 
    WHEN DATEDIFF(pb.expiry_date, CURRENT_DATE) < 0 THEN 'expired'
    WHEN DATEDIFF(pb.expiry_date, CURRENT_DATE) <= 30 THEN 'critical'
    WHEN DATEDIFF(pb.expiry_date, CURRENT_DATE) <= 90 THEN 'warning'
    ELSE 'good'
  END AS expiry_status
FROM product_batches pb
JOIN products p ON p.id = pb.product_id
LEFT JOIN stock_movements sm ON sm.batch_id = pb.id
GROUP BY pb.id, pb.product_id, p.sku, p.name, pb.branch_id, pb.batch_no, pb.expiry_date;
