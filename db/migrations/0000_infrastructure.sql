-- ==============================================================================
-- Migration 0000: Core Infrastructure Tables
-- ==============================================================================
-- Tables: schema_migrations, login_attempts, idempotency_keys
-- Note: staff_sessions depends on staff_users(id) and is placed at the end of
--       0002_foundation_users_and_files.sql so FK creation succeeds in order.
-- Engine: InnoDB
-- Charset: utf8mb4 COLLATE utf8mb4_unicode_ci
-- ==============================================================================

-- 1. Schema Migrations Tracking Table
-- Used by: apps/api/src/db/migrator.ts
-- Purpose: Records applied migration filenames, SHA-256 checksums, and timestamps
--          to prevent out-of-order execution and detect file tamper/modifications.
CREATE TABLE IF NOT EXISTS schema_migrations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  version VARCHAR(255) NOT NULL UNIQUE,
  checksum CHAR(64) NOT NULL COMMENT 'SHA-256 hash of migration file content',
  batch INT UNSIGNED NOT NULL DEFAULT 1,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_schema_migrations_applied (applied_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Login Attempts Table
-- Used by: apps/api/src/auth/lockout.ts
-- Purpose: Brute-force protection, rate limiting, and 15-minute lockout tracking
CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username_or_email VARCHAR(191) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  attempt_status ENUM('success', 'failed_bad_credentials', 'failed_locked', 'failed_csrf') NOT NULL,
  attempted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_login_attempts_lookup (username_or_email, attempted_at),
  INDEX idx_login_attempts_ip (ip_address, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Idempotency Keys Tracking Table
-- Used by: apps/api/src/middleware/idempotency.ts
-- Purpose: Deduplicates non-idempotent mutations (payments, stock adjustments,
--          package deducts, commission payouts) to enforce Rule 5.
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  idempotency_key VARCHAR(128) NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  route_path VARCHAR(255) NOT NULL,
  request_payload_hash CHAR(64) NOT NULL COMMENT 'SHA-256 of normalized request body',
  status ENUM('pending', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  response_status_code SMALLINT UNSIGNED NULL,
  response_body MEDIUMTEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL 24 HOUR),
  UNIQUE KEY uq_idempotency_key_scope (idempotency_key, route_path),
  INDEX idx_idempotency_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
