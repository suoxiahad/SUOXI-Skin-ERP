-- ==============================================================================
-- Migration 0007: Appointments Core, Resources, Schedules & Status History
-- ==============================================================================
-- Engine: InnoDB
-- Charset: utf8mb4 COLLATE utf8mb4_unicode_ci
-- ==============================================================================

-- 1. Appointment Acquisition Sources
CREATE TABLE IF NOT EXISTS appointment_sources (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  bn_name VARCHAR(100) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default appointment sources
INSERT IGNORE INTO appointment_sources (name, bn_name, is_active) VALUES
  ('Phone call', 'ফোন কল', 1),
  ('Walk-in', 'সরাসরি আগমন (ওয়াক-ইন)', 1),
  ('Referral', 'রেফারেল / সুপারিশ', 1),
  ('Social media', 'সোশ্যাল মিডিয়া (ফেসবুক/ইনস্টাগ্রাম)', 1),
  ('Doctor-defined follow-up', 'ডাক্তারের ফলো-আপ নির্দেশ', 1),
  ('Other', 'অন্যান্য', 1);

-- 2. Physical & Device Resources (Rooms & Devices)
CREATE TABLE IF NOT EXISTS resources (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  resource_type ENUM('room', 'device') NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_resources_branch (branch_id, resource_type, is_active),
  CONSTRAINT fk_res_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default clinic resources (Branch 1: Dhanmondi)
INSERT IGNORE INTO resources (branch_id, name, resource_type, is_active) VALUES
  (1, 'Room 1', 'room', 1),
  (1, 'Room 2', 'room', 1),
  (1, 'Laser Room', 'room', 1),
  (1, 'HydraFacial Device', 'device', 1);

-- 3. Provider Weekly Schedules
CREATE TABLE IF NOT EXISTS provider_schedules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  day_of_week TINYINT UNSIGNED NOT NULL COMMENT '0=Sun, 1=Mon, ..., 6=Sat',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_ps_provider_day (provider_id, branch_id, day_of_week, is_active),
  CONSTRAINT fk_ps_provider FOREIGN KEY (provider_id) REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ps_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Provider Time Off / Leaves
CREATE TABLE IF NOT EXISTS provider_time_off (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider_id BIGINT UNSIGNED NOT NULL,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  reason VARCHAR(255) NULL,
  approved_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_pto_provider_dates (provider_id, start_datetime, end_datetime),
  CONSTRAINT fk_pto_provider FOREIGN KEY (provider_id) REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_pto_approver FOREIGN KEY (approved_by) REFERENCES staff_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Appointments Core Table
CREATE TABLE IF NOT EXISTS appointments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_code VARCHAR(32) NOT NULL UNIQUE,
  branch_id BIGINT UNSIGNED NOT NULL,
  patient_id BIGINT UNSIGNED NOT NULL,
  provider_id BIGINT UNSIGNED NOT NULL,
  resource_id BIGINT UNSIGNED NULL,
  source_id BIGINT UNSIGNED NOT NULL,
  service_category VARCHAR(100) NULL,
  service_name VARCHAR(150) NOT NULL,
  appointment_date DATE NOT NULL COMMENT 'Asia/Dhaka wall-clock date',
  start_time TIME NOT NULL COMMENT 'Asia/Dhaka wall-clock start time',
  end_time TIME NOT NULL COMMENT 'Asia/Dhaka wall-clock end time',
  duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  appointment_type ENUM('consultation', 'treatment_session', 'follow_up', 'other') NOT NULL DEFAULT 'consultation',
  status ENUM('booked', 'confirmed', 'visited', 'cancelled', 'no_show', 'rescheduled') NOT NULL DEFAULT 'booked',
  set_by_clinician TINYINT(1) NOT NULL DEFAULT 0,
  is_walk_in TINYINT(1) NOT NULL DEFAULT 0,
  call_reference VARCHAR(100) NULL COMMENT 'External call center software reference code',
  rescheduled_to_appointment_id BIGINT UNSIGNED NULL,
  rescheduled_from_appointment_id BIGINT UNSIGNED NULL,
  cancel_reason VARCHAR(255) NULL,
  reschedule_reason VARCHAR(255) NULL,
  checked_in_at DATETIME(3) NULL,
  origin_session_id BIGINT UNSIGNED NULL COMMENT 'Nullable reference; FK added in Prompt 10',
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_apt_branch_date (branch_id, appointment_date, status),
  INDEX idx_apt_provider_date (provider_id, appointment_date, start_time, end_time),
  INDEX idx_apt_patient (patient_id, appointment_date),
  INDEX idx_apt_resource (resource_id, appointment_date, start_time, end_time),
  CONSTRAINT fk_apt_branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_apt_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_apt_provider FOREIGN KEY (provider_id) REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_apt_resource FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE SET NULL,
  CONSTRAINT fk_apt_source FOREIGN KEY (source_id) REFERENCES appointment_sources(id) ON DELETE RESTRICT,
  CONSTRAINT fk_apt_creator FOREIGN KEY (created_by) REFERENCES staff_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Appointment Status Audit History (Append-Only)
CREATE TABLE IF NOT EXISTS appointment_status_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  appointment_id BIGINT UNSIGNED NOT NULL,
  from_status ENUM('booked', 'confirmed', 'visited', 'cancelled', 'no_show', 'rescheduled') NULL,
  to_status ENUM('booked', 'confirmed', 'visited', 'cancelled', 'no_show', 'rescheduled') NOT NULL,
  reason VARCHAR(255) NULL,
  changed_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_ash_appointment (appointment_id, created_at),
  CONSTRAINT fk_ash_appointment FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  CONSTRAINT fk_ash_changer FOREIGN KEY (changed_by) REFERENCES staff_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Update Unified Patient Timeline View with Appointment Events
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

  -- 3. Appointments Events
  SELECT
    a.patient_id AS patient_id,
    CONCAT('appointment_', a.status) AS event_type,
    a.created_at AS event_at,
    CONCAT('Appointment ', a.appointment_code, ' (', a.service_name, ' on ', DATE_FORMAT(a.appointment_date, '%d %b %Y'), ' at ', a.start_time, ')') AS summary,
    'appointments' AS ref_type,
    a.id AS ref_id
  FROM appointments a

  UNION ALL

  -- 4. Patient Notes
  SELECT 
    pn.patient_id AS patient_id,
    CONCAT('note_', pn.note_type) AS event_type,
    pn.created_at AS event_at,
    pn.note_text AS summary,
    'patient_notes' AS ref_type,
    pn.id AS ref_id
  FROM patient_notes pn

  UNION ALL

  -- 5. Clinical Medical History Updates
  SELECT 
    pmh.patient_id AS patient_id,
    'medical_history_updated' AS event_type,
    pmh.updated_at AS event_at,
    'Clinical medical history and contraindications updated' AS summary,
    'patient_medical_history' AS ref_type,
    pmh.id AS ref_id
  FROM patient_medical_history pmh

  UNION ALL

  -- 6. Categorized Medical Entries
  SELECT
    pme.patient_id AS patient_id,
    CONCAT('clinical_', pme.category) AS event_type,
    pme.created_at AS event_at,
    CONCAT(UPPER(SUBSTRING(pme.category, 1, 1)), SUBSTRING(pme.category, 2), ': ', pme.title) AS summary,
    'patient_medical_entries' AS ref_type,
    pme.id AS ref_id
  FROM patient_medical_entries pme

  UNION ALL

  -- 7. Uploaded Patient Documents & Photos
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

  -- 8. Audit Log Events
  SELECT 
    ae.patient_id AS patient_id,
    LOWER(ae.action) AS event_type,
    ae.occurred_at AS event_at,
    CONCAT(ae.action, ' on ', ae.resource_type, ' #', ae.resource_id) AS summary,
    'audit_events' AS ref_type,
    ae.id AS ref_id
  FROM audit_events ae
  WHERE ae.patient_id IS NOT NULL;
