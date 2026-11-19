-- ==============================================================================
-- Migration 0001: Foundation Core Schema (Level 1 Independent Tables)
-- ==============================================================================
-- Tables: branches, code_sequences, roles, permissions, system_settings
-- Engine: InnoDB
-- Charset: utf8mb4 COLLATE utf8mb4_unicode_ci
-- Preserves: All authoritative schema definitions, checks, and unique keys.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS branches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  name_bn VARCHAR(255) NULL,
  address TEXT NULL,
  city VARCHAR(100) NOT NULL DEFAULT 'Dhaka',
  phone VARCHAR(50) NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Dhaka',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_branches_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS code_sequences (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sequence_key VARCHAR(50) NOT NULL,
  period_key VARCHAR(20) NOT NULL DEFAULT '',
  prefix VARCHAR(20) NOT NULL DEFAULT '',
  current_number BIGINT UNSIGNED NOT NULL DEFAULT 0,
  padding INT UNSIGNED NOT NULL DEFAULT 4,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_sequence_period (sequence_key, period_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  name_bn VARCHAR(100) NULL,
  description VARCHAR(255) NULL,
  max_discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_roles_system (is_system)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  module_group VARCHAR(50) NOT NULL,
  permission_class ENUM('general', 'clinical', 'financial', 'sensitive') NOT NULL DEFAULT 'general',
  description VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_permissions_group (module_group),
  INDEX idx_permissions_class (permission_class)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS system_settings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) NOT NULL UNIQUE,
  setting_value JSON NOT NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  description VARCHAR(255) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_system_settings_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
