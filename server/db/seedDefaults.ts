/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * Idempotent PostgreSQL Baseline Seeder (Branches, Roles, Initial Staff, Master Packages)
 *
 * Usage on VPS after `npm run pg:migrate`:
 *   npm run pg:seed
 */

import 'dotenv/config';
import argon2 from 'argon2';
import { closePgPool, isPostgresConfigured, withPgTransaction } from './pgPool.ts';

const BRANCHES = [
  {
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
    managerName: 'Nadia Islam',
    managerPhone: '+8801711223344',
    operatingHours: '10:00 AM - 09:00 PM (Sat - Thu)',
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
    managerName: 'Mahmudul Hasan',
    managerPhone: '+8801811445566',
    operatingHours: '09:30 AM - 08:30 PM (Sat - Thu)',
  },
];

const ROLES = [
  {
    id: 'super_admin',
    name: 'Super Admin / Managing Director',
    nameBn: 'সুপার অ্যাডমিন',
    description: 'Full unrestricted clinical, financial, security, and branch governance access.',
    permissions: ['*'],
  },
  {
    id: 'admin_manager',
    name: 'Branch Admin Manager',
    nameBn: 'ব্রাঞ্চ ম্যানেজার',
    description: 'Branch operations, staff rosters, reporting, and commission approvals.',
    permissions: ['patients:*', 'appointments:*', 'billing:read', 'inventory:*', 'reports:read', 'users:read'],
  },
  {
    id: 'doctor',
    name: 'Consultant Dermatologist / Doctor',
    nameBn: 'ডাক্তার / কনসালটেন্ট',
    description: 'Consultations, prescriptions, frozen lifestyle guidance, next-session dates, and Rx protocols.',
    permissions: ['patients:read', 'appointments:read', 'consultations:*', 'prescriptions:*', 'rx_protocols:*'],
  },
  {
    id: 'receptionist',
    name: 'Front Desk Receptionist',
    nameBn: 'রিসেপশনিস্ট',
    description: 'Patient registration, fast appointment booking, and walk-in check-ins.',
    permissions: ['patients:read', 'patients:create', 'patients:update', 'appointments:*'],
  },
  {
    id: 'therapist',
    name: 'Clinical Aesthetic Therapist',
    nameBn: 'থেরাপিস্ট',
    description: 'Treatment session execution and package session deductions.',
    permissions: ['patients:read', 'packages:read', 'packages:deduct', 'appointments:read'],
  },
  {
    id: 'cashier',
    name: 'Accounts & Billing Cashier',
    nameBn: 'ক্যাশিয়ার / একাউন্টস',
    description: 'POS invoicing, payment receipts, package installments, and daily closing.',
    permissions: ['patients:read', 'invoices:*', 'payments:*', 'packages:payment', 'daily_closing:*'],
  },
  {
    id: 'inventory_manager',
    name: 'Inventory & Procurement Manager',
    nameBn: 'ইনভেন্টরি ম্যানেজার',
    description: 'Stock management, purchase orders, GRN receiving, and supplier ledger.',
    permissions: ['inventory:*', 'suppliers:*', 'purchase_orders:*'],
  },
  {
    id: 'call_center',
    name: 'Call Center & Follow-up Executive',
    nameBn: 'কল সেন্টার এজেন্ট',
    description: 'Tomorrow call list confirmations, follow-up tracking, and SMS reminders.',
    permissions: ['appointments:read', 'call_center:*', 'patients:read'],
  },
];

const DEFAULT_MASTER_PACKAGES = [
  {
    id: 'mpkg-hydrafacial-6',
    code: 'PKG-HYD6',
    name: 'Signature HydraFacial 6-Session Glow',
    nameBn: 'সিগনেচার হাইড্রাফেসিয়াল (৬ সেশন)',
    serviceCategory: 'Skin Care',
    totalSessions: 6,
    regularPriceBDT: 36000,
    packagePriceBDT: 30000,
    validityMonths: 6,
    minIntervalDays: 14,
    description: 'Deep vortex cleansing, gentle chemical peel, painless extraction, and antioxidant infusion.',
    includedServices: ['HydraFacial MD', 'LED Phototherapy', 'Collagen Mask'],
  },
  {
    id: 'mpkg-laser-carbon-4',
    code: 'PKG-LCP4',
    name: 'Hollywood Laser Carbon Peel (4 Sessions)',
    nameBn: 'হলিউড লেজার কার্বন পিল (৪ সেশন)',
    serviceCategory: 'Laser & Aesthetic',
    totalSessions: 4,
    regularPriceBDT: 32000,
    packagePriceBDT: 26000,
    validityMonths: 6,
    minIntervalDays: 21,
    description: 'Q-Switched Nd:YAG carbon laser toning for pore refinement and sebum control.',
    includedServices: ['Carbon Laser Toning', 'Post-Laser Soothing Cryo Gel'],
  },
  {
    id: 'mpkg-prp-hair-6',
    code: 'PKG-PRP6',
    name: 'Autologous PRP Hair Restoration (6 Sessions)',
    nameBn: 'পিআরপি হেয়ার থেরাপি (৬ সেশন)',
    serviceCategory: 'Hair Therapy',
    totalSessions: 6,
    regularPriceBDT: 48000,
    packagePriceBDT: 39000,
    validityMonths: 9,
    minIntervalDays: 28,
    description: 'Double-spin platelet-rich plasma therapy with scalp dermapen stimulation.',
    includedServices: ['Autologous PRP', 'Scalp Microneedling', 'LLLT Hair Helmet'],
  },
];

async function run(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[SUOXI Seed] REFUSED: seedDefaults.ts is strictly for development/testing.\n' +
        'In production, run `npm run pg:migrate` followed by `npm run pg:create-admin` with strong credentials.'
    );
    process.exit(1);
  }

  if (!isPostgresConfigured()) {
    console.error('[SUOXI Seed] DATABASE_URL (postgresql://...) is not set.');
    process.exit(1);
  }

  const initialDevPassword = process.env.SEED_ADMIN_PASSWORD || '123456';
  const devHash = await argon2.hash(initialDevPassword, { type: argon2.argon2id });

  await withPgTransaction(async (client) => {
    for (const br of BRANCHES) {
      await client.query(
        `
        INSERT INTO branches (
          id, code, name, name_bn, address, city, phone, email,
          manager_name, manager_phone, operating_hours, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE)
        ON CONFLICT (id) DO NOTHING
        `,
        [
          br.id,
          br.code,
          br.name,
          br.nameBn,
          br.address,
          br.city,
          br.phone,
          br.email,
          br.managerName,
          br.managerPhone,
          br.operatingHours,
        ]
      );
    }

    for (const role of ROLES) {
      await client.query(
        `
        INSERT INTO clinic_roles (id, name, name_bn, description, permissions, is_system_role)
        VALUES ($1, $2, $3, $4, $5::jsonb, TRUE)
        ON CONFLICT (id) DO NOTHING
        `,
        [role.id, role.name, role.nameBn, role.description, JSON.stringify(role.permissions)]
      );
    }

    const defaultUsers: Array<{
      id: string;
      employeeId: string;
      name: string;
      nameBn: string;
      email: string;
      role: string;
      phone: string;
      branchId: string;
      branchName: string;
      designation: string;
      specialization?: string;
      bmdcRegNo?: string;
      consultationFeeBDT?: number;
      followUpFeeBDT?: number;
      roomNumber?: string;
    }> = [
      {
        id: 'usr-100',
        employeeId: '0001',
        name: 'Kabir Ahmed',
        nameBn: 'কবির আহমেদ',
        email: 'director@suoxiclinic.com',
        role: 'super_admin',
        phone: '+8801700000001',
        branchId: 'br-shantinagar',
        branchName: 'Shantinagar',
        designation: 'Managing Director & Founder',
      },
      {
        id: 'usr-101',
        employeeId: '0002',
        name: 'Dr. Nusrat Jahan',
        nameBn: 'ডাঃ নুসরাত জাহান',
        email: 'nusrat.jahan@suoxiclinic.com',
        role: 'doctor',
        phone: '+8801711223344',
        branchId: 'br-shantinagar',
        branchName: 'Shantinagar',
        specialization: 'MBBS, DDV, Consultant Aesthetic Dermatologist',
        bmdcRegNo: 'BMDC-A-48921',
        consultationFeeBDT: 2000,
        followUpFeeBDT: 1000,
        roomNumber: 'Room 201 (Laser Suite A)',
        designation: 'Senior Consultant Aesthetic Dermatologist',
      },
      {
        id: 'usr-102',
        employeeId: '0003',
        name: 'Dr. Farhana Khan',
        nameBn: 'ডাঃ ফারহানা খান',
        email: 'farhana.khan@suoxiclinic.com',
        role: 'doctor',
        phone: '+8801811223355',
        branchId: 'br-gulshan',
        branchName: 'Gulshan-2 Aesthetic Lounge',
        specialization: 'MBBS, FCPS (Dermatology), Facial Aesthetics',
        bmdcRegNo: 'BMDC-A-51204',
        consultationFeeBDT: 2500,
        followUpFeeBDT: 1200,
        roomNumber: 'Room 302 (Anti-Aging Suite)',
        designation: 'Consultant Cosmetic Dermatologist',
      },
      {
        id: 'usr-108',
        employeeId: '0004',
        name: 'Dr. Tanvir Ahmed',
        nameBn: 'ডাঃ তানভীর আহমেদ',
        email: 'tanvir.ahmed@suoxiclinic.com',
        role: 'doctor',
        phone: '+8801911334455',
        branchId: 'br-uttara',
        branchName: 'Uttara Sector-3 Clinic',
        specialization: 'MBBS, MCPS (Derma), Fellow Trichology (UK)',
        bmdcRegNo: 'BMDC-A-62390',
        consultationFeeBDT: 1800,
        followUpFeeBDT: 900,
        roomNumber: 'Room 105 (Trichology Suite)',
        designation: 'Clinical Aesthetician & Trichologist',
      },
      {
        id: 'usr-109',
        employeeId: '0005',
        name: 'Sabrina Mostafa',
        nameBn: 'সাবরিনা মোস্তফা',
        email: 'sabrina.m@suoxiclinic.com',
        role: 'doctor',
        phone: '+8801722445566',
        branchId: 'br-shantinagar',
        branchName: 'Shantinagar',
        specialization: 'MBBS, Diploma in Clinical Dermatology',
        bmdcRegNo: 'BMDC-A-70112',
        consultationFeeBDT: 1500,
        followUpFeeBDT: 800,
        roomNumber: 'Room 203 (Consultation)',
        designation: 'Resident Medical Officer (Aesthetic)',
      },
      {
        id: 'usr-105',
        employeeId: '0006',
        name: 'Rina Begum',
        nameBn: 'রিনা বেগম',
        email: 'therapist.rina@suoxiclinic.com',
        role: 'therapist',
        phone: '+8801755443322',
        branchId: 'br-shantinagar',
        branchName: 'Shantinagar',
        roomNumber: 'Treatment Suite 1',
        designation: 'Lead Aesthetic & Laser Therapist',
      },
      {
        id: 'usr-110',
        employeeId: '0007',
        name: 'Nasreen Sultana',
        nameBn: 'নাসরিন সুলতানা',
        email: 'nasreen.sultana@suoxiclinic.com',
        role: 'therapist',
        phone: '+8801822334466',
        branchId: 'br-gulshan',
        branchName: 'Gulshan-2 Aesthetic Lounge',
        roomNumber: 'Treatment Suite 2',
        designation: 'Senior Skin & Laser Therapist',
      },
      {
        id: 'usr-111',
        employeeId: '0008',
        name: 'Tania Akter',
        nameBn: 'তানিয়া আক্তার',
        email: 'tania.therapist@suoxiclinic.com',
        role: 'therapist',
        phone: '+8801933445577',
        branchId: 'br-uttara',
        branchName: 'Uttara Sector-3 Clinic',
        roomNumber: 'Treatment Suite 3',
        designation: 'Aesthetic Laser Therapist',
      },
      {
        id: 'usr-103',
        employeeId: '0009',
        name: 'Fatima Zohra',
        nameBn: 'ফাতিমা জোহরা',
        email: 'reception.shantinagar@suoxiclinic.com',
        role: 'receptionist',
        phone: '+8801799887766',
        branchId: 'br-shantinagar',
        branchName: 'Shantinagar',
        designation: 'Front Desk & Patient Relations Executive',
      },
      {
        id: 'usr-112',
        employeeId: '0010',
        name: 'Mehedi Hasan',
        nameBn: 'মেহেদী হাসান',
        email: 'reception.gulshan@suoxiclinic.com',
        role: 'receptionist',
        phone: '+8801855667788',
        branchId: 'br-gulshan',
        branchName: 'Gulshan-2 Aesthetic Lounge',
        designation: 'Front Desk Executive',
      },
      {
        id: 'usr-106',
        employeeId: '0011',
        name: 'Shamim Hossain',
        nameBn: 'শামীম হোসেন',
        email: 'accounts@suoxiclinic.com',
        role: 'cashier',
        phone: '+8801844778899',
        branchId: 'br-shantinagar',
        branchName: 'Shantinagar',
        designation: 'Senior Cashier & Accounts Officer',
      },
      {
        id: 'usr-107',
        employeeId: '0012',
        name: 'Sharmin Sultana',
        nameBn: 'শারমিন সুলতানা',
        email: 'inventory@suoxiclinic.com',
        role: 'inventory_manager',
        phone: '+8801966554433',
        branchId: 'br-shantinagar',
        branchName: 'Shantinagar',
        designation: 'Pharmacy & Inventory Manager',
      },
      {
        id: 'usr-104',
        employeeId: '0013',
        name: 'Tania Khan',
        nameBn: 'তানিয়া খান',
        email: 'callcenter.agent1@suoxiclinic.com',
        role: 'call_center',
        phone: '+8801833221100',
        branchId: 'br-shantinagar',
        branchName: 'Shantinagar',
        designation: 'Lead Tele-Triage & Follow-up Agent',
      },
      {
        id: 'usr-113',
        employeeId: '0014',
        name: 'Farzana Yasmin',
        nameBn: 'ফারজানা ইয়াসমিন',
        email: 'admin.shantinagar@suoxiclinic.com',
        role: 'admin_manager',
        phone: '+8801711998877',
        branchId: 'br-shantinagar',
        branchName: 'Shantinagar',
        designation: 'Clinic Operations Manager',
      },
    ];

    for (const u of defaultUsers) {
      await client.query(
        `
        INSERT INTO users (
          id, employee_id, name, name_bn, email, password_hash, must_change_password, role, phone,
          branch_id, branch_name, specialization, bmdc_reg_no, consultation_fee_bdt,
          follow_up_fee_bdt, room_number, status, designation
        )
        VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'active', $16)
        ON CONFLICT (id) DO NOTHING
        `,
        [
          u.id,
          u.employeeId,
          u.name,
          u.nameBn,
          u.email,
          devHash,
          u.role,
          u.phone,
          u.branchId,
          u.branchName,
          u.specialization || null,
          u.bmdcRegNo || null,
          u.consultationFeeBDT ?? null,
          u.followUpFeeBDT ?? null,
          u.roomNumber || null,
          u.designation || null,
        ]
      );
    }

    for (const mp of DEFAULT_MASTER_PACKAGES) {
      await client.query(
        `
        INSERT INTO master_packages (
          id, code, name, name_bn, service_category, total_sessions,
          regular_price_bdt, package_price_bdt, savings_bdt, validity_months,
          min_interval_days, description, included_services, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, TRUE)
        ON CONFLICT (id) DO NOTHING
        `,
        [
          mp.id,
          mp.code,
          mp.name,
          mp.nameBn,
          mp.serviceCategory,
          mp.totalSessions,
          mp.regularPriceBDT,
          mp.packagePriceBDT,
          Math.max(0, mp.regularPriceBDT - mp.packagePriceBDT),
          mp.validityMonths,
          mp.minIntervalDays,
          mp.description,
          JSON.stringify(mp.includedServices),
        ]
      );
    }

    // Default Clinic Settings (General, Scheduling, Security)
    const defaultSettings: Array<{ key: string; value: Record<string, unknown> }> = [
      {
        key: 'general',
        value: {
          clinicName: 'SUOXI Skin Care & Aesthetic Center',
          clinicNameBn: 'সুওক্সি স্কিন কেয়ার অ্যান্ড এস্থেটিক সেন্টার',
          tagline: 'Clinical Dermatology, Laser & Medical Aesthetics — Dhaka',
          binNumber: '004289102-0201',
          tradeLicenseNo: 'TRAD/DSCC/098412/2026',
          vatPercent: 5,
          currency: 'BDT',
          currencySymbol: '৳',
          timezone: 'Asia/Dhaka',
          primaryHelpline: '+8809612-887766',
          supportEmail: 'care@suoxiclinic.com',
          invoicePrefix: 'INV-2026',
          primaryAddress: '',
        },
      },
      {
        key: 'scheduling',
        value: {
          defaultSlotDurationMinutes: 30,
          patientBufferMinutes: 5,
          operatingStartTime: '09:00',
          operatingEndTime: '20:30',
          maxAdvanceBookingDays: 30,
          allowWalkInOverlap: false,
          teleTriageMandatory: true,
          autoSendSmsReminder24h: true,
        },
      },
      {
        key: 'security',
        value: {
          twoFactorEnforced: false,
          sessionTimeoutMinutes: 60,
          passwordExpiryDays: 90,
          minPasswordLength: 8,
          requireSpecialCharacter: true,
          maxDiscountPercentWithoutApproval: 5,
          patientPortalLinkExpiryHours: 24,
          patientPortalOtpExpiryMinutes: 5,
          allowDataExport: true,
          maskPatientMobileInCallCenter: false,
        },
      },
    ];

    for (const s of defaultSettings) {
      await client.query(
        `
        INSERT INTO clinic_settings (setting_key, value, updated_by, updated_at)
        VALUES ($1, $2::jsonb, 'system', NOW())
        ON CONFLICT (setting_key) DO NOTHING
        `,
        [s.key, JSON.stringify(s.value)]
      );
    }

    // Default SMS Templates
    const defaultSmsTemplates = [
      {
        id: 'tmpl-sms-booking-bn',
        name: 'Appointment Confirmation (Bangla)',
        category: 'appointment',
        msgType: 'unicode',
        label: 'transactional',
        content:
          'প্রিয় {{patientName}}, SUOXI-তে আপনার অ্যাপয়েন্টমেন্ট {{date}} তারিখ {{time}}-এ {{doctorName}}-এর সাথে নিশ্চিত হয়েছে। হেল্পলাইন: +8809612-887766',
        variables: ['patientName', 'date', 'time', 'doctorName'],
      },
      {
        id: 'tmpl-sms-payment-en',
        name: 'Payment Receipt Notice',
        category: 'billing',
        msgType: 'text',
        label: 'transactional',
        content:
          'Dear {{patientName}}, we received BDT {{amount}} for Invoice {{invoiceNumber}}. Thank you for visiting SUOXI Skin Care.',
        variables: ['patientName', 'amount', 'invoiceNumber'],
      },
      {
        id: 'tmpl-sms-reminder-24h',
        name: '24h Session Reminder (Bangla)',
        category: 'appointment',
        msgType: 'unicode',
        label: 'transactional',
        content:
          'স্মরণীয় বার্তা: আগামীকাল {{time}}-এ SUOXI ({{branchName}})-এ আপনার {{serviceName}} সেশন রয়েছে। অনুগ্রহ করে ১৫ মিনিট পূর্বে উপস্থিত থাকুন।',
        variables: ['time', 'branchName', 'serviceName'],
      },
    ];

    for (const tmpl of defaultSmsTemplates) {
      await client.query(
        `
        INSERT INTO sms_templates (id, name, category, msg_type, label, content, variables, is_default)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, TRUE)
        ON CONFLICT (id) DO NOTHING
        `,
        [tmpl.id, tmpl.name, tmpl.category, tmpl.msgType, tmpl.label, tmpl.content, JSON.stringify(tmpl.variables)]
      );
    }

    // Default Email Templates
    const defaultEmailTemplates = [
      {
        id: 'tmpl-email-rx',
        name: 'Digital Prescription & Lifestyle Card',
        subject: 'Your Clinical Prescription & Skincare Guidance — SUOXI Clinic',
        category: 'prescription',
        htmlPreview:
          '<h2>SUOXI Skin Care & Aesthetic Center</h2><p>Dear {{patientName}}, please find attached your finalized prescription ({{prescriptionCode}}) from {{doctorName}}.</p>',
        variables: ['patientName', 'prescriptionCode', 'doctorName'],
      },
      {
        id: 'tmpl-email-invoice',
        name: 'Official POS Invoice Receipt',
        subject: 'Payment Receipt {{invoiceNumber}} — SUOXI Skin Care',
        category: 'invoice',
        htmlPreview:
          '<h2>Official Payment Receipt</h2><p>Dear {{patientName}}, thank you for your payment of BDT {{paidAmount}} against invoice {{invoiceNumber}}.</p>',
        variables: ['patientName', 'paidAmount', 'invoiceNumber'],
      },
    ];

    for (const et of defaultEmailTemplates) {
      await client.query(
        `
        INSERT INTO email_templates (id, name, subject, category, html_preview, variables)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        ON CONFLICT (id) DO NOTHING
        `,
        [et.id, et.name, et.subject, et.category, et.htmlPreview, JSON.stringify(et.variables)]
      );
    }
  });

  console.log(
    '[SUOXI Seed] Baseline branches, roles, staff, master packages, clinic settings & SMS/Email templates seeded safely.'
  );
}

run()
  .catch((err) => {
    console.error('[SUOXI Seed] Failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePgPool();
  });
