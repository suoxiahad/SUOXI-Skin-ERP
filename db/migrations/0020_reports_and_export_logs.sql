-- Migration 0020: Reports Hub and Data Export Logs
-- Approved under Schema Gate ADR-020 for Prompt 20

CREATE TABLE IF NOT EXISTS data_export_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  actor_name VARCHAR(150) NOT NULL,
  report_type ENUM('revenue', 'doctor_activity', 'follow_up', 'inventory', 'referral', 'sms') NOT NULL,
  export_format ENUM('csv', 'pdf') NOT NULL,
  filters_json JSON NOT NULL,
  row_count INT UNSIGNED NOT NULL DEFAULT 0,
  file_name VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45) NOT NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_export_actor (actor_user_id),
  INDEX idx_export_report (report_type),
  INDEX idx_export_created (created_at),
  CONSTRAINT fk_export_actor FOREIGN KEY (actor_user_id) REFERENCES staff_users(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
