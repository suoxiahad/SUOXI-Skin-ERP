-- ==============================================================================
-- Migration 0002: Staff Users & File Assets (Level 2 & 3 Dependency Chain)
-- ==============================================================================
-- Tables: staff_users, files, staff_sessions
-- Engine: InnoDB
-- Charset: utf8mb4 COLLATE utf8mb4_unicode_ci
-- Foreign Keys:
--   - staff_users.branch_id -> branches.id [ON DELETE RESTRICT]
--   - files.uploaded_by -> staff_users.id [ON DELETE RESTRICT]
--   - staff_users.avatar_file_id -> files.id [ON DELETE SET NULL] (applied after files table exists)
--   - staff_sessions.staff_user_id -> staff_users.id [ON DELETE RESTRICT]
-- ==============================================================================

CREATE TABLE IF NOT EXISTS staff_users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  branch_id BIGINT UNSIGNED NOT NULL,
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(191) NOT NULL UNIQUE,
  phone VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  full_name_bn VARCHAR(150) NULL,
  status ENUM('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active',
  all_branches TINYINT(1) NOT NULL DEFAULT 0,
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  failed_login_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME(3) NULL,
  avatar_file_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_staff_users_status (status),
  INDEX idx_staff_users_branch (branch_id),
  CONSTRAINT fk_staff_users_branch FOREIGN KEY (branch_id) 
    REFERENCES branches(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS files (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  storage_key VARCHAR(255) NOT NULL UNIQUE,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  sha256_checksum CHAR(64) NOT NULL,
  uploaded_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_files_uploader (uploaded_by),
  CONSTRAINT fk_files_uploader FOREIGN KEY (uploaded_by) 
    REFERENCES staff_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Resolve circular dependency between staff_users and files
ALTER TABLE staff_users
  ADD CONSTRAINT fk_staff_users_avatar FOREIGN KEY (avatar_file_id) 
    REFERENCES files(id) ON DELETE SET NULL;

-- Staff Sessions Table
-- Used by: apps/api/src/auth/session.ts
-- Purpose: Opaque session tokens with SHA-256 hashing, idle timeout and absolute expiry
CREATE TABLE IF NOT EXISTS staff_sessions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id_hash CHAR(64) NOT NULL COMMENT 'SHA-256 of opaque session token',
  staff_user_id BIGINT UNSIGNED NOT NULL,
  created_ip VARCHAR(45) NOT NULL,
  user_agent VARCHAR(500) NULL,
  last_activity_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL COMMENT 'Absolute session expiry (e.g. 12 hours)',
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_staff_sessions_hash (session_id_hash),
  INDEX idx_staff_sessions_user (staff_user_id),
  INDEX idx_staff_sessions_active (expires_at, revoked_at),
  CONSTRAINT fk_staff_sessions_user FOREIGN KEY (staff_user_id)
    REFERENCES staff_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
