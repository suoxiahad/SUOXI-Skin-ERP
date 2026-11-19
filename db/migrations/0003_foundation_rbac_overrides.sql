-- ==============================================================================
-- Migration 0003: RBAC Pivots, Overrides & Auth Tokens (Level 4 Dependencies)
-- ==============================================================================
-- Tables:
--   - clinician_profiles
--   - role_permissions
--   - staff_user_roles
--   - staff_user_permissions (allow/deny with expiry)
--   - staff_branches
--   - password_reset_tokens (staff scope in this slice)
-- Engine: InnoDB
-- Charset: utf8mb4 COLLATE utf8mb4_unicode_ci
-- Preserves: All authoritative schema ON DELETE rules exactly.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS clinician_profiles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_user_id BIGINT UNSIGNED NOT NULL UNIQUE,
  bmdc_reg_no VARCHAR(100) NOT NULL UNIQUE,
  title VARCHAR(50) NOT NULL DEFAULT 'Dr.',
  qualifications TEXT NOT NULL,
  specialization VARCHAR(150) NOT NULL,
  signature_file_id BIGINT UNSIGNED NULL,
  consultation_fee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  followup_fee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_clinician_user FOREIGN KEY (staff_user_id) 
    REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_clinician_signature FOREIGN KEY (signature_file_id) 
    REFERENCES files(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  role_id BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_role_permission (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) 
    REFERENCES roles(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id) 
    REFERENCES permissions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_user_roles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_user_role (staff_user_id, role_id),
  CONSTRAINT fk_sur_user FOREIGN KEY (staff_user_id) 
    REFERENCES staff_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sur_role FOREIGN KEY (role_id) 
    REFERENCES roles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_user_permissions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_user_id BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  is_allow TINYINT(1) NOT NULL DEFAULT 1,
  expires_at DATETIME(3) NULL,
  reason VARCHAR(255) NULL,
  granted_by BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_user_permission (staff_user_id, permission_id),
  INDEX idx_sup_expiry (expires_at),
  CONSTRAINT fk_sup_user FOREIGN KEY (staff_user_id) 
    REFERENCES staff_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sup_permission FOREIGN KEY (permission_id) 
    REFERENCES permissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_sup_granted_by FOREIGN KEY (granted_by) 
    REFERENCES staff_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_branches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_user_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_staff_branch (staff_user_id, branch_id),
  CONSTRAINT fk_sb_user FOREIGN KEY (staff_user_id) 
    REFERENCES staff_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sb_branch FOREIGN KEY (branch_id) 
    REFERENCES branches(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  staff_user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE COMMENT 'SHA-256 of single-use reset token',
  expires_at DATETIME(3) NOT NULL,
  is_used TINYINT(1) NOT NULL DEFAULT 0,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_prt_validity (staff_user_id, is_used, expires_at),
  CONSTRAINT fk_prt_user FOREIGN KEY (staff_user_id) 
    REFERENCES staff_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
