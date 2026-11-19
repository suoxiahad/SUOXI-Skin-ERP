-- ==============================================================================
-- Migration: 0017_call_center_and_follow_ups.sql
-- Description: Call center dashboard, follow-up task queue, contact logs & rules
-- Module: Call Center & Patient Care (Prompt 17)
-- Engine: InnoDB
-- Charset: utf8mb4 COLLATE utf8mb4_unicode_ci
-- ==============================================================================

-- 1. Follow-Up Automation Rules
CREATE TABLE IF NOT EXISTS follow_up_rules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id BIGINT UNSIGNED NOT NULL,
  rule_type ENUM(
    'next_day_call',
    'missed_appointment',
    'cancelled_appointment',
    'inactive_patient',
    'package_expiry',
    'pending_payment'
  ) NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  trigger_days INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Threshold days before/after event',
  priority ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_rule_branch_type (branch_id, rule_type),
  CONSTRAINT fk_fur_branch FOREIGN KEY (branch_id)
    REFERENCES branches(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed default clinic rules
INSERT IGNORE INTO follow_up_rules (branch_id, rule_type, is_enabled, trigger_days, priority) VALUES
  (1, 'next_day_call', 1, 1, 'high'),
  (1, 'missed_appointment', 1, 1, 'critical'),
  (1, 'cancelled_appointment', 1, 2, 'medium'),
  (1, 'inactive_patient', 1, 60, 'low'),
  (1, 'package_expiry', 1, 14, 'high'),
  (1, 'pending_payment', 1, 7, 'medium');

-- 2. Follow-Up Tasks Queue (Idempotent via dedupe_key)
CREATE TABLE IF NOT EXISTS follow_up_tasks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id BIGINT UNSIGNED NOT NULL,
  patient_id BIGINT UNSIGNED NOT NULL,
  appointment_id BIGINT UNSIGNED NULL,
  task_type ENUM(
    'next_day_call',
    'missed_appointment',
    'cancelled_appointment',
    'inactive_patient',
    'package_expiry',
    'pending_payment'
  ) NOT NULL,
  priority ENUM('low', 'medium', 'high', 'critical') NOT NULL DEFAULT 'medium',
  status ENUM('open', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'open',
  assigned_to BIGINT UNSIGNED NULL COMMENT 'Staff user ID; NULL represents unassigned pool',
  due_date DATETIME(3) NOT NULL,
  dedupe_key VARCHAR(191) NOT NULL UNIQUE COMMENT 'Unique deduplication key e.g. task:next_day:apt_123',
  resolution_notes TEXT NULL,
  completed_at DATETIME(3) NULL,
  completed_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_fut_branch_status (branch_id, status, due_date),
  INDEX idx_fut_patient (patient_id),
  INDEX idx_fut_assigned (assigned_to, status),
  INDEX idx_fut_due (due_date),
  CONSTRAINT fk_fut_branch FOREIGN KEY (branch_id)
    REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_fut_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_fut_appointment FOREIGN KEY (appointment_id)
    REFERENCES appointments(id) ON DELETE SET NULL,
  CONSTRAINT fk_fut_assigned FOREIGN KEY (assigned_to)
    REFERENCES staff_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_fut_completed_by FOREIGN KEY (completed_by)
    REFERENCES staff_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Call Contact Logs & Reschedule Routing (Hard Rule 1 & 2)
CREATE TABLE IF NOT EXISTS call_contact_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT UNSIGNED NULL,
  patient_id BIGINT UNSIGNED NOT NULL,
  appointment_id BIGINT UNSIGNED NULL,
  caller_user_id BIGINT UNSIGNED NOT NULL,
  outcome ENUM(
    'reached',
    'no_answer',
    'busy',
    'switched_off',
    'wrong_number',
    'reschedule_requested',
    'cancel_requested',
    'completed',
    'declined',
    'other'
  ) NOT NULL,
  notes TEXT NULL,
  call_reference VARCHAR(100) NULL COMMENT 'External telephony software reference ID (Hard Rule 1)',
  next_action VARCHAR(191) NULL,
  next_action_due DATETIME(3) NULL,
  reschedule_requested_date DATE NULL COMMENT 'Patient requested new date (Asia/Dhaka)',
  reschedule_requested_time TIME NULL COMMENT 'Patient requested new time (Asia/Dhaka)',
  reschedule_reason VARCHAR(255) NULL,
  reschedule_status ENUM('none', 'pending', 'approved', 'rejected') NOT NULL DEFAULT 'none',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_ccl_patient (patient_id, created_at),
  INDEX idx_ccl_appointment (appointment_id),
  INDEX idx_ccl_caller (caller_user_id, created_at),
  INDEX idx_ccl_reschedule (reschedule_status),
  CONSTRAINT fk_ccl_task FOREIGN KEY (task_id)
    REFERENCES follow_up_tasks(id) ON DELETE SET NULL,
  CONSTRAINT fk_ccl_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ccl_appointment FOREIGN KEY (appointment_id)
    REFERENCES appointments(id) ON DELETE SET NULL,
  CONSTRAINT fk_ccl_caller FOREIGN KEY (caller_user_id)
    REFERENCES staff_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Dynamic View: Next Day Call List (Asia/Dhaka Wall-Clock: UTC+6)
CREATE OR REPLACE VIEW v_next_day_call_list AS
SELECT 
  a.id AS appointment_id,
  a.appointment_code,
  a.branch_id,
  b.name AS branch_name,
  a.patient_id,
  p.patient_code,
  p.full_name AS patient_name,
  p.primary_mobile AS patient_mobile,
  p.preferred_language,
  a.provider_id,
  u.full_name AS doctor_name,
  a.service_name,
  a.appointment_date,
  a.start_time,
  a.duration_minutes,
  a.status AS appointment_status,
  a.call_reference,
  -- Link Call Task Status if generated
  COALESCE(fut.status, 'pending') AS call_task_status,
  fut.id AS follow_up_task_id,
  fut.assigned_to,
  -- Link Latest SMS Status from notifications
  COALESCE(n.status, 'queued') AS sms_status,
  n.id AS notification_id,
  n.provider_message_id,
  n.sent_at AS sms_sent_at,
  n.delivered_at AS sms_delivered_at
FROM appointments a
JOIN branches b ON a.branch_id = b.id
JOIN patients p ON a.patient_id = p.id
JOIN staff_users u ON a.provider_id = u.id
LEFT JOIN follow_up_tasks fut 
  ON fut.appointment_id = a.id AND fut.task_type = 'next_day_call'
LEFT JOIN notifications n 
  ON n.appointment_id = a.id AND n.channel = 'sms'
WHERE 
  -- Tomorrow in Asia/Dhaka wall-clock time
  a.appointment_date = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+06:00')) + INTERVAL 1 DAY
  AND a.status NOT IN ('cancelled', 'visited');
