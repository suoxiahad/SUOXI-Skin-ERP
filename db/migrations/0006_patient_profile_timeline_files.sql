-- ==============================================================================
-- Migration 0006: Patient Profile Extensions, Timeline View & Patient Files
-- ==============================================================================
-- Engine: InnoDB
-- Charset: utf8mb4 COLLATE utf8mb4_unicode_ci
-- ==============================================================================

-- 1. Patient Files Association Table
CREATE TABLE IF NOT EXISTS patient_files (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id BIGINT UNSIGNED NOT NULL,
  file_id BIGINT UNSIGNED NOT NULL,
  file_category ENUM(
    'lab_report',
    'imaging',
    'referral_letter',
    'id_proof',
    'before_photo',
    'after_photo',
    'progress_photo',
    'general'
  ) NOT NULL DEFAULT 'general',
  title VARCHAR(150) NOT NULL,
  is_visible_to_patient TINYINT(1) NOT NULL DEFAULT 0,
  taken_at DATE NULL,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  INDEX idx_pf_patient (patient_id, file_category),
  INDEX idx_pf_file (file_id),
  INDEX idx_pf_visible (is_visible_to_patient),
  CONSTRAINT fk_pf_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_pf_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pf_uploader FOREIGN KEY (uploaded_by) REFERENCES staff_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Categorized Clinical Medical Entries (Grouped Cards by Category)
CREATE TABLE IF NOT EXISTS patient_medical_entries (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id BIGINT UNSIGNED NOT NULL,
  category ENUM(
    'allergy',
    'chronic_condition',
    'current_medication',
    'past_surgery',
    'family_history',
    'skin_history',
    'lifestyle',
    'pregnancy',
    'other'
  ) NOT NULL,
  title VARCHAR(150) NOT NULL,
  details TEXT NULL,
  severity ENUM('mild', 'moderate', 'severe', 'life_threatening') NULL,
  onset_date DATE NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_pme_patient_cat (patient_id, category, is_active),
  CONSTRAINT fk_pme_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  CONSTRAINT fk_pme_creator FOREIGN KEY (created_by) REFERENCES staff_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Extend Patient Notes note_type ENUM
ALTER TABLE patient_notes
  MODIFY COLUMN note_type ENUM(
    'general',
    'clinical',
    'clinical_alert',
    'front_desk',
    'call_center',
    'billing',
    'administrative'
  ) NOT NULL DEFAULT 'general';

-- 4. Unified Chronological Timeline View (v_patient_timeline)
-- Future migrations will issue CREATE OR REPLACE VIEW as appointments, consultations,
-- prescriptions, sessions, payments and packages are added.
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

  -- 6. Uploaded Patient Documents & Photos
  SELECT
    pf.patient_id AS patient_id,
    CONCAT('file_', pf.file_category) AS event_type,
    pf.created_at AS event_at,
    CONCAT('Uploaded ', REPLACE(pf.file_category, '_', ' '), ': ', pf.title) AS summary,
    'patient_files' AS ref_type,
    pf.id AS ref_id
  FROM patient_files pf
  WHERE pf.deleted_at IS NULL

  UNION ALL

  -- 7. Audit Log Events
  SELECT 
    ae.patient_id AS patient_id,
    LOWER(ae.action) AS event_type,
    ae.occurred_at AS event_at,
    CONCAT(ae.action, ' on ', ae.resource_type, ' #', ae.resource_id) AS summary,
    'audit_events' AS ref_type,
    ae.id AS ref_id
  FROM audit_events ae
  WHERE ae.patient_id IS NOT NULL;
