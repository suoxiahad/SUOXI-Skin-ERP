-- ==============================================================================
-- Migration 0004: Append-Only Audit Trail (Level 5 Compliance & Triggers)
-- ==============================================================================
-- Table: audit_events
-- Immutability Enforcement:
--   1. BEFORE UPDATE trigger raising SQLSTATE '45000'
--   2. BEFORE DELETE trigger raising SQLSTATE '45000'
-- Foreign Keys:
--   - actor_user_id -> staff_users(id) [ON DELETE RESTRICT]
--   - branch_id -> branches(id) [ON DELETE RESTRICT]
-- Deferred Reference:
--   - patient_id is defined as an unconstrained column; foreign key to patients(id)
--     is deferred to Prompt 3 when the clinical patients table is created.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  patient_id BIGINT UNSIGNED NULL COMMENT 'Deferred FK to patients table awaiting Prompt 3',
  branch_id BIGINT UNSIGNED NULL,
  reason TEXT NULL,
  payload_before JSON NULL,
  payload_after JSON NULL,
  ip_address VARCHAR(45) NOT NULL,
  user_agent VARCHAR(500) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_audit_actor (actor_user_id, created_at),
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_patient (patient_id),
  INDEX idx_audit_created (created_at),
  CONSTRAINT fk_ae_actor FOREIGN KEY (actor_user_id) 
    REFERENCES staff_users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_ae_branch FOREIGN KEY (branch_id) 
    REFERENCES branches(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Trigger: Block all UPDATE mutations on audit_events
DELIMITER $$
CREATE TRIGGER trg_audit_events_no_update
BEFORE UPDATE ON audit_events
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'AUDIT SECURITY VIOLATION: audit_events records are strictly immutable and cannot be updated.';
END$$
DELIMITER ;

-- Trigger: Block all DELETE operations on audit_events
DELIMITER $$
CREATE TRIGGER trg_audit_events_no_delete
BEFORE DELETE ON audit_events
FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'AUDIT SECURITY VIOLATION: audit_events records are strictly immutable and cannot be deleted.';
END$$
DELIMITER ;
