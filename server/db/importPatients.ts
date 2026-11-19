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

const DEFAULT_BRANCHES = [
  {
    id: 'br-dhanmondi',
    code: 'DHN',
    name: 'Dhanmondi Main Center',
    nameBn: 'ধানমন্ডি মেইন সেন্টার',
    address: 'House 42, Road 9/A, Dhanmondi, Dhaka-1209',
    city: 'Dhaka',
    phone: '+88029671122',
    email: 'dhanmondi@suoxiclinic.com',
  },
  {
    id: 'br-gulshan',
    code: 'GLS',
    name: 'Gulshan-2 Aesthetic Lounge',
    nameBn: 'গুলশান-২ এস্থেটিক লাউঞ্জ',
    address: 'Plot 18, Road 71, Gulshan-2, Dhaka-1212',
    city: 'Dhaka',
    phone: '+88029883344',
    email: 'gulshan@suoxiclinic.com',
  },
  {
    id: 'br-uttara',
    code: 'UTR',
    name: 'Uttara Sector-3 Clinic',
    nameBn: 'উত্তরা সেক্টর-৩ ক্লিনিক',
    address: 'House 12, Road 7, Sector 3, Uttara, Dhaka-1230',
    city: 'Dhaka',
    phone: '+88028951100',
    email: 'uttara@suoxiclinic.com',
  },
];

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
    // Ensure default branches exist so foreign keys always resolve cleanly
    for (const br of DEFAULT_BRANCHES) {
      await client.query(
        `
        INSERT INTO branches (id, code, name, name_bn, address, city, phone, email, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
        ON CONFLICT (id) DO NOTHING
        `,
        [br.id, br.code, br.name, br.nameBn, br.address, br.city, br.phone, br.email]
      );
    }

    let imported = 0;
    for (const p of patients) {
      const branchId = p.branchId || 'br-dhanmondi';
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
          p.city || 'Dhaka',
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
