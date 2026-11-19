-- ==============================================================================
-- Migration 0005: Patients, Clinical Medical History & Duplicate Management
-- ==============================================================================
-- Tables:
--   - patients (Master demographic record, unique patient_code, normalized mobile)
--   - patient_duplicate_candidates (Human review queue for potential duplicate profiles)
--   - patient_medical_history (Sensitive clinical history, allergies, contraindications)
--   - patient_notes (Front desk, general, and clinical notes)
-- Foreign Key Reconnection:
--   - audit_events.patient_id -> patients.id [ON DELETE RESTRICT]
-- Engine: InnoDB
-- Charset: utf8mb4 COLLATE utf8mb4_unicode_ci
-- ==============================================================================

CREATE TABLE IF NOT EXISTS patients (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_code VARCHAR(50) NOT NULL UNIQUE,
  branch_id BIGINT UNSIGNED NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  full_name_bn VARCHAR(150) NULL,
  gender ENUM('male', 'female', 'other', 'prefer_not_to_say') NOT NULL,
  date_of_birth DATE NULL,
  approximate_age INT UNSIGNED NULL,
  blood_group ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-') NULL,
  primary_mobile VARCHAR(20) NOT NULL,
  primary_mobile_normalized VARCHAR(20) NOT NULL,
  secondary_mobile VARCHAR(20) NULL,
  email VARCHAR(191) NULL,
  address TEXT NULL,
  area VARCHAR(100) NULL,
  city VARCHAR(100) NOT NULL DEFAULT 'Dhaka',
  district VARCHAR(100) NOT NULL DEFAULT 'Dhaka',
  emergency_contact_name VARCHAR(150) NULL,
  emergency_contact_phone VARCHAR(50) NULL,
  emergency_contact_relation VARCHAR(50) NULL,
  preferred_language ENUM('bn', 'en') NOT NULL DEFAULT 'bn',
  acquisition_source ENUM('call', 'walk_in', 'referral', 'social_media', 'other') NOT NULL DEFAULT 'walk_in',
  referrer_id BIGINT UNSIGNED NULL COMMENT 'Nullable reference until Prompt 19',
  status ENUM('active', 'inactive', 'merged') NOT NULL DEFAULT 'active',
  merged_into_patient_id BIGINT UNSIGNED NULL,
  merged_at DATETIME(3) NULL,
  merged_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_patients_branch (branch_id),
  INDEX idx_patients_normalized_mobile (primary_mobile_normalized),
  INDEX idx_patients_status (status),
  INDEX idx_patients_created (created_at),
  FULLTEXT INDEX ft_patients_name (full_name),
  CONSTRAINT chk_patients_mobile CHECK (primary_mobile REGEXP '^\\+8801[3-9][0-9]{8}$'),
  CONSTRAINT chk_patients_no_self_merge CHECK (merged_into_patient_id IS NULL OR merged_into_patient_id != id),
  CONSTRAINT fk_patients_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_patients_merged_into FOREIGN KEY (merged_into_patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_patients_merged_by FOREIGN KEY (merged_by) REFERENCES staff_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS patient_duplicate_candidates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  primary_patient_id BIGINT UNSIGNED NOT NULL,
  duplicate_patient_id BIGINT UNSIGNED NOT NULL,
  match_confidence ENUM('high', 'medium', 'low') NOT NULL DEFAULT 'high',
  match_reasons JSON NOT NULL COMMENT 'e.g. ["same_mobile", "same_name_dob"]',
  status ENUM('pending', 'not_duplicate', 'confirmed_duplicate', 'merged') NOT NULL DEFAULT 'pending',
  detected_during ENUM('pre_registration_check', 'server_insert', 'batch_scan') NOT NULL DEFAULT 'server_insert',
  resolved_by BIGINT UNSIGNED NULL,
  resolved_at DATETIME(3) NULL,
  resolution_notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_pdc_status (status),
  UNIQUE KEY uq_duplicate_pair (primary_patient_id, duplicate_patient_id),
  CONSTRAINT fk_pdc_primary FOREIGN KEY (primary_patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_pdc_duplicate FOREIGN KEY (duplicate_patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_pdc_resolver FOREIGN KEY (resolved_by) REFERENCES staff_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS patient_medical_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id BIGINT UNSIGNED NOT NULL UNIQUE,
  allergies TEXT NULL,
  skin_type VARCHAR(50) NULL,
  current_medications TEXT NULL,
  chronic_conditions TEXT NULL,
  past_aesthetic_procedures TEXT NULL,
  contraindications TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  updated_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_pmh_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_pmh_created_by FOREIGN KEY (created_by) REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pmh_updated_by FOREIGN KEY (updated_by) REFERENCES staff_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS patient_notes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id BIGINT UNSIGNED NOT NULL,
  author_id BIGINT UNSIGNED NOT NULL,
  note_type ENUM('general', 'front_desk', 'call_center', 'clinical_alert') NOT NULL DEFAULT 'general',
  note_text TEXT NOT NULL,
  is_pinned TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_pn_patient (patient_id, created_at),
  CONSTRAINT fk_pn_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_pn_author FOREIGN KEY (author_id) REFERENCES staff_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Reconnect deferred foreign key in audit_events (from Migration 0004)
ALTER TABLE audit_events
  ADD CONSTRAINT fk_ae_patient FOREIGN KEY (patient_id) 
    REFERENCES patients(id) ON DELETE RESTRICT;
