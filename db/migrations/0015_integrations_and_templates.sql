-- ==============================================================================
-- Migration 0015: Integrations (SMTP + SMS Gateway), Templates & Event Rules
-- Engine: InnoDB | Charset: utf8mb4 COLLATE utf8mb4_unicode_ci
-- ==============================================================================

-- 1. Integration Configurations (SMTP & SMS Gateways)
CREATE TABLE IF NOT EXISTS integration_configurations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  integration_type ENUM('email_smtp', 'sms_gateway') NOT NULL,
  name VARCHAR(100) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Rule: "Only one active default per integration type" enforced via generated column + UNIQUE index
  default_flag VARCHAR(32) GENERATED ALWAYS AS (
    IF(is_default = 1 AND is_active = 1, integration_type, NULL)
  ) STORED,
  -- Non-secret settings stored in JSON
  config JSON NOT NULL COMMENT 'host, port, encryption, sender_email, sender_name, api_url, auth_method, sender_id, rate_limit, max_retries, retry_backoff_sec, extra_params',
  -- Secret credentials stored ONLY as AES-256-GCM ciphertext
  credential_ciphertext VARBINARY(512) NULL COMMENT 'AES-256-GCM ciphertext',
  credential_iv VARBINARY(16) NULL COMMENT '12 or 16 byte IV/nonce',
  credential_auth_tag VARBINARY(16) NULL COMMENT '16 byte GCM authentication tag',
  credential_key_version INT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Key version for rotation procedures',
  last_test_status ENUM('never_tested', 'passed', 'failed') NOT NULL DEFAULT 'never_tested',
  last_tested_at DATETIME NULL,
  last_test_error TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_one_active_default_per_type (default_flag),
  INDEX idx_integration_type (integration_type, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Notification Templates (SMS, Email, In-App)
CREATE TABLE IF NOT EXISTS notification_templates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  template_code VARCHAR(64) NOT NULL,
  channel ENUM('sms', 'email', 'in_app') NOT NULL,
  language ENUM('bn', 'en') NOT NULL DEFAULT 'en',
  name VARCHAR(150) NOT NULL,
  subject VARCHAR(255) NULL COMMENT 'Email subject line (HTML escaped)',
  body TEXT NOT NULL COMMENT 'Template body with {{variable}} placeholders',
  allowed_variables JSON NOT NULL COMMENT 'JSON array of whitelisted variables: patient_name, appointment_date, etc.',
  status ENUM('draft', 'approved', 'archived') NOT NULL DEFAULT 'draft',
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_template_code_channel_lang (template_code, channel, language),
  CONSTRAINT fk_templates_approved_by FOREIGN KEY (approved_by)
    REFERENCES staff_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Notification Event Automation Rules
CREATE TABLE IF NOT EXISTS notification_event_rules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_type ENUM(
    'appointment_confirmed',
    'appointment_upcoming',
    'appointment_rescheduled',
    'appointment_cancelled',
    'session_reminder',
    'package_expiry',
    'payment_due',
    'followup_reminder',
    'portal_credentials'
  ) NOT NULL,
  channel ENUM('sms', 'email', 'in_app') NOT NULL,
  template_id BIGINT UNSIGNED NOT NULL,
  offset_minutes INT NOT NULL DEFAULT 0 COMMENT 'Offset relative to event, e.g. -1440 for 24h prior',
  quiet_hours_start TIME NULL COMMENT 'e.g. 21:00:00 Asia/Dhaka',
  quiet_hours_end TIME NULL COMMENT 'e.g. 08:00:00 Asia/Dhaka',
  requires_patient_consent BOOLEAN NOT NULL DEFAULT TRUE,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_event_channel (event_type, channel),
  CONSTRAINT fk_event_rules_template FOREIGN KEY (template_id)
    REFERENCES notification_templates(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Integration Logs (Audited Delivery Attempts with Redacted Secrets)
CREATE TABLE IF NOT EXISTS integration_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  integration_type ENUM('email_smtp', 'sms_gateway') NOT NULL,
  status ENUM('success', 'failed') NOT NULL,
  http_status INT NULL,
  provider_message_id VARCHAR(100) NULL,
  recipient VARCHAR(150) NOT NULL COMMENT 'Masked recipient e.g. +88017****1234 or s***@domain.com',
  error_text TEXT NULL COMMENT 'Provider error message with secrets stripped',
  correlation_id VARCHAR(64) NOT NULL,
  request_redacted JSON NULL COMMENT 'Payload with tokens/passwords replaced with [REDACTED]',
  response_redacted JSON NULL COMMENT 'Response body sanitized',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_integration_logs_corr (correlation_id),
  INDEX idx_integration_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
