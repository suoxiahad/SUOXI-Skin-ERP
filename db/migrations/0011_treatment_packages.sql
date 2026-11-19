-- ==============================================================================
-- MIGRATION 0011: TREATMENT PACKAGES & APPEND-ONLY SESSION LEDGER
-- ==============================================================================

-- 1. Catalog Packages
CREATE TABLE IF NOT EXISTS packages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  package_code VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(191) NOT NULL,
  name_bn VARCHAR(191) NULL,
  description TEXT NULL,
  price DECIMAL(12, 2) NOT NULL,
  validity_days INT UNSIGNED NOT NULL DEFAULT 180,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_packages_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Catalog Package Included Items / Services
CREATE TABLE IF NOT EXISTS package_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  package_id BIGINT UNSIGNED NOT NULL,
  service_id BIGINT UNSIGNED NOT NULL,
  session_count INT UNSIGNED NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pkg_items_package FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  CONSTRAINT fk_pkg_items_service FOREIGN KEY (service_id) REFERENCES treatment_services(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_package_service (package_id, service_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Patient Assigned Packages (Entitlement Snapshot)
CREATE TABLE IF NOT EXISTS patient_packages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  package_id BIGINT UNSIGNED NOT NULL,
  package_code VARCHAR(32) NOT NULL,
  package_name VARCHAR(191) NOT NULL,
  package_name_bn VARCHAR(191) NULL,
  purchase_date DATE NOT NULL,
  start_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  validity_days INT UNSIGNED NOT NULL,
  price_sold DECIMAL(12, 2) NOT NULL,
  sale_terms TEXT NULL,
  status ENUM('active', 'completed', 'expired', 'cancelled', 'renewed') NOT NULL DEFAULT 'active',
  assigned_by BIGINT UNSIGNED NOT NULL,
  renewed_from_id BIGINT UNSIGNED NULL,
  invoice_item_id BIGINT UNSIGNED NULL COMMENT 'Nullable hook for Prompt 12 billing integration',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_pt_pkg_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pt_pkg_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pt_pkg_package FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pt_pkg_assigned_by FOREIGN KEY (assigned_by) REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pt_pkg_renewed_from FOREIGN KEY (renewed_from_id) REFERENCES patient_packages(id) ON DELETE SET NULL,
  INDEX idx_pt_pkg_patient_status (patient_id, status),
  INDEX idx_pt_pkg_expiry (expiry_date, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Patient Package Items (Snapshot of Service Entitlements)
CREATE TABLE IF NOT EXISTS patient_package_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_package_id BIGINT UNSIGNED NOT NULL,
  service_id BIGINT UNSIGNED NOT NULL,
  service_name VARCHAR(191) NOT NULL,
  service_code VARCHAR(32) NOT NULL,
  initial_sessions INT UNSIGNED NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pt_pkg_items_pkg FOREIGN KEY (patient_package_id) REFERENCES patient_packages(id) ON DELETE CASCADE,
  CONSTRAINT fk_pt_pkg_items_service FOREIGN KEY (service_id) REFERENCES treatment_services(id) ON DELETE RESTRICT,
  UNIQUE KEY uq_pt_pkg_item_service (patient_package_id, service_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Package Session Ledger (APPEND-ONLY)
CREATE TABLE IF NOT EXISTS package_session_ledger (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_package_id BIGINT UNSIGNED NOT NULL,
  patient_package_item_id BIGINT UNSIGNED NOT NULL,
  treatment_session_id BIGINT UNSIGNED NULL,
  entry_type ENUM('deduction', 'reversal', 'adjustment') NOT NULL,
  change_quantity INT NOT NULL,
  cycle_no INT NOT NULL DEFAULT 1,
  original_ledger_id BIGINT UNSIGNED NULL,
  reason VARCHAR(255) NOT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ledger_pkg FOREIGN KEY (patient_package_id) REFERENCES patient_packages(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ledger_pkg_item FOREIGN KEY (patient_package_item_id) REFERENCES patient_package_items(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ledger_session FOREIGN KEY (treatment_session_id) REFERENCES treatment_sessions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ledger_original FOREIGN KEY (original_ledger_id) REFERENCES package_session_ledger(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ledger_creator FOREIGN KEY (created_by) REFERENCES staff_users(id) ON DELETE RESTRICT,
  -- Hard Rule 5: A treatment session can NEVER be deducted twice
  UNIQUE KEY uq_session_cycle_entry (treatment_session_id, cycle_no, entry_type),
  -- Each deduction can only be reversed once
  UNIQUE KEY uq_reversal_original (original_ledger_id),
  INDEX idx_ledger_pkg_item (patient_package_item_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Append-Only Triggers on package_session_ledger
DELIMITER //
CREATE TRIGGER trg_pkg_ledger_no_update
BEFORE UPDATE ON package_session_ledger
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'package_session_ledger is append-only: UPDATE operations are strictly prohibited (Engineering Rule 6)';
END;
//

CREATE TRIGGER trg_pkg_ledger_no_delete
BEFORE DELETE ON package_session_ledger
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'package_session_ledger is append-only: DELETE operations are strictly prohibited (Engineering Rule 6)';
END;
//
DELIMITER ;

-- 6. Package Cancellations
CREATE TABLE IF NOT EXISTS package_cancellations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_package_id BIGINT UNSIGNED NOT NULL UNIQUE,
  cancelled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_by BIGINT UNSIGNED NOT NULL,
  approved_by BIGINT UNSIGNED NOT NULL,
  reason TEXT NOT NULL,
  remaining_handling ENUM('forfeited', 'refunded', 'credited', 'transferred') NOT NULL,
  refund_reference VARCHAR(100) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pkg_cancel_pkg FOREIGN KEY (patient_package_id) REFERENCES patient_packages(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pkg_cancel_by FOREIGN KEY (cancelled_by) REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pkg_cancel_approved FOREIGN KEY (approved_by) REFERENCES staff_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. View: Patient Package Balances
CREATE OR REPLACE VIEW v_patient_package_balances AS
SELECT
  ppi.id AS patient_package_item_id,
  pp.id AS patient_package_id,
  pp.patient_id,
  pp.package_id,
  pp.package_code,
  pp.package_name,
  pp.status AS package_status,
  pp.start_date,
  pp.expiry_date,
  DATEDIFF(pp.expiry_date, CURDATE()) AS days_to_expiry,
  ppi.service_id,
  ppi.service_code,
  ppi.service_name,
  ppi.initial_sessions AS total_sessions,
  COALESCE(SUM(CASE WHEN psl.entry_type = 'deduction' THEN ABS(psl.change_quantity) WHEN psl.entry_type = 'reversal' THEN -psl.change_quantity ELSE 0 END), 0) AS completed_sessions,
  (ppi.initial_sessions - COALESCE(SUM(CASE WHEN psl.entry_type = 'deduction' THEN ABS(psl.change_quantity) WHEN psl.entry_type = 'reversal' THEN -psl.change_quantity ELSE 0 END), 0)) AS remaining_sessions
FROM patient_packages pp
JOIN patient_package_items ppi ON pp.id = ppi.patient_package_id
LEFT JOIN package_session_ledger psl ON ppi.id = psl.patient_package_item_id
GROUP BY ppi.id, pp.id, pp.patient_id, pp.package_id, pp.package_code, pp.package_name, pp.status, pp.start_date, pp.expiry_date, ppi.service_id, ppi.service_code, ppi.service_name, ppi.initial_sessions;

-- 8. Extend v_patient_timeline with Treatment Package Events
CREATE OR REPLACE VIEW v_patient_timeline AS
  -- 1. Patient Registration Event
  SELECT 
    p.id AS patient_id,
    'patient_registered' AS event_type,
    p.created_at AS event_at,
    CONCAT('Patient profile registered at branch #', p.branch_id, ' (', p.patient_code, ')') AS summary,
    'patients' AS ref_type,
    p.id AS ref_id
  FROM patients p

  UNION ALL

  -- 2. Patient Merged Event
  SELECT 
    p.id AS patient_id,
    'patient_merged' AS event_type,
    p.merged_at AS event_at,
    CONCAT('Profile merged into primary record #', p.merged_into_patient_id) AS summary,
    'patients' AS ref_type,
    p.merged_into_patient_id AS ref_id
  FROM patients p
  WHERE p.status = 'merged' AND p.merged_at IS NOT NULL

  UNION ALL

  -- 3. Patient Notes
  SELECT 
    pn.patient_id AS patient_id,
    CONCAT('note_', pn.note_type) AS event_type,
    pn.created_at AS event_at,
    pn.note_text AS summary,
    'patient_notes' AS ref_type,
    pn.id AS ref_id
  FROM patient_notes pn

  UNION ALL

  -- 4. Clinical Medical History Updates
  SELECT 
    pmh.patient_id AS patient_id,
    'medical_history_updated' AS event_type,
    pmh.updated_at AS event_at,
    'Clinical medical history and contraindications updated' AS summary,
    'patient_medical_history' AS ref_type,
    pmh.id AS ref_id
  FROM patient_medical_history pmh

  UNION ALL

  -- 5. Categorized Medical Entries
  SELECT 
    pme.patient_id AS patient_id,
    CONCAT('clinical_', pme.category) AS event_type,
    pme.created_at AS event_at,
    CONCAT(UPPER(SUBSTRING(pme.category, 1, 1)), SUBSTRING(pme.category, 2), ': ', pme.title) AS summary,
    'patient_medical_entries' AS ref_type,
    pme.id AS ref_id
  FROM patient_medical_entries pme

  UNION ALL

  -- 6. Appointment Events
  SELECT
    apt.patient_id AS patient_id,
    CONCAT('appointment_', apt.status) AS event_type,
    apt.appointment_date AS event_at,
    CONCAT('Appointment #', apt.appointment_code, ' (', apt.status, ') with provider #', apt.provider_id) AS summary,
    'appointments' AS ref_type,
    apt.id AS ref_id
  FROM appointments apt

  UNION ALL

  -- 7. Treatment Session Completed Events
  SELECT
    ts.patient_id AS patient_id,
    'session_completed' AS event_type,
    ts.completed_at AS event_at,
    CONCAT('Treatment session #', ts.session_code, ' completed (Session ', ts.session_no, ' of ', ts.total_sessions, ')') AS summary,
    'treatment_sessions' AS ref_type,
    ts.id AS ref_id
  FROM treatment_sessions ts
  WHERE ts.status = 'completed' AND ts.completed_at IS NOT NULL

  UNION ALL

  -- 8. Patient Package Assignment
  SELECT
    pp.patient_id AS patient_id,
    'package_assigned' AS event_type,
    pp.created_at AS event_at,
    CONCAT('Assigned treatment package ', pp.package_name, ' (', pp.package_code, ', ৳ ', pp.price_sold, ', valid to ', pp.expiry_date, ')') AS summary,
    'patient_packages' AS ref_type,
    pp.id AS ref_id
  FROM patient_packages pp

  UNION ALL

  -- 9. Patient Package Cancellation
  SELECT
    pp.patient_id AS patient_id,
    'package_cancelled' AS event_type,
    pc.cancelled_at AS event_at,
    CONCAT('Package ', pp.package_name, ' cancelled: ', pc.reason, ' (Remaining: ', pc.remaining_handling, ')') AS summary,
    'package_cancellations' AS ref_type,
    pc.id AS ref_id
  FROM package_cancellations pc
  JOIN patient_packages pp ON pc.patient_package_id = pp.id;

-- Down Migration Reference:
-- DROP VIEW IF EXISTS v_patient_package_balances;
-- DROP TABLE IF EXISTS package_cancellations;
-- DROP TRIGGER IF EXISTS trg_pkg_ledger_no_update;
-- DROP TRIGGER IF EXISTS trg_pkg_ledger_no_delete;
-- DROP TABLE IF EXISTS package_session_ledger;
-- DROP TABLE IF EXISTS patient_package_items;
-- DROP TABLE IF EXISTS patient_packages;
-- DROP TABLE IF EXISTS package_items;
-- DROP TABLE IF EXISTS packages;
