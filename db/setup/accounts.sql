-- ==============================================================================
-- SUOXI Skin Care & Aesthetic Center CRM — Database Security & Accounts Setup
-- ==============================================================================
-- STATUS: DOCUMENTATION ONLY — DO NOT EXECUTE DIRECTLY
-- RULE 11 COMPLIANCE: Awaiting verified MySQL 8 schema specification.
--
-- This file defines the least-privilege database user accounts required for
-- production and staging deployments of SUOXI CRM on MySQL 8 (InnoDB, utf8mb4).
--
-- THREE DISTINCT LEAST-PRIVILEGE ROLES:
-- 1. suoxi_migrator : DDL & Migration runner (CI/CD / deployment runner only).
-- 2. suoxi_app      : Application runtime API user (DML only, restricted UPDATE/DELETE).
-- 3. suoxi_readonly : Reporting, read-only analytics, and background audit queries.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. MIGRATION RUNNER ACCOUNT (`suoxi_migrator`)
-- ------------------------------------------------------------------------------
-- RESPONSIBILITY:
-- - Runs schema migrations from db/migrations/ in CI/CD or controlled deployment jobs.
-- - Creates, alters, and indexes tables and triggers once schemas are explicitly approved.
-- - Manages the `schema_migrations` tracking table.
--
-- SECURITY CONSTRAINTS:
-- - NEVER used by the web API or background worker runtime.
-- - Connection allowed ONLY from deployment bastions / CI runners.
--
-- TEMPLATE DDL (Uncomment only during controlled infrastructure provisioning):
/*
CREATE USER IF NOT EXISTS 'suoxi_migrator'@'%' 
  IDENTIFIED BY 'CHANGE_ME_SECURE_VAULT_GENERATED_PASSWORD_MIGRATOR'
  REQUIRE SSL
  WITH MAX_CONNECTIONS_PER_HOUR 100;

-- Grant DDL permissions on the database
GRANT CREATE, ALTER, DROP, INDEX, REFERENCES, TRIGGER, CREATE VIEW, SHOW VIEW
  ON suoxi_crm.* TO 'suoxi_migrator'@'%';

-- Grant DML on the migration tracking table (PACK-PROPOSED: pending schema approval)
GRANT SELECT, INSERT, UPDATE, DELETE ON suoxi_crm.schema_migrations TO 'suoxi_migrator'@'%';
*/

-- ------------------------------------------------------------------------------
-- 2. APPLICATION RUNTIME ACCOUNT (`suoxi_app`)
-- ------------------------------------------------------------------------------
-- RESPONSIBILITY:
-- - Used by `apps/api` runtime connection pool for standard transactional requests.
-- - Executes parameterized SELECT, INSERT, UPDATE queries.
--
-- SECURITY CONSTRAINTS & HARD BUSINESS RULES:
-- - Rule 3 & Rule 6: Financial, clinical, stock-ledger, and audit records are NEVER
--   hard-deleted. Corrections must be reversal / adjustment rows.
-- - Therefore, `suoxi_app` MUST NOT HAVE DELETE privileges on any tables.
-- - SCHEMA-DEPENDENT: Once verified schema tables are confirmed, UPDATE privileges
--   must be explicitly REVOKED on append-only tables (e.g. audit_events, payments,
--   stock_transactions, prescription_revisions, invoice_items).
-- - `suoxi_app` has NO DDL privileges (no CREATE, ALTER, DROP).
--
-- TEMPLATE DDL:
/*
CREATE USER IF NOT EXISTS 'suoxi_app'@'%'
  IDENTIFIED BY 'CHANGE_ME_SECURE_VAULT_GENERATED_PASSWORD_APP'
  REQUIRE SSL
  WITH MAX_USER_CONNECTIONS 50;

-- Base runtime DML privileges on standard mutable tables:
-- (SCHEMA-DEPENDENT: Table-level grants will replace wildcard grant upon schema verification)
GRANT SELECT, INSERT, UPDATE ON suoxi_crm.* TO 'suoxi_app'@'%';

-- EXPLICIT REVOCATIONS ON APPEND-ONLY TABLES (Pending Schema Table Names):
-- REVOKE UPDATE, DELETE ON suoxi_crm.audit_events FROM 'suoxi_app'@'%';
-- REVOKE UPDATE, DELETE ON suoxi_crm.payments FROM 'suoxi_app'@'%';
-- REVOKE UPDATE, DELETE ON suoxi_crm.stock_ledger FROM 'suoxi_app'@'%';
-- REVOKE UPDATE, DELETE ON suoxi_crm.prescription_revisions FROM 'suoxi_app'@'%';
*/

-- ------------------------------------------------------------------------------
-- 3. REPORTING & READ-ONLY ACCOUNT (`suoxi_readonly`)
-- ------------------------------------------------------------------------------
-- RESPONSIBILITY:
-- - Used for read-only analytical queries, export reports, and replica reads.
-- - Zero risk of data mutation or table locks on transactional rows.
--
-- SECURITY CONSTRAINTS:
-- - STRICT SELECT ONLY. No INSERT, UPDATE, DELETE, or DDL allowed.
--
-- TEMPLATE DDL:
/*
CREATE USER IF NOT EXISTS 'suoxi_readonly'@'%'
  IDENTIFIED BY 'CHANGE_ME_SECURE_VAULT_GENERATED_PASSWORD_READONLY'
  REQUIRE SSL
  WITH MAX_USER_CONNECTIONS 20;

GRANT SELECT, SHOW VIEW ON suoxi_crm.* TO 'suoxi_readonly'@'%';
*/

-- Flush privilege cache to enforce account configurations
-- FLUSH PRIVILEGES;
