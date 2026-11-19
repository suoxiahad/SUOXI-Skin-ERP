-- ==============================================================================
-- Migration: 0016_notification_queue_and_alerts.sql
-- Description: Notification queue, status lifecycle, staff alerts, consent, and webhooks
-- Module: Notifications & Communications Engine (Prompt 16)
-- Engine: InnoDB
-- Charset: utf8mb4 COLLATE utf8mb4_unicode_ci
-- ==============================================================================

-- 1. Notification Queue & Delivery Ledger
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id BIGINT UNSIGNED NOT NULL,
  patient_id BIGINT UNSIGNED NULL,
  appointment_id BIGINT UNSIGNED NULL,
  session_id BIGINT UNSIGNED NULL,
  template_id VARCHAR(64) NULL,
  event_rule_id VARCHAR(64) NULL,
  channel ENUM('sms', 'email', 'in_app') NOT NULL DEFAULT 'sms',
  recipient VARCHAR(191) NOT NULL COMMENT 'E.164 phone (+8801...) or email address',
  subject VARCHAR(255) NULL,
  body TEXT NOT NULL,
  status ENUM('queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled', 'skipped') NOT NULL DEFAULT 'queued',
  skip_reason VARCHAR(100) NULL COMMENT 'no_consent, outside_send_window, appointment_cancelled, invalid_recipient',
  idempotency_key VARCHAR(191) NOT NULL UNIQUE COMMENT 'Unique deduplication key e.g. session_reminder:apt:123:sms',
  scheduled_at DATETIME(3) NOT NULL COMMENT 'UTC scheduled time',
  sent_at DATETIME(3) NULL COMMENT 'UTC gateway acceptance time (Hard Rule 7: sent)',
  delivered_at DATETIME(3) NULL COMMENT 'UTC carrier delivery confirmation (delivered)',
  failed_at DATETIME(3) NULL,
  retry_count INT UNSIGNED NOT NULL DEFAULT 0,
  max_retries INT UNSIGNED NOT NULL DEFAULT 3,
  next_retry_at DATETIME(3) NULL,
  locked_by VARCHAR(100) NULL COMMENT 'Worker instance identifier holding lock',
  locked_until DATETIME(3) NULL COMMENT 'Crash recovery visibility timeout threshold',
  provider_message_id VARCHAR(191) NULL,
  correlation_id VARCHAR(100) NOT NULL,
  failure_reason TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_notif_claim (status, scheduled_at, locked_until),
  INDEX idx_notif_patient (patient_id, created_at),
  INDEX idx_notif_appointment (appointment_id),
  INDEX idx_notif_provider_msg (provider_message_id),
  INDEX idx_notif_scheduled (scheduled_at),
  CONSTRAINT fk_notif_branch FOREIGN KEY (branch_id)
    REFERENCES branches(id) ON DELETE RESTRICT,
  CONSTRAINT fk_notif_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE SET NULL,
  CONSTRAINT fk_notif_appointment FOREIGN KEY (appointment_id)
    REFERENCES appointments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Staff Alerts Bell
CREATE TABLE IF NOT EXISTS staff_alerts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL COMMENT 'Specific staff member or NULL for all staff in branch',
  branch_id BIGINT UNSIGNED NOT NULL,
  alert_type ENUM('upcoming_session', 'overdue_task', 'failed_reminder', 'low_stock', 'clinical_alert') NOT NULL,
  title VARCHAR(191) NOT NULL,
  message TEXT NOT NULL,
  link_path VARCHAR(255) NULL COMMENT 'In-app target route e.g. /appointments, /reports/notifications',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  read_at DATETIME(3) NULL,
  metadata JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_alerts_user (user_id, is_read, created_at),
  INDEX idx_alerts_branch (branch_id, is_read, created_at),
  CONSTRAINT fk_alerts_user FOREIGN KEY (user_id)
    REFERENCES staff_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_alerts_branch FOREIGN KEY (branch_id)
    REFERENCES branches(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Webhook Delivery Receipt Replay Protection (PACK-PROPOSED)
CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  provider VARCHAR(50) NOT NULL COMMENT 'Gateway provider e.g. elitbuzz, generic',
  provider_event_id VARCHAR(191) NOT NULL UNIQUE COMMENT 'Idempotent deduplication key from gateway payload',
  event_type VARCHAR(50) NOT NULL COMMENT 'e.g. delivery_receipt, incoming_status',
  payload JSON NOT NULL,
  received_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  processed_at DATETIME(3) NULL,
  INDEX idx_webhook_received (received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Communication Consent on patients table
ALTER TABLE patients 
  ADD COLUMN IF NOT EXISTS consent_sms_notifications TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = Patient consents to appointment/session SMS',
  ADD COLUMN IF NOT EXISTS consent_email_notifications TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1 = Patient consents to transactional emails',
  ADD COLUMN IF NOT EXISTS consent_marketing TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 = Patient explicitly opted-in to promotional messages';
