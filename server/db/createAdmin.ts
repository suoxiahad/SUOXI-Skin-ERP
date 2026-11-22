/**
 * SUOXI Skin Care & Aesthetic Center ERP
 * Production Initial Super Admin Provisioning CLI
 *
 * Security Policy:
 *  - NEVER creates demo patients, invoices, inventory, referrals, or default passwords.
 *  - Requires explicit strong ADMIN_PASSWORD (>= 12 chars, mixed case,
 *    number, and symbol) via environment variables.
 *  - Reads ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME, ADMIN_EMPLOYEE_ID,
 *    ADMIN_PHONE, and ADMIN_BRANCH_ID from environment variables.
 *  - Checks whether the specified branch exists; creates the initial Shantinagar
 *    branch (br-shantinagar) without invented optional contact details if absent,
 *    and preserves existing branch details if already present.
 *  - Ensures organization, mandatory RBAC roles, payment methods, and appointment
 *    sources exist idempotently, creates/updates super_admin with Argon2id hashing
 *    and `must_change_password = TRUE`, and assigns the primary branch.
 *
 * Usage:
 *   ADMIN_PASSWORD="<strong-password>" npm run pg:create-admin
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import { closePgPool, isPostgresConfigured, withPgTransaction } from './pgPool.ts';

export const DEFAULT_ORG_ID = 'org-suoxi';

export const INITIAL_SHANTINAGAR_BRANCH = {
  id: 'br-shantinagar',
  code: 'SHN',
  name: 'Shantinagar',
  nameBn: 'শান্তিনগর',
  address: '',
  city: '',
  phone: '',
  email: null as string | null,
  managerName: null as string | null,
  managerPhone: null as string | null,
  operatingHours: null as string | null,
  isActive: true,
};

export interface ProvisionAdminOptions {
  email?: string;
  password: string;
  name?: string;
  employeeId?: string;
  phone?: string;
  branchId?: string;
  branchCode?: string;
  branchName?: string;
  branchNameBn?: string;
}

export interface ProvisionAdminResult {
  organizationId: string;
  branchId: string;
  branchCode: string;
  branchName: string;
  branchCreated: boolean;
  userId: string;
  employeeId: string;
  email: string;
  mustChangePassword: boolean;
}

export function validateStrongPassword(password: string): string | null {
  if (password.length < 12) return 'ADMIN_PASSWORD must be at least 12 characters long.';
  if (!/[A-Z]/.test(password)) return 'ADMIN_PASSWORD must include at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'ADMIN_PASSWORD must include at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'ADMIN_PASSWORD must include at least one numeric digit.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'ADMIN_PASSWORD must include at least one special character.';
  return null;
}

const SYSTEM_ROLES = [
  { id: 'super_admin', name: 'Super Admin / Managing Director', nameBn: 'সুপার অ্যাডমিন', description: 'Full unrestricted system access.', permissions: ['*'] },
  { id: 'admin_manager', name: 'Branch Admin Manager', nameBn: 'ব্রাঞ্চ ম্যানেজার', description: 'Branch governance, reporting, inventory & commissions.', permissions: ['patients:*', 'appointments:*', 'billing:read', 'inventory:*', 'reports:read', 'users:read', 'referrals:*'] },
  { id: 'doctor', name: 'Consultant Dermatologist / Doctor', nameBn: 'ডাক্তার / কনসালটেন্ট', description: 'Consultations, prescriptions, treatment plans & protocols.', permissions: ['patients:read', 'appointments:read', 'consultations:*', 'prescriptions:*', 'rx_protocols:*', 'sessions:*'] },
  { id: 'receptionist', name: 'Front Desk Receptionist', nameBn: 'রিসেপশনিস্ট', description: 'Patient registration, scheduling & check-ins.', permissions: ['patients:read', 'patients:create', 'patients:update', 'appointments:*'] },
  { id: 'therapist', name: 'Clinical Aesthetic Therapist', nameBn: 'থেরাপিস্ট', description: 'Treatment sessions & package deductions.', permissions: ['patients:read', 'packages:read', 'packages:deduct', 'sessions:*', 'appointments:read'] },
  { id: 'cashier', name: 'Accounts & Billing Cashier', nameBn: 'ক্যাশিয়ার / একাউন্টস', description: 'POS invoicing, payments, refunds & daily closing.', permissions: ['patients:read', 'invoices:*', 'payments:*', 'packages:payment', 'daily_closing:*'] },
  { id: 'inventory_manager', name: 'Inventory & Procurement Manager', nameBn: 'ইনভেন্টরি ম্যানেজার', description: 'Stock, batches, suppliers, purchase orders & GRN.', permissions: ['inventory:*', 'suppliers:*', 'purchase_orders:*'] },
  { id: 'call_center', name: 'Call Center & Follow-up Executive', nameBn: 'কল সেন্টার এজেন্ট', description: 'Follow-ups, tomorrow call list & confirmation logging.', permissions: ['appointments:read', 'call_center:*', 'patients:read'] },
];

const PAYMENT_METHODS = [
  { id: 'pm-cash', code: 'cash', name: 'Cash (BDT)', requiresRef: false },
  { id: 'pm-card', code: 'card', name: 'Debit / Credit Card (POS)', requiresRef: true },
  { id: 'pm-bkash', code: 'bkash', name: 'bKash MFS', requiresRef: true },
  { id: 'pm-nagad', code: 'nagad', name: 'Nagad MFS', requiresRef: true },
  { id: 'pm-bank', code: 'bank_transfer', name: 'Bank Transfer / BEFTN', requiresRef: true },
];

const APPOINTMENT_SOURCES = [
  { id: 'src-walkin', code: 'walk_in', name: 'Walk-in', nameBn: 'সরাসরি উপস্থিত' },
  { id: 'src-phone', code: 'phone', name: 'Phone Call', nameBn: 'ফোন কল' },
  { id: 'src-facebook', code: 'facebook', name: 'Facebook / Messenger', nameBn: 'ফেসবুক' },
  { id: 'src-whatsapp', code: 'whatsapp', name: 'WhatsApp', nameBn: 'হোয়াটসঅ্যাপ' },
  { id: 'src-referral', code: 'referral', name: 'Doctor / Patient Referral', nameBn: 'রেফারেল' },
  { id: 'src-portal', code: 'portal', name: 'Patient Portal', nameBn: 'পেশেন্ট পোর্টাল' },
];

function deriveCustomBranchMetadata(
  branchId: string,
  overrides?: { code?: string; name?: string; nameBn?: string }
): { id: string; code: string; name: string; nameBn: string } {
  if (branchId === INITIAL_SHANTINAGAR_BRANCH.id) {
    return {
      id: INITIAL_SHANTINAGAR_BRANCH.id,
      code: overrides?.code?.trim().toUpperCase() || INITIAL_SHANTINAGAR_BRANCH.code,
      name: overrides?.name?.trim() || INITIAL_SHANTINAGAR_BRANCH.name,
      nameBn: overrides?.nameBn?.trim() || INITIAL_SHANTINAGAR_BRANCH.nameBn,
    };
  }

  const slug = branchId.replace(/^br-/i, '').trim() || branchId;
  const fallbackName = slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  const fallbackCode = slug.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'BR1';

  return {
    id: branchId,
    code: overrides?.code?.trim().toUpperCase() || fallbackCode,
    name: overrides?.name?.trim() || fallbackName || branchId,
    nameBn: overrides?.nameBn?.trim() || '',
  };
}

export async function provisionSuperAdminAndInitialBranch(
  opts: ProvisionAdminOptions
): Promise<ProvisionAdminResult> {
  const email = (opts.email ?? process.env.ADMIN_EMAIL ?? 'suoxiwork1@gmail.com').trim().toLowerCase();
  const employeeId = (opts.employeeId ?? process.env.ADMIN_EMPLOYEE_ID ?? '24040823').trim().toUpperCase();
  const password = opts.password ?? process.env.ADMIN_PASSWORD ?? '';
  const name = (opts.name ?? process.env.ADMIN_NAME ?? 'Md Ahad Ali').trim();
  const phone = (opts.phone ?? process.env.ADMIN_PHONE ?? '01314113066').trim();
  const branchId = (opts.branchId ?? process.env.ADMIN_BRANCH_ID ?? INITIAL_SHANTINAGAR_BRANCH.id).trim();

  if (!email || !email.includes('@')) {
    throw new Error('Set ADMIN_EMAIL to a valid administrator email address.');
  }
  if (!employeeId) {
    throw new Error('Set ADMIN_EMPLOYEE_ID to a valid employee identifier.');
  }
  if (!name) {
    throw new Error('Set ADMIN_NAME to the administrator full name.');
  }
  if (!branchId) {
    throw new Error('Set ADMIN_BRANCH_ID to the target primary branch ID.');
  }

  const pwdError = validateStrongPassword(password);
  if (pwdError) {
    throw new Error(pwdError);
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  return withPgTransaction(async (client) => {
    // 1. Ensure organization exists before creating or referencing branches
    await client.query(
      `
      INSERT INTO organizations (id, code, name, name_bn, timezone, currency)
      VALUES ($1, 'SUOXI', 'SUOXI Skin Care & Aesthetic Center', 'সুওক্সি স্কিন কেয়ার অ্যান্ড এস্থেটিক সেন্টার', 'Asia/Dhaka', 'BDT')
      ON CONFLICT (id) DO NOTHING
      `,
      [DEFAULT_ORG_ID]
    );

    // 2. Check whether the specified branch exists; preserve existing info if present
    const existingBranchRes = await client.query<{
      id: string;
      code: string;
      name: string;
      organization_id: string | null;
    }>('SELECT id, code, name, organization_id FROM branches WHERE id = $1 LIMIT 1', [branchId]);

    let resolvedBranchId = branchId;
    let resolvedBranchCode = '';
    let resolvedBranchName = '';
    let branchCreated = false;

    if (existingBranchRes.rowCount && existingBranchRes.rowCount > 0) {
      const existingBranch = existingBranchRes.rows[0];
      resolvedBranchId = String(existingBranch.id);
      resolvedBranchCode = String(existingBranch.code);
      resolvedBranchName = String(existingBranch.name);
      if (!existingBranch.organization_id) {
        await client.query('UPDATE branches SET organization_id = $2 WHERE id = $1 AND organization_id IS NULL', [
          resolvedBranchId,
          DEFAULT_ORG_ID,
        ]);
      }
    } else {
      const meta = deriveCustomBranchMetadata(branchId, {
        code: opts.branchCode ?? process.env.ADMIN_BRANCH_CODE,
        name: opts.branchName ?? process.env.ADMIN_BRANCH_NAME,
        nameBn: opts.branchNameBn ?? process.env.ADMIN_BRANCH_NAME_BN,
      });

      await client.query(
        `
        INSERT INTO branches (
          id, organization_id, code, name, name_bn, address, city, phone,
          email, manager_name, manager_phone, operating_hours, is_active, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, '', '', '',
          NULL, NULL, NULL, NULL, TRUE, NOW(), NOW()
        )
        `,
        [meta.id, DEFAULT_ORG_ID, meta.code, meta.name, meta.nameBn]
      );

      resolvedBranchId = meta.id;
      resolvedBranchCode = meta.code;
      resolvedBranchName = meta.name;
      branchCreated = true;
    }

    // 3. Seed mandatory system RBAC roles, payment methods, and appointment sources idempotently
    for (const role of SYSTEM_ROLES) {
      await client.query(
        `
        INSERT INTO clinic_roles (id, name, name_bn, description, permissions, is_system_role)
        VALUES ($1, $2, $3, $4, $5::jsonb, TRUE)
        ON CONFLICT (id) DO NOTHING
        `,
        [role.id, role.name, role.nameBn, role.description, JSON.stringify(role.permissions)]
      );
    }

    for (const pm of PAYMENT_METHODS) {
      await client.query(
        `
        INSERT INTO payment_methods (id, code, name, requires_reference, is_active)
        VALUES ($1, $2, $3, $4, TRUE)
        ON CONFLICT (id) DO NOTHING
        `,
        [pm.id, pm.code, pm.name, pm.requiresRef]
      );
    }

    for (const src of APPOINTMENT_SOURCES) {
      await client.query(
        `
        INSERT INTO appointment_sources (id, code, name, name_bn, is_active)
        VALUES ($1, $2, $3, $4, TRUE)
        ON CONFLICT (id) DO NOTHING
        `,
        [src.id, src.code, src.name, src.nameBn]
      );
    }

    // 4. Create or update the Super Admin user using Argon2id and must_change_password = TRUE
    const existingUserRes = await client.query<{ id: string }>(
      `
      SELECT id
      FROM users
      WHERE LOWER(email) = $1 OR UPPER(COALESCE(employee_id, '')) = $2
      ORDER BY CASE WHEN LOWER(email) = $1 THEN 0 ELSE 1 END
      LIMIT 1
      `,
      [email, employeeId]
    );

    let userId: string;
    if (existingUserRes.rowCount && existingUserRes.rowCount > 0) {
      userId = String(existingUserRes.rows[0].id);
      await client.query(
        `
        UPDATE users
        SET employee_id = $2,
            name = $3,
            email = $4,
            phone = $5,
            password_hash = $6,
            role = 'super_admin',
            branch_id = $7,
            branch_name = $8,
            status = 'active',
            permissions = '["*"]'::jsonb,
            designation = COALESCE(NULLIF(designation, ''), 'Managing Director'),
            must_change_password = TRUE,
            updated_at = NOW()
        WHERE id = $1
        `,
        [userId, employeeId, name, email, phone, passwordHash, resolvedBranchId, resolvedBranchName]
      );
    } else {
      userId = `usr-admin-${crypto.randomBytes(4).toString('hex')}`;
      await client.query(
        `
        INSERT INTO users (
          id, employee_id, name, email, password_hash, must_change_password, role, phone,
          branch_id, branch_name, status, permissions, designation
        )
        VALUES (
          $1, $2, $3, $4, $5, TRUE, 'super_admin', $6,
          $7, $8, 'active', '["*"]'::jsonb, 'Managing Director'
        )
        `,
        [userId, employeeId, name, email, passwordHash, phone, resolvedBranchId, resolvedBranchName]
      );
    }

    // 5. Assign the user to the specified primary branch
    await client.query(
      'UPDATE user_branch_assignments SET is_primary = FALSE WHERE user_id = $1 AND branch_id <> $2',
      [userId, resolvedBranchId]
    );
    await client.query(
      `
      INSERT INTO user_branch_assignments (id, user_id, branch_id, is_primary)
      VALUES ($1, $2, $3, TRUE)
      ON CONFLICT (user_id, branch_id) DO UPDATE SET is_primary = TRUE
      `,
      [`uba-${crypto.randomBytes(4).toString('hex')}`, userId, resolvedBranchId]
    );

    return {
      organizationId: DEFAULT_ORG_ID,
      branchId: resolvedBranchId,
      branchCode: resolvedBranchCode,
      branchName: resolvedBranchName,
      branchCreated,
      userId,
      employeeId,
      email,
      mustChangePassword: true,
    };
  });
}

async function runCli(): Promise<void> {
  if (!isPostgresConfigured()) {
    console.error('[SUOXI Create Admin] DATABASE_URL (postgresql://...) is required.');
    process.exit(1);
  }

  const result = await provisionSuperAdminAndInitialBranch({
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD || '',
    name: process.env.ADMIN_NAME,
    employeeId: process.env.ADMIN_EMPLOYEE_ID,
    phone: process.env.ADMIN_PHONE,
    branchId: process.env.ADMIN_BRANCH_ID,
    branchCode: process.env.ADMIN_BRANCH_CODE,
    branchName: process.env.ADMIN_BRANCH_NAME,
    branchNameBn: process.env.ADMIN_BRANCH_NAME_BN,
  });

  console.log(
    `[SUOXI Create Admin] Production super_admin ready (Employee ID: ${result.employeeId}, Email: ${result.email}, Primary Branch: ${result.branchId} [${result.branchName}], Branch ${result.branchCreated ? 'created' : 'preserved'}, Argon2id hashed, must_change_password=true).`
  );
}

const isDirectEntry =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectEntry) {
  runCli()
    .catch((err) => {
      console.error('[SUOXI Create Admin] Failed:', err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closePgPool();
    });
}
