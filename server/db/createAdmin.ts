/**
 * SUOXI Skin Care & Aesthetic Center ERP
 * Production Initial Super Admin Provisioning CLI
 *
 * Security Policy:
 *  - NEVER creates demo patients, invoices, inventory, referrals, or default passwords.
 *  - Requires explicit ADMIN_EMAIL and strong ADMIN_PASSWORD (>= 12 chars, mixed case,
 *    number, and symbol) via environment variables.
 *  - Seeds only mandatory structural records (organization, primary branch, RBAC roles,
 *    payment methods, appointment sources) if absent, then creates/updates the super_admin user
 *    with Argon2id hashing and `must_change_password = TRUE`.
 *
 * Usage:
 *   ADMIN_EMAIL="admin@suoxi.tech" ADMIN_PASSWORD="<strong-password>" npm run pg:create-admin
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import argon2 from 'argon2';
import { closePgPool, isPostgresConfigured, withPgTransaction } from './pgPool.ts';

function validateStrongPassword(password: string): string | null {
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

async function run(): Promise<void> {
  if (!isPostgresConfigured()) {
    console.error('[SUOXI Create Admin] DATABASE_URL (postgresql://...) is required.');
    process.exit(1);
  }

  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const name = (process.env.ADMIN_NAME || 'SUOXI Super Admin').trim();
  const phone = (process.env.ADMIN_PHONE || '+8801700000000').trim();
  const branchId = (process.env.ADMIN_BRANCH_ID || 'br-dhanmondi').trim();

  if (!email || !email.includes('@')) {
    console.error('[SUOXI Create Admin] Set ADMIN_EMAIL to a valid administrator email address.');
    process.exit(1);
  }

  const pwdError = validateStrongPassword(password);
  if (pwdError) {
    console.error(`[SUOXI Create Admin] ${pwdError}`);
    process.exit(1);
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  await withPgTransaction(async (client) => {
    await client.query(
      `
      INSERT INTO organizations (id, code, name, name_bn, timezone, currency)
      VALUES ('org-suoxi', 'SUOXI', 'SUOXI Skin Care & Aesthetic Center', 'সুওক্সি স্কিন কেয়ার অ্যান্ড এস্থেটিক সেন্টার', 'Asia/Dhaka', 'BDT')
      ON CONFLICT (id) DO NOTHING
      `
    );

    await client.query(
      `
      INSERT INTO branches (
        id, organization_id, code, name, name_bn, address, city, phone, email, operating_hours, is_active
      )
      VALUES (
        $1, 'org-suoxi', 'DHN', 'Dhanmondi Main Center', 'ধানমন্ডি মেইন সেন্টার',
        'House 42, Road 9/A, Dhanmondi, Dhaka-1209', 'Dhaka', '+88029671122',
        'care@suoxi.tech', '09:00 AM - 08:30 PM (Sat - Thu)', TRUE
      )
      ON CONFLICT (id) DO NOTHING
      `,
      [branchId]
    );

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

    const existing = await client.query<{ id: string }>(
      'SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1',
      [email]
    );

    let userId: string;
    if (existing.rowCount && existing.rowCount > 0) {
      userId = existing.rows[0].id;
      await client.query(
        `
        UPDATE users
        SET password_hash = $2,
            role = 'super_admin',
            status = 'active',
            must_change_password = TRUE,
            updated_at = NOW()
        WHERE id = $1
        `,
        [userId, passwordHash]
      );
    } else {
      userId = `usr-admin-${crypto.randomBytes(4).toString('hex')}`;
      await client.query(
        `
        INSERT INTO users (
          id, name, email, password_hash, must_change_password, role, phone,
          branch_id, branch_name, status, permissions, designation
        )
        VALUES (
          $1, $2, $3, $4, TRUE, 'super_admin', $5,
          $6, 'Dhanmondi Main Center', 'active', '["*"]'::jsonb, 'Managing Director'
        )
        `,
        [userId, name, email, passwordHash, phone, branchId]
      );
    }

    await client.query(
      `
      INSERT INTO user_branch_assignments (id, user_id, branch_id, is_primary)
      VALUES ($1, $2, $3, TRUE)
      ON CONFLICT (user_id, branch_id) DO NOTHING
      `,
      [`uba-${crypto.randomBytes(4).toString('hex')}`, userId, branchId]
    );
  });

  console.log(`[SUOXI Create Admin] Production super_admin ready for ${email} (Argon2id hashed, must_change_password=true).`);
}

run()
  .catch((err) => {
    console.error('[SUOXI Create Admin] Failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePgPool();
  });
