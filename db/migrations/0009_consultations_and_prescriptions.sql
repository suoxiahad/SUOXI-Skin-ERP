-- ==============================================================================
-- Migration 0009: Consultations, Prescriptions, Guidance Snapshots & Consent Records
-- Engine: InnoDB | Charset: utf8mb4 COLLATE utf8mb4_unicode_ci
-- ==============================================================================

-- 1. Consultations
CREATE TABLE IF NOT EXISTS consultations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  consultation_code VARCHAR(30) NOT NULL UNIQUE,
  appointment_id BIGINT UNSIGNED NULL,
  patient_id BIGINT UNSIGNED NOT NULL,
  doctor_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  chief_complaint TEXT NULL,
  assessment TEXT NULL,
  clinical_notes TEXT NULL,
  recommended_service_id BIGINT UNSIGNED NULL,
  status ENUM('draft', 'completed') NOT NULL DEFAULT 'draft',
  version INT UNSIGNED NOT NULL DEFAULT 1,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_cns_patient (patient_id, created_at),
  INDEX idx_cns_doctor (doctor_id, status),
  INDEX idx_cns_appointment (appointment_id),
  CONSTRAINT fk_cns_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cns_doctor FOREIGN KEY (doctor_id)
    REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cns_branch FOREIGN KEY (branch_id)
    REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cns_service FOREIGN KEY (recommended_service_id)
    REFERENCES treatment_services(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Treatment Plans
CREATE TABLE IF NOT EXISTS treatment_plans (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  plan_code VARCHAR(30) NOT NULL UNIQUE,
  consultation_id BIGINT UNSIGNED NULL,
  patient_id BIGINT UNSIGNED NOT NULL,
  service_id BIGINT UNSIGNED NOT NULL,
  doctor_id BIGINT UNSIGNED NOT NULL,
  planned_sessions SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  completed_sessions SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  expected_end_date DATE NULL,
  notes TEXT NULL,
  status ENUM('draft', 'active', 'completed', 'cancelled') NOT NULL DEFAULT 'draft',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_tp_patient (patient_id, status),
  CONSTRAINT fk_tp_consultation FOREIGN KEY (consultation_id)
    REFERENCES consultations(id) ON DELETE SET NULL,
  CONSTRAINT fk_tp_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tp_service FOREIGN KEY (service_id)
    REFERENCES treatment_services(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tp_doctor FOREIGN KEY (doctor_id)
    REFERENCES staff_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Prescriptions
CREATE TABLE IF NOT EXISTS prescriptions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  prescription_code VARCHAR(30) NOT NULL UNIQUE,
  consultation_id BIGINT UNSIGNED NULL,
  patient_id BIGINT UNSIGNED NOT NULL,
  doctor_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  previous_version_id BIGINT UNSIGNED NULL UNIQUE,
  version_number INT UNSIGNED NOT NULL DEFAULT 1,
  diagnosis TEXT NOT NULL,
  advice TEXT NULL,
  followup_advice TEXT NULL,
  next_session_date DATE NULL,
  language ENUM('en', 'bn', 'both') NOT NULL DEFAULT 'both',
  suggest_food TINYINT(1) NOT NULL DEFAULT 0,
  service_id BIGINT UNSIGNED NULL,
  guidance_id BIGINT UNSIGNED NULL,
  status ENUM('draft', 'finalized', 'superseded', 'void') NOT NULL DEFAULT 'draft',
  void_reason TEXT NULL,
  superseded_reason TEXT NULL,
  finalized_at DATETIME(3) NULL,
  finalized_by BIGINT UNSIGNED NULL,
  published_to_portal TINYINT(1) NOT NULL DEFAULT 0,
  pdf_file_id BIGINT UNSIGNED NULL,
  pdf_sha256 CHAR(64) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_rx_patient (patient_id, status),
  INDEX idx_rx_doctor (doctor_id, status),
  INDEX idx_rx_code (prescription_code),
  CONSTRAINT chk_rx_finalized CHECK (
    status != 'finalized' OR (finalized_at IS NOT NULL AND finalized_by IS NOT NULL)
  ),
  CONSTRAINT chk_rx_portal CHECK (
    published_to_portal = 0 OR status = 'finalized'
  ),
  CONSTRAINT fk_rx_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_rx_doctor FOREIGN KEY (doctor_id)
    REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_rx_finalized_by FOREIGN KEY (finalized_by)
    REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_rx_branch FOREIGN KEY (branch_id)
    REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_rx_prev FOREIGN KEY (previous_version_id)
    REFERENCES prescriptions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_rx_service FOREIGN KEY (service_id)
    REFERENCES treatment_services(id) ON DELETE SET NULL,
  CONSTRAINT fk_rx_guidance FOREIGN KEY (guidance_id)
    REFERENCES food_lifestyle_guidance(id) ON DELETE SET NULL,
  CONSTRAINT fk_rx_pdf FOREIGN KEY (pdf_file_id)
    REFERENCES files(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Prescription Items
CREATE TABLE IF NOT EXISTS prescription_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  prescription_id BIGINT UNSIGNED NOT NULL,
  item_name VARCHAR(200) NOT NULL,
  item_name_bn VARCHAR(200) NULL,
  inventory_product_id BIGINT UNSIGNED NULL,
  strength VARCHAR(50) NULL,
  dosage VARCHAR(50) NULL,
  frequency VARCHAR(100) NULL,
  frequency_bn VARCHAR(100) NULL,
  duration VARCHAR(50) NULL,
  route VARCHAR(50) NULL,
  instructions TEXT NULL,
  instructions_bn TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_rxi_prescription (prescription_id, sort_order),
  CONSTRAINT fk_rxi_prescription FOREIGN KEY (prescription_id)
    REFERENCES prescriptions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Prescription Guidance Snapshots (Frozen copy of approved guidance)
CREATE TABLE IF NOT EXISTS prescription_guidance_snapshots (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  prescription_id BIGINT UNSIGNED NOT NULL UNIQUE,
  source_guidance_id BIGINT UNSIGNED NOT NULL,
  service_id BIGINT UNSIGNED NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  title_bn VARCHAR(200) NULL,
  approved_by_doctor_name VARCHAR(150) NOT NULL,
  approved_by_bmdc_reg VARCHAR(50) NULL,
  approved_at DATETIME(3) NOT NULL,
  snapshot_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_pgs_prescription FOREIGN KEY (prescription_id)
    REFERENCES prescriptions(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pgs_guidance FOREIGN KEY (source_guidance_id)
    REFERENCES food_lifestyle_guidance(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pgs_service FOREIGN KEY (service_id)
    REFERENCES treatment_services(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Prescription Guidance Snapshot Items
CREATE TABLE IF NOT EXISTS prescription_guidance_snapshot_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  snapshot_id BIGINT UNSIGNED NOT NULL,
  section ENUM('recommended_foods', 'foods_to_avoid', 'lifestyle_habits', 'skincare_routine', 'general_advice') NOT NULL,
  content_en TEXT NULL,
  content_bn TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_pgsi_snapshot (snapshot_id, sort_order),
  CONSTRAINT fk_pgsi_snapshot FOREIGN KEY (snapshot_id)
    REFERENCES prescription_guidance_snapshots(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Consent Records
CREATE TABLE IF NOT EXISTS consent_records (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  consent_code VARCHAR(30) NOT NULL UNIQUE,
  patient_id BIGINT UNSIGNED NOT NULL,
  consultation_id BIGINT UNSIGNED NULL,
  service_id BIGINT UNSIGNED NOT NULL,
  doctor_id BIGINT UNSIGNED NOT NULL,
  consent_type ENUM('treatment', 'procedure', 'photography', 'general') NOT NULL DEFAULT 'treatment',
  consent_text TEXT NOT NULL,
  consent_text_bn TEXT NULL,
  is_signed TINYINT(1) NOT NULL DEFAULT 0,
  signed_at DATETIME(3) NULL,
  witness_name VARCHAR(100) NULL,
  file_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_cr_patient (patient_id, created_at),
  CONSTRAINT fk_cr_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cr_consultation FOREIGN KEY (consultation_id)
    REFERENCES consultations(id) ON DELETE SET NULL,
  CONSTRAINT fk_cr_service FOREIGN KEY (service_id)
    REFERENCES treatment_services(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cr_doctor FOREIGN KEY (doctor_id)
    REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cr_file FOREIGN KEY (file_id)
    REFERENCES files(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Sequences Registration
INSERT IGNORE INTO sequence_counters (sequence_name, current_val, prefix, padding) VALUES
  ('RX', 0, 'RX-', 6),
  ('CONSULTATION', 0, 'CNS-', 6),
  ('PLAN', 0, 'PLN-', 6),
  ('CONSENT', 0, 'CNSNT-', 6);

-- 9. Immutability Triggers
DELIMITER $$

-- Trigger: Prevent updates to finalized prescriptions except allowed state transitions
CREATE TRIGGER trg_prevent_finalized_prescription_mutation
BEFORE UPDATE ON prescriptions
FOR EACH ROW
BEGIN
  IF OLD.status IN ('finalized', 'superseded', 'void') THEN
    -- Allowed transition 1: finalized -> superseded (when a new version is created)
    -- Allowed transition 2: finalized -> void (with void_reason)
    -- Allowed transition 3: toggle published_to_portal
    -- Allowed transition 4: attaching generated pdf_file_id and pdf_sha256
    IF (OLD.status = 'finalized' AND NEW.status IN ('superseded', 'void'))
       OR (OLD.status = 'finalized' AND NEW.status = 'finalized' AND OLD.diagnosis = NEW.diagnosis 
           AND OLD.advice <=> NEW.advice AND OLD.followup_advice <=> NEW.followup_advice 
           AND OLD.next_session_date <=> NEW.next_session_date) THEN
      -- Allowed modification
      SET NEW.version_number = OLD.version_number;
    ELSE
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Finalized clinical prescriptions are immutable. A correction requires creating a new version.';
    END IF;
  END IF;
END$$

-- Trigger: Forbid hard-deleting prescriptions
CREATE TRIGGER trg_prevent_finalized_prescription_delete
BEFORE DELETE ON prescriptions
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Prescription records are immutable clinical documents and cannot be deleted.';
END$$

-- Trigger: Forbid modifying items of a finalized prescription
CREATE TRIGGER trg_prevent_prescription_items_mutation
BEFORE UPDATE ON prescription_items
FOR EACH ROW
BEGIN
  DECLARE p_status VARCHAR(20);
  SELECT status INTO p_status FROM prescriptions WHERE id = OLD.prescription_id;
  IF p_status IN ('finalized', 'superseded', 'void') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Prescription items for finalized prescriptions cannot be modified.';
  END IF;
END$$

-- Trigger: Forbid deleting items of a finalized prescription
CREATE TRIGGER trg_prevent_prescription_items_delete
BEFORE DELETE ON prescription_items
FOR EACH ROW
BEGIN
  DECLARE p_status VARCHAR(20);
  SELECT status INTO p_status FROM prescriptions WHERE id = OLD.prescription_id;
  IF p_status IN ('finalized', 'superseded', 'void') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Prescription items for finalized prescriptions cannot be deleted.';
  END IF;
END$$

-- Trigger: Forbid mutating guidance snapshots
CREATE TRIGGER trg_prevent_guidance_snapshot_mutation
BEFORE UPDATE ON prescription_guidance_snapshots
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Prescription guidance snapshots are frozen clinical records and cannot be altered.';
END$$

-- Trigger: Forbid deleting guidance snapshots
CREATE TRIGGER trg_prevent_guidance_snapshot_delete
BEFORE DELETE ON prescription_guidance_snapshots
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'Prescription guidance snapshots cannot be deleted.';
END$$

DELIMITER ;

-- 10. Extended Unified Patient Timeline View
CREATE OR REPLACE VIEW v_patient_timeline AS
  -- Patient Creation
  SELECT
    p.id AS patient_id,
    'patient_created' AS event_type,
    p.created_at AS event_at,
    CONCAT('Patient registered: ', p.full_name, ' (', p.patient_code, ')') AS summary,
    'patient' AS ref_type,
    p.id AS ref_id
  FROM patients p

  UNION ALL

  -- Patient Notes
  SELECT
    pn.patient_id,
    CONCAT('note_', pn.note_type) AS event_type,
    pn.created_at AS event_at,
    pn.note_text AS summary,
    'patient_note' AS ref_type,
    pn.id AS ref_id
  FROM patient_notes pn

  UNION ALL

  -- Appointments
  SELECT
    apt.patient_id,
    CONCAT('appointment_', LOWER(apt.status)) AS event_type,
    apt.appointment_date AS event_at,
    CONCAT('Appointment (', apt.appointment_code, ') at ', apt.start_time, ' - ', apt.status) AS summary,
    'appointment' AS ref_type,
    apt.id AS ref_id
  FROM appointments apt

  UNION ALL

  -- Consultations Completed
  SELECT
    cns.patient_id,
    'consultation_completed' AS event_type,
    COALESCE(cns.completed_at, cns.updated_at) AS event_at,
    CONCAT('Consultation completed (', cns.consultation_code, '): ', COALESCE(cns.chief_complaint, 'Routine checkup')) AS summary,
    'consultation' AS ref_type,
    cns.id AS ref_id
  FROM consultations cns
  WHERE cns.status = 'completed'

  UNION ALL

  -- Prescriptions Finalized
  SELECT
    rx.patient_id,
    'prescription_finalized' AS event_type,
    COALESCE(rx.finalized_at, rx.updated_at) AS event_at,
    CONCAT('Prescription finalized (', rx.prescription_code, ' v', rx.version_number, '): ', rx.diagnosis) AS summary,
    'prescription' AS ref_type,
    rx.id AS ref_id
  FROM prescriptions rx
  WHERE rx.status = 'finalized'

  UNION ALL

  -- Prescriptions Superseded (Correction)
  SELECT
    rx.patient_id,
    'prescription_superseded' AS event_type,
    rx.updated_at AS event_at,
    CONCAT('Prescription superseded by correction (', rx.prescription_code, '): ', COALESCE(rx.superseded_reason, 'Corrected')) AS summary,
    'prescription' AS ref_type,
    rx.id AS ref_id
  FROM prescriptions rx
  WHERE rx.status = 'superseded'

  UNION ALL

  -- Prescriptions Voided
  SELECT
    rx.patient_id,
    'prescription_voided' AS event_type,
    rx.updated_at AS event_at,
    CONCAT('Prescription voided (', rx.prescription_code, '): ', COALESCE(rx.void_reason, 'Voided')) AS summary,
    'prescription' AS ref_type,
    rx.id AS ref_id
  FROM prescriptions rx
  WHERE rx.status = 'void'

  UNION ALL

  -- Consents Signed
  SELECT
    cr.patient_id,
    'consent_signed' AS event_type,
    COALESCE(cr.signed_at, cr.created_at) AS event_at,
    CONCAT('Informed consent signed (', cr.consent_code, ') for treatment') AS summary,
    'consent_record' AS ref_type,
    cr.id AS ref_id
  FROM consent_records cr
  WHERE cr.is_signed = 1;
