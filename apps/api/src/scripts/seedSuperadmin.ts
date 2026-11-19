import crypto from 'node:crypto';
import { hashPassword } from '../auth/password.js';
import { userRegistry } from '../routes/auth.js';
import { getRbacRepository } from '../services/permissionResolver.js';

export async function seedSuperadmin(options: { silent?: boolean } = {}): Promise<{ username: string; oneTimePassword: string }> {
  const username = 'admin';
  // Generate cryptographically secure random 16-character password
  const oneTimePassword = crypto.randomBytes(12).toString('base64url') + '!A9';
  const passwordHash = await hashPassword(oneTimePassword);

  const userId = 'usr-superadmin-01';

  // Seed into in-memory store
  userRegistry.addUser({
    id: userId,
    username,
    email: 'admin@suoxiclinic.com',
    phone: '+8801700000000',
    passwordHash,
    fullName: 'Super Administrator',
    fullNameBn: 'সুপার অ্যাডমিনিস্ট্রেটর',
    status: 'active',
    allBranches: true,
    mustChangePassword: true,
    primaryBranchId: 'SKC-01',
  });

  const rbacRepo = getRbacRepository();
  if ('setUser' in rbacRepo) {
    (rbacRepo as any).setUser({
      userId,
      username,
      primaryBranchId: 'SKC-01',
      allBranches: true,
      allowedBranchIds: ['SKC-01'],
      mustChangePassword: true,
      roles: ['super_admin'],
      rolePermissions: [
        'patient.view',
        'patient.create',
        'appointment.create',
        'appointment.reschedule',
        'medical_history.view',
        'medical_history.edit',
        'prescription.finalize',
        'guidance.approve',
        'billing.discount',
        'billing.refund',
        'commission.edit',
        'inventory.adjust',
        'audit.view',
        'settings.integrations',
        'user.manage',
        'schedule.override',
      ],
      permissionOverrides: [],
    });
  }

  if (!options.silent) {
    process.stdout.write('\n====================================================================\n');
    process.stdout.write('SUOXI Skin Care & Aesthetic Center CRM — Superadmin Initial Seed\n');
    process.stdout.write('====================================================================\n');
    process.stdout.write(`Username:             ${username}\n`);
    process.stdout.write(`One-Time Password:    ${oneTimePassword}\n`);
    process.stdout.write(`Must Change Password: true (Enforced on first login)\n`);
    process.stdout.write('IMPORTANT: This password is shown ONCE and is NOT logged or saved.\n');
    process.stdout.write('====================================================================\n\n');
  }

  return { username, oneTimePassword };
}

// Allow direct CLI execution: tsx src/scripts/seedSuperadmin.ts
if (process.argv[1]?.endsWith('seedSuperadmin.ts')) {
  seedSuperadmin().catch((err) => {
    process.stderr.write(`Error during superadmin seeding: ${err}\n`);
    process.exit(1);
  });
}
