-- =============================================================================
-- SUOXI Skin Care & Aesthetic Center ERP (Dhaka, Bangladesh)
-- PostgreSQL Migration 0004: Staff Employee ID Authentication Support
-- =============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employee_id VARCHAR(50);

-- Backfill any existing staff rows that do not yet have an employee_id
WITH missing_emp AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS seq_num
  FROM users
  WHERE employee_id IS NULL OR BTRIM(employee_id) = ''
),
max_existing AS (
  SELECT COALESCE(
    MAX(
      CASE
        WHEN employee_id ~ '^SX-[0-9]+$'
          THEN SUBSTRING(employee_id FROM '^SX-([0-9]+)$')::INT
        ELSE 1000
      END
    ),
    1000
  ) AS base_num
  FROM users
)
UPDATE users u
SET employee_id = 'SX-' || (max_existing.base_num + missing_emp.seq_num)::TEXT,
    updated_at = NOW()
FROM missing_emp, max_existing
WHERE u.id = missing_emp.id;

-- Enforce case-insensitive uniqueness on non-empty employee IDs
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_employee_id
  ON users (UPPER(employee_id))
  WHERE employee_id IS NOT NULL AND BTRIM(employee_id) <> '';
