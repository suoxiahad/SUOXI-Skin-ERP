-- ==============================================================================
-- Migration 0008: Treatment Catalog & Food & Lifestyle Guidance Library
-- Engine: InnoDB | Charset: utf8mb4 COLLATE utf8mb4_unicode_ci
-- ==============================================================================

-- 1. Treatment Categories
CREATE TABLE IF NOT EXISTS treatment_categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  name_bn VARCHAR(100) NULL,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_tc_sort (sort_order, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed Standard Treatment Categories
INSERT IGNORE INTO treatment_categories (code, name, name_bn, description, sort_order, is_active) VALUES
  ('facial', 'Facial & Skin Rejuvenation', 'ফেসিয়াল ও ত্বক পুনরুজ্জীবন', 'Advanced aesthetic facial treatments, HydraFacial, and hydration regimens', 1, 1),
  ('laser', 'Laser & Energy Devices', 'লেজার ট্রিটমেন্ট', 'Q-Switched Nd:YAG, Carbon laser peel, and laser toning procedures', 2, 1),
  ('hair', 'Hair & Scalp Therapy', 'চুল ও স্ক্যাল্প থেরাপি', 'PRP hair restoration, mesotherapy, and hair loss management', 3, 1),
  ('peel', 'Chemical Peels', 'কেমিক্যাল পিল', 'Glycolic, salicylic, and customized medical chemical peels', 4, 1),
  ('acne_care', 'Acne & Scar Care', 'ব্রণ ও দাগের যত্ন', 'Subcision, microneedling, active acne extraction and recovery', 5, 1),
  ('body', 'Body Contouring & Aesthetics', 'বডি কনট্যুরিং', 'Non-invasive fat reduction, skin tightening, and contouring', 6, 1),
  ('consultation', 'Clinical Consultation', 'ক্লিনিক্যাল কনসালটেশন', 'Comprehensive dermatological and aesthetic specialist consultation', 7, 1);

-- 2. Treatment Services
CREATE TABLE IF NOT EXISTS treatment_services (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  service_code VARCHAR(50) NOT NULL UNIQUE,
  category_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  name_bn VARCHAR(150) NULL,
  description TEXT NULL,
  base_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  default_duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  default_followup_days SMALLINT UNSIGNED NULL DEFAULT 14,
  requires_clinical_approval TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_ts_category (category_id, is_active),
  CONSTRAINT fk_ts_category FOREIGN KEY (category_id)
    REFERENCES treatment_categories(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Allowed Rooms & Devices per Service (Multi-select)
CREATE TABLE IF NOT EXISTS treatment_service_resources (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  service_id BIGINT UNSIGNED NOT NULL,
  resource_id BIGINT UNSIGNED NOT NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_service_resource (service_id, resource_id),
  CONSTRAINT fk_tsr_service FOREIGN KEY (service_id)
    REFERENCES treatment_services(id) ON DELETE CASCADE,
  CONSTRAINT fk_tsr_resource FOREIGN KEY (resource_id)
    REFERENCES resources(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Follow-up Rules Inside Treatment
CREATE TABLE IF NOT EXISTS treatment_followup_rules (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  service_id BIGINT UNSIGNED NOT NULL,
  interval_days SMALLINT UNSIGNED NOT NULL DEFAULT 14,
  max_followups SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  instructions TEXT NULL,
  instructions_bn TEXT NULL,
  needs_clinical_approval TINYINT(1) NOT NULL DEFAULT 0,
  approved_by BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_tfr_service (service_id),
  CONSTRAINT fk_tfr_service FOREIGN KEY (service_id)
    REFERENCES treatment_services(id) ON DELETE CASCADE,
  CONSTRAINT fk_tfr_approver FOREIGN KEY (approved_by)
    REFERENCES staff_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Food & Lifestyle Guidance (Versioning, Approvals & Generated Unique Flag)
CREATE TABLE IF NOT EXISTS food_lifestyle_guidance (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  service_id BIGINT UNSIGNED NOT NULL,
  version_number INT UNSIGNED NOT NULL DEFAULT 1,
  title VARCHAR(200) NOT NULL,
  title_bn VARCHAR(200) NULL,
  status ENUM('draft', 'pending_approval', 'approved', 'retired') NOT NULL DEFAULT 'draft',
  approved_flag BIGINT UNSIGNED GENERATED ALWAYS AS (IF(status = 'approved', service_id, NULL)) STORED,
  author_id BIGINT UNSIGNED NOT NULL,
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME(3) NULL,
  clinical_notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_guidance_service_version (service_id, version_number),
  UNIQUE KEY uq_guidance_approved_per_service (approved_flag),
  INDEX idx_flg_service_status (service_id, status),
  CONSTRAINT fk_flg_service FOREIGN KEY (service_id)
    REFERENCES treatment_services(id) ON DELETE CASCADE,
  CONSTRAINT fk_flg_author FOREIGN KEY (author_id)
    REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_flg_approver FOREIGN KEY (approved_by)
    REFERENCES staff_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Food & Lifestyle Guidance Items (5 Standardized Sections)
CREATE TABLE IF NOT EXISTS food_lifestyle_guidance_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  guidance_id BIGINT UNSIGNED NOT NULL,
  section ENUM('recommended_foods', 'foods_to_avoid', 'lifestyle_do', 'lifestyle_avoid', 'general_advice') NOT NULL,
  content_en TEXT NULL,
  content_bn TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_flgi_guidance_section (guidance_id, section, sort_order),
  CONSTRAINT chk_flgi_has_language CHECK (content_en IS NOT NULL OR content_bn IS NOT NULL),
  CONSTRAINT fk_flgi_guidance FOREIGN KEY (guidance_id)
    REFERENCES food_lifestyle_guidance(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Immutability Protection Trigger for Approved Guidance
DELIMITER //
CREATE TRIGGER trg_prevent_approved_guidance_mutation
BEFORE UPDATE ON food_lifestyle_guidance
FOR EACH ROW
BEGIN
  IF OLD.status = 'approved' AND NEW.status = 'approved' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Approved food and lifestyle guidance versions are immutable. Create a new draft version instead.';
  END IF;
END//
DELIMITER ;
