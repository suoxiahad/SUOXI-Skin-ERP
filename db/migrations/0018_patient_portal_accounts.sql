-- ==============================================================================
-- Migration: 0018_patient_portal_accounts.sql
-- Description: Patient portal authentication realm, sessions, setup/reset tokens,
--              and rate-limited contact change OTP verification
-- Module: Patient Portal (Prompt 18)
-- Engine: InnoDB
-- Charset: utf8mb4 COLLATE utf8mb4_unicode_ci
-- ==============================================================================

-- 1. Patient Accounts Table
CREATE TABLE IF NOT EXISTS patient_accounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_id BIGINT UNSIGNED NOT NULL UNIQUE,
  login_identifier VARCHAR(191) NOT NULL UNIQUE COMMENT 'Normalized mobile or patient_code or email',
  password_hash VARCHAR(255) NULL COMMENT 'Argon2id password hash, NULL until initial setup',
  status ENUM('pending_setup', 'active', 'suspended', 'deactivated') NOT NULL DEFAULT 'pending_setup',
  failed_login_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME(3) NULL,
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_pa_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Portal Sessions Table (Separate table & separate realm per B.5a)
CREATE TABLE IF NOT EXISTS portal_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id_hash VARCHAR(64) NOT NULL UNIQUE COMMENT 'SHA-256 of portal session token',
  patient_account_id BIGINT UNSIGNED NOT NULL,
  patient_id BIGINT UNSIGNED NOT NULL,
  created_ip VARCHAR(45) NOT NULL,
  user_agent VARCHAR(512) NOT NULL DEFAULT '',
  last_activity_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_ps_account (patient_account_id),
  KEY idx_ps_patient (patient_id),
  KEY idx_ps_expires (expires_at),
  CONSTRAINT fk_ps_account FOREIGN KEY (patient_account_id)
    REFERENCES patient_accounts(id) ON DELETE CASCADE,
  CONSTRAINT fk_ps_patient FOREIGN KEY (patient_id)
    REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Patient Setup & Password Reset Tokens (Single-use, expiring, hashed)
CREATE TABLE IF NOT EXISTS patient_setup_reset_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_account_id BIGINT UNSIGNED NOT NULL,
  token_hash VARCHAR(64) NOT NULL UNIQUE COMMENT 'SHA-256 of setup/reset token',
  token_type ENUM('setup', 'reset') NOT NULL,
  channel ENUM('sms', 'email') NOT NULL DEFAULT 'sms',
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_psrt_account (patient_account_id),
  KEY idx_psrt_expires (expires_at),
  CONSTRAINT fk_psrt_account FOREIGN KEY (patient_account_id)
    REFERENCES patient_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Portal Contact Change OTPs (Attempt-limited, short-lived, hashed)
CREATE TABLE IF NOT EXISTS portal_contact_change_otps (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  patient_account_id BIGINT UNSIGNED NOT NULL,
  change_type ENUM('mobile', 'email') NOT NULL,
  target_value VARCHAR(191) NOT NULL,
  otp_hash VARCHAR(64) NOT NULL COMMENT 'SHA-256 of 6-digit OTP',
  attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  max_attempts INT UNSIGNED NOT NULL DEFAULT 3,
  expires_at DATETIME(3) NOT NULL,
  consumed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_pcco_account (patient_account_id),
  CONSTRAINT fk_pcco_account FOREIGN KEY (patient_account_id)
    REFERENCES patient_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
