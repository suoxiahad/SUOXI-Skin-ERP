-- ==============================================================================
-- MIGRATION 0010: TREATMENT SESSIONS, PHOTOS, CONSUMABLES & NEXT-SESSION LINK
-- ==============================================================================

-- 1. Treatment Sessions
CREATE TABLE IF NOT EXISTS treatment_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_code VARCHAR(30) NOT NULL UNIQUE,
  patient_id BIGINT UNSIGNED NOT NULL,
  plan_id BIGINT UNSIGNED NULL,
  service_id BIGINT UNSIGNED NOT NULL,
  appointment_id BIGINT UNSIGNED NOT NULL UNIQUE,
  doctor_id BIGINT UNSIGNED NOT NULL,
  therapist_id BIGINT UNSIGNED NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  resource_id BIGINT UNSIGNED NULL,
  session_no SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  total_sessions SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  status ENUM('planned', 'in_progress', 'completed', 'cancelled', 'missed') NOT NULL DEFAULT 'planned',
  started_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  completed_by BIGINT UNSIGNED NULL,
  outcome_notes TEXT NULL,
  treatment_notes TEXT NULL,
  aftercare_instructions TEXT NULL,
  publish_aftercare_to_portal TINYINT(1) NOT NULL DEFAULT 0,
  package_id BIGINT UNSIGNED NULL COMMENT 'Hook for Prompt 11 package deduction',
  package_session_deducted TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_treatment_session_plan_no (plan_id, session_no),
  INDEX idx_session_patient (patient_id, status),
  INDEX idx_session_doctor (doctor_id, status),
  INDEX idx_session_therapist (therapist_id, status),
  INDEX idx_session_branch_date (branch_id, created_at),
  CONSTRAINT fk_ts_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ts_plan FOREIGN KEY (plan_id)
    REFERENCES treatment_plans(id) ON DELETE SET NULL,
  CONSTRAINT fk_ts_service FOREIGN KEY (service_id)
    REFERENCES treatment_services(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ts_appointment FOREIGN KEY (appointment_id)
    REFERENCES appointments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ts_doctor FOREIGN KEY (doctor_id)
    REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ts_therapist FOREIGN KEY (therapist_id)
    REFERENCES staff_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ts_completed_by FOREIGN KEY (completed_by)
    REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ts_branch FOREIGN KEY (branch_id)
    REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ts_resource FOREIGN KEY (resource_id)
    REFERENCES resources(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Circular Foreign Key: appointments.origin_session_id -> treatment_sessions.id
ALTER TABLE appointments
  ADD CONSTRAINT fk_appointments_origin_session
  FOREIGN KEY (origin_session_id) REFERENCES treatment_sessions(id)
  ON DELETE RESTRICT;

-- 3. Treatment Clinical Photos (Private, Signed-URL only)
CREATE TABLE IF NOT EXISTS treatment_photos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  patient_id BIGINT UNSIGNED NOT NULL,
  file_id BIGINT UNSIGNED NOT NULL,
  photo_type ENUM('before', 'after', 'progress') NOT NULL,
  body_site VARCHAR(100) NULL,
  taken_at DATETIME(3) NOT NULL,
  taken_by BIGINT UNSIGNED NOT NULL,
  is_visible_to_patient TINYINT(1) NOT NULL DEFAULT 0,
  clinical_notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_tp_session (session_id),
  INDEX idx_tp_patient (patient_id, is_visible_to_patient),
  CONSTRAINT fk_tp_session FOREIGN KEY (session_id)
    REFERENCES treatment_sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_tp_patient_record FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tp_file FOREIGN KEY (file_id)
    REFERENCES files(id) ON DELETE RESTRICT,
  CONSTRAINT fk_tp_taken_by FOREIGN KEY (taken_by)
    REFERENCES staff_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Session Consumables Used
CREATE TABLE IF NOT EXISTS session_consumables (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NULL COMMENT 'Linked to inventory_products in Prompt 13',
  product_name VARCHAR(191) NOT NULL,
  batch_number VARCHAR(100) NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1.00,
  unit VARCHAR(50) NOT NULL DEFAULT 'pcs',
  notes VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_sc_session (session_id),
  CONSTRAINT fk_sc_session FOREIGN KEY (session_id)
    REFERENCES treatment_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Down Migration Reference:
-- ALTER TABLE appointments DROP FOREIGN KEY fk_appointments_origin_session;
-- DROP TABLE IF EXISTS session_consumables;
-- DROP TABLE IF EXISTS treatment_photos;
-- DROP TABLE IF EXISTS treatment_sessions;
