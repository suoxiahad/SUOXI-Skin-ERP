/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * Zero-Loss Patient Data Importer (storage/patients.json -> PostgreSQL)
 *
 * Usage:
 *   npm run pg:import-patients            # Upsert all patients from storage/patients.json
 *   npm run pg:import-patients -- --dry-run  # Preview without writing to PostgreSQL
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import type { Patient } from '../../src/types/index.ts';
import { closePgPool, isPostgresConfigured, withPgTransaction } from './pgPool.ts';

const PATIENTS_FILE = path.resolve(process.cwd(), 'storage', 'patients.json');

const INITIAL_BRANCH = {
  id: 'br-shantinagar',
  code: 'SHN',
  name: 'Shantinagar',
  nameBn: 'শান্তিনগর',
};

async function run(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  if (!fs.existsSync(PATIENTS_FILE)) {
    console.log(`[SUOXI Import] No file found at ${PATIENTS_FILE}. Nothing to import.`);
    return;
  }

  const raw = fs.readFileSync(PATIENTS_FILE, 'utf8');
  const patients = JSON.parse(raw) as Patient[];

  if (!Array.isArray(patients) || patients.length === 0) {
    console.log('[SUOXI Import] storage/patients.json contains 0 records.');
    return;
  }

  console.log(`[SUOXI Import] Found ${patients.length} patient record(s) in storage/patients.json.`);

  if (dryRun) {
    for (const p of patients) {
      console.log(`  [DRY-RUN] ${p.id} | ${p.patientIdCode} | ${p.name} | ${p.phone} | branch=${p.branchId}`);
    }
    return;
  }

  if (!isPostgresConfigured()) {
    console.error('[SUOXI Import] DATABASE_URL (postgresql://...) is not set in environment.');
    process.exit(1);
  }

  await withPgTransaction(async (client) => {
    const existingBranches = await client.query<{ id: string }>(
      'SELECT id FROM branches ORDER BY is_active DESC, created_at ASC LIMIT 1'
    );
    let fallbackBranchId = existingBranches.rows[0]?.id;
    if (!fallbackBranchId) {
      await client.query(
        `
        INSERT INTO branches (id, code, name, name_bn, address, city, phone, email, is_active)
        VALUES ($1, $2, $3, $4, '', '', '', NULL, TRUE)
        ON CONFLICT (id) DO NOTHING
        `,
        [INITIAL_BRANCH.id, INITIAL_BRANCH.code, INITIAL_BRANCH.name, INITIAL_BRANCH.nameBn]
      );
      fallbackBranchId = INITIAL_BRANCH.id;
    }

    let imported = 0;
    for (const p of patients) {
      const requestedBranchId = p.branchId;
      let branchId = fallbackBranchId;
      if (requestedBranchId) {
        const brCheck = await client.query<{ id: string }>('SELECT id FROM branches WHERE id = $1 LIMIT 1', [
          requestedBranchId,
        ]);
        if (brCheck.rows[0]?.id) {
          branchId = brCheck.rows[0].id;
        }
      }
      await client.query(
        `
        INSERT INTO patients (
          id, patient_id_code, name, name_bn, phone, email, gender, date_of_birth,
          age, blood_group, address, city, branch_id, allergies, medical_history,
          skin_type, referred_by, referrer_doctor_id, is_flagged_duplicate,
          duplicate_reason, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14::jsonb, $15,
          $16, $17, $18, $19,
          $20, COALESCE($21::timestamptz, NOW()), COALESCE($22::timestamptz, NOW())
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          name_bn = EXCLUDED.name_bn,
          phone = EXCLUDED.phone,
          email = EXCLUDED.email,
          gender = EXCLUDED.gender,
          date_of_birth = EXCLUDED.date_of_birth,
          age = EXCLUDED.age,
          blood_group = EXCLUDED.blood_group,
          address = EXCLUDED.address,
          city = EXCLUDED.city,
          branch_id = EXCLUDED.branch_id,
          allergies = EXCLUDED.allergies,
          medical_history = EXCLUDED.medical_history,
          skin_type = EXCLUDED.skin_type,
          referred_by = EXCLUDED.referred_by,
          referrer_doctor_id = EXCLUDED.referrer_doctor_id,
          is_flagged_duplicate = EXCLUDED.is_flagged_duplicate,
          duplicate_reason = EXCLUDED.duplicate_reason,
          updated_at = EXCLUDED.updated_at
        `,
        [
          p.id,
          p.patientIdCode,
          p.name,
          p.nameBn ?? null,
          p.phone,
          p.email ?? null,
          p.gender || 'female',
          p.dateOfBirth || null,
          p.age ?? null,
          p.bloodGroup ?? null,
          p.address ?? null,
          p.city ?? null,
          branchId,
          JSON.stringify(Array.isArray(p.allergies) ? p.allergies : []),
          p.medicalHistory ?? null,
          p.skinType ?? null,
          p.referredBy ?? null,
          p.referrerDoctorId ?? null,
          Boolean(p.isFlaggedDuplicate),
          p.duplicateReason ?? null,
          p.createdAt || null,
          p.updatedAt || null,
        ]
      );
      imported += 1;
    }

    console.log(`[SUOXI Import] Upserted ${imported} patient record(s) into PostgreSQL.`);
  });
}

run()
  .catch((err) => {
    console.error('[SUOXI Import] Failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePgPool();
  });
