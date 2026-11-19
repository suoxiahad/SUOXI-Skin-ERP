-- ==============================================================================
-- Seed 0001: Foundation Roles, Starter Permissions & Primary Branch
-- ==============================================================================
-- Idempotent seed script using INSERT IGNORE / ON DUPLICATE KEY UPDATE.
-- ==============================================================================

-- 1. Primary Branch
INSERT INTO branches (code, name, name_bn, address, city, phone, timezone, is_active)
VALUES (
  'SKC-01',
  'SUOXI Skin Care & Aesthetic Center',
  'সুঅক্সি স্কিন কেয়ার অ্যান্ড নান্দনিক কেন্দ্র',
  'House 12, Road 4, Sector 3, Uttara / Bashundhara, Dhaka',
  'Dhaka',
  '+88029671122',
  'Asia/Dhaka',
  1
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  name_bn = VALUES(name_bn),
  timezone = VALUES(timezone),
  is_active = VALUES(is_active);

-- 2. Standard Roles with Discount Authority
INSERT INTO roles (code, name, name_bn, description, max_discount_percent, is_system)
VALUES
  ('super_admin', 'Super Admin', 'সুপার অ্যাডমিন', 'Full unrestricted platform access across all branches', 100.00, 1),
  ('admin_manager', 'Admin / Manager', 'অ্যাডমিন / ম্যানেজার', 'Branch operations, user management, and discount approvals up to 20%', 20.00, 1),
  ('receptionist', 'Receptionist', 'অভ্যর্থনাকারী', 'Front-desk patient check-in, registration, and under-60-sec appointment booking', 0.00, 1),
  ('doctor', 'Doctor / Consultant', 'চিকিৎসক / কনসালটেন্ট', 'Clinical consultations, prescriptions, next-session date setting, and food/lifestyle approvals', 0.00, 1),
  ('therapist', 'Therapist', 'থেরাপিস্ট', 'Treatment session execution and package session deduction records', 0.00, 1),
  ('cashier', 'Accounts / Cashier', 'অ্যাকাউন্টস / ক্যাশিয়ার', 'Billing, payments, derived dues, and discounts up to 10%', 10.00, 1),
  ('inventory_manager', 'Inventory Manager', 'ইনভেন্টরি ম্যানেজার', 'Stock tracking, batch receipts, and stock adjustments', 0.00, 1),
  ('call_center', 'Call Center Agent', 'কল সেন্টার এজেন্ট', 'Appointment scheduling and tomorrow session reminder call list workflows', 0.00, 1)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  name_bn = VALUES(name_bn),
  description = VALUES(description),
  max_discount_percent = VALUES(max_discount_percent);

-- 3. Starter Permissions Categorized by Class (general, clinical, financial, sensitive)
INSERT INTO permissions (code, name, module_group, permission_class, description)
VALUES
  -- General Module Permissions
  ('patient.view', 'View Patient Records', 'patients', 'general', 'View general demographic and contact details of patients'),
  ('patient.create', 'Create Patient Records', 'patients', 'general', 'Register new patients in under 60 seconds'),
  ('appointment.create', 'Create Appointments', 'appointments', 'general', 'Book appointments manually from front-desk or call center'),
  ('appointment.reschedule', 'Reschedule Appointments', 'appointments', 'general', 'Update appointment wall-clock schedule slot'),
  ('export.run', 'Run Data Exports', 'reports', 'general', 'Export sanitized non-sensitive report summaries'),

  -- Clinical Module Permissions
  ('medical_history.view', 'View Medical History', 'clinical', 'clinical', 'Access patient clinical history, allergies, and skin conditions'),
  ('medical_history.edit', 'Edit Medical History', 'clinical', 'clinical', 'Update clinical examination and diagnostic notes'),
  ('prescription.finalize', 'Finalize Prescriptions', 'clinical', 'clinical', 'Finalize Rx and prescribe next-session date'),
  ('guidance.approve', 'Approve Lifestyle Guidance', 'clinical', 'clinical', 'Approve frozen food and lifestyle guidance snapshot'),

  -- Financial Module Permissions
  ('billing.discount', 'Apply Discount', 'billing', 'financial', 'Apply invoice discount subject to role max_discount_percent'),
  ('billing.refund', 'Process Refund', 'billing', 'financial', 'Issue reversal/void refund transactions with audit trail'),
  ('commission.edit', 'Manage Commissions', 'commissions', 'financial', 'Review and edit doctor/referrer referral commissions'),

  -- Sensitive Module Permissions
  ('inventory.adjust', 'Adjust Stock Levels', 'inventory', 'sensitive', 'Create stock ledger adjustment entries for damaged or reconciled stock'),
  ('audit.view', 'View Audit Events', 'audit', 'sensitive', 'Inspect immutable audit logs across system entities'),
  ('settings.integrations', 'Manage Integrations', 'settings', 'sensitive', 'Configure SMS gateway and SMTP integration settings'),
  ('user.manage', 'Manage Staff Accounts', 'users', 'sensitive', 'Create staff users, assign roles, and grant permission overrides'),
  ('schedule.override', 'Override Clinical Schedule', 'appointments', 'sensitive', 'Override clinician slot capacity or leave boundaries')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  module_group = VALUES(module_group),
  permission_class = VALUES(permission_class),
  description = VALUES(description);
