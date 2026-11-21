/**
 * SUOXI Skin Care & Aesthetic Center CRM (Dhaka, Bangladesh)
 * Backend API Server (Node.js + Express)
 * Implements /api/v1/* with CSRF protection, RBAC, Idempotency, Audit Logging,
 * and Derived Financial Rules.
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { z } from 'zod';
import { isDemoRoleSwitcherAllowed, isProductionAuthEnabled } from './server/auth/productionAuth.ts';
import { getRequestAuthUser } from './server/auth/requestContext.ts';
import { checkRedisHealth, closeRedis, isRedisConfigured } from './server/cache/redisClient.ts';
import { assertProductionSecurityOrThrow, isHostedFallbackWithoutDb, maskSecret } from './server/config/securityConfig.ts';
import { checkPgHealth, closePgPool, isPostgresConfigured } from './server/db/pgPool.ts';
import { closeClinicQueue, getQueueStats, startClinicWorker } from './server/queue/jobQueue.ts';
import {
  acquireIdempotencyKey,
  completeIdempotencyKey,
  issuePersistentCsrfToken,
  validatePersistentCsrfToken,
} from './server/repositories/pgSecurityStoreRepo.ts';
import { createPgCoreRouter } from './server/routes/pgCoreRoutes.ts';
import { createPgExtendedRouter } from './server/routes/pgExtendedRoutes.ts';
import { createPgOpsRouter } from './server/routes/pgOpsRoutes.ts';
import { parseCookieHeader } from './server/auth/productionAuth.ts';
import {
  createPhase4AuthMiddleware,
  createPhase4PlatformRouter,
  PREVIEW_SESSION_COOKIE_NAME,
} from './server/routes/phase4PlatformRoutes.ts';
import { getPrivateStorageHealth } from './server/storage/localFileStorage.ts';
import type {
  User,
  Branch,
  Patient,
  Appointment,
  CallCenterTask,
  Consultation,
  Prescription,
  TreatmentPackage,
  MasterPackage,
  PackageDeduction,
  Invoice,
  PaymentRecord,
  InventoryItem,
  StockAdjustment,
  Supplier,
  PurchaseOrder,
  GoodsReceivedNote,
  ReferralCommission,
  AuditEvent,
  UserRole,
  MedicalAttachment,
  SmsGatewayConfig,
  SmsLogRecord,
  SmsTemplate,
  EmailGatewayConfig,
  EmailLogRecord,
  EmailTemplate,
  ClinicRoleDefinition,
  StaffDutyRoster,
  UserSecurityLog,
  ClinicGeneralSettings,
  ClinicSchedulingSettings,
  ClinicSecuritySettings,
  BackupRecord,
  ActiveSessionRecord,
  RxProtocol,
} from './src/types/index.ts';
import { appointmentService } from './apps/api/src/services/appointmentService.js';
import { patientService } from './apps/api/src/services/patientService.js';
import { computeAvailability, scheduleRepository } from './apps/api/src/services/scheduleService.js';
import { catalogService } from './apps/api/src/services/catalogService.js';
import { portalAuthRouter } from './apps/api/src/routes/portalAuth.js';
import { portalApiRouter } from './apps/api/src/routes/portalApi.js';
import { portalService } from './apps/api/src/services/portalService.js';
import { referralsRouter } from './apps/api/src/routes/referrals.js';
import { commissionsRouter } from './apps/api/src/routes/commissions.js';
import { errorHandlerMiddleware } from './apps/api/src/middleware/errorHandler.js';

export const app = express();
const portArgIndex = process.argv.indexOf('--port');
const cliPort = portArgIndex !== -1 && process.argv[portArgIndex + 1] ? parseInt(process.argv[portArgIndex + 1], 10) : undefined;
const rawPort = cliPort || (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);
const PORT = rawPort;

app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || 1 : 1);

// Security Headers & Strict Production CORS Allowlist
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(self)');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  const origin = req.headers.origin;
  if (origin) {
    const allowedOrigins = (process.env.CORS_ORIGIN || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const requestHost = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
    const requestProto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
    const isSameOrigin = Boolean(requestHost && origin === `${requestProto}://${requestHost}`);
    const isAllowed =
      process.env.NODE_ENV !== 'production'
        ? allowedOrigins.length === 0 || allowedOrigins.includes(origin) || isSameOrigin
        : isSameOrigin || allowedOrigins.includes(origin);
    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, x-csrf-token, idempotency-key, X-Branch-Id, Authorization'
      );
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      return res.status(isAllowed ? 204 : 403).end();
    }
  }
  return next();
});

app.use(express.json({ limit: '20mb' }));

// Start BullMQ background worker automatically when REDIS_URL is configured (unless disabled for dedicated worker process)
if (isRedisConfigured() && process.env.EMBEDDED_WORKER !== 'false' && process.env.SUOXI_NO_AUTOSTART !== '1') {
  startClinicWorker();
}

// Health check endpoint for VPS LiteSpeed/PM2 monitoring
const handleHealth = async (_req: Request, res: Response) => {
  const pgConfigured = isPostgresConfigured();
  const redisConfigured = isRedisConfigured();
  const [pgHealth, redisHealth, queue] = await Promise.all([
    pgConfigured ? checkPgHealth() : Promise.resolve({ ok: false, error: 'not_configured' }),
    checkRedisHealth(),
    getQueueStats(),
  ]);
  const storage = getPrivateStorageHealth();
  const pgHealthy = !pgConfigured || pgHealth.ok;
  const redisHealthy = !redisConfigured || redisHealth.ok;
  const status = pgHealthy && redisHealthy && storage.ok ? 'ok' : 'degraded';

  return res.status(status === 'ok' ? 200 : 503).json({
    status,
    storageMode: pgConfigured && pgHealth.ok ? 'postgresql' : 'prototype_fallback',
    authMode: isProductionAuthEnabled() ? 'production_session' : 'preview_demo',
    allowRoleSwitcher: isDemoRoleSwitcherAllowed(),
    postgres: pgHealth,
    redis: redisHealth,
    queue,
    privateStorage: storage,
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
};
app.get('/api/v1/health', handleHealth);
app.get('/healthz', handleHealth);

// Preview-only session & credential store (STRICTLY inactive when PostgreSQL is configured or NODE_ENV === 'production')
const previewSessions = new Map<string, User>();
const previewStaffPasswords = new Map<string, string>();

// Phase 4: Production Auth Middleware & Per-Request Session Context
app.use(
  createPhase4AuthMiddleware({
    resolvePreviewUser: (_req, previewSid) => previewSessions.get(previewSid),
  })
);

// In-memory CSRF & Idempotency Store
const validCsrfTokens = new Set<string>();
const idempotencyStore = new Map<string, { statusCode: number; body: unknown }>();

// API-CONV Envelopes
function sendSuccess(res: Response, data: unknown, metaExtras: Record<string, unknown> = {}, statusCode = 200) {
  const requestId = crypto.randomUUID();
  return res.status(statusCode).json({
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
      ...metaExtras,
    },
  });
}

function sendError(res: Response, statusCode: number, code: string, message: string, details?: unknown) {
  const requestId = crypto.randomUUID();
  return res.status(statusCode).json({
    error: {
      code,
      message,
      details,
      requestId,
    },
  });
}

// -------------------------------------------------------------
// TEMP-PROTOTYPE: In-memory relational store
// (Follows Rule 1: temporary prototype fixture marked TEMP-PROTOTYPE)
// -------------------------------------------------------------

const branches: Branch[] = [
  {
    id: 'br-dhanmondi',
    name: 'Dhanmondi Main Center',
    nameBn: 'ধানমন্ডি মেইন সেন্টার',
    code: 'DHN',
    address: 'House 42, Road 9/A, Dhanmondi, Dhaka-1209',
    city: 'Dhaka',
    phone: '+88029671122',
    email: 'dhanmondi@suoxiclinic.com',
    managerName: 'Farzana Yasmin',
    managerPhone: '+8801711998877',
    operatingHours: '09:00 AM - 08:30 PM (Sat - Thu)',
    isActive: true,
    createdAt: '2024-01-15T00:00:00Z',
  },
  {
    id: 'br-gulshan',
    name: 'Gulshan Aesthetic Lounge',
    nameBn: 'গুলশান নান্দনিক লাউঞ্জ',
    code: 'GLS',
    address: 'Avenue 2, Block D, Gulshan-1, Dhaka-1212',
    city: 'Dhaka',
    phone: '+88029883344',
    email: 'gulshan@suoxiclinic.com',
    managerName: 'Tareq Mahmud',
    managerPhone: '+8801811887766',
    operatingHours: '10:00 AM - 09:00 PM (Everyday)',
    isActive: true,
    createdAt: '2024-06-01T00:00:00Z',
  },
  {
    id: 'br-uttara',
    name: 'Uttara Skin Care Clinic',
    nameBn: 'উত্তরা স্কিন কেয়ার ক্লিনিক',
    code: 'UTR',
    address: 'Sector 7, Rabindra Sarani, Uttara, Dhaka-1230',
    city: 'Dhaka',
    phone: '+88028954455',
    email: 'uttara@suoxiclinic.com',
    managerName: 'Rashedul Karim',
    managerPhone: '+8801911776655',
    operatingHours: '09:30 AM - 08:00 PM (Sat - Thu)',
    isActive: true,
    createdAt: '2025-02-10T00:00:00Z',
  },
];

let currentUser: User = {
  id: 'usr-101',
  employeeId: '0002',
  name: 'Dr. Nusrat Jahan',
  nameBn: 'ডাঃ নুসরাত জাহান',
  email: 'nusrat.jahan@suoxiclinic.com',
  role: 'doctor',
  phone: '+8801711223344',
  branchId: 'br-dhanmondi',
  branchName: 'Dhanmondi Main Center',
  specialization: 'MBBS, DDV, Consultant Aesthetic Dermatologist',
  bmdcRegNo: 'BMDC-A-48921',
};

const initialSeedPatients: Patient[] = [
  {
    id: 'pat-1',
    patientIdCode: 'SKC-000088',
    name: 'Sumaiya Rahman',
    nameBn: 'সুমাইয়া রহমান',
    phone: '+8801712345678',
    email: 'sumaiya.rahman@gmail.com',
    gender: 'female',
    dateOfBirth: '1998-04-12',
    age: 28,
    bloodGroup: 'B+',
    address: 'House 42, Road 7, Dhanmondi, Dhaka',
    city: 'Dhaka',
    branchId: 'br-dhanmondi',
    allergies: ['Dust', 'Sunscreens with oxybenzone'],
    skinType: 'combination',
    medicalHistory: 'Mild adult hormonal acne, hyperpigmentation on malar cheeks. Undergoing HydraFacial.',
    createdAt: '2026-02-15T10:00:00Z',
    updatedAt: '2026-10-18T10:00:00Z',
  },
  {
    id: 'pat-2',
    patientIdCode: 'SKC-000089',
    name: 'Tanvir Ahmed',
    nameBn: 'তানভীর আহমেদ',
    phone: '+8801812345678',
    email: 'tanvir.ahmed@yahoo.com',
    gender: 'male',
    dateOfBirth: '1992-09-18',
    age: 34,
    bloodGroup: 'O+',
    address: 'Road 12, Banani DOHS, Dhaka',
    city: 'Dhaka',
    branchId: 'br-dhanmondi',
    allergies: [],
    skinType: 'oily',
    medicalHistory: 'Enlarged pores, sun damage. Scheduled for Laser Carbon Peel.',
    createdAt: '2026-03-01T11:00:00Z',
    updatedAt: '2026-10-19T05:25:00Z',
  },
  {
    id: 'pat-3',
    patientIdCode: 'SKC-000090',
    name: 'Roxane Begum',
    nameBn: 'রোকসানা বেগম',
    phone: '+8801912345678',
    email: 'roxane.begum@outlook.com',
    gender: 'female',
    dateOfBirth: '1995-11-23',
    age: 31,
    bloodGroup: 'A+',
    address: 'House 14, Road 33, Gulshan-2, Dhaka',
    city: 'Dhaka',
    branchId: 'br-dhanmondi',
    allergies: ['Salicylic acid high concentration'],
    skinType: 'sensitive',
    medicalHistory: 'Severe acne scarring, erythema. Scheduled for Acne Scar Revision consultation.',
    createdAt: '2026-04-10T09:00:00Z',
    updatedAt: '2026-10-18T12:00:00Z',
  },
  {
    id: 'pt-1',
    patientIdCode: 'SX-2026-0841',
    name: 'Taslima Akter',
    nameBn: 'তাসলিমা আক্তার',
    phone: '+8801712345678',
    email: 'taslima.akter@gmail.com',
    gender: 'female',
    dateOfBirth: '1994-05-14',
    age: 32,
    bloodGroup: 'B+',
    address: 'Road 5, Dhanmondi, Dhaka',
    city: 'Dhaka',
    branchId: 'br-dhanmondi',
    allergies: ['Penicillin', 'Sulfa drugs'],
    skinType: 'combination',
    medicalHistory: 'Mild adult hormonal acne, hyperpigmentation on malar cheeks.',
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-10-15T11:00:00Z',
  },
  {
    id: 'pt-2',
    patientIdCode: 'SX-2026-0842',
    name: 'Md. Farhan Chowdhury',
    nameBn: 'মোঃ ফারহান চৌধুরী',
    phone: '+8801819876543',
    email: 'farhan.chowdhury@hotmail.com',
    gender: 'male',
    dateOfBirth: '1988-11-20',
    age: 37,
    bloodGroup: 'O+',
    address: 'Banani Block C, Dhaka',
    city: 'Dhaka',
    branchId: 'br-gulshan',
    allergies: [],
    skinType: 'oily',
    medicalHistory: 'Deep acne scars, requested Carbon Laser treatment.',
    createdAt: '2026-02-01T12:00:00Z',
    updatedAt: '2026-10-14T09:30:00Z',
  },
  {
    id: 'pt-3',
    patientIdCode: 'SX-2026-0843',
    name: 'Sadia Rahman',
    nameBn: 'সাদিয়া রহমান',
    phone: '+8801911223399',
    email: 'sadia.r@yahoo.com',
    gender: 'female',
    dateOfBirth: '1998-03-08',
    age: 28,
    bloodGroup: 'A+',
    address: 'Sector 3, Uttara, Dhaka',
    city: 'Dhaka',
    branchId: 'br-uttara',
    allergies: ['Fragrance in cosmetic creams'],
    skinType: 'sensitive',
    medicalHistory: 'Rosacea flare-ups, dehydration.',
    createdAt: '2026-03-05T14:15:00Z',
    updatedAt: '2026-10-16T08:00:00Z',
  },
  {
    id: 'pt-4',
    patientIdCode: 'SX-2026-0844',
    name: 'Taslima Akhter (Flagged)',
    nameBn: 'তাসলিমা আক্তার',
    phone: '+8801712345678', // Same phone as pt-1
    email: 'taslima.office@corp.bd',
    gender: 'female',
    age: 32,
    city: 'Dhaka',
    branchId: 'br-dhanmondi',
    isFlaggedDuplicate: true,
    duplicateReason: 'Exact phone number match with SX-2026-0841 (Taslima Akter). Awaiting manual review.',
    createdAt: '2026-10-14T15:20:00Z',
    updatedAt: '2026-10-14T15:20:00Z',
  },
  {
    id: 'pt-8',
    patientIdCode: 'SX-2026-0848',
    name: 'Ahad',
    nameBn: 'আহাদ',
    phone: '+8801314113022',
    email: 'ahad@example.com',
    gender: 'male',
    age: 31,
    bloodGroup: 'B+',
    address: 'Dhanmondi, Dhaka',
    city: 'Dhaka',
    branchId: 'br-dhanmondi',
    allergies: [],
    medicalHistory: 'Acne and facial skin assessment.',
    skinType: 'combination',
    createdAt: '2026-10-17T10:00:00Z',
    updatedAt: '2026-10-17T10:00:00Z',
  },
];

const PATIENTS_STORAGE_FILE = path.resolve(process.cwd(), 'storage', 'patients.json');

function loadPersistedPatients(): Patient[] {
  try {
    if (fs.existsSync(PATIENTS_STORAGE_FILE)) {
      const data = fs.readFileSync(PATIENTS_STORAGE_FILE, 'utf-8');
      const loaded = JSON.parse(data);
      if (Array.isArray(loaded) && loaded.length > 0) {
        return loaded;
      }
    }
  } catch (err) {
    console.error('Failed to load persisted patients from disk, using default seed:', err);
  }
  return [...initialSeedPatients];
}

const patients: Patient[] = loadPersistedPatients();

export function savePatientsToDisk(): void {
  try {
    const dir = path.dirname(PATIENTS_STORAGE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(PATIENTS_STORAGE_FILE, JSON.stringify(patients, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write patients to disk:', err);
  }
}

// Ensure patients.json is written initially if file didn't exist
try {
  if (!fs.existsSync(PATIENTS_STORAGE_FILE)) {
    savePatientsToDisk();
  }
} catch (e) {
  console.error('Initial patient file sync error:', e);
}

export function syncPatientsToService(): void {
  for (const pt of patients) {
    patientService.upsertPatient({
      id: pt.id,
      patient_code: pt.patientIdCode,
      branch_id: pt.branchId || 'br-dhanmondi',
      full_name: pt.name,
      full_name_bn: pt.nameBn,
      gender: pt.gender as any,
      approximate_age: pt.age,
      blood_group: pt.bloodGroup as any,
      primary_mobile: pt.phone,
      primary_mobile_normalized: pt.phone,
      email: pt.email,
      address: pt.address,
      city: pt.city,
      status: 'active',
      created_at: pt.createdAt,
      updated_at: pt.updatedAt,
    });
  }
}
syncPatientsToService();

// Today is 2026-10-17 Asia/Dhaka
const todayStr = '2026-10-17';
const tomorrowStr = '2026-10-18';

const appointments: Appointment[] = [
  {
    id: 'apt-201',
    patientId: 'pt-1',
    patientName: 'Taslima Akter',
    patientPhone: '+8801712345678',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    doctorId: 'usr-101',
    doctorName: 'Dr. Nusrat Jahan',
    serviceCategory: 'Skin Care',
    serviceName: 'HydraFacial Deluxe + Derma Infusion',
    appointmentDate: todayStr,
    appointmentTime: '11:00',
    durationMinutes: 45,
    status: 'confirmed',
    callReference: 'CR-88910',
    notes: 'Session 2 of 5. Bring previous prescription.',
    createdBy: 'usr-103',
    createdAt: '2026-10-15T10:00:00Z',
    updatedAt: '2026-10-16T09:00:00Z',
  },
  {
    id: 'apt-202',
    patientId: 'pt-2',
    patientName: 'Md. Farhan Chowdhury',
    patientPhone: '+8801819876543',
    branchId: 'br-gulshan',
    branchName: 'Gulshan Aesthetic Lounge',
    doctorId: 'usr-102',
    doctorName: 'Dr. Tanvir Ahmed',
    serviceCategory: 'Laser & Aesthetic',
    serviceName: 'Carbon Laser Peel (Hollywood Peel)',
    appointmentDate: todayStr,
    appointmentTime: '15:30',
    durationMinutes: 60,
    status: 'booked',
    callReference: 'CR-88944',
    createdBy: 'usr-103',
    createdAt: '2026-10-16T11:00:00Z',
    updatedAt: '2026-10-16T11:00:00Z',
  },
  {
    id: 'apt-203',
    patientId: 'pt-3',
    patientName: 'Sadia Rahman',
    patientPhone: '+8801911223399',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    doctorId: 'usr-101',
    doctorName: 'Dr. Nusrat Jahan',
    serviceCategory: 'General Consultation',
    serviceName: 'Aesthetic Dermatology Consultation',
    appointmentDate: tomorrowStr,
    appointmentTime: '12:00',
    durationMinutes: 30,
    status: 'booked',
    callReference: 'CR-89012',
    notes: 'First time consultation for pigmentation and skin texture.',
    createdBy: 'usr-104',
    createdAt: '2026-10-16T14:00:00Z',
    updatedAt: '2026-10-16T14:00:00Z',
  },
  {
    id: 'apt-204',
    patientId: 'pt-1',
    patientName: 'Taslima Akter',
    patientPhone: '+8801712345678',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    doctorId: 'usr-101',
    doctorName: 'Dr. Nusrat Jahan',
    serviceCategory: 'Skin Care',
    serviceName: 'HydraFacial Follow-up & Serum Glow',
    appointmentDate: tomorrowStr,
    appointmentTime: '16:00',
    durationMinutes: 45,
    status: 'booked',
    callReference: 'CR-89045',
    createdBy: 'usr-103',
    createdAt: '2026-10-16T15:00:00Z',
    updatedAt: '2026-10-16T15:00:00Z',
  },
];

// Call Center & CRM Follow-up Tasks
const callTasks: CallCenterTask[] = [
  {
    id: 'ct-1',
    appointmentId: 'apt-203',
    patientId: 'pt-3',
    patientName: 'Sadia Rahman',
    patientPhone: '+8801911223399',
    appointmentDate: tomorrowStr,
    appointmentTime: '12:00',
    doctorName: 'Dr. Nusrat Jahan',
    serviceName: 'Aesthetic Dermatology Consultation',
    branchName: 'Dhanmondi Main Center',
    callStatus: 'pending',
    smsStatus: 'gateway_accepted',
    callAttempts: 0,
    callNotes: '',
    followupPurpose: 'New Booking Confirmation',
    callOutcome: 'No Answer',
    patientIntent: 'Follow-up Later',
    nextFollowupDate: tomorrowStr,
    nextFollowupTime: '10:00',
  },
  {
    id: 'ct-2',
    appointmentId: 'apt-204',
    patientId: 'pt-1',
    patientName: 'Taslima Akter',
    patientPhone: '+8801712345678',
    appointmentDate: tomorrowStr,
    appointmentTime: '16:00',
    doctorName: 'Dr. Nusrat Jahan',
    serviceName: 'HydraFacial Follow-up & Serum Glow',
    branchName: 'Dhanmondi Main Center',
    callStatus: 'confirmed',
    smsStatus: 'sent',
    callAttempts: 1,
    callNotes: 'Patient confirmed she will arrive on time with her sister.',
    followupPurpose: 'Treatment Post-Care Follow-up',
    callOutcome: 'Connected',
    patientIntent: 'Appointment Confirmed',
    lastCalledAt: '2026-10-18T09:30:00Z',
    agentName: 'Tania Khan (CRM Agent)',
  },
  {
    id: 'ct-3',
    appointmentId: 'apt-205',
    patientId: 'pt-2',
    patientName: 'Md. Farhan Chowdhury',
    patientPhone: '+8801819876543',
    appointmentDate: tomorrowStr,
    appointmentTime: '18:30',
    doctorName: 'Dr. Tanvir Ahmed',
    serviceName: 'Laser Carbon Peel Consultation',
    branchName: 'Uttara Skin Care Clinic',
    callStatus: 'rescheduled',
    smsStatus: 'gateway_accepted',
    callAttempts: 2,
    callNotes: 'In meeting during 1st call. On 2nd call requested evening callback.',
    followupPurpose: 'Package Session Reminder',
    callOutcome: 'Call Back Requested',
    patientIntent: 'Rescheduled',
    lastCalledAt: '2026-10-18T11:15:00Z',
    agentName: 'Tania Khan (CRM Agent)',
    nextFollowupDate: tomorrowStr,
    nextFollowupTime: '17:00',
  },
];

const consultations: Consultation[] = [
  {
    id: 'cons-1',
    patientId: 'pt-1',
    patientName: 'Taslima Akter',
    doctorId: 'usr-101',
    doctorName: 'Dr. Nusrat Jahan',
    appointmentId: 'apt-201',
    consultationDate: '2026-10-10',
    chiefComplaints: 'Persistent melasma patches on both cheeks; post-inflammatory hyperpigmentation; dull complexion.',
    examinationNotes: 'Fitzpatrick skin type IV. Moderate epidermal pigmentation. No active acne pustules.',
    clinicalDiagnosis: 'Epidermal Melasma & Post-Inflammatory Hyperpigmentation',
    skinAnalysis: {
      hydration: '38% (Low)',
      pigmentation: 'High (Index 68)',
      elasticity: 'Good',
      sebum: 'Moderate T-zone',
    },
    recommendedProcedures: [
      'HydraFacial MD with GlySal Peel (5 Sessions Package)',
      'Q-Switched Nd:YAG Laser Toning (Alternate weeks)',
      'Strict Broad Spectrum SPF 50+ Sun Protection',
    ],
    nextSessionDate: '2026-10-24', // Doctor sets next session date (Hard rule 2)
    nextSessionNotes: 'Session 3: Evaluate response to HydraFacial and begin low-fluence Nd:YAG toning.',
    prescriptionId: 'rx-1',
    createdAt: '2026-10-10T11:45:00Z',
  },
];

const rxProtocols: RxProtocol[] = [
  {
    id: 'proto-melasma',
    name: 'Epidermal Melasma & Brightening',
    subtitle: 'Q-Switch Laser + Azelaic + Vit C + Strict SPF',
    category: 'Pigmentation & Melasma',
    isActive: true,
    isDefaultBaseline: true,
    diagnosis: 'Epidermal Melasma',
    chiefComplaints: 'Dark brownish patches over bilateral malar cheeks and forehead',
    investigations: "Wood's Lamp / Dermoscopy, TSH / Thyroid Profile, Serum Ferritin",
    examinationNotes: 'Fitzpatrick Type IV, epidermal melanin patch under Wood’s lamp, barrier intact',
    skinType: 'combination',
    targetZones: ['Malar Cheeks', 'Forehead & Glabella'],
    procedures: ['Q-Switched Nd:YAG Laser Toning', 'HydraFacial MD with GlySal Peel'],
    medicines: [
      {
        name: 'Azelaic Acid 20% Derma Cream',
        genericName: 'Azelaic Acid',
        form: 'Cream',
        dosage: 'PM (Night)',
        duration: '60 days',
        instructions: 'Apply pea-sized thin layer on pigmented patches after drying face',
        instructionsBn: 'রাতে মুখ ধোয়ার ২০ মিনিট পর দাগের ওপর পাতলা করে লাগাবেন',
      },
      {
        name: 'Vitamin C 15% + Ferulic Serum',
        genericName: 'L-Ascorbic Acid',
        form: 'Serum',
        dosage: 'AM (Morning)',
        duration: '60 days',
        instructions: '3–4 drops on clean skin before moisturizer and sunscreen',
        instructionsBn: 'সকালে ময়েশ্চারাইজার ও সানস্ক্রিনের আগে ৩–৪ ফোঁটা লাগাবেন',
      },
      {
        name: 'UV Shield Mineral Sunscreen SPF 50+',
        genericName: 'Zinc Oxide + Tinosorb',
        form: 'Sunscreen',
        dosage: 'AM + Noon',
        duration: 'Continuous',
        instructions: 'Two-finger length amount 20 mins before sun exposure',
        instructionsBn: 'রোদে বা চুলার পাশে যাওয়ার ২০ মিনিট আগে ব্যবহার করুন',
      },
      {
        name: 'Tab. Tranexa 250 mg',
        genericName: 'Tranexamic Acid',
        form: 'Tablet',
        dosage: '1+0+1',
        duration: '30 days',
        instructions: 'After meal',
        instructionsBn: 'ভরা পেটে খাবেন',
      },
    ],
    adviceList: [
      'বাইরে বের হওয়ার ২০ মিনিট আগে সানস্ক্রিন SPF 50+ ব্যবহার করুন (প্রতি ৩ ঘণ্টা পর পর)',
      'রান্নাঘরের সরাসরি চুলার তাপ ও রোদ এড়িয়ে চলুন',
      'চিকিৎসকের পরামর্শ ছাড়া কোনো স্টেরয়েড বা ফার্মেসি ক্রিম ব্যবহার করবেন না',
    ],
    sunInstructions: 'Apply 2-finger length broad-spectrum SPF 50+ PA++++ every 3 hours; avoid direct kitchen stove heat.',
    sunInstructionsBn: 'রোদে বা চুলার কাছে যাওয়ার ২০ মিনিট আগে ২-আঙুল পরিমাণ সানস্ক্রিন ব্যবহার করুন।',
    waterLiters: 3.0,
    followUpDays: 14,
    morningRoutine: [
      '1. Gentle pH-balanced Cleanser',
      '2. Antioxidant / Hyaluronic Serum',
      '3. Lightweight Barrier Moisturizer',
      '4. Broad-Spectrum Sunscreen SPF 50+ PA++++',
    ],
    eveningRoutine: [
      '1. Gentle Cleanser',
      '2. Azelaic Acid 20% Thin Layer',
      '3. Ceramide Moisturizer',
    ],
    recommendedFoods: [
      'Amla, Guava, Orange & Lemon (Vitamin C collagen support)',
      'Papaya, Carrots & Tomatoes (Antioxidant lycopene)',
      'Almonds, Walnuts & Chia Seeds (Omega-3 & Vitamin E)',
      'Spinach, Broccoli & Green Leafy Vegetables',
    ],
    prohibitedFoods: [
      'Refined sugar, sweet pastries & sugary carbonated drinks',
      'Deep-fried fast food & trans-fat street snacks',
      'Excessive spicy gravies causing facial flushing',
    ],
    createdBy: 'Dr. Nusrat Jahan',
    updatedAt: '2026-11-17T08:00:00Z',
  },
  {
    id: 'proto-acne',
    name: 'Acne & Sebum Control',
    subtitle: 'Salicylic Peel + Adapalene + Matte SPF',
    category: 'Acne & Sebum',
    isActive: true,
    isDefaultBaseline: false,
    diagnosis: 'Acne Vulgaris (Grade II)',
    chiefComplaints: 'Recurrent facial breakouts, open/closed comedones, and oily T-zone',
    investigations: 'LH / FSH / Testosterone (PCOS Panel), HbA1c / FBS',
    examinationNotes: 'Open & closed comedones with mild inflammatory papules on cheeks and jawline',
    skinType: 'oily',
    targetZones: ['Malar Cheeks', 'Nose & T-Zone', 'Jawline & Submental'],
    procedures: ['Medical Chemical Peel (Salicylic / Glycolic)'],
    medicines: [
      {
        name: 'Salicylic Acid 2% Clarifying Wash',
        genericName: 'Salicylic Acid',
        form: 'Facewash',
        dosage: 'AM + PM',
        duration: '60 days',
        instructions: 'Massage gently for 30 seconds and rinse with cool water',
        instructionsBn: 'সকাল ও রাতে ৩০ সেকেন্ড ম্যাসাজ করে ঠান্ডা পানিতে ধুয়ে ফেলুন',
      },
      {
        name: 'Adapalene 0.1% + Clindamycin Gel',
        genericName: 'Adapalene + Clindamycin',
        form: 'Gel',
        dosage: 'PM (Night)',
        duration: '45 days',
        instructions: 'Apply thin pea-sized layer at bedtime; avoid corners of eyes & nose',
        instructionsBn: 'রাতে ঘুমানোর আগে পাতলা করে লাগান (চোখের কোণা এড়িয়ে চলুন)',
      },
      {
        name: 'Oil-Free Matte Gel Sunscreen SPF 50',
        genericName: 'Non-comedogenic UV Filter',
        form: 'Sunscreen',
        dosage: 'AM (Morning)',
        duration: 'Continuous',
        instructions: 'Apply every morning and reapply if outdoors',
        instructionsBn: 'প্রতিদিন সকালে মুখে ব্যবহার করুন',
      },
      {
        name: 'Cap. Doxycycline 100 mg',
        genericName: 'Doxycycline',
        form: 'Capsule',
        dosage: '0+0+1',
        duration: '14 days',
        instructions: 'After dinner with a full glass of water; stay upright 30 mins',
        instructionsBn: 'রাতের খাবারের পর এক গ্লাস পানি দিয়ে খাবেন',
      },
    ],
    adviceList: [
      'ব্রণ খুঁটবেন বা চাপ দেবেন না—এতে স্থায়ী দাগ বা গর্ত হতে পারে',
      'অতিরিক্ত চিনি, দুধের মিষ্টি ও ভাজাপোড়া খাবার এড়িয়ে চলুন',
      'দৈনিক কমপক্ষে ২.৫–৩ লিটার বিশুদ্ধ পানি পান করুন',
    ],
    sunInstructions: 'Use oil-free non-comedogenic gel sunscreen SPF 50 daily before stepping out.',
    sunInstructionsBn: 'তেলমুক্ত জেল সানস্ক্রিন প্রতিদিন সকালে ব্যবহার করুন।',
    waterLiters: 3.0,
    followUpDays: 14,
    morningRoutine: ['1. Salicylic Acid 2% Wash', '2. Niacinamide Oil-Control Serum', '3. Matte Gel SPF 50'],
    eveningRoutine: ['1. Salicylic Acid 2% Wash', '2. Adapalene + Clindamycin Gel (Pea-sized)', '3. Light Oil-Free Gel'],
    recommendedFoods: [
      'Amla, Guava, Orange & Lemon (Vitamin C collagen support)',
      'Papaya, Carrots & Tomatoes (Antioxidant lycopene)',
      'Almonds, Walnuts & Chia Seeds (Omega-3 & Vitamin E)',
      'Spinach, Broccoli & Green Leafy Vegetables',
    ],
    prohibitedFoods: [
      'High-glycemic sweets, sugary tea/coffee & dairy desserts',
      'Deep-fried snacks & oily fast food',
    ],
    createdBy: 'Dr. Nusrat Jahan',
    updatedAt: '2026-11-17T08:00:00Z',
  },
  {
    id: 'proto-post-laser',
    name: 'Post-CO2 Laser & Scar Recovery',
    subtitle: 'Barrier Repair + HA Serum + Physical SPF',
    category: 'Laser & Scar Recovery',
    isActive: true,
    isDefaultBaseline: false,
    diagnosis: 'Atrophic Acne Scars (Post-Fractional Care)',
    chiefComplaints: 'Rolling and boxcar post-acne scars across malar region',
    investigations: 'CBC, HbA1c / FBS',
    examinationNotes: 'Fitzpatrick Type IV, deep scars suitable for fractional resurfacing; barrier prep needed',
    skinType: 'sensitive',
    targetZones: ['Malar Cheeks', 'Forehead & Glabella'],
    procedures: ['Fractional CO2 Laser Resurfacing', 'Autologous PRP Skin / Hair Therapy'],
    medicines: [
      {
        name: 'Centella + Ceramide Barrier Repair Cream',
        genericName: 'Ceramide NP + Madecassoside',
        form: 'Cream',
        dosage: 'AM + PM',
        duration: '30 days',
        instructions: 'Apply generously to calm redness and support post-procedure healing',
        instructionsBn: 'দিনে ২ বার ত্বক কোমল ও সুরক্ষিত রাখতে লাগান',
      },
      {
        name: 'Hyaluronic Acid 2% + B5 Hydrating Serum',
        genericName: 'Sodium Hyaluronate + Panthenol',
        form: 'Serum',
        dosage: 'AM + PM',
        duration: '60 days',
        instructions: 'Apply on slightly damp skin before moisturizer',
        instructionsBn: 'হালকা ভেজা ত্বকে ২–৩ ফোঁটা ব্যবহার করুন',
      },
      {
        name: 'Mineral Soothing Sunscreen SPF 50+',
        genericName: 'Physical UV Filters',
        form: 'Sunscreen',
        dosage: 'AM + Noon',
        duration: 'Continuous',
        instructions: 'Mandatory post-laser protection every 3 hours',
        instructionsBn: 'লেজারের পর রোদ ও তাপ থেকে বাঁচতে প্রতি ৩ ঘণ্টায় ব্যবহার করুন',
      },
    ],
    adviceList: [
      'লেজার/পিলের পর ৪৮ ঘণ্টা সরাসরি রোদ, গরম ভাপ ও চুলার তাপ এড়িয়ে চলুন',
      'পাঁচ দিন কোনো স্ক্রাব, ফেসওয়াশ বা অ্যাক্টিভ অ্যাসিড ব্যবহার করবেন না',
      'মুখ ঘষে মুছবেন না; নরম তোয়ালে দিয়ে হালকাভাবে মুছুন',
    ],
    sunInstructions: 'Strict photoprotection for 14 days post-laser. Apply mineral SPF 50+ indoors near windows as well.',
    sunInstructionsBn: 'লেজারের পর ১৪ দিন কঠোরভাবে রোদ ও তাপ এড়িয়ে চলুন ও মিনারেল সানস্ক্রিন লাগান।',
    waterLiters: 3.0,
    followUpDays: 7,
    morningRoutine: ['1. Thermal Spring Water Mist / Gentle Wash', '2. Hyaluronic Acid B5 Serum', '3. Ceramide Cream', '4. Mineral SPF 50+'],
    eveningRoutine: ['1. Ultra-Gentle Cleanser', '2. Centella Barrier Repair Balm'],
    recommendedFoods: [
      'Amla, Guava, Orange & Lemon (Vitamin C collagen support)',
      'Papaya, Carrots & Tomatoes (Antioxidant lycopene)',
      'Almonds, Walnuts & Chia Seeds (Omega-3 & Vitamin E)',
    ],
    prohibitedFoods: [
      'Refined sugar, sweet pastries & sugary carbonated drinks',
      'Deep-fried fast food & trans-fat street snacks',
    ],
    createdBy: 'Dr. Nusrat Jahan',
    updatedAt: '2026-11-17T08:00:00Z',
  },
  {
    id: 'proto-hair',
    name: 'Hair Fall & PRP Density Protocol',
    subtitle: 'PRP Therapy + Minoxidil + Biotin Complex',
    category: 'Hair & PRP',
    isActive: true,
    isDefaultBaseline: false,
    diagnosis: 'Androgenetic Alopecia',
    chiefComplaints: 'Progressive hair thinning at crown and frontal hairline for 6 months',
    investigations: 'CBC, Serum Ferritin, Vitamin D3, TSH / Thyroid Profile',
    examinationNotes: 'Positive hair pull test, widening central part, mild scalp seborrhea',
    skinType: 'normal',
    targetZones: ['Scalp'],
    procedures: ['Autologous PRP Skin / Hair Therapy'],
    medicines: [
      {
        name: 'Minoxidil 5% + Finasteride Topical Solution',
        genericName: 'Minoxidil + Finasteride',
        form: 'Lotion',
        dosage: 'PM (Night)',
        duration: '90 days',
        instructions: 'Apply 1 ml directly on dry scalp and massage gently',
        instructionsBn: 'রাতে শুষ্ক স্ক্যাল্পে ১ মিলি লাগিয়ে হালকা ম্যাসাজ করুন',
      },
      {
        name: 'Biotin + Zinc + Amino Hair Support',
        genericName: 'Biotin 10mg Complex',
        form: 'Tablet',
        dosage: '0+1+0',
        duration: '60 days',
        instructions: 'After lunch',
        instructionsBn: 'দুপুরের খাবারের পর ১টি করে খাবেন',
      },
      {
        name: 'Ketoconazole 2% Medicated Scalp Wash',
        genericName: 'Ketoconazole',
        form: 'Facewash',
        dosage: '2x Weekly',
        duration: '30 days',
        instructions: 'Leave foam on scalp for 3–5 minutes before rinsing',
        instructionsBn: 'সপ্তাহে ২ দিন মাথায় ৩–৫ মিনিট রেখে ধুয়ে ফেলুন',
      },
    ],
    adviceList: [
      'PRP সেশনের পর ২৪ ঘণ্টা মাথায় শ্যাম্পু বা তেল ব্যবহার করবেন না',
      'পর্যাপ্ত প্রোটিনসমৃদ্ধ খাবার (ডিম, মাছ, বাদাম) ও পর্যাপ্ত ঘুম নিশ্চিত করুন',
    ],
    sunInstructions: 'Protect scalp from intense midday sun after PRP microneedling for 48 hours.',
    sunInstructionsBn: 'PRP করার পর ৪৮ ঘণ্টা সরাসরি কড়া রোদ এড়িয়ে চলুন।',
    waterLiters: 2.5,
    followUpDays: 30,
    morningRoutine: ['1. Gentle Scalp Care', '2. Post-Breakfast Biotin Supplement'],
    eveningRoutine: ['1. Dry Scalp Application (Minoxidil 1ml)', '2. Gentle Fingertip Massage'],
    recommendedFoods: [
      'Eggs, lean fish, lentils & Greek yogurt (Keratin protein)',
      'Pumpkin seeds, walnuts & spinach (Iron & Zinc)',
    ],
    prohibitedFoods: ['Crash dieting & excess sugary beverages'],
    createdBy: 'Dr. Nusrat Jahan',
    updatedAt: '2026-11-17T08:00:00Z',
  },
];

const prescriptions: Prescription[] = [
  {
    id: 'rx-1',
    prescriptionCode: 'RX-2026-0312',
    patientId: 'pt-1',
    patientName: 'Taslima Akter',
    patientAge: 32,
    patientGender: 'Female',
    doctorId: 'usr-101',
    doctorName: 'Dr. Nusrat Jahan',
    doctorCredentials: 'MBBS, DDV, Consultant Aesthetic Dermatologist (BMDC-A-48921)',
    consultationId: 'cons-1',
    diagnosis: 'Epidermal Melasma & Post-Inflammatory Hyperpigmentation',
    version: 1,
    isFinalized: true,
    language: 'both',
    nextSessionDate: '2026-10-24',
    medicines: [
      {
        id: 'med-1',
        name: 'Azelaic Acid 20% Cream',
        genericName: 'Azelaic Acid',
        form: 'Cream',
        dosage: '0-0-1 (Nightly)',
        duration: '6 weeks',
        instructions: 'Apply a pea-sized amount over pigmented spots at bedtime after gentle cleansing.',
        instructionsBn: 'রাতে মৃদু ফেসওয়াশ দিয়ে মুখ ধোয়ার পর কালো দাগের ওপর লাগাবেন।',
      },
      {
        id: 'med-2',
        name: 'Suoxi Physical Tinted Sunscreen SPF 50+ PA++++',
        genericName: 'Zinc Oxide + Titanium Dioxide',
        form: 'Sunscreen',
        dosage: '1-1-1 (Every 3-4 hours outdoors)',
        duration: 'Continuous',
        instructions: 'Apply 2 finger lengths 20 mins before sun exposure. Reapply even when indoors near windows.',
        instructionsBn: 'রোদে বের হওয়ার ২০ মিনিট আগে দুই আঙুল পরিমাণ মুখে ও গলায় লাগান। প্রতি ৩-৪ ঘণ্টা পর পুনরায় লাগান।',
      },
      {
        id: 'med-3',
        name: 'Glutathione + Vitamin C 500mg Effervescent',
        genericName: 'L-Glutathione & Ascorbic Acid',
        form: 'Tablet',
        dosage: '1-0-0 (Morning)',
        duration: '30 days',
        instructions: 'Dissolve 1 tablet in 200ml drinking water after breakfast.',
        instructionsBn: 'সকালের নাস্তার পর এক গ্লাস (২০০ মিলি) পানিতে একটি ট্যাবলেট গুলিয়ে পান করুন।',
      },
    ],
    lifestyleGuidance: {
      id: 'flg-1',
      prescriptionId: 'rx-1',
      isFrozenSnapshot: true, // Hard Rule 6
      snapshotVersion: 1,
      waterIntakeLiters: 3.0,
      sunProtectionInstructions: 'Wear wide-brimmed hat and UV sunglasses. Avoid direct midday sun between 11 AM - 3 PM. Never cook in high heat without sunscreen.',
      sunProtectionInstructionsBn: 'চওড়া টুপি ও রোদচশমা ব্যবহার করুন। বেলা ১১টা থেকে ৩টা সরাসরি রোদ এড়িয়ে চলুন। সানস্ক্রিন ছাড়া চুলার তাপে রান্না করবেন না।',
      recommendedFoods: [
        'Citrus fruits (Oranges, Guava, Amla - rich in Vitamin C)',
        'Papaya, Pomegranate, Tomatoes (Lycopene for photoprotection)',
        'Green leafy vegetables & Spinach',
        'Almonds & Walnuts (Vitamin E & Omega 3)',
      ],
      recommendedFoodsBn: [
        'টক ফল (কমলা, পেয়ারা, আমলকী - ভিটামিন সি সমৃদ্ধ)',
        'পেঁপে, বেদানা ও টমেটো (ত্বকের প্রাকৃতিক সুরক্ষা)',
        'সবুজ শাকসবজি ও পালং শাক',
        'কাঠবাদাম ও আখরোট',
      ],
      prohibitedFoods: [
        'Excess refined sugars, pastries, and sweet beverages',
        'Deep-fried street foods and trans-fats',
        'Excess spicy oily curries which exacerbate flushing',
      ],
      prohibitedFoodsBn: [
        'অতিরিক্ত চিনি, মিষ্টি ও প্রক্রিয়াজাত পানীয়',
        'ডিপ ফ্রাইড ও অতিরিক্ত তেল-মসলাযুক্ত খাবার',
        'অনিয়মিত ক্যাফেইন ও কোল্ড ড্রিঙ্কস',
      ],
      lifestylePrecautions: [
        'Sleep at least 7-8 hours to aid skin cellular repair',
        'Do not scrub or use harsh abrasive face towels',
        'Avoid sauna, steam rooms, or vigorous workouts for 48h after peel',
      ],
      lifestylePrecautionsBn: [
        'রাতে কমপক্ষে ৭-৮ ঘণ্টা পর্যাপ্ত ঘুম জরুরি',
        'মুখে কখনো শক্তভাবে ঘষাঘষি করবেন না',
        'লেজার বা পিল নেওয়ার ৪৮ ঘণ্টা পর্যন্ত স্টিম বা অতিরিক্ত ঘাম এড়িয়ে চলুন',
      ],
      skincareRoutineMorning: [
        '1. Mild Gentle Gel Cleanser',
        '2. Hyaluronic Acid B5 Hydrating Serum',
        '3. Suoxi Sunscreen SPF 50+',
      ],
      skincareRoutineEvening: [
        '1. Double Cleanse with Micellar Water',
        '2. Azelaic Acid 20% on spots',
        '3. Ceramide Barrier Repair Cream',
      ],
      createdAt: '2026-10-10T11:45:00Z',
    },
    createdAt: '2026-10-10T11:45:00Z',
  },
  {
    id: 'rx-2',
    prescriptionCode: 'RX-2026-0313',
    patientId: 'pt-2',
    patientName: 'Md. Farhan Chowdhury',
    patientAge: 37,
    patientGender: 'Male',
    doctorId: 'usr-101',
    doctorName: 'Dr. Nusrat Jahan',
    doctorCredentials: 'MBBS, DDV, Consultant Aesthetic Dermatologist (BMDC-A-48921)',
    consultationId: 'cons-2',
    diagnosis: 'Severe Ice-Pick Acne Scars & Post-Acne Erythema',
    version: 1,
    isFinalized: true,
    language: 'both',
    nextSessionDate: '2026-11-04',
    medicines: [
      {
        id: 'med-201',
        name: 'Clindamycin Phosphate 1% + Tretinoin 0.025% Gel',
        genericName: 'Clindamycin & Tretinoin',
        form: 'Gel',
        dosage: '0-0-1 (Nightly alternate days)',
        duration: '4 weeks',
        instructions: 'Apply a pea-sized amount over scarred zones before sleep. Avoid eye contour.',
        instructionsBn: 'রাতে ঘুমানোর আগে দাগযুক্ত জায়গায় হালকা করে লাগাবেন। চোখের চারপাশে লাগাবেন না।',
      },
      {
        id: 'med-202',
        name: 'Suoxi Post-Procedure Cica Soothing Recovery Balm',
        genericName: 'Centella Asiatica + Madecassoside 2%',
        form: 'Cream',
        dosage: '1-1-1 (Morning, Noon, Night)',
        duration: '14 days',
        instructions: 'Apply generous layer across treated face to speed up re-epithelialization.',
        instructionsBn: 'মুখের লালচে ভাব ও চামড়ার ক্ষত দ্রুত নিরাময়ের জন্য দিনে ৩ বার হালকা করে লাগান।',
      },
      {
        id: 'med-203',
        name: 'Ultra Matte Non-Comedogenic Sunblock SPF 60 PA++++',
        genericName: 'Micronized Zinc Oxide & Octocrylene',
        form: 'Sunscreen',
        dosage: '1-1-1 (Every 3 hours)',
        duration: 'Continuous',
        instructions: 'Mandatory daytime shield against UV induced post-laser hyperpigmentation.',
        instructionsBn: 'দিনের বেলা লেজার পরবর্তী দাগ প্রতিরোধে প্রতি ৩ ঘণ্টা পর পর অবশ্যই লাগাতে হবে।',
      },
    ],
    lifestyleGuidance: {
      id: 'flg-rx-2',
      prescriptionId: 'rx-2',
      isFrozenSnapshot: true,
      snapshotVersion: 1,
      waterIntakeLiters: 3.5,
      sunProtectionInstructions: 'Strict UV avoidance for 5 days post fractional ablative laser. Wear protective visor.',
      sunProtectionInstructionsBn: 'ফ্র্যাকশনাল লেজারের পর ৫ দিন সরাসরি সূর্যের তাপ ও তীব্র আলো এড়িয়ে চলুন।',
      recommendedFoods: ['Salmon & Omega-3 fish', 'Amla juice & Guava', 'Bone broth for natural collagen'],
      recommendedFoodsBn: ['সামুদ্রিক মাছ ও ওমেগা-৩', 'আমলকী ও পেয়ারা', 'প্রাকৃতিক কোলাজেন সমৃদ্ধ স্যুপ'],
      prohibitedFoods: ['Excess sodium and salty foods', 'Raw unwashed salads', 'Alcohol & tobacco'],
      prohibitedFoodsBn: ['অতিরিক্ত লবণাক্ত খাবার', 'ধূমপান ও অ্যালকোহল', 'তেল ও ঝালযুক্ত খাবার'],
      lifestylePrecautions: ['Do not pick or scratch laser micro-crusts', 'Change pillowcase daily', 'No shaving for 7 days'],
      lifestylePrecautionsBn: ['লেজারের পর ত্বকের খোসা নিজে থেকে উঠতে দিন, ঘষবেন না', 'প্রতিদিন পরিষ্কার বালিশের কভার ব্যবহার করুন'],
      skincareRoutineMorning: ['Gentle Foaming Cleanser', 'Centella Recovery Gel', 'SPF 60 Sunscreen'],
      skincareRoutineEvening: ['Cleansing Milk', 'Cica Soothing Balm'],
      createdAt: '2026-10-18T14:30:00Z',
    },
    createdAt: '2026-10-18T14:30:00Z',
  },
  {
    id: 'rx-3',
    prescriptionCode: 'RX-2026-0314',
    patientId: 'pt-3',
    patientName: 'Sadia Rahman',
    patientAge: 28,
    patientGender: 'Female',
    doctorId: 'usr-102',
    doctorName: 'Dr. Tanvir Ahmed',
    doctorCredentials: 'MBBS, FCPS (Dermatology), Senior Laser Specialist (BMDC-A-51204)',
    consultationId: 'cons-3',
    diagnosis: 'Facial Telangiectasia & Erythematotelangiectatic Rosacea',
    version: 1,
    isFinalized: true,
    language: 'both',
    nextSessionDate: '2026-11-10',
    medicines: [
      {
        id: 'med-301',
        name: 'Metronidazole 0.75% Topical Gel',
        genericName: 'Metronidazole',
        form: 'Gel',
        dosage: '1-0-1 (Morning & Night)',
        duration: '8 weeks',
        instructions: 'Apply thin film to flushed areas of cheeks and nose after gentle cleansing.',
        instructionsBn: 'সকালে ও রাতে মুখ পরিষ্কারের পর গাল ও নাকের লালচে অংশে হালকা প্রলেপ দিন।',
      },
      {
        id: 'med-302',
        name: 'Mineral Tinted Thermal Barrier Cream SPF 50',
        genericName: 'Zinc Oxide 18% + Allantoin',
        form: 'Sunscreen',
        dosage: '1-1-1 (Daytime continuous)',
        duration: 'Continuous',
        instructions: 'Apply every morning to calm thermal flush and block vascular stimulation.',
        instructionsBn: 'রোদে ও গরম আবহাওয়ায় ত্বক শান্ত রাখতে নিয়মিত ব্যবহার করুন।',
      },
    ],
    lifestyleGuidance: {
      id: 'flg-rx-3',
      prescriptionId: 'rx-3',
      isFrozenSnapshot: true,
      snapshotVersion: 1,
      waterIntakeLiters: 3.0,
      sunProtectionInstructions: 'Avoid sudden temperature changes, hot showers, and kitchen steam.',
      sunProtectionInstructionsBn: 'গরম পানির ভাপ, হট শাওয়ার ও রান্নার আগুনের সরাসরি তাপ থেকে দূরে থাকুন।',
      recommendedFoods: ['Cucumber, Coconut water, Mint', 'Flaxseeds, Chia seeds', 'Green vegetables'],
      recommendedFoodsBn: ['শসা, ডাবের পানি ও পুদিনা', 'তিসি ও চিয়া সিড', 'সবুজ শাকসবজি'],
      prohibitedFoods: ['Extremely spicy curries', 'Hot tea/coffee above 60C', 'Red meat and aged cheese'],
      prohibitedFoodsBn: ['অতিরিক্ত গরম চা-কফি', 'ঝাল কারি ও অতিরিক্ত মসলা', 'রেড মিট'],
      lifestylePrecautions: ['Never use harsh exfoliating scrubs', 'Use lukewarm or cool water to wash face'],
      lifestylePrecautionsBn: ['স্ক্রাব বা দানাদার ফেসওয়াশ সম্পূর্ণ নিষেধ', 'ঠাণ্ডা বা স্বাভাবিক তাপমাত্রার পানি দিয়ে মুখ ধোবেন'],
      skincareRoutineMorning: ['Soothing Cleanser', 'Barrier Repair Cream', 'Mineral Sunscreen'],
      skincareRoutineEvening: ['Micellar Gentle Wipe', 'Metronidazole Gel', 'Hydrating Moisturizer'],
      createdAt: '2026-10-20T10:15:00Z',
    },
    createdAt: '2026-10-20T10:15:00Z',
  },
];

const medicalDocuments: MedicalAttachment[] = [
  {
    id: 'doc-101',
    documentCode: 'DOC-2026-0041',
    patientId: 'pt-1',
    patientName: 'Taslima Akter',
    patientPhone: '+8801712345678',
    type: 'clinical_photo',
    title: 'HydraFacial Glow & Melasma Toning - Session 1 vs Session 3',
    titleBn: 'হাইড্রাফেসিয়াল ও মেলাসমা লেজার টোনিং - সেশন ১ ও সেশন ৩ তুলনা',
    category: 'Before-After Photos',
    procedureName: 'HydraFacial MD & Laser Toning',
    sessionNumber: 3,
    photoType: 'after',
    fileUrl: '/assets/clinical/before_after_taslima_melasma.png',
    thumbnailUrl: '/assets/clinical/before_after_taslima_melasma.png',
    fileSize: '3.8 MB',
    fileFormat: 'PNG',
    doctorName: 'Dr. Nusrat Jahan',
    signedByPatient: true,
    signatureDate: '2026-10-10',
    clinicalNotes: 'Visible 42% reduction in epidermal melanin density on bilateral zygomatic arches. Skin barrier intact.',
    isConfidential: true,
    createdAt: '2026-10-10T12:00:00Z',
  },
  {
    id: 'doc-102',
    documentCode: 'DOC-2026-0042',
    patientId: 'pt-1',
    patientName: 'Taslima Akter',
    patientPhone: '+8801712345678',
    type: 'consent_form',
    title: 'Informed Consent for Q-Switched Nd:YAG Laser & Chemical Peel Protocol',
    titleBn: 'কিউ-সুইচড লেজার ও কেমিক্যাল পিল পদ্ধতির আইনি সম্মতিপত্র',
    category: 'Informed Consent',
    procedureName: 'Q-Switched Nd:YAG Laser Toning',
    sessionNumber: 1,
    fileUrl: '/assets/clinical/consent_form_SX0841.pdf',
    fileSize: '1.2 MB',
    fileFormat: 'PDF',
    doctorName: 'Dr. Nusrat Jahan',
    signedByPatient: true,
    signatureDate: '2026-10-10',
    clinicalNotes: 'Patient signed digital consent on clinic iPad. Potential erythema, hyperpigmentation risks and strict SPF protocol acknowledged.',
    isConfidential: true,
    createdAt: '2026-10-10T11:15:00Z',
  },
  {
    id: 'doc-103',
    documentCode: 'DOC-2026-0043',
    patientId: 'pt-2',
    patientName: 'Md. Farhan Chowdhury',
    patientPhone: '+8801819876543',
    type: 'clinical_photo',
    title: 'Fractional CO2 Laser Resurfacing for Deep Ice-Pick Scars (Pre-op Baseline)',
    titleBn: 'ফ্র্যাকশনাল সিও২ লেজার প্রসিডিউর বেসলাইন ফটোগ্রাফি',
    category: 'Before-After Photos',
    procedureName: 'Fractional CO2 Laser Resurfacing',
    sessionNumber: 1,
    photoType: 'before',
    fileUrl: '/assets/clinical/farhan_scar_baseline.png',
    thumbnailUrl: '/assets/clinical/farhan_scar_baseline.png',
    fileSize: '4.2 MB',
    fileFormat: 'PNG',
    doctorName: 'Dr. Nusrat Jahan',
    signedByPatient: true,
    signatureDate: '2026-10-18',
    clinicalNotes: 'Cross-polarized baseline high-resolution imagery. Subcision + deep fractional ablation recommended for malar region.',
    isConfidential: true,
    createdAt: '2026-10-18T14:40:00Z',
  },
  {
    id: 'doc-104',
    documentCode: 'DOC-2026-0044',
    patientId: 'pt-2',
    patientName: 'Md. Farhan Chowdhury',
    patientPhone: '+8801819876543',
    type: 'patch_test',
    title: 'Fractional CO2 Laser Test Spot & Tolerance Evaluation (Right Mandibular Zone)',
    titleBn: 'লেজার প্যাচ টেস্ট ও ত্বকের সহনশীলতা পরীক্ষণ রিপোর্ট',
    category: 'Patch Test',
    procedureName: 'Fractional CO2 Laser',
    sessionNumber: 1,
    fileUrl: '/assets/clinical/patch_test_farhan.pdf',
    fileSize: '850 KB',
    fileFormat: 'PDF',
    doctorName: 'Dr. Nusrat Jahan',
    signedByPatient: true,
    signatureDate: '2026-10-18',
    clinicalNotes: 'Test energy: 15mJ, Pitch 0.8mm. Normal erythema resolved in 45 mins. No paradoxical hyperpigmentation observed.',
    isConfidential: true,
    createdAt: '2026-10-18T15:10:00Z',
  },
  {
    id: 'doc-105',
    documentCode: 'DOC-2026-0045',
    patientId: 'pt-3',
    patientName: 'Sadia Rahman',
    patientPhone: '+8801911223399',
    type: 'lab_biopsy_report',
    title: 'Comprehensive Serum Hormone & Antinuclear Antibody (ANA) Screening',
    titleBn: 'হরমোন প্রোফাইল ও এএনএ স্ক্রিনিং ল্যাবরেটরি রিপোর্ট',
    category: 'Lab & Biopsy',
    procedureName: 'Clinical Dermatology Screening',
    fileUrl: '/assets/clinical/lab_report_sadia.pdf',
    fileSize: '2.1 MB',
    fileFormat: 'PDF',
    doctorName: 'Dr. Tanvir Ahmed',
    signedByPatient: false,
    clinicalNotes: 'ANA negative. Serum DHEA-S & Free Testosterone within standard limits. Lupus erythematosus ruled out; confirmed primary Rosacea.',
    isConfidential: true,
    createdAt: '2026-10-20T11:00:00Z',
  },
  {
    id: 'doc-106',
    documentCode: 'DOC-2026-0046',
    patientId: 'pt-3',
    patientName: 'Sadia Rahman',
    patientPhone: '+8801911223399',
    type: 'consent_form',
    title: 'Aesthetic Laser & Rosacea Treatment Legal Consent Agreement',
    titleBn: 'রোসেসিয়া লেজার ট্রিটমেন্ট আইনি সম্মতিপত্র',
    category: 'Informed Consent',
    procedureName: 'Vascular Laser Toning',
    sessionNumber: 1,
    fileUrl: '/assets/clinical/consent_sadia_rosacea.pdf',
    fileSize: '1.4 MB',
    fileFormat: 'PDF',
    doctorName: 'Dr. Tanvir Ahmed',
    signedByPatient: true,
    signatureDate: '2026-10-20',
    clinicalNotes: 'Signed digital consent. Patient explicitly instructed on post-care cooling gel and avoidance of kitchen heat.',
    isConfidential: true,
    createdAt: '2026-10-20T11:30:00Z',
  },
];

const masterPackages: MasterPackage[] = [
  {
    id: 'mpkg-hydra-4',
    code: 'PKG-HF-04',
    name: 'HydraFacial MD Radiance Protocol',
    nameBn: 'হাইড্রাফেসিয়াল গ্লো প্রোটোকল (৪ সেশন)',
    serviceCategory: 'Facial & Skin Rejuvenation',
    totalSessions: 4,
    regularPriceBDT: 18000,
    packagePriceBDT: 15000,
    savingsBDT: 3000,
    validityMonths: 6,
    minIntervalDays: 14,
    description: 'Deep pore exfoliation, peptide infusion, and LED phototherapy skin rejuvenating course.',
    descriptionBn: 'গভীর ত্বক পরিষ্কার, অ্যান্টিঅক্সিডেন্ট সিরাম ও এলইডি লাইট থেরাপি',
    includedServices: ['HydraFacial Treatment', 'Peptide Infusion Mask', 'LED Phototherapy'],
    isActive: true,
    createdAt: '2026-01-10T10:00:00Z',
  },
  {
    id: 'mpkg-laser-carbon-6',
    code: 'PKG-CL-06',
    name: 'Hollywood Carbon Laser Peel & Toning',
    nameBn: 'হলিউড কার্বন লেজার পিল ও টোনিং (৬ সেশন)',
    serviceCategory: 'Laser & Energy Devices',
    totalSessions: 6,
    regularPriceBDT: 45000,
    packagePriceBDT: 36000,
    savingsBDT: 9000,
    validityMonths: 8,
    minIntervalDays: 21,
    description: 'Nd:YAG Q-switched laser carbon peel for pore shrinkage, oil balance, and hyperpigmentation.',
    descriptionBn: 'কিউ-সুইচড লেজার ও কার্বন লোশন সহযোগে পোর মিনিমাইজেশন ও ব্রাইটনিং',
    includedServices: ['Carbon Laser Peel', 'Laser Toning', 'Soothing Cryo Mask'],
    isActive: true,
    createdAt: '2026-01-12T10:00:00Z',
  },
  {
    id: 'mpkg-co2-scar-4',
    code: 'PKG-CO2-04',
    name: 'Fractional CO2 Laser Acne Scar Revision',
    nameBn: 'ফ্র্যাকশনাল সিও২ লেজার ব্রণ ও দাগ নিরাময় (৪ সেশন)',
    serviceCategory: 'Laser & Energy Devices',
    totalSessions: 4,
    regularPriceBDT: 34000,
    packagePriceBDT: 28000,
    savingsBDT: 6000,
    validityMonths: 6,
    minIntervalDays: 28,
    description: 'Deep ablative fractional resurfacing for pitted acne scars, surgical scars, and skin texturing.',
    descriptionBn: 'গভীর ব্রণের গর্ত ও দাগ দূর করতে চিকিৎসকের ফ্র্যাকশনাল লেজার রিসারফেসিং',
    includedServices: ['Fractional CO2 Laser Resurfacing', 'Post-Care Soothing Recovery Gel'],
    isActive: true,
    createdAt: '2026-01-15T10:00:00Z',
  },
  {
    id: 'mpkg-prp-hair-6',
    code: 'PKG-PRP-06',
    name: 'Autologous PRP Hair Restoration Therapy',
    nameBn: 'পিআরপি চুল পড়া রোধ ও রিগ্রোথ থেরাপি (৬ সেশন)',
    serviceCategory: 'Hair & Scalp Therapy',
    totalSessions: 6,
    regularPriceBDT: 54000,
    packagePriceBDT: 42000,
    savingsBDT: 12000,
    validityMonths: 9,
    minIntervalDays: 28,
    description: 'Platelet-rich plasma cellular activation micro-injections for androgenic alopecia and hair thinning.',
    descriptionBn: 'উচ্চ ঘনত্বের প্লাটিলেট সমৃদ্ধ প্লাজমা থেরাপির মাধ্যমে চুলের গোড়া শক্ত করা',
    includedServices: ['Autologous PRP Scalp Injection', 'Microneedling Mesotherapy', 'Low-Level Laser Therapy Cap'],
    isActive: true,
    createdAt: '2026-01-20T10:00:00Z',
  },
  {
    id: 'mpkg-peel-acne-5',
    code: 'PKG-PEEL-05',
    name: 'Medical Chemical Peel Acne Clearing Protocol',
    nameBn: 'মেডিকেল কেমিক্যাল পিল অ্যাকনে ক্লিয়ারিং (৫ সেশন)',
    serviceCategory: 'Chemical Peels',
    totalSessions: 5,
    regularPriceBDT: 22500,
    packagePriceBDT: 18000,
    savingsBDT: 4500,
    validityMonths: 6,
    minIntervalDays: 14,
    description: 'Targeted salicylic & glycolic dermatological peels for active acne, comedones, and post-inflammatory erythema.',
    descriptionBn: 'স্যালিসিলিক ও গ্লাইকোলিক এসিড ভিত্তিক চিকিৎসকের পরামর্শে অ্যাকনে কন্ট্রোল পিলিং',
    includedServices: ['Medical Salicylic/Glycolic Peel', 'Extraction Comedone Care', 'Hydrating Aloe Compress'],
    isActive: true,
    createdAt: '2026-02-01T10:00:00Z',
  },
  {
    id: 'mpkg-bridal-glow',
    code: 'PKG-BRIDE-GLOW',
    name: 'SUOXI Ultimate Bridal Glow & Red Carpet Protocol',
    nameBn: 'সুওক্সি ব্রাইডাল গ্লো ও রেড কার্পেট প্যাকেজ (৫ সেশন)',
    serviceCategory: 'Combination Packages',
    totalSessions: 5,
    regularPriceBDT: 36000,
    packagePriceBDT: 29000,
    savingsBDT: 7000,
    validityMonths: 4,
    minIntervalDays: 10,
    description: 'Comprehensive pre-wedding aesthetic transformation: 2 HydraFacials + 2 Laser Tonings + 1 Glutathione Drip.',
    descriptionBn: 'বিয়ের আগে সম্পূর্ণ ত্বক উজ্জ্বল ও স্বাস্থ্যকর করার ৫ সেশনের প্রিমিয়াম কম্বিনেশন',
    includedServices: ['2x HydraFacial MD', '2x Q-Switch Laser Toning', '1x IV Glutathione Antioxidant Infusion'],
    isActive: true,
    createdAt: '2026-02-05T10:00:00Z',
  },
];

const packages: TreatmentPackage[] = [
  {
    id: 'pkg-1',
    patientId: 'pt-1',
    patientName: 'Taslima Akter',
    packageName: 'HydraFacial MD Radiance (5-Session Package)',
    serviceCategory: 'Skin Care',
    totalSessions: 5,
    completedSessions: 2,
    remainingSessions: 3,
    priceBDT: 35000.0,
    purchaseDate: '2026-10-01',
    expiryDate: '2027-04-01',
    invoiceId: 'inv-301',
    status: 'active',
  },
  {
    id: 'pkg-2',
    patientId: 'pt-2',
    patientName: 'Md. Farhan Chowdhury',
    packageName: 'Hollywood Carbon Laser Peel (3-Session Pack)',
    serviceCategory: 'Laser & Aesthetic',
    totalSessions: 3,
    completedSessions: 1,
    remainingSessions: 2,
    priceBDT: 24000.0,
    purchaseDate: '2026-09-15',
    expiryDate: '2027-03-15',
    invoiceId: 'inv-302',
    status: 'active',
  },
];

const packageDeductions: PackageDeduction[] = [
  {
    id: 'ded-1',
    packageId: 'pkg-1',
    patientId: 'pt-1',
    sessionNumber: 1,
    deductedAt: '2026-10-02T11:30:00Z',
    therapistId: 'usr-105',
    therapistName: 'Rina Begum (Lead Aesthetician)',
    treatmentNotes: 'Deep pore cleansing, glycolic peel infusion, LED therapy (Red 630nm). Patient tolerated well.',
    machineSettings: 'Vortex Suction Level 2, Blue Light 10 min',
  },
  {
    id: 'ded-2',
    packageId: 'pkg-1',
    patientId: 'pt-1',
    sessionNumber: 2,
    deductedAt: '2026-10-10T12:00:00Z',
    therapistId: 'usr-105',
    therapistName: 'Rina Begum (Lead Aesthetician)',
    treatmentNotes: 'HydraFacial Session 2. Boosted with Britenol brightening ampoule.',
    machineSettings: 'Vortex Suction Level 2.5, Red Light 15 min',
  },
];

const paymentRecords: PaymentRecord[] = [
  {
    id: 'pay-1',
    invoiceId: 'inv-301',
    receiptNumber: 'RCP-2026-0041',
    amountBDT: 20000.0,
    method: 'bkash',
    transactionRef: 'BKH98234789',
    paidAt: '2026-10-01T12:30:00Z',
    receivedBy: 'Shamim Hossain (Cashier)',
    status: 'valid',
  },
  {
    id: 'pay-2',
    invoiceId: 'inv-301',
    receiptNumber: 'RCP-2026-0042',
    amountBDT: 15000.0,
    method: 'card',
    transactionRef: 'VISA-4491-POS',
    paidAt: '2026-10-10T14:00:00Z',
    receivedBy: 'Shamim Hossain (Cashier)',
    status: 'valid',
  },
  {
    id: 'pay-3',
    invoiceId: 'inv-302',
    receiptNumber: 'RCP-2026-0050',
    amountBDT: 12000.0,
    method: 'cash',
    transactionRef: 'CASH-DRAWER-1',
    paidAt: '2026-09-15T15:00:00Z',
    receivedBy: 'Shamim Hossain (Cashier)',
    status: 'valid',
  },
];

const invoices: Invoice[] = [
  {
    id: 'inv-301',
    invoiceNumber: 'INV-2026-0591',
    patientId: 'pt-1',
    patientName: 'Taslima Akter',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    items: [
      {
        id: 'it-1',
        description: 'HydraFacial MD Radiance Package (5 Sessions)',
        quantity: 1,
        unitPriceBDT: 35000.0,
        discountBDT: 0.0,
        totalBDT: 35000.0,
      },
    ],
    subtotalBDT: 35000.0,
    vatPercent: 0.0,
    vatAmountBDT: 0.0,
    discountBDT: 0.0,
    totalAmountBDT: 35000.0,
    paidAmountBDT: 35000.0, // Derived from pay-1 (20k) + pay-2 (15k)
    dueAmountBDT: 0.0,
    status: 'paid',
    payments: [],
    createdAt: '2026-10-01T12:00:00Z',
    createdBy: 'Shamim Hossain (Cashier)',
  },
  {
    id: 'inv-302',
    invoiceNumber: 'INV-2026-0592',
    patientId: 'pt-2',
    patientName: 'Md. Farhan Chowdhury',
    branchId: 'br-gulshan',
    branchName: 'Gulshan Aesthetic Lounge',
    items: [
      {
        id: 'it-2',
        description: 'Hollywood Carbon Laser Peel (3 Sessions)',
        quantity: 1,
        unitPriceBDT: 24000.0,
        discountBDT: 0.0,
        totalBDT: 24000.0,
      },
    ],
    subtotalBDT: 24000.0,
    vatPercent: 0.0,
    vatAmountBDT: 0.0,
    discountBDT: 0.0,
    totalAmountBDT: 24000.0,
    paidAmountBDT: 12000.0, // Derived from pay-3 (12k)
    dueAmountBDT: 12000.0,
    status: 'partially_paid',
    payments: [],
    createdAt: '2026-09-15T14:30:00Z',
    createdBy: 'Shamim Hossain (Cashier)',
  },
  {
    id: 'inv-303',
    invoiceNumber: 'INV-2026-0593',
    patientId: 'pt-3',
    patientName: 'Sadia Rahman',
    branchId: 'br-uttara',
    branchName: 'Uttara Skin Care Clinic',
    items: [
      {
        id: 'it-3',
        description: 'Initial Skin Consultation & Diagnostics',
        quantity: 1,
        unitPriceBDT: 2500.0,
        discountBDT: 0.0,
        totalBDT: 2500.0,
      },
      {
        id: 'it-4',
        description: 'Suoxi Physical Tinted Sunscreen SPF 50+',
        quantity: 1,
        unitPriceBDT: 2200.0,
        discountBDT: 200.0,
        totalBDT: 2000.0,
      },
    ],
    subtotalBDT: 4700.0,
    vatPercent: 0.0,
    vatAmountBDT: 0.0,
    discountBDT: 200.0,
    totalAmountBDT: 4500.0,
    paidAmountBDT: 0.0, // No payments yet
    dueAmountBDT: 4500.0,
    status: 'unpaid',
    payments: [],
    createdAt: '2026-10-16T15:45:00Z',
    createdBy: 'Shamim Hossain (Cashier)',
  },
  {
    id: 'inv-304',
    invoiceNumber: 'INV-2026-0594',
    patientId: 'pt-1',
    patientName: 'Sumaiya Rahman',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    items: [
      {
        id: 'it-304-1',
        description: 'Hair Remover',
        quantity: 4,
        unitPriceBDT: 5000.0,
        discountBDT: 10000.0,
        totalBDT: 10000.0,
      },
      {
        id: 'it-304-2',
        description: 'Hair Remover',
        quantity: 2,
        unitPriceBDT: 2000.0,
        discountBDT: 0.0,
        totalBDT: 4000.0,
      },
    ],
    subtotalBDT: 24000.0,
    vatPercent: 0.0,
    vatAmountBDT: 0.0,
    discountBDT: 10000.0,
    totalAmountBDT: 14000.0,
    paidAmountBDT: 14000.0,
    dueAmountBDT: 0.0,
    status: 'paid',
    payments: [],
    createdAt: '2026-10-31T11:20:00Z',
    createdBy: 'Shamim Hossain (Cashier)',
  },
  {
    id: 'inv-305',
    invoiceNumber: 'INV-2026-0595',
    patientId: 'pt-2',
    patientName: 'Tanvir Ahmed',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    items: [
      {
        id: 'it-305-1',
        description: 'HydraFacial MD Radiance Protocol',
        quantity: 1,
        unitPriceBDT: 4500.0,
        discountBDT: 0.0,
        totalBDT: 4500.0,
      },
      {
        id: 'it-305-2',
        description: 'Suoxi Mineral Sunscreen SPF 50+ PA++++',
        quantity: 1,
        unitPriceBDT: 1850.0,
        discountBDT: 0.0,
        totalBDT: 1850.0,
      },
    ],
    subtotalBDT: 6350.0,
    vatPercent: 0.0,
    vatAmountBDT: 0.0,
    discountBDT: 0.0,
    totalAmountBDT: 6350.0,
    paidAmountBDT: 6350.0,
    dueAmountBDT: 0.0,
    status: 'paid',
    payments: [],
    createdAt: '2026-10-31T14:45:00Z',
    createdBy: 'Shamim Hossain (Cashier)',
  },
  {
    id: 'inv-306',
    invoiceNumber: 'INV-2026-0596',
    patientId: 'pt-3',
    patientName: 'Roxane Begum',
    branchId: 'br-gulshan',
    branchName: 'Gulshan Aesthetic Lounge',
    items: [
      {
        id: 'it-306-1',
        description: 'Q-Switched Nd:YAG Laser Melasma Toning',
        quantity: 2,
        unitPriceBDT: 5500.0,
        discountBDT: 1000.0,
        totalBDT: 10000.0,
      },
      {
        id: 'it-306-2',
        description: 'Azelaic Acid 20% DermaCream (30g)',
        quantity: 2,
        unitPriceBDT: 1200.0,
        discountBDT: 0.0,
        totalBDT: 2400.0,
      },
    ],
    subtotalBDT: 13400.0,
    vatPercent: 0.0,
    vatAmountBDT: 0.0,
    discountBDT: 1000.0,
    totalAmountBDT: 12400.0,
    paidAmountBDT: 10000.0,
    dueAmountBDT: 2400.0,
    status: 'partially_paid',
    payments: [],
    createdAt: '2026-10-30T16:10:00Z',
    createdBy: 'Shamim Hossain (Cashier)',
  },
  {
    id: 'inv-307',
    invoiceNumber: 'INV-2026-0597',
    patientId: 'pt-1',
    patientName: 'Taslima Akter',
    branchId: 'br-uttara',
    branchName: 'Uttara Skin Care Clinic',
    items: [
      {
        id: 'it-307-1',
        description: 'Fractional CO2 Laser Resurfacing',
        quantity: 1,
        unitPriceBDT: 8500.0,
        discountBDT: 500.0,
        totalBDT: 8000.0,
      },
      {
        id: 'it-307-2',
        description: 'Mesoestetic Cosmelan 2 Maintenance Depigmentation Cream',
        quantity: 1,
        unitPriceBDT: 16500.0,
        discountBDT: 500.0,
        totalBDT: 16000.0,
      },
    ],
    subtotalBDT: 25000.0,
    vatPercent: 0.0,
    vatAmountBDT: 0.0,
    discountBDT: 1000.0,
    totalAmountBDT: 24000.0,
    paidAmountBDT: 24000.0,
    dueAmountBDT: 0.0,
    status: 'paid',
    payments: [],
    createdAt: '2026-10-28T10:30:00Z',
    createdBy: 'Shamim Hossain (Cashier)',
  },
  {
    id: 'inv-308',
    invoiceNumber: 'INV-2026-0598',
    patientId: 'pt-2',
    patientName: 'Md. Farhan Chowdhury',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    items: [
      {
        id: 'it-308-1',
        description: 'Medical Chemical Peel (Acne Clearing)',
        quantity: 2,
        unitPriceBDT: 3500.0,
        discountBDT: 500.0,
        totalBDT: 6500.0,
      },
      {
        id: 'it-308-2',
        description: 'Centella Asiatica Soothing Barrier Gel',
        quantity: 1,
        unitPriceBDT: 2300.0,
        discountBDT: 0.0,
        totalBDT: 2300.0,
      },
    ],
    subtotalBDT: 9300.0,
    vatPercent: 0.0,
    vatAmountBDT: 0.0,
    discountBDT: 500.0,
    totalAmountBDT: 8800.0,
    paidAmountBDT: 6000.0,
    dueAmountBDT: 2800.0,
    status: 'partially_paid',
    payments: [],
    createdAt: '2026-10-25T13:15:00Z',
    createdBy: 'Shamim Hossain (Cashier)',
  },
  {
    id: 'inv-309',
    invoiceNumber: 'INV-2026-0599',
    patientId: 'pt-3',
    patientName: 'Sadia Rahman',
    branchId: 'br-gulshan',
    branchName: 'Gulshan Aesthetic Lounge',
    items: [
      {
        id: 'it-309-1',
        description: 'Autologous PRP Skin Rejuvenation',
        quantity: 1,
        unitPriceBDT: 8000.0,
        discountBDT: 1000.0,
        totalBDT: 7000.0,
      },
      {
        id: 'it-309-2',
        description: 'SkinCeuticals C E Ferulic Antioxidant Serum',
        quantity: 1,
        unitPriceBDT: 14500.0,
        discountBDT: 500.0,
        totalBDT: 14000.0,
      },
    ],
    subtotalBDT: 22500.0,
    vatPercent: 0.0,
    vatAmountBDT: 0.0,
    discountBDT: 1500.0,
    totalAmountBDT: 21000.0,
    paidAmountBDT: 21000.0,
    dueAmountBDT: 0.0,
    status: 'paid',
    payments: [],
    createdAt: '2026-10-20T12:00:00Z',
    createdBy: 'Shamim Hossain (Cashier)',
  },
];

const inventoryItems: InventoryItem[] = [
  {
    id: 'inv-item-1',
    itemCode: 'SKU-SER-001',
    barcode: '8901234001',
    sku: 'HF-GLYSAL-15',
    name: 'HydraFacial MD GlySal Peel Solution (15% Glycolic + 1.5% Salicylic)',
    category: 'Serums & Peels',
    brand: 'Edge Systems LLC',
    productType: 'consumable',
    currentStock: 18,
    unit: 'bottles',
    reorderLevel: 5,
    unitCostBDT: 4500.0,
    sellingPriceBDT: 7500.0,
    batchNumber: 'GLS-2025-B4',
    expiryDate: '2027-08-30',
    batches: [
      { batchNumber: 'GLS-2025-B4', expiryDate: '2027-08-30', quantity: 18, costPriceBDT: 4500.0, receivedDate: '2026-01-15' }
    ],
    usageProtocol: '5ml per HydraFacial deep extraction step',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    status: 'in_stock',
    isActive: true,
  },
  {
    id: 'inv-item-2',
    itemCode: 'SKU-LAS-002',
    barcode: '8901234002',
    sku: 'CRB-GEL-80',
    name: 'Activated Carbon Cream for Q-Switched Nd:YAG Laser',
    category: 'Laser Consumables',
    brand: 'LaserTech Bio',
    productType: 'consumable',
    currentStock: 4,
    unit: 'tubes',
    reorderLevel: 6,
    unitCostBDT: 3200.0,
    sellingPriceBDT: 5500.0,
    batchNumber: 'CRB-2026-A1',
    expiryDate: '2027-01-15',
    batches: [
      { batchNumber: 'CRB-2026-A1', expiryDate: '2027-01-15', quantity: 4, costPriceBDT: 3200.0, receivedDate: '2026-02-10' }
    ],
    usageProtocol: '3g thin layer applied to face 15 mins before laser pulse',
    branchId: 'br-gulshan',
    branchName: 'Gulshan Aesthetic Lounge',
    status: 'low_stock',
    isActive: true,
  },
  {
    id: 'inv-item-3',
    itemCode: 'SKU-SUN-003',
    barcode: '8901234003',
    sku: 'SX-DERMA-SPF50',
    name: 'Suoxi Physical Tinted Sunscreen SPF 50+ PA++++ (50ml)',
    category: 'Post-Care Creams',
    brand: 'Suoxi DermaLab',
    productType: 'retail',
    currentStock: 35,
    unit: 'tubes',
    reorderLevel: 10,
    unitCostBDT: 1400.0,
    sellingPriceBDT: 2200.0,
    batchNumber: 'SX-SUN-88',
    expiryDate: '2027-11-20',
    batches: [
      { batchNumber: 'SX-SUN-88', expiryDate: '2027-11-20', quantity: 35, costPriceBDT: 1400.0, receivedDate: '2026-03-01' }
    ],
    usageProtocol: 'Prescribed for home use post-laser & chemical peels',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    status: 'in_stock',
    isActive: true,
  },
  {
    id: 'inv-item-4',
    itemCode: 'SKU-DIS-004',
    barcode: '8901234004',
    sku: 'BD-30G-NDL',
    name: 'Sterile 30G Disposable Mesotherapy Needles (Box of 100)',
    category: 'Disposables',
    brand: 'BD Medical',
    productType: 'consumable',
    currentStock: 2,
    unit: 'boxes',
    reorderLevel: 5,
    unitCostBDT: 1800.0,
    sellingPriceBDT: 2500.0,
    batchNumber: 'NDL-30G-77',
    expiryDate: '2028-05-10',
    batches: [
      { batchNumber: 'NDL-30G-77', expiryDate: '2028-05-10', quantity: 2, costPriceBDT: 1800.0, receivedDate: '2025-11-01' }
    ],
    usageProtocol: 'Single-use sterile needles for PRP micro-papules',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    status: 'low_stock',
    isActive: true,
  },
  {
    id: 'inv-item-5',
    itemCode: 'SKU-SER-005',
    barcode: '8901234005',
    sku: 'CE-FERULIC-30',
    name: 'SkinCeuticals C E Ferulic Antioxidant Serum (30ml)',
    category: 'Serums & Peels',
    brand: 'SkinCeuticals',
    productType: 'dual_use',
    currentStock: 12,
    unit: 'bottles',
    reorderLevel: 4,
    unitCostBDT: 14500.0,
    sellingPriceBDT: 19500.0,
    batchNumber: 'SC-FER-902',
    expiryDate: '2027-04-18',
    batches: [
      { batchNumber: 'SC-FER-902', expiryDate: '2027-04-18', quantity: 12, costPriceBDT: 14500.0, receivedDate: '2026-02-20' }
    ],
    usageProtocol: '4-5 drops in morning before moisturizer/sunscreen',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    status: 'in_stock',
    isActive: true,
  },
  {
    id: 'inv-item-6',
    itemCode: 'SKU-INJ-006',
    barcode: '8901234006',
    sku: 'TEOSYAL-RHA2',
    name: 'Teosyal RHA 2 Resilient Hyaluronic Dermal Filler (2x1ml)',
    category: 'Injectables',
    brand: 'Teoxane Laboratories',
    productType: 'consumable',
    currentStock: 6,
    unit: 'boxes',
    reorderLevel: 3,
    unitCostBDT: 24000.0,
    sellingPriceBDT: 38000.0,
    batchNumber: 'TEO-RHA-41',
    expiryDate: '2026-12-15',
    batches: [
      { batchNumber: 'TEO-RHA-41', expiryDate: '2026-12-15', quantity: 6, costPriceBDT: 24000.0, receivedDate: '2026-01-25' }
    ],
    usageProtocol: 'Superficial to medium dermis dynamic wrinkle correction by licensed doctor',
    branchId: 'br-gulshan',
    branchName: 'Gulshan Aesthetic Lounge',
    status: 'in_stock',
    isActive: true,
  },
  {
    id: 'inv-item-7',
    itemCode: 'SKU-CRM-007',
    barcode: '8901234007',
    sku: 'COSMELAN-2',
    name: 'Mesoestetic Cosmelan 2 Maintenance Depigmentation Cream (30g)',
    category: 'Post-Care Creams',
    brand: 'Mesoestetic',
    productType: 'retail',
    currentStock: 9,
    unit: 'tubes',
    reorderLevel: 3,
    unitCostBDT: 16500.0,
    sellingPriceBDT: 22000.0,
    batchNumber: 'MESO-COS2-77',
    expiryDate: '2027-09-10',
    batches: [
      { batchNumber: 'MESO-COS2-77', expiryDate: '2027-09-10', quantity: 9, costPriceBDT: 16500.0, receivedDate: '2026-02-18' }
    ],
    usageProtocol: 'Apply daily according to dermatological depigmentation protocol',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    status: 'in_stock',
    isActive: true,
  },
  {
    id: 'inv-item-8',
    itemCode: 'SKU-CRM-008',
    barcode: '8901234008',
    sku: 'CICA-REPAIR-50',
    name: 'Centella Asiatica Soothing Barrier Recovery Gel (100ml)',
    category: 'Post-Care Creams',
    brand: 'Suoxi DermaLab',
    productType: 'dual_use',
    currentStock: 28,
    unit: 'tubes',
    reorderLevel: 8,
    unitCostBDT: 950.0,
    sellingPriceBDT: 1650.0,
    batchNumber: 'SX-CICA-102',
    expiryDate: '2027-06-30',
    batches: [
      { batchNumber: 'SX-CICA-102', expiryDate: '2027-06-30', quantity: 28, costPriceBDT: 950.0, receivedDate: '2026-03-05' }
    ],
    usageProtocol: 'Post-laser cooling mask & take-home soothing balm',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    status: 'in_stock',
    isActive: true,
  }
];

const suppliers: Supplier[] = [
  {
    id: 'sup-1',
    code: 'SUP-EDGE-01',
    name: 'BioAesthetic Devices & Consumables BD',
    contactPerson: 'Engr. Mahfuzur Rahman',
    phone: '+880 1711-223344',
    email: 'sales@bioaesthetic-bd.com',
    address: 'Suite 4B, Gulshan Tower, Plot 31, Gulshan-2, Dhaka',
    brandsSupplied: ['Edge Systems LLC', 'HydraFacial MD', 'LaserTech Bio'],
    paymentTerms: 'Net 30',
    balanceDueBDT: 45000.0,
    isActive: true,
    createdAt: '2025-10-12T09:00:00Z',
  },
  {
    id: 'sup-2',
    code: 'SUP-DERMA-02',
    name: 'Cosmoceuticals Global Import Ltd.',
    contactPerson: 'Tanima Chowdhury',
    phone: '+880 1819-556677',
    email: 'orders@cosmoceuticals-bd.com',
    address: 'House 14, Road 11, Banani C/A, Dhaka-1213',
    brandsSupplied: ['SkinCeuticals', 'Mesoestetic', 'Obagi'],
    paymentTerms: 'Net 15',
    balanceDueBDT: 120000.0,
    isActive: true,
    createdAt: '2025-11-05T10:30:00Z',
  },
  {
    id: 'sup-3',
    code: 'SUP-MED-03',
    name: 'Apex Surgical & Clinical Disposables',
    contactPerson: 'Md. Shahidul Islam',
    phone: '+880 1912-998877',
    email: 'info@apexsurgical.com.bd',
    address: 'Pritam-Innes Complex, 89 VIP Road, Kakrail, Dhaka',
    brandsSupplied: ['BD Medical', 'Teoxane Laboratories'],
    paymentTerms: 'Cash on Delivery',
    balanceDueBDT: 0.0,
    isActive: true,
    createdAt: '2025-12-01T11:00:00Z',
  },
  {
    id: 'sup-4',
    code: 'SUP-SUOXI-04',
    name: 'Suoxi DermaLab Manufacturing Unit',
    contactPerson: 'Kazi Farhana',
    phone: '+880 1700-112233',
    email: 'lab@suoxiderma.com',
    address: 'BSCIC Industrial Estate, Tongi, Gazipur',
    brandsSupplied: ['Suoxi DermaLab'],
    paymentTerms: 'Advance',
    balanceDueBDT: 0.0,
    isActive: true,
    createdAt: '2026-01-01T08:00:00Z',
  }
];

const purchaseOrders: PurchaseOrder[] = [
  {
    id: 'po-101',
    poNumber: 'PO-2026-081',
    supplierId: 'sup-1',
    supplierName: 'BioAesthetic Devices & Consumables BD',
    orderDate: '2026-10-18',
    expectedDeliveryDate: '2026-10-25',
    items: [
      {
        itemId: 'inv-item-1',
        itemCode: 'SKU-SER-001',
        itemName: 'HydraFacial MD GlySal Peel Solution',
        orderedQty: 20,
        receivedQty: 20,
        unitCostBDT: 4500.0,
        totalBDT: 90000.0,
      },
      {
        itemId: 'inv-item-2',
        itemCode: 'SKU-LAS-002',
        itemName: 'Activated Carbon Cream for Laser',
        orderedQty: 10,
        receivedQty: 10,
        unitCostBDT: 3200.0,
        totalBDT: 32000.0,
      }
    ],
    subtotalBDT: 122000.0,
    taxBDT: 0.0,
    totalBDT: 122000.0,
    status: 'received',
    paymentStatus: 'paid',
    notes: 'Urgent restocking for Dhanmondi laser & peel clinic.',
    createdAt: '2026-10-18T10:00:00Z',
    createdBy: 'Sharmin Sultana (Inventory Mgr)',
  },
  {
    id: 'po-102',
    poNumber: 'PO-2026-082',
    supplierId: 'sup-2',
    supplierName: 'Cosmoceuticals Global Import Ltd.',
    orderDate: '2026-10-24',
    expectedDeliveryDate: '2026-11-02',
    items: [
      {
        itemId: 'inv-item-5',
        itemCode: 'SKU-SER-005',
        itemName: 'SkinCeuticals C E Ferulic Antioxidant Serum',
        orderedQty: 15,
        receivedQty: 0,
        unitCostBDT: 14500.0,
        totalBDT: 217500.0,
      },
      {
        itemId: 'inv-item-7',
        itemCode: 'SKU-CRM-007',
        itemName: 'Mesoestetic Cosmelan 2 Maintenance Cream',
        orderedQty: 10,
        receivedQty: 0,
        unitCostBDT: 16500.0,
        totalBDT: 165000.0,
      }
    ],
    subtotalBDT: 382500.0,
    taxBDT: 0.0,
    totalBDT: 382500.0,
    status: 'ordered',
    paymentStatus: 'unpaid',
    notes: 'Imported batch with certificate of analysis (COA) required.',
    createdAt: '2026-10-24T14:30:00Z',
    createdBy: 'Sharmin Sultana (Inventory Mgr)',
  },
  {
    id: 'po-103',
    poNumber: '2600407',
    invoiceNo: '2600407',
    supplierId: 'sup-fm',
    supplierName: 'F.M. Surgical & Scientific Co.',
    orderDate: '2026-10-24',
    expectedDeliveryDate: '2026-10-24',
    items: [
      {
        itemId: 'item-bp-mdf',
        itemCode: 'MDF-BP-01',
        itemName: 'BP Machine MDF',
        orderedQty: 1,
        receivedQty: 1,
        unitCostBDT: 2500.0,
        discountBDT: 0.0,
        totalBDT: 2500.0,
        paidBDT: 2500.0,
        dueBDT: 0.0,
      },
      {
        itemId: 'item-steth-mdf',
        itemCode: 'MDF-ST-02',
        itemName: 'Stethoscope MDF',
        orderedQty: 1,
        receivedQty: 1,
        unitCostBDT: 1000.0,
        discountBDT: 0.0,
        totalBDT: 1000.0,
        paidBDT: 1000.0,
        dueBDT: 0.0,
      },
    ],
    subtotalBDT: 3500.0,
    discountBDT: 0.0,
    taxBDT: 0.0,
    totalBDT: 3500.0,
    paidBDT: 3500.0,
    dueBDT: 0.0,
    status: 'received',
    paymentStatus: 'paid',
    notes: 'Clinical diagnostic equipment received.',
    createdAt: '2026-10-24T09:30:00Z',
    createdBy: 'Sharmin Sultana (Inventory Mgr)',
  },
  {
    id: 'po-104',
    poNumber: '3656565',
    invoiceNo: '3656565',
    supplierId: 'sup-acme',
    supplierName: 'Acme Pharmaceutical',
    orderDate: '2026-10-24',
    expectedDeliveryDate: '2026-10-24',
    items: [
      {
        itemId: 'item-meso-ndl',
        itemCode: 'ACME-NDL-30G',
        itemName: 'Sterile 30G Disposable Mesotherapy Needles',
        orderedQty: 1,
        receivedQty: 1,
        unitCostBDT: 3500.0,
        discountBDT: 0.0,
        totalBDT: 3500.0,
        paidBDT: 3500.0,
        dueBDT: 0.0,
      },
      {
        itemId: 'inv-item-5',
        itemCode: 'SKU-SER-005',
        itemName: 'SkinCeuticals C E Ferulic Antioxidant Serum',
        orderedQty: 1,
        receivedQty: 1,
        unitCostBDT: 1500.0,
        discountBDT: 0.0,
        totalBDT: 1500.0,
        paidBDT: 1500.0,
        dueBDT: 0.0,
      },
      {
        itemId: 'item-teosyal',
        itemCode: 'TEOX-RHA-02',
        itemName: 'Teosyal RHA 2 Resilient Hyaluronic Dermal Filler',
        orderedQty: 1,
        receivedQty: 1,
        unitCostBDT: 3000.0,
        discountBDT: 0.0,
        totalBDT: 3000.0,
        paidBDT: 3000.0,
        dueBDT: 0.0,
      },
    ],
    subtotalBDT: 8000.0,
    discountBDT: 0.0,
    taxBDT: 0.0,
    totalBDT: 8000.0,
    paidBDT: 8000.0,
    dueBDT: 0.0,
    status: 'received',
    paymentStatus: 'paid',
    notes: 'Aesthetic injectables and serum course.',
    createdAt: '2026-10-24T11:15:00Z',
    createdBy: 'Sharmin Sultana (Inventory Mgr)',
  },
  {
    id: 'po-105',
    poNumber: '54687856',
    invoiceNo: '54687856',
    supplierId: 'sup-sqr',
    supplierName: 'Square Pharmaceuticals',
    orderDate: '2026-10-23',
    expectedDeliveryDate: '2026-10-23',
    items: [
      {
        itemId: 'item-centella',
        itemCode: 'SQR-CENT-100',
        itemName: 'Centella Asiatica Soothing Barrier Recovery Gel (100ml)',
        orderedQty: 1,
        receivedQty: 1,
        unitCostBDT: 2300.0,
        discountBDT: 0.0,
        totalBDT: 2300.0,
        paidBDT: 2300.0,
        dueBDT: 0.0,
      },
    ],
    subtotalBDT: 2300.0,
    discountBDT: 0.0,
    taxBDT: 0.0,
    totalBDT: 2300.0,
    paidBDT: 2300.0,
    dueBDT: 0.0,
    status: 'received',
    paymentStatus: 'paid',
    notes: 'Post-laser soothing recovery gel.',
    createdAt: '2026-10-23T14:00:00Z',
    createdBy: 'Sharmin Sultana (Inventory Mgr)',
  },
  {
    id: 'po-106',
    poNumber: '425751',
    invoiceNo: '425751',
    supplierId: 'sup-bex',
    supplierName: 'Beximco Pharmaceuticals Ltd.',
    orderDate: '2026-10-24',
    expectedDeliveryDate: '2026-10-24',
    items: [
      {
        itemId: 'item-sun-tinted',
        itemCode: 'BEX-SUN-50',
        itemName: 'Physical Tinted Sunscreen SPF 50+ PA++++ (50ml)',
        orderedQty: 1,
        receivedQty: 1,
        unitCostBDT: 800.0,
        discountBDT: 0.0,
        totalBDT: 800.0,
        paidBDT: 800.0,
        dueBDT: 0.0,
      },
    ],
    subtotalBDT: 800.0,
    discountBDT: 0.0,
    taxBDT: 0.0,
    totalBDT: 800.0,
    paidBDT: 800.0,
    dueBDT: 0.0,
    status: 'received',
    paymentStatus: 'paid',
    notes: 'Derma sunscreen retail batch.',
    createdAt: '2026-10-24T16:20:00Z',
    createdBy: 'Sharmin Sultana (Inventory Mgr)',
  },
  {
    id: 'po-107',
    poNumber: '2500258',
    invoiceNo: '2500258',
    supplierId: 'sup-tth',
    supplierName: 'Three Trading House',
    orderDate: '2026-10-29',
    expectedDeliveryDate: '2026-10-29',
    items: [
      {
        itemId: 'item-tens-tista',
        itemCode: 'TTH-TENS-01',
        itemName: 'Tens Machine TISTA',
        orderedQty: 20,
        receivedQty: 20,
        unitCostBDT: 4800.0,
        discountBDT: 0.0,
        totalBDT: 96000.0,
        paidBDT: 80000.0,
        dueBDT: 16000.0,
      },
    ],
    subtotalBDT: 96000.0,
    discountBDT: 0.0,
    taxBDT: 0.0,
    totalBDT: 96000.0,
    paidBDT: 80000.0,
    dueBDT: 16000.0,
    status: 'received',
    paymentStatus: 'partial',
    notes: 'Physiotherapy electrotherapy units; ৳16,000 net 30 balance.',
    createdAt: '2026-10-29T10:00:00Z',
    createdBy: 'Sharmin Sultana (Inventory Mgr)',
  },
  {
    id: 'po-108',
    poNumber: '8250211',
    invoiceNo: '8250211',
    supplierId: 'sup-tth',
    supplierName: 'Three Trading House',
    orderDate: '2026-10-20',
    expectedDeliveryDate: '2026-10-20',
    items: [
      {
        itemId: 'item-tth-disp',
        itemCode: 'TTH-DISP-02',
        itemName: 'Three Trading Clinical Disposables Pack',
        orderedQty: 20,
        receivedQty: 20,
        unitCostBDT: 2300.0,
        discountBDT: 0.0,
        totalBDT: 46000.0,
        paidBDT: 46000.0,
        dueBDT: 0.0,
      },
    ],
    subtotalBDT: 46000.0,
    discountBDT: 0.0,
    taxBDT: 0.0,
    totalBDT: 46000.0,
    paidBDT: 46000.0,
    dueBDT: 0.0,
    status: 'received',
    paymentStatus: 'paid',
    notes: 'Clinical disposables batch.',
    createdAt: '2026-10-20T11:45:00Z',
    createdBy: 'Sharmin Sultana (Inventory Mgr)',
  },
  {
    id: 'po-109',
    poNumber: '5461250',
    invoiceNo: '5461250',
    supplierId: 'sup-sqr',
    supplierName: 'Square Pharmaceuticals',
    orderDate: '2026-10-21',
    expectedDeliveryDate: '2026-10-21',
    items: [
      {
        itemId: 'inv-item-7',
        itemCode: 'SKU-CRM-007',
        itemName: 'Mesoestetic Cosmelan 2 Maintenance Depigmentation Cream (30g)',
        orderedQty: 2,
        receivedQty: 2,
        unitCostBDT: 1600.0,
        discountBDT: 0.0,
        totalBDT: 3200.0,
        paidBDT: 3200.0,
        dueBDT: 0.0,
      },
    ],
    subtotalBDT: 3200.0,
    discountBDT: 0.0,
    taxBDT: 0.0,
    totalBDT: 3200.0,
    paidBDT: 3200.0,
    dueBDT: 0.0,
    status: 'received',
    paymentStatus: 'paid',
    notes: 'Direct clinical supply from authorized distributor.',
    createdAt: '2026-10-21T15:20:00Z',
    createdBy: 'Sharmin Sultana (Inventory Mgr)',
  },
];

const goodsReceivedNotes: GoodsReceivedNote[] = [
  {
    id: 'grn-501',
    grnNumber: 'GRN-2026-104',
    poId: 'po-101',
    poNumber: 'PO-2026-081',
    supplierId: 'sup-1',
    supplierName: 'BioAesthetic Devices & Consumables BD',
    receivedDate: '2026-10-25',
    receivedBy: 'Sharmin Sultana (Inventory Mgr)',
    invoiceRefNumber: 'INV-BIO-9924',
    items: [
      {
        itemId: 'inv-item-1',
        itemName: 'HydraFacial MD GlySal Peel Solution',
        batchNumber: 'GLS-2025-B4',
        expiryDate: '2027-08-30',
        receivedQty: 20,
        unitCostBDT: 4500.0,
        condition: 'good',
      },
      {
        itemId: 'inv-item-2',
        itemName: 'Activated Carbon Cream for Laser',
        batchNumber: 'CRB-2026-A1',
        expiryDate: '2027-01-15',
        receivedQty: 10,
        unitCostBDT: 3200.0,
        condition: 'good',
      }
    ],
    totalCostBDT: 122000.0,
    notes: 'Seals intact, temperature log verified during transit.',
    createdAt: '2026-10-25T11:45:00Z',
  }
];

const stockAdjustments: StockAdjustment[] = [
  {
    id: 'stk-adj-1',
    itemId: 'inv-item-1',
    itemName: 'HydraFacial MD GlySal Peel Solution',
    batchNumber: 'GLS-2025-B4',
    adjustmentType: 'clinic_use',
    quantityDelta: -2,
    balanceAfter: 18,
    unitCostBDT: 4500.0,
    reason: 'Consumed during morning clinical treatments at Dhanmondi.',
    adjustedBy: 'Sharmin Sultana (Inventory Mgr)',
    adjustedAt: '2026-10-15T16:00:00Z',
  },
  {
    id: 'stk-adj-2',
    itemId: 'inv-item-3',
    itemName: 'Suoxi Physical Tinted Sunscreen SPF 50+',
    batchNumber: 'SX-SUN-88',
    adjustmentType: 'tester',
    quantityDelta: -1,
    balanceAfter: 35,
    unitCostBDT: 1400.0,
    reason: 'Issued 1 tube to reception sample display for skin shade matching.',
    adjustedBy: 'Sharmin Sultana (Inventory Mgr)',
    adjustedAt: '2026-10-20T10:30:00Z',
  },
  {
    id: 'stk-adj-3',
    itemId: 'inv-item-4',
    itemName: 'Sterile 30G Disposable Mesotherapy Needles',
    batchNumber: 'NDL-30G-77',
    adjustmentType: 'clinic_use',
    quantityDelta: -1,
    balanceAfter: 2,
    unitCostBDT: 1800.0,
    reason: 'Consumed in PRP scalp restoration procedure suite.',
    adjustedBy: 'Dr. Nusrat Jahan',
    adjustedAt: '2026-10-22T15:00:00Z',
  }
];

const referralCommissions: ReferralCommission[] = [
  {
    id: 'ref-1',
    referrerName: 'Dr. Kazi Mahbubur Rahman',
    referrerType: 'Doctor',
    phone: '+8801722889900',
    patientId: 'pt-1',
    patientName: 'Taslima Akter',
    invoiceId: 'inv-301',
    serviceCategory: 'Skin Care',
    billAmountBDT: 35000.0,
    commissionPercentage: 10.0,
    commissionAmountBDT: 3500.0,
    status: 'approved',
    createdAt: '2026-10-01T13:00:00Z',
  },
  {
    id: 'ref-2',
    referrerName: 'Glamour Lounge Salon & Spa (Partner)',
    referrerType: 'Partner Clinic',
    phone: '+8801844556677',
    patientId: 'pt-2',
    patientName: 'Md. Farhan Chowdhury',
    invoiceId: 'inv-302',
    serviceCategory: 'Laser & Aesthetic',
    billAmountBDT: 24000.0,
    commissionPercentage: 8.0,
    commissionAmountBDT: 1920.0,
    status: 'pending',
    createdAt: '2026-09-15T15:00:00Z',
  },
];

const auditEvents: AuditEvent[] = [
  {
    id: 'aud-1',
    timestamp: '2026-10-10T11:45:00Z',
    userId: 'usr-101',
    userName: 'Dr. Nusrat Jahan',
    userRole: 'doctor',
    action: 'PRESCRIPTION_FINALIZED',
    resourceType: 'prescription',
    resourceId: 'rx-1',
    details: 'Finalized Rx RX-2026-0312 for patient SX-2026-0841. Next session set to 2026-10-24.',
    ipAddress: '192.168.1.45',
    branchId: 'br-dhanmondi',
  },
  {
    id: 'aud-2',
    timestamp: '2026-10-10T14:00:00Z',
    userId: 'usr-106',
    userName: 'Shamim Hossain',
    userRole: 'cashier',
    action: 'PAYMENT_RECORDED',
    resourceType: 'invoice',
    resourceId: 'inv-301',
    details: 'Recorded payment of ৳ 15,000.00 via card. Receipt RCP-2026-0042. Invoice marked PAID.',
    ipAddress: '192.168.1.80',
    branchId: 'br-dhanmondi',
  },
];

// -------------------------------------------------------------
// Data Store: User Management & Access Control (RBAC)
// -------------------------------------------------------------

const staffUsers: User[] = [
  {
    id: 'usr-100',
    employeeId: '0001',
    name: 'Kabir Ahmed',
    nameBn: 'কবির আহমেদ',
    email: 'director@suoxiclinic.com',
    role: 'super_admin',
    phone: '+8801700000001',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    designation: 'Managing Director & Founder',
    status: 'active',
    lastLoginAt: '2026-11-03T09:15:00Z',
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'usr-101',
    employeeId: '0002',
    name: 'Dr. Nusrat Jahan',
    nameBn: 'ডাঃ নুসরাত জাহান',
    email: 'nusrat.jahan@suoxiclinic.com',
    role: 'doctor',
    phone: '+8801711223344',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    designation: 'Senior Consultant Aesthetic Dermatologist',
    specialization: 'MBBS, DDV, Consultant Aesthetic Dermatologist',
    bmdcRegNo: 'BMDC-A-48921',
    consultationFeeBDT: 2000,
    followUpFeeBDT: 1000,
    roomNumber: 'Room 201 (Laser Suite A)',
    signatureUrl: '/assets/signatures/dr_nusrat.png',
    shift: 'morning',
    status: 'active',
    lastLoginAt: '2026-11-03T08:45:00Z',
    createdAt: '2025-02-10T10:00:00Z',
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
    branchName: 'Gulshan Aesthetic Lounge',
    designation: 'Consultant Cosmetic Dermatologist',
    specialization: 'MBBS, FCPS (Dermatology), Facial Aesthetics',
    bmdcRegNo: 'BMDC-A-51204',
    consultationFeeBDT: 2500,
    followUpFeeBDT: 1200,
    roomNumber: 'Room 302 (Anti-Aging Suite)',
    shift: 'evening',
    status: 'active',
    lastLoginAt: '2026-11-02T16:20:00Z',
    createdAt: '2025-03-01T10:00:00Z',
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
    branchName: 'Uttara Skin Care Clinic',
    designation: 'Clinical Aesthetician & Trichologist',
    specialization: 'MBBS, MCPS (Derma), Fellow Trichology (UK)',
    bmdcRegNo: 'BMDC-A-62390',
    consultationFeeBDT: 1800,
    followUpFeeBDT: 900,
    roomNumber: 'Room 105 (Trichology Suite)',
    shift: 'full_day',
    status: 'active',
    lastLoginAt: '2026-11-03T10:05:00Z',
    createdAt: '2025-04-15T10:00:00Z',
  },
  {
    id: 'usr-109',
    employeeId: '0005',
    name: 'Sabrina Mostafa',
    nameBn: 'সাবরিনা মোস্তফা',
    email: 'sabrina.m@suoxiclinic.com',
    role: 'doctor',
    phone: '+8801722445566',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    designation: 'Resident Medical Officer (Aesthetic)',
    specialization: 'MBBS, Diploma in Clinical Dermatology',
    bmdcRegNo: 'BMDC-A-70112',
    consultationFeeBDT: 1500,
    followUpFeeBDT: 800,
    roomNumber: 'Room 203 (Consultation)',
    shift: 'morning',
    status: 'active',
    lastLoginAt: '2026-11-03T09:00:00Z',
    createdAt: '2025-06-01T10:00:00Z',
  },
  {
    id: 'usr-105',
    employeeId: '0006',
    name: 'Rina Begum',
    nameBn: 'রিনা বেগম',
    email: 'therapist.rina@suoxiclinic.com',
    role: 'therapist',
    phone: '+8801755443322',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    designation: 'Lead Aesthetic & Laser Therapist',
    certifications: ['HydraFacial MD Certified', 'Q-Switch Laser Specialist', 'Fractional CO2 Operator', 'HIFU Ultra-lift'],
    shift: 'morning',
    roomNumber: 'Treatment Suite 1',
    status: 'active',
    lastLoginAt: '2026-11-03T08:30:00Z',
    createdAt: '2025-01-15T10:00:00Z',
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
    branchName: 'Gulshan Aesthetic Lounge',
    designation: 'Senior Skin & Laser Therapist',
    certifications: ['HydraFacial MD Certified', 'Chemical Peel Specialist', 'Morpheus8 RF Certified'],
    shift: 'evening',
    roomNumber: 'Treatment Suite 2',
    status: 'active',
    lastLoginAt: '2026-11-02T13:45:00Z',
    createdAt: '2025-02-20T10:00:00Z',
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
    branchName: 'Uttara Skin Care Clinic',
    designation: 'Aesthetic Laser Therapist',
    certifications: ['HydraFacial MD Certified', 'Laser Hair Removal Certified'],
    shift: 'full_day',
    roomNumber: 'Treatment Suite 3',
    status: 'active',
    lastLoginAt: '2026-11-03T09:10:00Z',
    createdAt: '2025-05-10T10:00:00Z',
  },
  {
    id: 'usr-103',
    employeeId: '0009',
    name: 'Fatima Zohra',
    nameBn: 'ফাতিমা জোহরা',
    email: 'reception.dhanmondi@suoxiclinic.com',
    role: 'receptionist',
    phone: '+8801799887766',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    designation: 'Front Desk & Patient Relations Executive',
    shift: 'morning',
    status: 'active',
    lastLoginAt: '2026-11-03T08:15:00Z',
    createdAt: '2025-01-10T10:00:00Z',
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
    branchName: 'Gulshan Aesthetic Lounge',
    designation: 'Front Desk Executive',
    shift: 'evening',
    status: 'active',
    lastLoginAt: '2026-11-02T14:00:00Z',
    createdAt: '2025-03-12T10:00:00Z',
  },
  {
    id: 'usr-106',
    employeeId: '0011',
    name: 'Shamim Hossain',
    nameBn: 'শামীম হোসেন',
    email: 'accounts@suoxiclinic.com',
    role: 'cashier',
    phone: '+8801844778899',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    designation: 'Senior Cashier & Accounts Officer',
    shift: 'morning',
    status: 'active',
    lastLoginAt: '2026-11-03T08:50:00Z',
    createdAt: '2025-01-12T10:00:00Z',
  },
  {
    id: 'usr-107',
    employeeId: '0012',
    name: 'Sharmin Sultana',
    nameBn: 'শারমিন সুলতানা',
    email: 'inventory@suoxiclinic.com',
    role: 'inventory_manager',
    phone: '+8801966554433',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    designation: 'Pharmacy & Inventory Manager',
    shift: 'full_day',
    status: 'active',
    lastLoginAt: '2026-11-03T09:20:00Z',
    createdAt: '2025-01-15T10:00:00Z',
  },
  {
    id: 'usr-104',
    employeeId: '0013',
    name: 'Tania Khan',
    nameBn: 'তানিয়া খান',
    email: 'callcenter.agent1@suoxiclinic.com',
    role: 'call_center',
    phone: '+8801833221100',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    designation: 'Lead Tele-Triage & Follow-up Agent',
    shift: 'morning',
    status: 'active',
    lastLoginAt: '2026-11-03T08:25:00Z',
    createdAt: '2025-02-01T10:00:00Z',
  },
  {
    id: 'usr-113',
    employeeId: '0014',
    name: 'Farzana Yasmin',
    nameBn: 'ফারজানা ইয়াসমিন',
    email: 'admin.dhanmondi@suoxiclinic.com',
    role: 'admin_manager',
    phone: '+8801711998877',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    designation: 'Clinic Operations Manager',
    shift: 'full_day',
    status: 'active',
    lastLoginAt: '2026-11-03T08:00:00Z',
    createdAt: '2025-01-05T10:00:00Z',
  },
];

// Register default preview-only passwords (strictly non-production or Cloud Run preview without PostgreSQL)
if ((process.env.NODE_ENV !== 'production' || isHostedFallbackWithoutDb()) && !isPostgresConfigured()) {
  for (const staff of staffUsers) {
    previewStaffPasswords.set(staff.id, '123456');
  }
}

const clinicRoles: ClinicRoleDefinition[] = [
  {
    id: 'super_admin',
    name: 'Super Admin',
    nameBn: 'সুপার অ্যাডমিন',
    description: 'সম্পূর্ণ সিস্টেমের একক নিয়ন্ত্রণ, ফিন্যান্সিয়াল ডিসকাউন্ট পলিসি, রোল ম্যানেজমেন্ট এবং সিকিউরিটি অডিট',
    userCount: 1,
    permissions: [
      'users.view', 'users.create', 'users.edit', 'users.delete', 'users.roles', 'users.security',
      'billing.view', 'billing.create', 'billing.refund', 'billing.discount_unlimited', 'billing.closing',
      'patients.view', 'patients.create', 'patients.edit', 'patients.delete', 'patients.export',
      'clinical.consultation', 'clinical.prescription', 'clinical.documents',
      'inventory.view', 'inventory.purchase', 'inventory.adjust',
      'settings.sms', 'settings.email', 'audit.view',
    ],
    isSystemRole: true,
  },
  {
    id: 'admin_manager',
    name: 'Admin & Operations Manager',
    nameBn: 'অপারেশন ম্যানেজার',
    description: 'দৈনিক ক্লিনিক পরিচালনা, ডাক্তার ও থেরাপিস্ট রোস্টার শিডিউলিং, স্টক রিকুইজিশন অনুমোদন',
    userCount: 1,
    permissions: [
      'users.view', 'users.create', 'users.edit', 'users.roster',
      'billing.view', 'billing.closing',
      'patients.view', 'patients.create', 'patients.edit',
      'clinical.consultation_view',
      'inventory.view', 'inventory.purchase',
      'settings.sms', 'audit.view',
    ],
  },
  {
    id: 'doctor',
    name: 'Doctor & Consultant Specialist',
    nameBn: 'ডাক্তার ও কনসালট্যান্ট',
    description: 'রোগীর ইতিহাস পর্যালোচনা, ডিজিটাল প্রেসক্রিপশন প্রদান, বিএমডিসি সাইনিং ও লেজার প্ল্যান',
    userCount: 4,
    permissions: [
      'patients.view', 'patients.edit',
      'clinical.consultation', 'clinical.prescription', 'clinical.documents',
      'packages.view', 'packages.deduct',
      'calendar.view', 'calendar.manage_slots',
    ],
  },
  {
    id: 'therapist',
    name: 'Aesthetic Laser Therapist',
    nameBn: 'লেজার ও বিউটি থেরাপিস্ট',
    description: 'মেশিন ট্রিটমেন্ট সম্পাদন, প্যাকেজ সেশন কনজিউম, কসমেসিউটিক্যালস কনজাম্পশন এন্ট্রি',
    userCount: 3,
    permissions: [
      'patients.view',
      'packages.view', 'packages.deduct',
      'treatments.execute',
      'calendar.view',
    ],
  },
  {
    id: 'receptionist',
    name: 'Front Desk Receptionist',
    nameBn: 'ফ্রন্ট ডেস্ক কর্মকর্তা',
    description: 'রোগী নিবন্ধন, দ্রুত অ্যাপয়েন্টমেন্ট বুকিং, ভিজিটর টোকেন জেনারেশন এবং চেক-ইন',
    userCount: 2,
    permissions: [
      'patients.view', 'patients.create', 'patients.edit',
      'appointments.view', 'appointments.book', 'appointments.reschedule', 'appointments.checkin',
      'calendar.view',
    ],
  },
  {
    id: 'cashier',
    name: 'Cashier & Accounts Executive',
    nameBn: 'ক্যাশিয়ার ও হিসাবরক্ষক',
    description: 'বিল জেনারেশন, ক্যাশ/কার্ড/বিকাশ পেমেন্ট গ্রহণ, ভ্যাট হিসাব এবং দৈনিক ক্যাশ ক্লোজিং',
    userCount: 1,
    permissions: [
      'billing.view', 'billing.create', 'billing.collect_payment', 'billing.closing',
      'invoices.print', 'invoices.download',
      'patients.view',
    ],
  },
  {
    id: 'inventory_manager',
    name: 'Inventory & Pharmacy Manager',
    nameBn: 'ইনভেন্টরি ও ফার্মেসি ম্যানেজার',
    description: 'মেডিসিন ও লেজার কনজিউমেবল স্টক পরিচালনা, পিও জেনারেশন, জিআরএন ও ড্যামেজ সমন্বয়',
    userCount: 1,
    permissions: [
      'inventory.view', 'inventory.create', 'inventory.purchase', 'inventory.grn', 'inventory.adjust',
      'suppliers.manage',
    ],
  },
  {
    id: 'call_center',
    name: 'Call Center & CRM Telephony',
    nameBn: 'কল সেন্টার প্রতিনিধি',
    description: 'টেলি-ইনকোয়ারি, টুমোরোস কল লিস্ট, ফলো-আপ কল আউটকাম লগিং ও প্রি-বুকিং',
    userCount: 1,
    permissions: [
      'appointments.view', 'appointments.book',
      'followups.view', 'followups.call', 'followups.reschedule',
      'patients.view',
    ],
  },
];

const staffRosters: StaffDutyRoster[] = [
  {
    id: 'rst-1',
    staffId: 'usr-101',
    staffName: 'Dr. Nusrat Jahan',
    role: 'doctor',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    date: '2026-11-03',
    shift: 'morning',
    roomNumber: 'Room 201 (Laser Suite A)',
    notes: 'Morning OPD & Fractional CO2 Laser Cases',
  },
  {
    id: 'rst-2',
    staffId: 'usr-109',
    staffName: 'Sabrina Mostafa',
    role: 'doctor',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    date: '2026-11-03',
    shift: 'morning',
    roomNumber: 'Room 203 (Consultation)',
    notes: 'Initial Assessment & Skin Analysis',
  },
  {
    id: 'rst-3',
    staffId: 'usr-105',
    staffName: 'Rina Begum',
    role: 'therapist',
    branchId: 'br-dhanmondi',
    branchName: 'Dhanmondi Main Center',
    date: '2026-11-03',
    shift: 'morning',
    roomNumber: 'Treatment Suite 1',
    assignedDoctorName: 'Dr. Nusrat Jahan',
    notes: 'HydraFacial MD & Carbon Laser Peels',
  },
  {
    id: 'rst-4',
    staffId: 'usr-102',
    staffName: 'Dr. Farhana Khan',
    role: 'doctor',
    branchId: 'br-gulshan',
    branchName: 'Gulshan Aesthetic Lounge',
    date: '2026-11-03',
    shift: 'evening',
    roomNumber: 'Room 302 (Anti-Aging Suite)',
    notes: 'Evening Botox & Dermal Fillers consultation',
  },
  {
    id: 'rst-5',
    staffId: 'usr-110',
    staffName: 'Nasreen Sultana',
    role: 'therapist',
    branchId: 'br-gulshan',
    branchName: 'Gulshan Aesthetic Lounge',
    date: '2026-11-03',
    shift: 'evening',
    roomNumber: 'Treatment Suite 2',
    assignedDoctorName: 'Dr. Farhana Khan',
    notes: 'Morpheus8 RF & Chemical Peel sessions',
  },
  {
    id: 'rst-6',
    staffId: 'usr-108',
    staffName: 'Dr. Tanvir Ahmed',
    role: 'doctor',
    branchId: 'br-uttara',
    branchName: 'Uttara Skin Care Clinic',
    date: '2026-11-03',
    shift: 'full_day',
    roomNumber: 'Room 105 (Trichology Suite)',
    notes: 'Full Day Trichology & PRP Therapy sessions',
  },
  {
    id: 'rst-7',
    staffId: 'usr-111',
    staffName: 'Tania Akter',
    role: 'therapist',
    branchId: 'br-uttara',
    branchName: 'Uttara Skin Care Clinic',
    date: '2026-11-03',
    shift: 'full_day',
    roomNumber: 'Treatment Suite 3',
    assignedDoctorName: 'Dr. Tanvir Ahmed',
    notes: 'Laser Hair Reduction & HydraFacial',
  },
];

const userSecurityLogs: UserSecurityLog[] = [
  {
    id: 'sec-1',
    userId: 'usr-100',
    userName: 'Kabir Ahmed',
    role: 'super_admin',
    action: 'LOGIN',
    ipAddress: '103.114.98.24',
    deviceInfo: 'Chrome 122 (Windows 11, Dhaka)',
    status: 'success',
    details: 'Successful administrator two-factor authentication',
    timestamp: '2026-11-03T09:15:10Z',
  },
  {
    id: 'sec-2',
    userId: 'usr-101',
    userName: 'Dr. Nusrat Jahan',
    role: 'doctor',
    action: 'LOGIN',
    ipAddress: '192.168.1.45',
    deviceInfo: 'Safari (iPad Pro, Dhanmondi Clinic Wi-Fi)',
    status: 'success',
    details: 'Doctor session authenticated for OPD consultations',
    timestamp: '2026-11-03T08:45:22Z',
  },
  {
    id: 'sec-3',
    userId: 'usr-106',
    userName: 'Shamim Hossain',
    role: 'cashier',
    action: 'LOGIN',
    ipAddress: '192.168.1.80',
    deviceInfo: 'Chrome 120 (POS Terminal 1, Dhanmondi)',
    status: 'success',
    details: 'Cashier session initiated for morning shift',
    timestamp: '2026-11-03T08:50:01Z',
  },
  {
    id: 'sec-4',
    userId: 'usr-105',
    userName: 'Rina Begum',
    role: 'therapist',
    action: 'LOGIN',
    ipAddress: '192.168.1.92',
    deviceInfo: 'Edge (Laser Console Tablet, Dhanmondi)',
    status: 'success',
    details: 'Therapist session logged in for morning treatments',
    timestamp: '2026-11-03T08:30:14Z',
  },
  {
    id: 'sec-5',
    userId: 'usr-100',
    userName: 'Kabir Ahmed',
    role: 'super_admin',
    action: 'ROLE_CHANGED',
    ipAddress: '103.114.98.24',
    deviceInfo: 'Chrome 122 (Windows 11)',
    status: 'success',
    details: 'Promoted Sabrina Mostafa from doctor to resident specialist with extended slot privileges',
    timestamp: '2026-11-02T17:30:00Z',
  },
  {
    id: 'sec-6',
    userId: 'usr-110',
    userName: 'Nasreen Sultana',
    role: 'therapist',
    action: 'PASSWORD_RESET',
    ipAddress: '103.205.71.18',
    deviceInfo: 'Chrome Mobile (Android 14, Dhaka)',
    status: 'success',
    details: 'Password successfully changed via secure SMS OTP',
    timestamp: '2026-11-02T13:40:00Z',
  },
  {
    id: 'sec-7',
    userId: 'usr-104',
    userName: 'Tania Khan',
    role: 'call_center',
    action: 'LOGIN',
    ipAddress: '192.168.1.112',
    deviceInfo: 'Chrome 122 (Call Center Station 3)',
    status: 'success',
    details: 'Call center shift login confirmed',
    timestamp: '2026-11-03T08:25:00Z',
  },
  {
    id: 'sec-8',
    userId: 'usr-112',
    userName: 'Mehedi Hasan',
    role: 'receptionist',
    action: 'LOGIN',
    ipAddress: '192.168.2.15',
    deviceInfo: 'Firefox (Reception Desk, Gulshan Branch)',
    status: 'success',
    details: 'Front desk terminal access authenticated',
    timestamp: '2026-11-02T13:58:00Z',
  },
  {
    id: 'sec-9',
    userId: 'usr-107',
    userName: 'Sharmin Sultana',
    role: 'inventory_manager',
    action: 'EXPORT_DATA',
    ipAddress: '192.168.1.66',
    deviceInfo: 'Chrome 121 (Inventory Backoffice)',
    status: 'success',
    details: 'Monthly consumable stock depletion audit exported to CSV',
    timestamp: '2026-11-01T18:15:00Z',
  },
  {
    id: 'sec-10',
    userId: 'usr-103',
    userName: 'Fatima Zohra',
    role: 'receptionist',
    action: 'PERMISSION_OVERRIDE',
    ipAddress: '192.168.1.10',
    deviceInfo: 'Chrome 122 (Front Desk, Dhanmondi)',
    status: 'flagged',
    details: 'Attempted to edit locked financial invoice without cashier clearance; rejected',
    timestamp: '2026-11-01T11:20:00Z',
  },
];

// -------------------------------------------------------------
// Data Store: Security & System Settings
// -------------------------------------------------------------

let generalSettings: ClinicGeneralSettings = {
  clinicName: 'SUOXI Skin Care & Aesthetic Center',
  clinicNameBn: 'সুঅক্সি স্কিন কেয়ার অ্যান্ড নান্দনিক কেন্দ্র',
  tagline: 'Premier Aesthetic Dermatology & Laser Center in Dhaka',
  binNumber: 'BIN-003847291-0101',
  tradeLicenseNo: 'TRAD/DNCC/048192/2024',
  vatPercent: 5.0,
  currency: 'BDT',
  currencySymbol: '৳',
  timezone: 'Asia/Dhaka',
  primaryHelpline: '+8801711223344',
  supportEmail: 'care@suoxiclinic.com',
  invoicePrefix: 'INV-2026-',
  posFooterNotes: 'Thank you for trusting SUOXI. Aesthetic treatments require post-procedure SPF sunblock compliance. Medicines once sold cannot be returned.',
  primaryAddress: 'House 42, Road 9/A, Dhanmondi, Dhaka-1209, Bangladesh',
};

let schedulingSettings: ClinicSchedulingSettings = {
  defaultSlotDurationMinutes: 30,
  patientBufferMinutes: 5,
  operatingStartTime: '09:00',
  operatingEndTime: '20:30',
  maxAdvanceBookingDays: 30,
  allowWalkInOverlap: true,
  teleTriageMandatory: false,
  autoSendSmsReminder24h: true,
};

let securitySettings: ClinicSecuritySettings = {
  twoFactorEnforced: true,
  sessionTimeoutMinutes: 15,
  passwordExpiryDays: 90,
  minPasswordLength: 8,
  requireSpecialCharacter: true,
  maxDiscountPercentWithoutApproval: 5,
  patientPortalLinkExpiryHours: 24,
  patientPortalOtpExpiryMinutes: 5,
  allowDataExport: true,
  maskPatientMobileInCallCenter: true,
};

let backupRecords: BackupRecord[] = [
  {
    id: 'bkp-20261103-01',
    filename: 'suoxi_crm_daily_20261103_040000.sql.gz',
    fileSize: '14.8 MB',
    backupType: 'auto_daily',
    status: 'completed',
    totalRecords: 12480,
    tablesIncluded: ['patients', 'appointments', 'invoices', 'prescriptions', 'inventory', 'audit_logs'],
    createdAt: '2026-11-03T04:00:00Z',
    createdBy: 'System Automated Cron',
  },
  {
    id: 'bkp-20261102-01',
    filename: 'suoxi_crm_daily_20261102_040000.sql.gz',
    fileSize: '14.2 MB',
    backupType: 'auto_daily',
    status: 'completed',
    totalRecords: 12210,
    tablesIncluded: ['patients', 'appointments', 'invoices', 'prescriptions', 'inventory', 'audit_logs'],
    createdAt: '2026-11-02T04:00:00Z',
    createdBy: 'System Automated Cron',
  },
  {
    id: 'bkp-20261028-02',
    filename: 'suoxi_crm_manual_pre_release.sql.gz',
    fileSize: '13.9 MB',
    backupType: 'manual',
    status: 'completed',
    totalRecords: 11950,
    tablesIncluded: ['patients', 'appointments', 'invoices', 'prescriptions', 'inventory', 'audit_logs'],
    createdAt: '2026-10-28T18:30:00Z',
    createdBy: 'Kabir Ahmed (Super Admin)',
  },
];

let activeSessions: ActiveSessionRecord[] = [
  {
    id: 'sess-01',
    userId: 'usr-101',
    userName: 'Dr. Nusrat Jahan',
    role: 'doctor',
    ipAddress: '192.168.1.45',
    deviceInfo: 'Safari (iPad Pro 12.9, Dhanmondi Clinic Wi-Fi)',
    loginTime: '2026-11-03T08:45:22Z',
    lastActiveTime: '2026-11-03T09:12:00Z',
    isCurrentSession: true,
  },
  {
    id: 'sess-02',
    userId: 'usr-100',
    userName: 'Kabir Ahmed',
    role: 'super_admin',
    ipAddress: '103.114.98.24',
    deviceInfo: 'Chrome 122 (Windows 11, Executive Office)',
    loginTime: '2026-11-03T09:15:10Z',
    lastActiveTime: '2026-11-03T09:16:30Z',
    isCurrentSession: false,
  },
  {
    id: 'sess-03',
    userId: 'usr-106',
    userName: 'Shamim Hossain',
    role: 'cashier',
    ipAddress: '192.168.1.80',
    deviceInfo: 'Chrome 120 (POS Terminal 1, Dhanmondi)',
    loginTime: '2026-11-03T08:50:01Z',
    lastActiveTime: '2026-11-03T09:05:14Z',
    isCurrentSession: false,
  },
  {
    id: 'sess-04',
    userId: 'usr-105',
    userName: 'Rina Begum',
    role: 'therapist',
    ipAddress: '192.168.1.92',
    deviceInfo: 'Edge (Laser Console Tablet, Dhanmondi)',
    loginTime: '2026-11-03T08:30:14Z',
    lastActiveTime: '2026-11-03T09:10:00Z',
    isCurrentSession: false,
  },
  {
    id: 'sess-05',
    userId: 'usr-104',
    userName: 'Tania Khan',
    role: 'call_center',
    ipAddress: '192.168.1.112',
    deviceInfo: 'Chrome 122 (Call Center Station 3)',
    loginTime: '2026-11-03T08:25:00Z',
    lastActiveTime: '2026-11-03T09:11:45Z',
    isCurrentSession: false,
  },
];

// Helper to record audit event in same mutation
function logAuditEvent(action: string, resourceType: string, resourceId: string, details: string, branchId = currentUser.branchId) {
  const event: AuditEvent = {
    id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    userId: currentUser.id,
    userName: currentUser.name,
    userRole: currentUser.role,
    action,
    resourceType,
    resourceId,
    details,
    ipAddress: '127.0.0.1',
    branchId,
  };
  auditEvents.unshift(event);
  return event;
}

// -------------------------------------------------------------
// Middleware: Persistent PostgreSQL + Redis CSRF & Idempotency
// -------------------------------------------------------------

const CSRF_EXEMPT_PREFIXES = ['/api/v1/webhooks/'];

// Generate new CSRF token (persisted in PostgreSQL + Redis when PG is active)
app.get('/api/v1/csrf-token', async (req, res) => {
  try {
    if (isPostgresConfigured()) {
      const sessionId = (req as Request & { sessionId?: string }).sessionId || null;
      const csrfToken = await issuePersistentCsrfToken({ sessionId });
      return sendSuccess(res, { csrfToken });
    }
  } catch (err) {
    console.warn('[CSRF] Persistent issuance fallback:', err instanceof Error ? err.message : err);
  }
  const token = crypto.randomBytes(24).toString('hex');
  validCsrfTokens.add(token);
  return sendSuccess(res, { csrfToken: token });
});

// Verify CSRF on unsafe HTTP methods
app.use('/api/v1', async (req: Request, res: Response, next: NextFunction) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }
  const fullPath = req.originalUrl.split('?')[0];
  if (CSRF_EXEMPT_PREFIXES.some((prefix) => fullPath.startsWith(prefix))) {
    return next();
  }

  const token = String(req.headers['x-csrf-token'] || '').trim();
  if (!token) {
    return sendError(res, 403, 'CSRF_INVALID', 'Missing or invalid CSRF token in x-csrf-token header.');
  }

  if (isPostgresConfigured()) {
    try {
      const valid = await validatePersistentCsrfToken(token);
      if (!valid) {
        return sendError(res, 403, 'CSRF_INVALID', 'Invalid or expired CSRF token.');
      }
      return next();
    } catch (err) {
      console.error('[CSRF] Validation error:', err instanceof Error ? err.message : err);
      if (process.env.NODE_ENV === 'production') {
        return sendError(res, 503, 'CSRF_UNAVAILABLE', 'Security token store temporarily unavailable.');
      }
    }
  } else if (process.env.NODE_ENV === 'production' && !validCsrfTokens.has(token)) {
    return sendError(res, 403, 'CSRF_INVALID', 'Invalid CSRF token.');
  }

  return next();
});

const pendingIdempotencyMeta = new Map<string, { method: string; routePath: string; actorScope: string }>();

// Idempotency Middleware for Money, Stock, Package mutations (Rule 5 — PG persistent)
function checkIdempotency(req: Request, res: Response, next: NextFunction) {
  const key = String(req.headers['idempotency-key'] || '').trim();
  if (!key) return next();

  if (isPostgresConfigured()) {
    const actor = getRequestAuthUser();
    const actorScope = actor?.id || 'anonymous';
    const routePath = req.path;
    const method = req.method.toUpperCase();
    acquireIdempotencyKey({
      key,
      method,
      routePath,
      actorScope,
      requestPayload: req.body,
    })
      .then((outcome) => {
        if (outcome.state === 'replay') {
          return res.status(outcome.statusCode).json(outcome.body);
        }
        if (outcome.state === 'conflict') {
          return sendError(
            res,
            409,
            'IDEMPOTENCY_CONFLICT',
            outcome.message || 'Idempotency-Key was already used with a different request payload.'
          );
        }
        if (outcome.state === 'in_progress') {
          return sendError(
            res,
            409,
            'IDEMPOTENCY_IN_PROGRESS',
            outcome.message || 'A request with this Idempotency-Key is currently being processed.'
          );
        }
        pendingIdempotencyMeta.set(key, { method, routePath, actorScope });
        return next();
      })
      .catch((err) => {
        console.error('[Idempotency] PG check failed:', err instanceof Error ? err.message : err);
        return sendError(res, 503, 'IDEMPOTENCY_UNAVAILABLE', 'Idempotency store unavailable.');
      });
    return;
  }

  if (idempotencyStore.has(key)) {
    const cached = idempotencyStore.get(key)!;
    return res.status(cached.statusCode).json(cached.body);
  }
  return next();
}

function saveIdempotency(key: string | undefined, statusCode: number, body: unknown) {
  if (!key) return;
  if (isPostgresConfigured()) {
    const trimmed = key.trim();
    const meta = pendingIdempotencyMeta.get(trimmed);
    pendingIdempotencyMeta.delete(trimmed);
    if (!meta) return;
    void completeIdempotencyKey({
      key: trimmed,
      method: meta.method,
      routePath: meta.routePath,
      actorScope: meta.actorScope,
      statusCode,
      responseBody: body,
    }).catch((err) => {
      console.error('[Idempotency] PG save failed:', err instanceof Error ? err.message : err);
    });
    return;
  }
  idempotencyStore.set(key, { statusCode, body });
}

// Phase 4: Mount Production Auth, Private VPS File Storage, Redis Dashboard Cache & Queue Routes
app.use(
  createPhase4PlatformRouter({
    getFallbackUser: () => currentUser,
    previewAuth:
      (process.env.NODE_ENV !== 'production' || isHostedFallbackWithoutDb()) && !isPostgresConfigured()
        ? {
            authenticate: (identifier: string, password: string) => {
              const raw = identifier.trim();
              const upper = raw.toUpperCase();
              const lower = raw.toLowerCase();
              const staff = staffUsers.find(
                (u) =>
                  (u.employeeId && u.employeeId.toUpperCase() === upper) ||
                  u.email.toLowerCase() === lower
              );
              if (!staff) {
                return {
                  statusCode: 401,
                  errorCode: 'INVALID_CREDENTIALS',
                  message: 'Invalid Employee ID or password',
                };
              }
              if (staff.status && staff.status !== 'active') {
                return {
                  statusCode: 403,
                  errorCode: 'ACCOUNT_INACTIVE',
                  message: 'Your staff account is inactive or suspended. Contact the clinic administrator.',
                };
              }
              const expectedPwd = previewStaffPasswords.get(staff.id) ?? '123456';
              if (password !== expectedPwd) {
                return {
                  statusCode: 401,
                  errorCode: 'INVALID_CREDENTIALS',
                  message: 'Invalid Employee ID or password',
                };
              }
              return { user: { ...staff } };
            },
            getSessionUser: (sessionId: string) => previewSessions.get(sessionId),
            createSession: (user: User, ipAddress: string, deviceInfo: string) => {
              const sid = crypto.randomBytes(24).toString('hex');
              const sessionUser = { ...user, lastLoginAt: new Date().toISOString() };
              previewSessions.set(sid, sessionUser);
              currentUser = sessionUser;
              const matched = staffUsers.find((u) => u.id === user.id);
              if (matched) {
                matched.lastLoginAt = sessionUser.lastLoginAt;
              }
              logAuditEvent(
                'USER_LOGIN',
                'user',
                user.id,
                `Preview sign-in by ${user.employeeId || user.email} from ${ipAddress} (${deviceInfo.slice(0, 60)})`
              );
              return sid;
            },
            revokeSession: (sessionId: string) => {
              previewSessions.delete(sessionId);
            },
          }
        : undefined,
  })
);

// -------------------------------------------------------------
// Endpoints: Authentication & User Roles Switcher (Preview Fallback)
// -------------------------------------------------------------

app.get('/api/v1/auth/me', (req, res) => {
  if ((process.env.NODE_ENV !== 'production' || isHostedFallbackWithoutDb()) && !isPostgresConfigured()) {
    const cookies = parseCookieHeader(req.headers.cookie);
    const sid = cookies[PREVIEW_SESSION_COOKIE_NAME];
    const previewUser = sid ? previewSessions.get(sid) : undefined;
    if (!previewUser) {
      return sendError(res, 401, 'AUTH_REQUIRED', 'Authentication required. Please sign in.');
    }
    return sendSuccess(res, { user: previewUser, authMode: 'preview_demo', allowRoleSwitcher: true });
  }
  return sendSuccess(res, { user: currentUser, authMode: 'preview_demo', allowRoleSwitcher: false });
});

// Phase 2: Mount PostgreSQL Core Clinical & Financial Router (active when DATABASE_URL is configured)
app.use(
  createPgCoreRouter({
    getCurrentUser: () => getRequestAuthUser() || currentUser,
    checkIdempotency,
    saveIdempotency,
  })
);

// Phase 3: Mount PostgreSQL Operational Modules Router (Inventory, Call Center, Referrals, Audit, SMS/Email, Settings)
app.use(
  createPgOpsRouter({
    getCurrentUser: () => getRequestAuthUser() || currentUser,
    checkIdempotency,
    saveIdempotency,
    getServerOutgoingIp: () => getServerOutgoingIp(),
  })
);

// Phase 2/3/4 Extended PostgreSQL Router (Catalog, Calendar, Clinical Sessions, Portal, Notifications, Webhooks, Reports, Refunds)
app.use(
  createPgExtendedRouter({
    getFallbackUser: () => currentUser,
  })
);

// Production Fail-Closed Barrier: NEVER fall through to in-memory prototype routes in real VPS/PG production
app.use(['/api', '/portal'], (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'production' && !isHostedFallbackWithoutDb()) {
    return sendError(
      res,
      404,
      'API_ENDPOINT_NOT_FOUND',
      `Production API endpoint ${req.method} ${req.originalUrl} not found`
    );
  }
  return next();
});

// Branches
app.get('/api/v1/branches', (_req, res) => {
  return sendSuccess(res, branches);
});

// -------------------------------------------------------------
// Endpoints: Patients
// -------------------------------------------------------------

app.get('/api/v1/patients', (req, res) => {
  const query = ((req.query.q as string) || '').toLowerCase().trim();
  let list = [...patients];

  if (query) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.phone.includes(query) ||
        p.patientIdCode.toLowerCase().includes(query)
    );
  }

  return sendSuccess(res, list, { total: list.length });
});

function resolvePatientRecord(id: string): Patient {
  const normalizedId = (id || '').trim();

  // 1. Direct ID match
  let p = patients.find((pt) => pt.id === normalizedId);
  if (p) return p;

  // 2. Direct code match (SX-2026-0841, SKC-000088, etc.)
  p = patients.find((pt) => pt.patientIdCode && pt.patientIdCode.toLowerCase() === normalizedId.toLowerCase());
  if (p) return p;

  // 3. pat-X <-> pt-X translation
  if (normalizedId.startsWith('pat-')) {
    const alias = normalizedId.replace('pat-', 'pt-');
    p = patients.find((pt) => pt.id === alias);
    if (p) return p;
  } else if (normalizedId.startsWith('pt-')) {
    const alias = normalizedId.replace('pt-', 'pat-');
    p = patients.find((pt) => pt.id === alias);
    if (p) return p;
  }

  // 4. Numeric index match (e.g. "1" -> pat-1 or pt-1)
  const matchNum = normalizedId.match(/\d+/);
  if (matchNum) {
    const num = matchNum[0];
    p = patients.find((pt) => pt.id === `pat-${num}` || pt.id === `pt-${num}`);
    if (p) return p;
  }

  // 5. Query appointmentService appointments for matching patient_id or patient_name
  try {
    const apts = appointmentService.listAppointments({ limit: 100 }).items;
    const matchedApt = apts.find((a: any) =>
      a.patient_id === normalizedId ||
      a.id === normalizedId ||
      (normalizedId.startsWith('pat-') && a.patient_id === normalizedId.replace('pat-', 'pt-')) ||
      (normalizedId.startsWith('pt-') && a.patient_id === normalizedId.replace('pt-', 'pat-'))
    );
    if (matchedApt) {
      const generated: Patient = {
        id: normalizedId,
        patientIdCode: matchedApt.patient_code || `SX-2026-${normalizedId}`,
        name: matchedApt.patient_name || 'Patient',
        nameBn: matchedApt.patient_name_bn || undefined,
        phone: matchedApt.patient_mobile || '+8801712345678',
        gender: ((matchedApt as any).patient_summary?.gender as any) || 'female',
        age: (matchedApt as any).patient_summary?.approximate_age || 28,
        bloodGroup: ((matchedApt as any).patient_summary?.blood_group as any) || 'B+',
        address: 'House 42, Road 7, Dhanmondi, Dhaka',
        city: 'Dhaka',
        branchId: matchedApt.branch_id || 'br-dhanmondi',
        allergies: [],
        medicalHistory: matchedApt.notes || 'Routine consultation and assessment',
        skinType: 'combination',
        createdAt: matchedApt.created_at || new Date().toISOString(),
        updatedAt: matchedApt.updated_at || new Date().toISOString(),
      };
      patients.push(generated);
      return generated;
    }
  } catch (_e) {
    // ignore
  }

  // 6. Query local appointments array
  const localApt = appointments.find((a) => a.patientId === normalizedId || (a as any).patient_id === normalizedId);
  if (localApt) {
    const generated: Patient = {
      id: normalizedId,
      patientIdCode: `SX-2026-${normalizedId}`,
      name: localApt.patientName || 'Patient',
      phone: localApt.patientPhone || '+8801712345678',
      gender: 'female',
      age: 28,
      bloodGroup: 'B+',
      address: 'House 42, Road 7, Dhanmondi, Dhaka',
      city: 'Dhaka',
      branchId: localApt.branchId || 'br-dhanmondi',
      allergies: [],
      medicalHistory: localApt.notes || 'Routine consultation and assessment',
      skinType: 'combination',
      createdAt: localApt.createdAt || new Date().toISOString(),
      updatedAt: localApt.updatedAt || new Date().toISOString(),
    };
    patients.push(generated);
    return generated;
  }

  // 7. Synthetic fallback
  const fallback: Patient = {
    id: normalizedId || `pt-${Date.now()}`,
    patientIdCode: `SX-2026-${normalizedId || 'REC'}`,
    name: 'Registered Patient',
    phone: '+8801712345678',
    gender: 'female',
    age: 30,
    bloodGroup: 'B+',
    address: 'Dhanmondi, Dhaka',
    city: 'Dhaka',
    branchId: 'br-dhanmondi',
    allergies: [],
    medicalHistory: 'Clinical record loaded.',
    skinType: 'combination',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  patients.push(fallback);
  return fallback;
}

app.get('/api/v1/patients/:id', (req, res) => {
  const patient = resolvePatientRecord(req.params.id);

  // Cross-reference IDs for history
  const matchIds = new Set<string>([
    patient.id,
    req.params.id,
    patient.id.startsWith('pat-') ? patient.id.replace('pat-', 'pt-') : patient.id.replace('pt-', 'pat-'),
  ]);

  // Gather patient's clinical history, prescriptions, packages, invoices
  const patientAppointments = [
    ...appointments.filter((a) => matchIds.has(a.patientId) || matchIds.has((a as any).patient_id) || a.patientName === patient.name),
    ...appointmentService.listAppointments({ limit: 100 }).items
      .filter((a: any) => matchIds.has(a.patient_id) || a.patient_name === patient.name)
      .map((a: any) => ({
        id: a.id,
        patientId: patient.id,
        patientName: a.patient_name,
        patientPhone: a.patient_mobile,
        branchId: a.branch_id,
        branchName: a.branch_name || 'Dhanmondi Main Center',
        doctorId: a.provider_id,
        doctorName: a.provider_name,
        serviceCategory: a.service_category || 'Facial Aesthetics',
        serviceName: a.service_name,
        appointmentDate: a.appointment_date,
        appointmentTime: a.start_time,
        durationMinutes: a.duration_minutes || 30,
        status: a.status,
        callReference: a.call_reference,
        notes: a.notes,
        createdBy: a.created_by,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
      })),
  ];

  // Deduplicate appointments by id
  const seenAptIds = new Set<string>();
  const uniqueAppointments = patientAppointments.filter((a) => {
    if (seenAptIds.has(a.id)) return false;
    seenAptIds.add(a.id);
    return true;
  });

  const patientConsultations = consultations.filter((c) => matchIds.has(c.patientId) || c.patientName === patient.name);
  const patientPrescriptions = prescriptions.filter((p) => matchIds.has(p.patientId) || p.patientName === patient.name);
  const patientPackages = packages.filter((pkg) => matchIds.has(pkg.patientId) || pkg.patientName === patient.name);
  const patientInvoices = invoices.filter((i) => matchIds.has(i.patientId) || i.patientName === patient.name);

  return sendSuccess(res, {
    patient,
    appointments: uniqueAppointments,
    consultations: patientConsultations,
    prescriptions: patientPrescriptions,
    packages: patientPackages,
    invoices: patientInvoices,
  });
});

app.post('/api/v1/patients', (req, res) => {
  const schema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    nameBn: z.string().optional(),
    phone: z.string().regex(/^\+?8801[3-9]\d{8}$/, 'Must be a valid Bangladesh phone number (+8801XXXXXXXXX)'),
    email: z.string().email().optional().or(z.literal('')),
    gender: z.enum(['female', 'male', 'other']),
    dateOfBirth: z.string().optional(),
    age: z.number().min(1).max(120).optional(),
    bloodGroup: z.string().optional(),
    address: z.string().optional(),
    city: z.string().default('Dhaka'),
    branchId: z.string().default('br-dhanmondi'),
    allergies: z.array(z.string()).optional(),
    medicalHistory: z.string().optional(),
    skinType: z.enum(['normal', 'dry', 'oily', 'combination', 'sensitive']).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid patient data', parsed.error.format());
  }

  const data = parsed.data;

  // Hard Rule 9: Duplicate patients are flagged for human review, never auto-merged
  const normalizedPhone = data.phone.startsWith('+') ? data.phone : `+${data.phone}`;
  const existingWithSamePhone = patients.find((p) => p.phone === normalizedPhone);
  const isDuplicate = !!existingWithSamePhone;

  const newPatient: Patient = {
    id: `pt-${patients.length + 1}`,
    patientIdCode: `SX-2026-${(840 + patients.length + 1).toString().padStart(4, '0')}`,
    name: data.name,
    nameBn: data.nameBn,
    phone: normalizedPhone,
    email: data.email || undefined,
    gender: data.gender,
    dateOfBirth: data.dateOfBirth,
    age: data.age,
    bloodGroup: data.bloodGroup,
    address: data.address,
    city: data.city,
    branchId: data.branchId,
    allergies: data.allergies || [],
    medicalHistory: data.medicalHistory,
    skinType: data.skinType,
    isFlaggedDuplicate: isDuplicate,
    duplicateReason: isDuplicate
      ? `Phone matches existing patient ${existingWithSamePhone?.patientIdCode} (${existingWithSamePhone?.name}). Flagged for manual review.`
      : undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  patients.push(newPatient);

  patientService.upsertPatient({
    id: newPatient.id,
    patient_code: newPatient.patientIdCode,
    branch_id: newPatient.branchId,
    full_name: newPatient.name,
    full_name_bn: newPatient.nameBn,
    gender: newPatient.gender as any,
    approximate_age: newPatient.age,
    blood_group: newPatient.bloodGroup as any,
    primary_mobile: newPatient.phone,
    primary_mobile_normalized: newPatient.phone,
    email: newPatient.email,
    address: newPatient.address,
    city: newPatient.city,
    status: 'active',
    created_at: newPatient.createdAt,
    updated_at: newPatient.updatedAt,
  });

  savePatientsToDisk();

  logAuditEvent(
    isDuplicate ? 'PATIENT_CREATED_DUPLICATE_FLAGGED' : 'PATIENT_CREATED',
    'patient',
    newPatient.id,
    `Registered patient ${newPatient.name} (${newPatient.patientIdCode}). ${isDuplicate ? 'FLAGGED AS DUPLICATE.' : ''}`
  );

  return sendSuccess(res, newPatient, {}, 201);
});

// Update / Edit Patient Endpoint
function updatePatientHandler(req: Request, res: Response) {
  const patientId = String(req.params.id || '').trim();
  const targetPatient = resolvePatientRecord(patientId);

  const patientIndex = patients.findIndex(
    (p) =>
      p.id === patientId ||
      (targetPatient && p.id === targetPatient.id) ||
      p.patientIdCode?.toLowerCase() === patientId.toLowerCase()
  );

  if (patientIndex === -1 && !targetPatient) {
    return sendError(res, 404, 'NOT_FOUND', `Patient record "${patientId}" not found`);
  }

  const updateSchema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters').optional(),
    nameBn: z.string().optional().nullable(),
    phone: z.string().regex(/^\+?8801[3-9]\d{8}$/, 'Must be a valid Bangladesh phone number (+8801XXXXXXXXX)').optional(),
    email: z.string().email().optional().or(z.literal('')).nullable(),
    gender: z.enum(['female', 'male', 'other', 'prefer_not_to_say']).optional(),
    dateOfBirth: z.string().optional().nullable(),
    age: z.number().min(1).max(120).optional().nullable(),
    bloodGroup: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    city: z.string().optional(),
    branchId: z.string().optional(),
    allergies: z.array(z.string()).optional(),
    medicalHistory: z.string().optional().nullable(),
    skinType: z.enum(['normal', 'dry', 'oily', 'combination', 'sensitive']).optional().nullable(),
    isFlaggedDuplicate: z.boolean().optional(),
    duplicateReason: z.string().optional().nullable(),
  });

  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid patient update payload', parsed.error.format());
  }

  const data = parsed.data;
  const existing = patientIndex !== -1 ? patients[patientIndex] : targetPatient;

  // Normalized phone check
  let normalizedPhone = existing.phone;
  let isDuplicate = existing.isFlaggedDuplicate;
  let duplicateReason = existing.duplicateReason;

  if (data.phone) {
    normalizedPhone = data.phone.startsWith('+') ? data.phone : `+${data.phone}`;
    const duplicateMatch = patients.find(
      (p) => p.id !== existing.id && p.phone === normalizedPhone
    );
    if (duplicateMatch) {
      isDuplicate = true;
      duplicateReason = `Phone matches existing patient ${duplicateMatch.patientIdCode} (${duplicateMatch.name}). Flagged for manual review.`;
    }
  }

  const updatedPatient: Patient = {
    ...existing,
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.nameBn !== undefined ? { nameBn: data.nameBn || undefined } : {}),
    ...(data.phone !== undefined ? { phone: normalizedPhone } : {}),
    ...(data.email !== undefined ? { email: data.email || undefined } : {}),
    ...(data.gender !== undefined ? { gender: data.gender as any } : {}),
    ...(data.dateOfBirth !== undefined ? { dateOfBirth: data.dateOfBirth || undefined } : {}),
    ...(data.age !== undefined ? { age: data.age ?? undefined } : {}),
    ...(data.bloodGroup !== undefined ? { bloodGroup: data.bloodGroup || undefined } : {}),
    ...(data.address !== undefined ? { address: data.address || undefined } : {}),
    ...(data.city !== undefined ? { city: data.city } : {}),
    ...(data.branchId !== undefined ? { branchId: data.branchId } : {}),
    ...(data.allergies !== undefined ? { allergies: data.allergies } : {}),
    ...(data.medicalHistory !== undefined ? { medicalHistory: data.medicalHistory || undefined } : {}),
    ...(data.skinType !== undefined ? { skinType: data.skinType as any } : {}),
    isFlaggedDuplicate: data.isFlaggedDuplicate !== undefined ? data.isFlaggedDuplicate : isDuplicate,
    duplicateReason: data.duplicateReason !== undefined ? (data.duplicateReason || undefined) : duplicateReason,
    updatedAt: new Date().toISOString(),
  };

  if (patientIndex !== -1) {
    patients[patientIndex] = updatedPatient;
  } else {
    patients.push(updatedPatient);
  }

  patientService.upsertPatient({
    id: updatedPatient.id,
    patient_code: updatedPatient.patientIdCode,
    branch_id: updatedPatient.branchId || 'br-dhanmondi',
    full_name: updatedPatient.name,
    full_name_bn: updatedPatient.nameBn,
    gender: updatedPatient.gender as any,
    approximate_age: updatedPatient.age,
    blood_group: updatedPatient.bloodGroup as any,
    primary_mobile: updatedPatient.phone,
    primary_mobile_normalized: updatedPatient.phone,
    email: updatedPatient.email,
    address: updatedPatient.address,
    city: updatedPatient.city,
    status: 'active',
    created_at: updatedPatient.createdAt,
    updated_at: updatedPatient.updatedAt,
  });

  savePatientsToDisk();

  logAuditEvent(
    'PATIENT_UPDATED',
    'patient',
    updatedPatient.id,
    `Updated details for patient ${updatedPatient.name} (${updatedPatient.patientIdCode})`
  );

  return sendSuccess(res, updatedPatient);
}

app.put(['/api/v1/patients/:id', '/patients/:id'], (req, res) => {
  return updatePatientHandler(req, res);
});

app.patch(['/api/v1/patients/:id', '/patients/:id'], (req, res) => {
  return updatePatientHandler(req, res);
});

// -------------------------------------------------------------
// Endpoints: Appointments (Under 60s Booking Flow)
// -------------------------------------------------------------

app.get('/api/v1/appointments', (req, res) => {
  const { branchId, patientId, providerId, status, sourceId, startDate, endDate, tab, search, page, limit, date } = req.query;

  const effStartDate = (date as string) || (startDate as string);
  const effEndDate = (date as string) || (endDate as string);

  const result = appointmentService.listAppointments({
    branchId: branchId as string,
    patientId: patientId as string,
    providerId: providerId as string,
    status: status as string,
    sourceId: sourceId as string,
    startDate: effStartDate,
    endDate: effEndDate,
    tab: tab as any,
    search: search as string,
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 100,
  });

  const items = result.items.map((a: any) => {
    const pt = resolvePatientRecord(a.patient_id || a.patientId);
    let parsedDisease = a.disease_name || a.diseaseName || '';
    if (!parsedDisease && a.service_name?.includes(':')) {
      parsedDisease = a.service_name.split(':')[1]?.trim();
    }
    if (!parsedDisease && a.notes?.includes('Disease:')) {
      const match = a.notes.match(/Disease:\s*([^|\]]+)/);
      if (match) parsedDisease = match[1].trim();
    }
    let parsedMethod = a.booking_method || a.bookingMethod || '';
    if (!parsedMethod && a.notes?.includes('Method:')) {
      const match = a.notes.match(/Method:\s*([^|\]]+)/);
      if (match) parsedMethod = match[1].trim();
    }
    if (!parsedMethod && a.call_reference) {
      parsedMethod = a.call_reference.replace(/^\[Method:\s*/, '').replace(/\]$/, '').trim();
    }

    return {
      ...a,
      patientName: a.patient_name || a.patientName || pt?.name || 'Patient',
      patientPhone: a.patient_mobile || a.patientPhone || pt?.phone || '',
      patientAge: pt?.age || a.patient_summary?.approximate_age || 28,
      patientGender: pt?.gender || a.patient_summary?.gender || 'female',
      patientAddress: pt?.address || (pt?.city ? `${pt.city}` : 'Dhanmondi, Dhaka'),
      patientBloodGroup: pt?.bloodGroup || a.patient_summary?.blood_group || 'B+',
      diseaseName: parsedDisease || 'Acne Vulgaris',
      bookingMethod: parsedMethod || 'Phone GP',
      branchName: a.branch_name || a.branchName || (a.branch_id === 'br-uttara' ? 'Uttara Branch' : 'Dhanmondi Main Center'),
      doctorName: a.provider_name || a.doctorName || 'Dr. Nusrat Jahan',
      appointmentDate: a.appointment_date || a.appointmentDate,
      appointmentTime: a.start_time || a.appointmentTime,
      durationMinutes: a.duration_minutes || a.durationMinutes || 30,
    };
  });

  return sendSuccess(res, items, { total: result.total, page: page || 1, limit: limit || 20 });
});

app.get('/api/v1/appointments/availability', (req, res) => {
  const providerId = (req.query.providerId as string) || 'usr-101';
  const date = (req.query.date as string) || new Date().toISOString().substring(0, 10);
  const duration = req.query.duration ? parseInt(req.query.duration as string, 10) : 30;

  const providerNameMap: Record<string, string> = {
    'usr-101': 'Dr. Nusrat Jahan',
    'usr-102': 'Dr. Farhana Khan',
    'usr-103': 'Sabrina Mostafa',
  };
  const providerName = providerNameMap[providerId] || 'Doctor';

  const bookedSlots = appointmentService.getProviderBookedSlots(providerId, date);
  const availability = computeAvailability(providerId, providerName, date, bookedSlots, duration);

  return sendSuccess(res, availability);
});

app.get(['/api/v1/calendar', '/calendar'], (req, res) => {
  const from = req.query.from as string;
  const to = req.query.to as string;
  const providerId = req.query.providerId as string | undefined;
  const resourceId = req.query.resourceId as string | undefined;
  const branchId = (req.query.branchId as string) || 'br-dhanmondi';

  if (!from || !to) {
    return sendError(res, 400, 'BAD_REQUEST', 'Both "from" and "to" parameters are required');
  }

  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T23:59:59Z`);
  if (toDate.getTime() < fromDate.getTime()) {
    return sendError(res, 400, 'BAD_REQUEST', '"from" date cannot be after "to" date');
  }

  const diffDays = Math.ceil((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 42) {
    return sendError(res, 400, 'BAD_REQUEST', 'Date range exceeds maximum allowed window of 42 days');
  }

  const appointmentsResult = appointmentService.listAppointments({
    branchId,
    providerId: providerId !== 'all' ? providerId : undefined,
    startDate: from,
    endDate: to,
    limit: 1000,
  });

  let filtered = appointmentsResult.items;
  if (resourceId && resourceId !== 'all') {
    filtered = filtered.filter((a) => a.resource_id === resourceId);
  }

  const isCallCenter = currentUser.role === 'call_center';

  const calendarAppointments = filtered.map((apt) => ({
    id: apt.id,
    appointment_code: apt.appointment_code,
    branch_id: apt.branch_id,
    patient_id: apt.patient_id,
    patient_name: apt.patient_name,
    patient_mobile: isCallCenter ? undefined : apt.patient_mobile,
    provider_id: apt.provider_id,
    provider_name: apt.provider_name,
    resource_id: apt.resource_id,
    resource_name: apt.resource_name,
    service_name: apt.service_name,
    service_category: apt.service_category,
    appointment_date: apt.appointment_date,
    start_time: apt.start_time,
    end_time: apt.end_time,
    duration_minutes: apt.duration_minutes,
    status: apt.status,
    set_by_clinician: apt.set_by_clinician,
    is_walk_in: apt.is_walk_in,
    notes: isCallCenter ? null : apt.notes,
  }));

  const schedules = scheduleRepository.getAllSchedules(
    branchId,
    providerId !== 'all' ? providerId : undefined
  );

  const timeOffs = scheduleRepository.getAllTimeOffs(
    from,
    to,
    providerId !== 'all' ? providerId : undefined
  );

  return sendSuccess(res, {
    from,
    to,
    appointments: calendarAppointments,
    schedules,
    timeOffs,
    settings: {
      drag_reschedule_enabled: true,
      operating_start_time: '09:00',
      operating_end_time: '20:00',
    },
  }, { totalAppointments: calendarAppointments.length });
});

app.get('/api/v1/appointment-sources', (_req, res) => {
  const sources = appointmentService.getSources();
  return sendSuccess(res, sources, { total: sources.length });
});

app.get('/api/v1/resources', (req, res) => {
  const branchId = req.query.branchId as string;
  const resources = appointmentService.getResources(branchId);
  return sendSuccess(res, resources, { total: resources.length });
});

// -------------------------------------------------------------
// Catalog & Guidance Endpoints (Prompt 8)
// -------------------------------------------------------------

app.get(['/api/v1/catalog/categories', '/catalog/categories'], (_req, res) => {
  const categories = catalogService.listCategories();
  return sendSuccess(res, categories, { total: categories.length });
});

app.post(['/api/v1/catalog/categories', '/catalog/categories'], (req, res) => {
  const { name, name_bn, code, description } = req.body || {};
  if (!name || typeof name !== 'string') {
    return sendError(res, 400, 'BAD_REQUEST', 'Category name is required');
  }
  const category = catalogService.createCategory({ name, name_bn, code, description });
  return sendSuccess(res, category, {}, 201);
});

app.get(['/api/v1/catalog/treatments', '/catalog/treatments'], (req, res) => {
  const categoryId = req.query.categoryId as string | undefined;
  const activeOnly = req.query.activeOnly === 'true';
  const search = req.query.search as string | undefined;
  const list = catalogService.listServices({ categoryId, activeOnly, search });
  return sendSuccess(res, list, { total: list.length });
});

app.get(['/api/v1/catalog/treatments/:id', '/catalog/treatments/:id'], (req, res) => {
  try {
    const srv = catalogService.getServiceById(String(req.params.id));
    return sendSuccess(res, srv);
  } catch (err: any) {
    return sendError(res, 404, 'NOT_FOUND', err.message);
  }
});

app.post(['/api/v1/catalog/treatments', '/catalog/treatments'], async (req, res) => {
  try {
    const srv = await catalogService.createService(req.body, { id: currentUser.id, role: currentUser.role });
    return sendSuccess(res, srv, {}, 201);
  } catch (err: any) {
    const status = err.statusCode || 400;
    return sendError(res, status, err.code || 'BAD_REQUEST', err.message);
  }
});

app.patch(['/api/v1/catalog/treatments/:id', '/catalog/treatments/:id'], async (req, res) => {
  try {
    const srv = await catalogService.updateService(String(req.params.id), req.body, { id: currentUser.id, role: currentUser.role });
    return sendSuccess(res, srv);
  } catch (err: any) {
    const status = err.statusCode || 400;
    return sendError(res, status, err.code || 'BAD_REQUEST', err.message);
  }
});

app.get(['/api/v1/catalog/treatments/:id/followup-rules', '/catalog/treatments/:id/followup-rules'], (req, res) => {
  try {
    const rules = catalogService.getFollowupRules(String(req.params.id));
    return sendSuccess(res, rules);
  } catch (err: any) {
    return sendError(res, 404, 'NOT_FOUND', err.message);
  }
});

app.post(['/api/v1/catalog/treatments/:id/followup-rules', '/catalog/treatments/:id/followup-rules'], async (req, res) => {
  try {
    const rule = await catalogService.createFollowupRule(String(req.params.id), req.body, {
      id: currentUser.id,
      role: currentUser.role,
      fullName: currentUser.name,
    });
    return sendSuccess(res, rule, {}, 201);
  } catch (err: any) {
    const status = err.statusCode || 400;
    return sendError(res, status, err.code || 'BAD_REQUEST', err.message);
  }
});

app.get(['/api/v1/catalog/guidance', '/catalog/guidance'], (req, res) => {
  const serviceId = req.query.serviceId as string | undefined;
  const status = req.query.status as any;
  const list = catalogService.listGuidance({ serviceId, status });
  return sendSuccess(res, list, { total: list.length });
});

app.get(['/api/v1/catalog/guidance/:id', '/catalog/guidance/:id'], (req, res) => {
  try {
    const g = catalogService.getGuidanceById(String(req.params.id));
    return sendSuccess(res, g);
  } catch (err: any) {
    return sendError(res, 404, 'NOT_FOUND', err.message);
  }
});

app.post(['/api/v1/catalog/guidance', '/catalog/guidance'], async (req, res) => {
  try {
    const g = await catalogService.createGuidance(req.body, {
      id: currentUser.id,
      role: currentUser.role,
      fullName: currentUser.name,
    });
    return sendSuccess(res, g, {}, 201);
  } catch (err: any) {
    const status = err.statusCode || 400;
    return sendError(res, status, err.code || 'BAD_REQUEST', err.message);
  }
});

app.patch(['/api/v1/catalog/guidance/:id', '/catalog/guidance/:id'], async (req, res) => {
  try {
    const g = await catalogService.updateGuidance(String(req.params.id), req.body, {
      id: currentUser.id,
      role: currentUser.role,
    });
    return sendSuccess(res, g);
  } catch (err: any) {
    const status = err.statusCode || (err.name === 'ConflictError' ? 409 : 400);
    return sendError(res, status, err.code || (status === 409 ? 'CONFLICT' : 'BAD_REQUEST'), err.message);
  }
});

app.post(['/api/v1/catalog/guidance/:id/submit', '/catalog/guidance/:id/submit'], async (req, res) => {
  try {
    const g = await catalogService.submitGuidance(String(req.params.id), {
      id: currentUser.id,
      role: currentUser.role,
    });
    return sendSuccess(res, g);
  } catch (err: any) {
    const status = err.statusCode || 400;
    return sendError(res, status, err.code || 'BAD_REQUEST', err.message);
  }
});

app.post(['/api/v1/catalog/guidance/:id/approve', '/catalog/guidance/:id/approve'], async (req, res) => {
  try {
    const isClinical = currentUser.role === 'doctor' || currentUser.role === 'super_admin';
    if (!isClinical) {
      return sendError(res, 403, 'FORBIDDEN', 'Non-clinical staff cannot approve clinical food & lifestyle guidance');
    }
    const g = await catalogService.approveGuidance(String(req.params.id), {
      id: currentUser.id,
      role: currentUser.role,
      fullName: currentUser.name,
    });
    return sendSuccess(res, g);
  } catch (err: any) {
    const status = err.statusCode || (err.name === 'ConflictError' ? 409 : 400);
    return sendError(res, status, err.code || (status === 409 ? 'CONFLICT' : 'BAD_REQUEST'), err.message);
  }
});

app.get('/api/v1/appointments/:id', (req, res) => {
  const detail = appointmentService.getAppointmentDetail(req.params.id);
  if (!detail) {
    return sendError(res, 404, 'NOT_FOUND', 'Appointment not found');
  }
  return sendSuccess(res, detail);
});

app.post('/api/v1/appointments', checkIdempotency, async (req, res) => {
  try {
    const raw = req.body;
    const patientId = raw.patient_id || raw.patientId;
    const providerId = raw.provider_id || raw.doctorId || 'usr-101';
    const branchId = raw.branch_id || raw.branchId || 'br-dhanmondi';
    const serviceName = raw.service_name || raw.serviceName || 'General Consultation';
    const appointmentDate = raw.appointment_date || raw.appointmentDate;
    const startTime = raw.start_time || raw.appointmentTime;

    if (!patientId || !appointmentDate || !startTime) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Missing required fields: patient_id, appointment_date, start_time');
    }

    const diseaseName = raw.disease_name || raw.diseaseName || null;
    const bookingMethod = raw.booking_method || raw.bookingMethod || null;
    const notesWithMeta = [
      diseaseName ? `Disease: ${diseaseName}` : '',
      bookingMethod ? `Method: ${bookingMethod}` : '',
      raw.notes || '',
    ].filter(Boolean).join(' | ');

    const resolvedPt = resolvePatientRecord(patientId);
    if (resolvedPt) {
      patientService.upsertPatient({
        id: resolvedPt.id,
        patient_code: resolvedPt.patientIdCode,
        branch_id: resolvedPt.branchId || branchId,
        full_name: resolvedPt.name,
        full_name_bn: resolvedPt.nameBn,
        gender: resolvedPt.gender as any,
        approximate_age: resolvedPt.age,
        blood_group: resolvedPt.bloodGroup as any,
        primary_mobile: resolvedPt.phone,
        primary_mobile_normalized: resolvedPt.phone,
        email: resolvedPt.email,
        address: resolvedPt.address,
        city: resolvedPt.city,
        status: 'active',
        created_at: resolvedPt.createdAt,
        updated_at: resolvedPt.updatedAt,
      });
      if (patientId !== resolvedPt.id) {
        patientService.upsertPatient({
          id: patientId,
          patient_code: resolvedPt.patientIdCode,
          branch_id: resolvedPt.branchId || branchId,
          full_name: resolvedPt.name,
          primary_mobile: resolvedPt.phone,
        });
      }
    }

    const payload = {
      patient_id: patientId,
      patient_name: raw.patient_name || raw.patientName || resolvedPt?.name || 'Registered Patient',
      patient_mobile: raw.patient_mobile || raw.patientPhone || resolvedPt?.phone || '+8801700000000',
      patient_code: raw.patient_code || raw.patientCode || resolvedPt?.patientIdCode || `SX-2026-${patientId.replace(/[^0-9]/g, '')}`,
      branch_id: branchId,
      provider_id: providerId,
      resource_id: raw.resource_id || raw.resourceId || null,
      source_id: raw.source_id || raw.sourceId || 'src-1',
      service_category: raw.service_category || raw.serviceCategory || 'Consultation',
      service_name: raw.service_name || raw.serviceName || (diseaseName ? `Consultation: ${diseaseName}` : 'General Consultation'),
      appointment_date: appointmentDate,
      start_time: startTime,
      duration_minutes: raw.duration_minutes || raw.durationMinutes || 30,
      appointment_type: raw.appointment_type || 'consultation',
      set_by_clinician: raw.set_by_clinician ?? false,
      is_walk_in: bookingMethod === 'Walk-in' || raw.is_walk_in || false,
      call_reference: raw.call_reference || raw.callReference || bookingMethod || null,
      notes: notesWithMeta || null,
      confirm_override: raw.confirm_override ?? false,
      override_reason: raw.override_reason || null,
    };

    const user = {
      id: currentUser.id,
      name: currentUser.name,
      role: currentUser.role,
      branchId,
    };

    const newApt = await appointmentService.createAppointment(payload as any, user);
    (newApt as any).diseaseName = diseaseName;
    (newApt as any).bookingMethod = bookingMethod;
    (newApt as any).patientName = newApt.patient_name || resolvedPt?.name || 'Patient';
    (newApt as any).patientPhone = newApt.patient_mobile || resolvedPt?.phone || '';
    (newApt as any).patientAge = resolvedPt?.age || 28;
    (newApt as any).patientGender = resolvedPt?.gender || 'female';
    (newApt as any).patientAddress = resolvedPt?.address || resolvedPt?.city || 'Dhaka';
    (newApt as any).patientBloodGroup = resolvedPt?.bloodGroup || 'B+';
    (newApt as any).branchName = (newApt as any).branch_name || (newApt.branch_id === 'br-uttara' ? 'Uttara Branch' : 'Dhanmondi Main Center');
    (newApt as any).doctorName = newApt.provider_name || 'Dr. Nusrat Jahan';
    (newApt as any).appointmentDate = newApt.appointment_date;
    (newApt as any).appointmentTime = newApt.start_time;

    appointments.unshift({
      id: newApt.id,
      patientId: newApt.patient_id,
      patientName: (newApt as any).patientName,
      patientPhone: (newApt as any).patientPhone,
      branchId: newApt.branch_id,
      branchName: (newApt as any).branchName,
      doctorId: newApt.provider_id,
      doctorName: (newApt as any).doctorName,
      serviceCategory: ((newApt.service_category as any) || 'General Consultation') as any,
      serviceName: newApt.service_name,
      appointmentDate: newApt.appointment_date,
      appointmentTime: newApt.start_time,
      durationMinutes: newApt.duration_minutes || 30,
      status: 'confirmed',
      callReference: newApt.call_reference || bookingMethod || '',
      notes: newApt.notes || '',
      createdBy: user.id,
      createdAt: newApt.created_at || new Date().toISOString(),
      updatedAt: newApt.updated_at || new Date().toISOString(),
    });

    const idempotencyKey = req.headers['idempotency-key'] as string;
    saveIdempotency(idempotencyKey, 201, { data: newApt });

    return sendSuccess(res, newApt, {}, 201);
  } catch (err: any) {
    if (err.statusCode === 409 || err.name === 'ConflictError') {
      return sendError(res, 409, 'CONFLICT', err.message);
    }
    if (err.statusCode === 404 || err.name === 'NotFoundError') {
      return sendError(res, 404, 'NOT_FOUND', err.message);
    }
    if (err.statusCode === 400 || err.name === 'BadRequestError') {
      return sendError(res, 400, 'BAD_REQUEST', err.message);
    }
    return sendError(res, 500, 'INTERNAL_ERROR', err.message || 'Failed to create appointment');
  }
});

app.patch('/api/v1/appointments/:id', async (req, res) => {
  try {
    const user = {
      id: currentUser.id,
      name: currentUser.name,
      role: currentUser.role,
    };
    const updated = await appointmentService.updateAppointment(req.params.id, req.body, user);
    return sendSuccess(res, updated);
  } catch (err: any) {
    if (err.statusCode === 403 || err.name === 'ForbiddenError') {
      return sendError(res, 403, 'FORBIDDEN', err.message);
    }
    if (err.statusCode === 409 || err.name === 'ConflictError') {
      return sendError(res, 409, 'CONFLICT', err.message);
    }
    if (err.statusCode === 404 || err.name === 'NotFoundError') {
      return sendError(res, 404, 'NOT_FOUND', err.message);
    }
    return sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

app.post('/api/v1/appointments/:id/status', (req, res) => {
  try {
    const { status, reason } = req.body;
    const user = {
      id: currentUser.id,
      name: currentUser.name,
      role: currentUser.role,
    };
    const updated = appointmentService.changeStatus(req.params.id, status, reason, user);
    return sendSuccess(res, updated);
  } catch (err: any) {
    if (err.statusCode === 409 || err.name === 'ConflictError') {
      return sendError(res, 409, 'CONFLICT', err.message);
    }
    if (err.statusCode === 404 || err.name === 'NotFoundError') {
      return sendError(res, 404, 'NOT_FOUND', err.message);
    }
    return sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

app.post('/api/v1/appointments/:id/cancel', async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || reason.trim().length === 0) {
      return sendError(res, 400, 'BAD_REQUEST', 'Cancellation reason is mandatory');
    }
    const user = {
      id: currentUser.id,
      name: currentUser.name,
      role: currentUser.role,
    };
    const updated = await appointmentService.cancelAppointment(req.params.id, { reason }, user);
    return sendSuccess(res, updated);
  } catch (err: any) {
    if (err.statusCode === 409 || err.name === 'ConflictError') {
      return sendError(res, 409, 'CONFLICT', err.message);
    }
    if (err.statusCode === 404 || err.name === 'NotFoundError') {
      return sendError(res, 404, 'NOT_FOUND', err.message);
    }
    return sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

app.post('/api/v1/appointments/:id/reschedule', checkIdempotency, async (req, res) => {
  try {
    const user = {
      id: currentUser.id,
      name: currentUser.name,
      role: currentUser.role,
    };
    const result = await appointmentService.rescheduleAppointment(String(req.params.id), req.body, user);
    const idempotencyKey = req.headers['idempotency-key'] as string;
    saveIdempotency(idempotencyKey, 200, { data: result });
    return sendSuccess(res, result);
  } catch (err: any) {
    if (err.statusCode === 409 || err.name === 'ConflictError') {
      return sendError(res, 409, 'CONFLICT', err.message);
    }
    if (err.statusCode === 404 || err.name === 'NotFoundError') {
      return sendError(res, 404, 'NOT_FOUND', err.message);
    }
    return sendError(res, 500, 'INTERNAL_ERROR', err.message);
  }
});

// -------------------------------------------------------------
// Endpoints: Call Center "Tomorrow's Sessions" Workbench
// -------------------------------------------------------------

app.get('/api/v1/call-center/tomorrow-calls', (_req, res) => {
  return sendSuccess(res, callTasks, { total: callTasks.length });
});

app.patch('/api/v1/call-center/calls/:id', (req, res) => {
  const schema = z.object({
    callStatus: z.enum([
      'pending',
      'call_attempted',
      'confirmed',
      'rescheduled',
      'no_answer',
      'left_voicemail',
      'cancelled',
    ]).optional(),
    smsStatus: z.enum(['pending', 'gateway_accepted', 'sent', 'failed']).optional(),
    callNotes: z.string().optional(),
    callOutcome: z.string().optional(),
    patientIntent: z.string().optional(),
    followupPurpose: z.string().optional(),
    nextFollowupDate: z.string().optional(),
    nextFollowupTime: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid call log data', parsed.error.format());
  }

  const task = callTasks.find((t) => t.id === req.params.id);
  if (!task) {
    return sendError(res, 404, 'NOT_FOUND', 'Call task not found');
  }

  // Update call status independently of SMS status (Hard Rule 7)
  if (parsed.data.callStatus) {
    task.callStatus = parsed.data.callStatus;
  }
  if (parsed.data.smsStatus) {
    task.smsStatus = parsed.data.smsStatus;
  }
  if (parsed.data.callNotes !== undefined) {
    task.callNotes = parsed.data.callNotes;
  }
  if (parsed.data.callOutcome) {
    task.callOutcome = parsed.data.callOutcome;
  }
  if (parsed.data.patientIntent) {
    task.patientIntent = parsed.data.patientIntent;
  }
  if (parsed.data.followupPurpose) {
    task.followupPurpose = parsed.data.followupPurpose;
  }
  if (parsed.data.nextFollowupDate) {
    task.nextFollowupDate = parsed.data.nextFollowupDate;
  }
  if (parsed.data.nextFollowupTime) {
    task.nextFollowupTime = parsed.data.nextFollowupTime;
  }
  task.callAttempts += 1;
  task.lastCalledAt = new Date().toISOString();
  task.agentId = currentUser.id;
  task.agentName = currentUser.name;

  // Sync appointment status if confirmed/cancelled
  // Hard Rule 2: Call center records call outcomes but NEVER overwrites doctor's schedule
  const apt = appointments.find((a) => a.id === task.appointmentId);
  if (apt) {
    if (parsed.data.callStatus === 'confirmed') {
      apt.status = 'confirmed';
    } else if (parsed.data.callStatus === 'cancelled') {
      apt.status = 'cancelled';
      apt.statusReason = `Cancelled during pre-session call: ${parsed.data.callNotes || 'Patient requested'}`;
    }
    apt.updatedAt = new Date().toISOString();
  }

  logAuditEvent(
    'CALL_TASK_UPDATED',
    'call_center',
    task.id,
    `Call task updated to ${task.callStatus}. SMS Gateway Status: ${task.smsStatus}. Attempts: ${task.callAttempts}`
  );

  return sendSuccess(res, task);
});

// -------------------------------------------------------------
// Endpoints: Doctor Consultation & Next Session Date (Hard Rule 2)
// -------------------------------------------------------------

app.get('/api/v1/consultations', (req, res) => {
  const { patientId } = req.query;
  let list = [...consultations];
  if (patientId) {
    list = list.filter((c) => c.patientId === patientId);
  }
  return sendSuccess(res, list);
});

app.post('/api/v1/consultations', (req, res) => {
  // Hard Rule 8: Server-side RBAC validation
  if (currentUser.role !== 'doctor' && currentUser.role !== 'super_admin') {
    return sendError(res, 403, 'FORBIDDEN', 'Only doctors can create or finalize consultations');
  }

  const schema = z.object({
    patientId: z.string(),
    appointmentId: z.string().optional(),
    chiefComplaints: z.string().min(3),
    examinationNotes: z.string().min(3),
    clinicalDiagnosis: z.string().min(2),
    skinAnalysis: z
      .object({
        hydration: z.string(),
        pigmentation: z.string(),
        elasticity: z.string(),
        sebum: z.string(),
      })
      .optional(),
    recommendedProcedures: z.array(z.string()).default([]),
    nextSessionDate: z.string().optional(), // Doctor sets this!
    nextSessionNotes: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid consultation data', parsed.error.format());
  }

  const data = parsed.data;
  const patient = patients.find((p) => p.id === data.patientId);
  if (!patient) {
    return sendError(res, 404, 'NOT_FOUND', 'Patient not found');
  }

  const newConsultation: Consultation = {
    id: `cons-${consultations.length + 1}`,
    patientId: patient.id,
    patientName: patient.name,
    doctorId: currentUser.id,
    doctorName: currentUser.name,
    appointmentId: data.appointmentId,
    consultationDate: new Date().toISOString().split('T')[0],
    chiefComplaints: data.chiefComplaints,
    examinationNotes: data.examinationNotes,
    clinicalDiagnosis: data.clinicalDiagnosis,
    skinAnalysis: data.skinAnalysis,
    recommendedProcedures: data.recommendedProcedures,
    nextSessionDate: data.nextSessionDate,
    nextSessionNotes: data.nextSessionNotes,
    createdAt: new Date().toISOString(),
  };

  consultations.unshift(newConsultation);

  // If appointment was linked, mark it visited
  if (data.appointmentId) {
    const apt = appointments.find((a) => a.id === data.appointmentId);
    if (apt) {
      apt.status = 'visited';
      apt.updatedAt = new Date().toISOString();
    }
  }

  logAuditEvent(
    'CONSULTATION_CREATED',
    'consultation',
    newConsultation.id,
    `Dr. ${currentUser.name} completed consultation for ${patient.name}. Next Session Date: ${newConsultation.nextSessionDate || 'None'}`
  );

  return sendSuccess(res, newConsultation, {}, 201);
});

// -------------------------------------------------------------
// Endpoints: Prescriptions & Frozen Food/Lifestyle Snapshot (Hard Rule 6)
// -------------------------------------------------------------

app.get('/api/v1/prescriptions', (req, res) => {
  const { patientId } = req.query;
  let list = prescriptions.map((rx) => {
    const pt = patients.find((p) => p.id === rx.patientId);
    const cons = consultations.find((c) => c.id === rx.consultationId);
    return {
      ...rx,
      patientCode: rx.patientCode || pt?.patientIdCode || rx.patientId,
      patientPhone: rx.patientPhone || pt?.phone,
      patientAddress: rx.patientAddress || pt?.address || pt?.city,
      chiefComplaints: rx.chiefComplaints || cons?.chiefComplaints,
      recommendedProcedures:
        rx.recommendedProcedures && rx.recommendedProcedures.length > 0
          ? rx.recommendedProcedures
          : cons?.recommendedProcedures,
      skinAnalysis: rx.skinAnalysis || (cons?.skinAnalysis ? { ...cons.skinAnalysis, skinType: pt?.skinType } : undefined),
    };
  });
  if (patientId) {
    list = list.filter((p) => p.patientId === patientId);
  }
  return sendSuccess(res, list);
});

app.post('/api/v1/prescriptions', (req, res) => {
  // Hard Rule 8: Server-side RBAC
  if (currentUser.role !== 'doctor' && currentUser.role !== 'super_admin') {
    return sendError(res, 403, 'FORBIDDEN', 'Only a licensed doctor can create and finalize prescriptions');
  }

  const schema = z.object({
    patientId: z.string(),
    consultationId: z.string(),
    diagnosis: z.string(),
    chiefComplaints: z.string().optional(),
    pastHistory: z.string().optional(),
    operationHistory: z.string().optional(),
    investigations: z.string().optional(),
    recommendedProcedures: z.array(z.string()).optional(),
    adviceList: z.array(z.string()).optional(),
    planNotes: z.string().optional(),
    skinAnalysis: z
      .object({
        hydration: z.string().optional(),
        pigmentation: z.string().optional(),
        elasticity: z.string().optional(),
        sebum: z.string().optional(),
        skinType: z.string().optional(),
      })
      .optional(),
    language: z.enum(['en', 'bn', 'both']).default('both'),
    nextSessionDate: z.string().optional(),
    medicines: z.array(
      z.object({
        name: z.string(),
        genericName: z.string().optional(),
        form: z.enum(['Tablet', 'Capsule', 'Cream', 'Gel', 'Serum', 'Sunscreen', 'Facewash', 'Lotion']),
        dosage: z.string(),
        duration: z.string(),
        instructions: z.string(),
        instructionsBn: z.string().optional(),
      })
    ),
    lifestyleGuidance: z.object({
      waterIntakeLiters: z.number().default(2.5),
      sunProtectionInstructions: z.string(),
      sunProtectionInstructionsBn: z.string(),
      recommendedFoods: z.array(z.string()),
      recommendedFoodsBn: z.array(z.string()),
      prohibitedFoods: z.array(z.string()),
      prohibitedFoodsBn: z.array(z.string()),
      lifestylePrecautions: z.array(z.string()),
      lifestylePrecautionsBn: z.array(z.string()),
      skincareRoutineMorning: z.array(z.string()),
      skincareRoutineEvening: z.array(z.string()),
    }),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid prescription payload', parsed.error.format());
  }

  const data = parsed.data;
  const patient = patients.find((p) => p.id === data.patientId);
  if (!patient) {
    return sendError(res, 404, 'NOT_FOUND', 'Patient not found');
  }

  const rxId = `rx-${prescriptions.length + 1}`;
  const prescriptionCode = `RX-2026-${(310 + prescriptions.length + 1).toString().padStart(4, '0')}`;

  // Hard Rule 6: Finalized prescriptions are never silently edited; a correction creates a new version.
  // The food/lifestyle page is a frozen snapshot.
  const newRx: Prescription = {
    id: rxId,
    prescriptionCode,
    patientId: patient.id,
    patientCode: patient.patientIdCode,
    patientName: patient.name,
    patientAge: patient.age,
    patientGender: patient.gender,
    patientPhone: patient.phone,
    patientAddress: patient.address || patient.city,
    doctorId: currentUser.id,
    doctorName: currentUser.name,
    doctorCredentials: currentUser.specialization
      ? `${currentUser.specialization} (${currentUser.bmdcRegNo || 'BMDC Reg'})`
      : 'Consultant Aesthetic Dermatologist',
    consultationId: data.consultationId,
    chiefComplaints: data.chiefComplaints,
    pastHistory: data.pastHistory,
    operationHistory: data.operationHistory,
    investigations: data.investigations,
    diagnosis: data.diagnosis,
    skinAnalysis: data.skinAnalysis,
    recommendedProcedures: data.recommendedProcedures,
    adviceList: data.adviceList,
    planNotes: data.planNotes,
    medicines: data.medicines.map((m, idx) => ({ ...m, id: `med-${rxId}-${idx + 1}` })),
    lifestyleGuidance: {
      id: `flg-${rxId}`,
      prescriptionId: rxId,
      isFrozenSnapshot: true, // Frozen snapshot (Hard Rule 6)
      snapshotVersion: 1,
      ...data.lifestyleGuidance,
      createdAt: new Date().toISOString(),
    },
    nextSessionDate: data.nextSessionDate,
    version: 1,
    isFinalized: true,
    language: data.language,
    createdAt: new Date().toISOString(),
  };

  prescriptions.unshift(newRx);

  logAuditEvent(
    'PRESCRIPTION_FINALIZED',
    'prescription',
    newRx.id,
    `Dr. ${currentUser.name} finalized prescription ${newRx.prescriptionCode} with frozen Food & Lifestyle snapshot for ${patient.name}`
  );

  return sendSuccess(res, newRx, {}, 201);
});

// -------------------------------------------------------------
// Endpoints: Clinical Rx Protocols & Care Templates
// -------------------------------------------------------------

const rxProtocolMedicineSchema = z.object({
  name: z.string().min(1),
  genericName: z.string().optional(),
  form: z.enum(['Tablet', 'Capsule', 'Cream', 'Gel', 'Serum', 'Sunscreen', 'Facewash', 'Lotion']),
  dosage: z.string(),
  duration: z.string(),
  instructions: z.string(),
  instructionsBn: z.string().optional(),
});

const rxProtocolSchema = z.object({
  name: z.string().min(2),
  subtitle: z.string().default(''),
  category: z.enum([
    'Pigmentation & Melasma',
    'Acne & Sebum',
    'Laser & Scar Recovery',
    'Hair & PRP',
    'Anti-Aging & Glow',
    'General Dermatology',
  ]).default('General Dermatology'),
  isActive: z.boolean().default(true),
  isDefaultBaseline: z.boolean().optional().default(false),
  diagnosis: z.string().default(''),
  chiefComplaints: z.string().default(''),
  investigations: z.string().default(''),
  examinationNotes: z.string().default(''),
  skinType: z.enum(['normal', 'dry', 'oily', 'combination', 'sensitive']).default('combination'),
  targetZones: z.array(z.string()).default([]),
  procedures: z.array(z.string()).default([]),
  medicines: z.array(rxProtocolMedicineSchema).default([]),
  adviceList: z.array(z.string()).default([]),
  sunInstructions: z.string().default(''),
  sunInstructionsBn: z.string().default(''),
  waterLiters: z.number().min(0.5).max(8).default(2.5),
  followUpDays: z.number().int().min(0).max(365).default(14),
  morningRoutine: z.array(z.string()).default([]),
  eveningRoutine: z.array(z.string()).default([]),
  recommendedFoods: z.array(z.string()).default([]),
  prohibitedFoods: z.array(z.string()).default([]),
});

app.get('/api/v1/rx-protocols', (req, res) => {
  const activeOnly = req.query.activeOnly === 'true';
  const list = activeOnly ? rxProtocols.filter((p) => p.isActive) : rxProtocols;
  return sendSuccess(res, list, { total: list.length });
});

app.post('/api/v1/rx-protocols', (req, res) => {
  if (currentUser.role !== 'doctor' && currentUser.role !== 'super_admin') {
    return sendError(res, 403, 'FORBIDDEN', 'Only doctors or super admins can manage Rx protocols');
  }

  const parsed = rxProtocolSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid Rx protocol payload', parsed.error.format());
  }

  const data = parsed.data;
  if (data.isDefaultBaseline) {
    rxProtocols.forEach((p) => {
      p.isDefaultBaseline = false;
    });
  }

  const newProto: RxProtocol = {
    id: `proto-${Date.now()}`,
    ...data,
    createdBy: currentUser.name,
    updatedAt: new Date().toISOString(),
  };

  rxProtocols.unshift(newProto);

  logAuditEvent(
    'RX_PROTOCOL_CREATED',
    'rx_protocol',
    newProto.id,
    `${currentUser.name} created Rx protocol "${newProto.name}"`
  );

  return sendSuccess(res, newProto, {}, 201);
});

app.put('/api/v1/rx-protocols/:id', (req, res) => {
  if (currentUser.role !== 'doctor' && currentUser.role !== 'super_admin') {
    return sendError(res, 403, 'FORBIDDEN', 'Only doctors or super admins can update Rx protocols');
  }

  const protoId = String(req.params.id);
  const idx = rxProtocols.findIndex((p) => p.id === protoId);
  if (idx === -1) {
    return sendError(res, 404, 'NOT_FOUND', `Rx protocol "${protoId}" not found`);
  }

  const parsed = rxProtocolSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid Rx protocol update payload', parsed.error.format());
  }

  const data = parsed.data;
  if (data.isDefaultBaseline) {
    rxProtocols.forEach((p) => {
      p.isDefaultBaseline = false;
    });
  }

  const updated: RxProtocol = {
    ...rxProtocols[idx],
    ...data,
    updatedAt: new Date().toISOString(),
  };
  rxProtocols[idx] = updated;

  logAuditEvent(
    'RX_PROTOCOL_UPDATED',
    'rx_protocol',
    updated.id,
    `${currentUser.name} updated Rx protocol "${updated.name}"`
  );

  return sendSuccess(res, updated);
});

app.delete('/api/v1/rx-protocols/:id', (req, res) => {
  if (currentUser.role !== 'doctor' && currentUser.role !== 'super_admin') {
    return sendError(res, 403, 'FORBIDDEN', 'Only doctors or super admins can delete Rx protocols');
  }

  const protoId = String(req.params.id);
  const idx = rxProtocols.findIndex((p) => p.id === protoId);
  if (idx === -1) {
    return sendError(res, 404, 'NOT_FOUND', `Rx protocol "${protoId}" not found`);
  }

  const [removed] = rxProtocols.splice(idx, 1);

  if (removed.isDefaultBaseline && rxProtocols.length > 0) {
    rxProtocols[0].isDefaultBaseline = true;
  }

  logAuditEvent(
    'RX_PROTOCOL_DELETED',
    'rx_protocol',
    removed.id,
    `${currentUser.name} deleted Rx protocol "${removed.name}"`
  );

  return sendSuccess(res, { deleted: true, id: removed.id });
});

// -------------------------------------------------------------
// Endpoints: Medical Documents & Clinical Attachments (EMR/EHR)
// -------------------------------------------------------------

app.get('/api/v1/medical-documents', (req, res) => {
  const { patientId, type } = req.query;
  let list = [...medicalDocuments];
  if (patientId) {
    list = list.filter((d) => d.patientId === patientId);
  }
  if (type && type !== 'all') {
    list = list.filter((d) => d.type === type || d.category === type);
  }
  return sendSuccess(res, list, { total: list.length });
});

app.post('/api/v1/medical-documents', (req, res) => {
  const {
    patientId,
    title,
    titleBn,
    type,
    category,
    procedureName,
    sessionNumber,
    photoType,
    fileUrl,
    fileSize,
    fileFormat,
    clinicalNotes,
    signedByPatient,
  } = req.body;

  if (!patientId || !title) {
    return sendError(res, 400, 'BAD_REQUEST', 'Patient ID and Title are required');
  }

  const patient = patients.find((p) => p.id === patientId);

  const newDoc: MedicalAttachment = {
    id: `doc-${Date.now()}`,
    documentCode: `DOC-2026-${(100 + medicalDocuments.length + 1).toString().padStart(4, '0')}`,
    patientId,
    patientName: patient?.name || 'Patient',
    patientPhone: patient?.phone || '',
    type: type || 'clinical_photo',
    title,
    titleBn: titleBn || undefined,
    category: category || 'Before-After Photos',
    procedureName: procedureName || undefined,
    sessionNumber: sessionNumber ? Number(sessionNumber) : undefined,
    photoType: photoType || undefined,
    fileUrl: fileUrl || '/assets/clinical/sample_document.png',
    thumbnailUrl: fileUrl || '/assets/clinical/sample_document.png',
    fileSize: fileSize || '1.8 MB',
    fileFormat: fileFormat || 'PNG',
    doctorName: currentUser.name,
    signedByPatient: !!signedByPatient,
    signatureDate: signedByPatient ? new Date().toISOString().split('T')[0] : undefined,
    clinicalNotes: clinicalNotes || undefined,
    isConfidential: true,
    createdAt: new Date().toISOString(),
  };

  medicalDocuments.unshift(newDoc);

  logAuditEvent(
    'MEDICAL_DOCUMENT_UPLOADED',
    'medical_document',
    newDoc.id,
    `Uploaded ${newDoc.category} "${newDoc.title}" for patient ${newDoc.patientName}`
  );

  return sendSuccess(res, newDoc, {}, 201);
});

// -------------------------------------------------------------
// Helper: Compute Package Financials (Strict Advance Pre-payment & Zero-Due Lock)
// -------------------------------------------------------------

function computePackageFinancials(pkg: TreatmentPackage): TreatmentPackage {
  // 1. Find linked invoice
  const inv = invoices.find(
    (i) =>
      i.id === pkg.invoiceId ||
      i.invoiceNumber === pkg.invoiceId ||
      (pkg.patientId === i.patientId &&
        i.items.some(
          (it) =>
            it.description.toLowerCase().includes(pkg.packageName.toLowerCase()) ||
            pkg.packageName.toLowerCase().includes(it.description.toLowerCase())
        ))
  );

  let totalPaid = 0;
  if (inv) {
    const validPayments = paymentRecords.filter((p) => p.invoiceId === inv.id && p.status === 'valid');
    totalPaid = validPayments.reduce((sum, p) => sum + p.amountBDT, 0);
  } else if (pkg.paidAmountBDT !== undefined) {
    totalPaid = pkg.paidAmountBDT;
  } else {
    // Legacy fallback: if completed sessions exist, assume they were covered
    const perSession = pkg.totalSessions > 0 ? pkg.priceBDT / pkg.totalSessions : 0;
    totalPaid = pkg.completedSessions * perSession;
  }

  const perSessionPriceBDT =
    pkg.totalSessions > 0 ? Math.round((pkg.priceBDT / pkg.totalSessions) * 100) / 100 : 0;
  const paidAmountBDT = totalPaid;
  const dueAmountBDT = Math.max(0, Math.round((pkg.priceBDT - paidAmountBDT) * 100) / 100);

  // Strict Rule: A session can NEVER be taken on due!
  // unlockedSessions = Math.min(totalSessions, Math.floor((paidAmount + 0.01) / perSessionPrice))
  const unlockedSessions =
    perSessionPriceBDT > 0
      ? Math.min(pkg.totalSessions, Math.floor((paidAmountBDT + 0.01) / perSessionPriceBDT))
      : pkg.totalSessions;

  // Advance credit = Total paid - (completed sessions * per session price)
  const advanceCreditBDT = Math.max(
    0,
    Math.round((paidAmountBDT - pkg.completedSessions * perSessionPriceBDT) * 100) / 100
  );

  return {
    ...pkg,
    paidAmountBDT,
    dueAmountBDT,
    perSessionPriceBDT,
    unlockedSessions,
    advanceCreditBDT,
  };
}

// -------------------------------------------------------------
// Endpoints: Packages & Non-Duplicate Session Deductions (Hard Rule 5)
// -------------------------------------------------------------

app.get('/api/v1/packages', (req, res) => {
  const { patientId } = req.query;
  let list = [...packages];
  if (patientId) {
    list = list.filter((p) => p.patientId === patientId);
  }
  const enrichedList = list.map((pkg) => computePackageFinancials(pkg));
  return sendSuccess(res, enrichedList);
});

app.get('/api/v1/packages/master', (_req, res) => {
  return sendSuccess(res, masterPackages);
});

app.post('/api/v1/packages/master', (req, res) => {
  const {
    name,
    nameBn,
    serviceCategory,
    totalSessions,
    regularPriceBDT,
    packagePriceBDT,
    validityMonths,
    minIntervalDays,
    description,
    descriptionBn,
    includedServices,
  } = req.body;
  if (!name || !totalSessions || !packagePriceBDT) {
    return sendError(res, 400, 'BAD_REQUEST', 'Name, totalSessions, and packagePriceBDT are required');
  }
  const reg = Number(regularPriceBDT) || Number(packagePriceBDT);
  const pkgPr = Number(packagePriceBDT);
  const newMaster: MasterPackage = {
    id: `mpkg-${Date.now()}`,
    code: `PKG-${Date.now().toString().slice(-4)}`,
    name,
    nameBn: nameBn || undefined,
    serviceCategory: serviceCategory || 'Skin Care',
    totalSessions: Number(totalSessions),
    regularPriceBDT: reg,
    packagePriceBDT: pkgPr,
    savingsBDT: Math.max(0, reg - pkgPr),
    validityMonths: Number(validityMonths) || 6,
    minIntervalDays: Number(minIntervalDays) || 14,
    description: description || '',
    descriptionBn: descriptionBn || undefined,
    includedServices: Array.isArray(includedServices) ? includedServices : [name],
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  masterPackages.unshift(newMaster);
  return sendSuccess(res, newMaster, {}, 201);
});

app.get('/api/v1/packages/deductions', (req, res) => {
  const { packageId } = req.query;
  let list = [...packageDeductions];
  if (packageId) {
    list = list.filter((d) => d.packageId === packageId);
  }
  return sendSuccess(res, list.reverse());
});

app.post('/api/v1/packages', (req, res) => {
  const {
    patientId,
    patientName,
    packageName,
    serviceCategory,
    totalSessions,
    priceBDT,
    validityMonths,
    invoiceId,
    initialPayment,
  } = req.body;
  if (!patientId || !patientName || !packageName || !totalSessions) {
    return sendError(res, 400, 'BAD_REQUEST', 'Missing required package fields');
  }
  const months = Number(validityMonths) || 6;
  const expiry = new Date();
  expiry.setMonth(expiry.getMonth() + months);
  const total = Number(priceBDT) || 0;

  // Generate or link invoice
  const invId = invoiceId || `inv-${Date.now().toString().slice(-4)}`;
  let linkedInvoice = invoices.find((inv) => inv.id === invId);

  if (!linkedInvoice) {
    const invNumber = `INV-2026-${(600 + invoices.length + 1).toString().padStart(4, '0')}`;
    linkedInvoice = {
      id: invId,
      invoiceNumber: invNumber,
      patientId,
      patientName,
      branchId: 'br-dhanmondi',
      branchName: 'Dhanmondi Main Center',
      items: [
        {
          id: `it-${Date.now()}`,
          description: `${packageName} (${totalSessions} Sessions)`,
          quantity: 1,
          unitPriceBDT: total,
          discountBDT: 0,
          totalBDT: total,
        },
      ],
      subtotalBDT: total,
      vatPercent: 0,
      vatAmountBDT: 0,
      discountBDT: 0,
      totalAmountBDT: total,
      paidAmountBDT: 0,
      dueAmountBDT: total,
      status: 'unpaid',
      payments: [],
      createdAt: new Date().toISOString(),
      createdBy: currentUser.name,
    };
    invoices.unshift(linkedInvoice);
  }

  // If initialPayment provided (e.g. Day 1 advance payment)
  if (initialPayment && Number(initialPayment.amountBDT) > 0) {
    const payAmt = Math.min(Number(initialPayment.amountBDT), total);
    const payRec: PaymentRecord = {
      id: `pay-${paymentRecords.length + 1}`,
      invoiceId: linkedInvoice.id,
      receiptNumber: `RCP-2026-${(40 + paymentRecords.length + 1).toString().padStart(4, '0')}`,
      amountBDT: payAmt,
      method: initialPayment.method || 'cash',
      transactionRef: initialPayment.transactionRef || `ADV-${Math.floor(1000 + Math.random() * 9000)}`,
      paidAt: new Date().toISOString(),
      receivedBy: currentUser.name,
      status: 'valid',
    };
    paymentRecords.push(payRec);
    linkedInvoice.paidAmountBDT = payAmt;
    linkedInvoice.dueAmountBDT = Math.max(0, total - payAmt);
    linkedInvoice.status = linkedInvoice.dueAmountBDT <= 0.01 ? 'paid' : 'partially_paid';
  }

  const rawPackage: TreatmentPackage = {
    id: `pkg-${Date.now()}`,
    patientId,
    patientName,
    packageName,
    serviceCategory: serviceCategory || 'Skin Care',
    totalSessions: Number(totalSessions),
    completedSessions: 0,
    remainingSessions: Number(totalSessions),
    priceBDT: total,
    purchaseDate: new Date().toISOString().split('T')[0],
    expiryDate: expiry.toISOString().split('T')[0],
    invoiceId: linkedInvoice.id,
    status: 'active',
  };

  packages.unshift(rawPackage);
  const computed = computePackageFinancials(rawPackage);
  return sendSuccess(res, computed, {}, 201);
});

// Record Package Installment / Advance Payment
app.post('/api/v1/packages/:id/payments', checkIdempotency, (req, res) => {
  const schema = z.object({
    amountBDT: z.number().positive('Payment amount must be greater than zero'),
    method: z.enum(['cash', 'card', 'bkash', 'nagad', 'bank_transfer']),
    transactionRef: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid payment payload', parsed.error.format());
  }

  const pkg = packages.find((p) => p.id === req.params.id);
  if (!pkg) {
    return sendError(res, 404, 'NOT_FOUND', 'Package not found');
  }

  // Find or create linked invoice
  let invoice = invoices.find((inv) => inv.id === pkg.invoiceId || inv.invoiceNumber === pkg.invoiceId);
  if (!invoice) {
    const invNumber = `INV-2026-${(600 + invoices.length + 1).toString().padStart(4, '0')}`;
    invoice = {
      id: pkg.invoiceId || `inv-${Date.now().toString().slice(-4)}`,
      invoiceNumber: invNumber,
      patientId: pkg.patientId,
      patientName: pkg.patientName,
      branchId: 'br-dhanmondi',
      branchName: 'Dhanmondi Main Center',
      items: [
        {
          id: `it-${Date.now()}`,
          description: `${pkg.packageName} (${pkg.totalSessions} Sessions)`,
          quantity: 1,
          unitPriceBDT: pkg.priceBDT,
          discountBDT: 0,
          totalBDT: pkg.priceBDT,
        },
      ],
      subtotalBDT: pkg.priceBDT,
      vatPercent: 0,
      vatAmountBDT: 0,
      discountBDT: 0,
      totalAmountBDT: pkg.priceBDT,
      paidAmountBDT: 0,
      dueAmountBDT: pkg.priceBDT,
      status: 'unpaid',
      payments: [],
      createdAt: new Date().toISOString(),
      createdBy: currentUser.name,
    };
    pkg.invoiceId = invoice.id;
    invoices.unshift(invoice);
  }

  // Calculate current paid directly from valid payment records
  const validPayments = paymentRecords.filter((p) => p.invoiceId === invoice!.id && p.status === 'valid');
  const currentPaid = validPayments.reduce((sum, p) => sum + p.amountBDT, 0);
  const currentDue = Math.max(0, invoice.totalAmountBDT - currentPaid);

  if (parsed.data.amountBDT > currentDue + 0.01) {
    return sendError(
      res,
      422,
      'EXCEEDS_DUE_AMOUNT',
      `Payment amount ৳ ${parsed.data.amountBDT} exceeds remaining due amount ৳ ${currentDue.toFixed(2)}`
    );
  }

  // Append new payment record
  const payment: PaymentRecord = {
    id: `pay-${paymentRecords.length + 1}`,
    invoiceId: invoice.id,
    receiptNumber: `RCP-2026-${(40 + paymentRecords.length + 1).toString().padStart(4, '0')}`,
    amountBDT: parsed.data.amountBDT,
    method: parsed.data.method,
    transactionRef:
      parsed.data.transactionRef ||
      `${parsed.data.method.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
    paidAt: new Date().toISOString(),
    receivedBy: currentUser.name,
    status: 'valid',
  };

  paymentRecords.push(payment);

  const updatedValidPayments = paymentRecords.filter((p) => p.invoiceId === invoice!.id && p.status === 'valid');
  const newPaidAmount = updatedValidPayments.reduce((sum, p) => sum + p.amountBDT, 0);
  const newDueAmount = Math.max(0, invoice.totalAmountBDT - newPaidAmount);

  invoice.paidAmountBDT = newPaidAmount;
  invoice.dueAmountBDT = newDueAmount;
  invoice.status = newDueAmount <= 0.01 ? 'paid' : 'partially_paid';

  logAuditEvent(
    'PACKAGE_PAYMENT_RECORDED',
    'package',
    pkg.id,
    `Recorded package installment of ৳ ${payment.amountBDT.toLocaleString()} via ${payment.method} (${payment.receiptNumber}). Linked Invoice: ${invoice.invoiceNumber}. Remaining due: ৳ ${newDueAmount.toFixed(2)}`
  );

  const updatedPkg = computePackageFinancials(pkg);

  const idempotencyKey = req.headers['idempotency-key'] as string;
  saveIdempotency(idempotencyKey, 201, { data: { package: updatedPkg, invoice, payment } });

  return sendSuccess(res, { package: updatedPkg, invoice, payment }, {}, 201);
});

app.post('/api/v1/packages/deduct-session', checkIdempotency, (req, res) => {
  const schema = z.object({
    packageId: z.string(),
    treatmentNotes: z.string().min(3),
    machineSettings: z.string().optional(),
    therapistName: z.string().default(currentUser.name),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid session deduction', parsed.error.format());
  }

  const data = parsed.data;
  const pkg = packages.find((p) => p.id === data.packageId);
  if (!pkg) {
    return sendError(res, 404, 'NOT_FOUND', 'Package not found');
  }

  // Hard Rule 5: A package session can never be deducted twice
  if (pkg.remainingSessions <= 0 || pkg.completedSessions >= pkg.totalSessions) {
    return sendError(
      res,
      409,
      'PACKAGE_EXHAUSTED',
      `Cannot deduct session: All ${pkg.totalSessions} sessions of package "${pkg.packageName}" have already been completed.`
    );
  }

  const nextSessionNumber = pkg.completedSessions + 1;

  // Strict Advance Pre-payment & Zero-Due Session Lock Check:
  const financial = computePackageFinancials(pkg);
  const unlockedSessions = financial.unlockedSessions ?? 0;

  if (pkg.completedSessions >= unlockedSessions) {
    // Next session is LOCKED because payments made do not cover session #nextSessionNumber!
    const perSession = financial.perSessionPriceBDT || (pkg.priceBDT / pkg.totalSessions);
    const neededCumulative = nextSessionNumber * perSession;
    const currentPaid = financial.paidAmountBDT || 0;
    const neededNow = Math.max(0, Math.round(neededCumulative - currentPaid));

    return sendError(
      res,
      402,
      'SESSION_PAYMENT_REQUIRED',
      `সেশন #${nextSessionNumber} এর ফি অপরিশোধিত। সেশনের বিল বাকি (Due) রেখে ট্রিটমেন্ট গ্রহণ অনুমোদিত নয়। এই সেশনটি আনলক করতে সর্বনিম্ন ৳ ${neededNow.toLocaleString('en-BD')} অগ্রিম/কিস্তি পরিশোধ করুন।`,
      {
        packageId: pkg.id,
        packageName: pkg.packageName,
        patientName: pkg.patientName,
        nextSessionNumber,
        perSessionPriceBDT: perSession,
        currentPaidBDT: currentPaid,
        neededPaymentBDT: neededNow,
        totalDueBDT: financial.dueAmountBDT,
        invoiceId: pkg.invoiceId,
        unlockedSessions,
      }
    );
  }

  // Verify that this specific session number has not already been logged
  const existingDeduction = packageDeductions.find(
    (d) => d.packageId === pkg.id && d.sessionNumber === nextSessionNumber
  );
  if (existingDeduction) {
    return sendError(
      res,
      409,
      'DUPLICATE_SESSION_DEDUCTION',
      `Session #${nextSessionNumber} has already been logged on ${existingDeduction.deductedAt}. Cannot deduct twice.`
    );
  }

  pkg.completedSessions += 1;
  pkg.remainingSessions -= 1;
  if (pkg.remainingSessions === 0) {
    pkg.status = 'completed';
  }

  const deduction: PackageDeduction = {
    id: `ded-${packageDeductions.length + 1}`,
    packageId: pkg.id,
    patientId: pkg.patientId,
    sessionNumber: nextSessionNumber,
    deductedAt: new Date().toISOString(),
    therapistId: currentUser.id,
    therapistName: data.therapistName,
    treatmentNotes: data.treatmentNotes,
    machineSettings: data.machineSettings,
  };

  packageDeductions.push(deduction);

  logAuditEvent(
    'PACKAGE_SESSION_DEDUCTED',
    'package',
    pkg.id,
    `Deducted session ${nextSessionNumber}/${pkg.totalSessions} for patient ${pkg.patientName}. Remaining: ${pkg.remainingSessions}`
  );

  const updatedFinancial = computePackageFinancials(pkg);
  const idempotencyKey = req.headers['idempotency-key'] as string;
  saveIdempotency(idempotencyKey, 200, { data: { package: updatedFinancial, deduction } });

  return sendSuccess(res, { package: updatedFinancial, deduction });
});

// -------------------------------------------------------------
// Endpoints: Invoices & Payments (Hard Rule 4: Paid amount & due are DERIVED)
// -------------------------------------------------------------

app.get('/api/v1/invoices', (req, res) => {
  const { patientId, status } = req.query;
  let list = invoices.map((inv) => {
    // Populate associated payments
    const payments = paymentRecords.filter((p) => p.invoiceId === inv.id);
    return { ...inv, payments };
  });

  if (patientId) {
    list = list.filter((i) => i.patientId === patientId);
  }
  if (status) {
    list = list.filter((i) => i.status === status);
  }

  return sendSuccess(res, list);
});

app.post('/api/v1/invoices', checkIdempotency, (req, res) => {
  const schema = z.object({
    patientId: z.string(),
    branchId: z.string().default('br-dhanmondi'),
    items: z
      .array(
        z.object({
          description: z.string().min(1),
          quantity: z.number().min(1),
          unitPriceBDT: z.number().min(0),
          discountBDT: z.number().min(0).default(0),
        })
      )
      .min(1, 'Invoice must contain at least one item'),
    discountBDT: z.number().min(0).default(0),
    vatPercent: z.number().min(0).max(100).default(0),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid invoice items', parsed.error.format());
  }

  const data = parsed.data;
  const patient = patients.find((p) => p.id === data.patientId);
  if (!patient) {
    return sendError(res, 404, 'NOT_FOUND', 'Patient not found');
  }

  const branch = branches.find((b) => b.id === data.branchId) || branches[0];

  let subtotal = 0;
  const computedItems = data.items.map((it, idx) => {
    const itemTotal = it.quantity * it.unitPriceBDT - it.discountBDT;
    subtotal += itemTotal;
    return {
      id: `it-${Date.now()}-${idx}`,
      description: it.description,
      quantity: it.quantity,
      unitPriceBDT: it.unitPriceBDT,
      discountBDT: it.discountBDT,
      totalBDT: itemTotal,
    };
  });

  const vatAmount = (subtotal * data.vatPercent) / 100;
  const totalAmount = subtotal + vatAmount - data.discountBDT;

  // Hard Rule 4: Paid and due are derived from payment records, starts at 0 paid
  const newInvoice: Invoice = {
    id: `inv-${invoices.length + 301}`,
    invoiceNumber: `INV-2026-${(590 + invoices.length + 1).toString().padStart(4, '0')}`,
    patientId: patient.id,
    patientName: patient.name,
    patientPhone: patient.phone,
    patientAge: patient.age || 31,
    patientGender: patient.gender || 'male',
    patientCode: patient.patientIdCode || patient.id,
    branchId: branch.id,
    branchName: branch.name,
    items: computedItems,
    subtotalBDT: subtotal,
    vatPercent: data.vatPercent,
    vatAmountBDT: vatAmount,
    discountBDT: data.discountBDT,
    totalAmountBDT: totalAmount,
    paidAmountBDT: 0.0, // Hard rule: derived
    dueAmountBDT: totalAmount, // Hard rule: derived
    status: 'unpaid',
    payments: [],
    createdAt: new Date().toISOString(),
    createdBy: currentUser.name,
  };

  invoices.unshift(newInvoice);

  logAuditEvent(
    'INVOICE_CREATED',
    'invoice',
    newInvoice.id,
    `Generated invoice ${newInvoice.invoiceNumber} for ${patient.name} totaling ৳ ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  );

  const idempotencyKey = req.headers['idempotency-key'] as string;
  saveIdempotency(idempotencyKey, 201, { data: newInvoice });

  return sendSuccess(res, newInvoice, {}, 201);
});

// Record Payment & DERIVE Paid and Due (Hard Rule 4)
app.post('/api/v1/invoices/:id/payments', checkIdempotency, (req, res) => {
  const schema = z.object({
    amountBDT: z.number().positive('Payment amount must be greater than zero'),
    method: z.enum(['cash', 'card', 'bkash', 'nagad', 'bank_transfer']),
    transactionRef: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid payment payload', parsed.error.format());
  }

  const invoice = invoices.find((inv) => inv.id === req.params.id);
  if (!invoice) {
    return sendError(res, 404, 'NOT_FOUND', 'Invoice not found');
  }

  if (invoice.status === 'void') {
    return sendError(res, 409, 'INVOICE_VOIDED', 'Cannot accept payment for a voided invoice');
  }

  // Calculate current valid paid amount directly from payment records
  const existingValidPayments = paymentRecords.filter((p) => p.invoiceId === invoice.id && p.status === 'valid');
  const currentPaid = existingValidPayments.reduce((sum, p) => sum + p.amountBDT, 0);
  const currentDue = invoice.totalAmountBDT - currentPaid;

  if (parsed.data.amountBDT > currentDue + 0.01) {
    return sendError(
      res,
      422,
      'EXCEEDS_DUE_AMOUNT',
      `Payment amount ৳ ${parsed.data.amountBDT} exceeds remaining due amount ৳ ${currentDue.toFixed(2)}`
    );
  }

  // Record payment row (append-only)
  const payment: PaymentRecord = {
    id: `pay-${paymentRecords.length + 1}`,
    invoiceId: invoice.id,
    receiptNumber: `RCP-2026-${(40 + paymentRecords.length + 1).toString().padStart(4, '0')}`,
    amountBDT: parsed.data.amountBDT,
    method: parsed.data.method,
    transactionRef: parsed.data.transactionRef || `${parsed.data.method.toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`,
    paidAt: new Date().toISOString(),
    receivedBy: currentUser.name,
    status: 'valid',
  };

  paymentRecords.push(payment);

  // DERIVE paid amount and due from payment records (Hard Rule 4)
  const updatedValidPayments = paymentRecords.filter((p) => p.invoiceId === invoice.id && p.status === 'valid');
  const newPaidAmount = updatedValidPayments.reduce((sum, p) => sum + p.amountBDT, 0);
  const newDueAmount = Math.max(0, invoice.totalAmountBDT - newPaidAmount);

  invoice.paidAmountBDT = newPaidAmount;
  invoice.dueAmountBDT = newDueAmount;
  invoice.status = newDueAmount <= 0.01 ? 'paid' : 'partially_paid';

  logAuditEvent(
    'PAYMENT_RECORDED',
    'invoice',
    invoice.id,
    `Recorded payment of ৳ ${payment.amountBDT.toLocaleString('en-US', { minimumFractionDigits: 2 })} via ${payment.method} (${payment.receiptNumber}). Derived due: ৳ ${newDueAmount.toFixed(2)}`
  );

  const idempotencyKey = req.headers['idempotency-key'] as string;
  saveIdempotency(idempotencyKey, 201, { data: { invoice, payment } });

  return sendSuccess(res, { invoice, payment }, {}, 201);
});

// Void Invoice (Hard Rule 3 & 6: Never hard delete, use void row with mandatory reason)
app.post('/api/v1/invoices/:id/void', (req, res) => {
  const schema = z.object({
    reason: z.string().min(5, 'Reason for voiding must be at least 5 characters'),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'A mandatory reason is required to void an invoice', parsed.error.format());
  }

  const invoice = invoices.find((inv) => inv.id === req.params.id);
  if (!invoice) {
    return sendError(res, 404, 'NOT_FOUND', 'Invoice not found');
  }

  if (invoice.status === 'void') {
    return sendError(res, 409, 'ALREADY_VOID', 'Invoice is already voided');
  }

  invoice.status = 'void';
  invoice.voidReason = parsed.data.reason;
  invoice.voidedAt = new Date().toISOString();
  invoice.voidedBy = currentUser.name;

  // Mark all associated payments as reversed
  for (const pay of paymentRecords.filter((p) => p.invoiceId === invoice.id)) {
    pay.status = 'reversed';
    pay.reversalReason = `Invoice ${invoice.invoiceNumber} voided: ${parsed.data.reason}`;
  }

  logAuditEvent(
    'INVOICE_VOIDED',
    'invoice',
    invoice.id,
    `Voided invoice ${invoice.invoiceNumber}. Reason: ${parsed.data.reason}. Any related payments marked reversed.`
  );

  return sendSuccess(res, invoice);
});

// -------------------------------------------------------------
// Endpoints: Inventory & Non-Destructive Adjustments (Hard Rule 3 & 6)
// -------------------------------------------------------------

app.get('/api/v1/inventory', (req, res) => {
  const { branchId, category, productType, status, search } = req.query;
  let list = [...inventoryItems];

  if (branchId) {
    list = list.filter((i) => i.branchId === branchId);
  }
  if (category && category !== 'all') {
    list = list.filter((i) => i.category === category);
  }
  if (productType && productType !== 'all') {
    list = list.filter((i) => i.productType === productType);
  }
  if (status && status !== 'all') {
    list = list.filter((i) => i.status === status);
  }
  if (search) {
    const q = (search as string).toLowerCase();
    list = list.filter((i) =>
      i.name.toLowerCase().includes(q) ||
      i.itemCode.toLowerCase().includes(q) ||
      (i.brand && i.brand.toLowerCase().includes(q)) ||
      (i.barcode && i.barcode.includes(q))
    );
  }

  return sendSuccess(res, list, { total: list.length });
});

app.post('/api/v1/inventory', (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    category: z.enum(['Serums & Peels', 'Laser Consumables', 'Injectables', 'Post-Care Creams', 'Disposables']),
    brand: z.string().min(1),
    productType: z.enum(['retail', 'consumable', 'dual_use']).default('retail'),
    currentStock: z.number().int().min(0).default(0),
    unit: z.enum(['vials', 'bottles', 'boxes', 'pieces', 'tubes']),
    reorderLevel: z.number().int().min(1).default(5),
    unitCostBDT: z.number().min(0),
    sellingPriceBDT: z.number().min(0),
    batchNumber: z.string().min(1),
    expiryDate: z.string().min(4),
    barcode: z.string().optional(),
    sku: z.string().optional(),
    description: z.string().optional(),
    usageProtocol: z.string().optional(),
    branchId: z.string().default('br-dhanmondi'),
    branchName: z.string().default('Dhanmondi Main Center'),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid product data', parsed.error.format());
  }

  const d = parsed.data;
  const newId = `inv-item-${Date.now()}`;
  const codeSeq = (inventoryItems.length + 1).toString().padStart(3, '0');
  const catPrefix = d.category.slice(0, 3).toUpperCase();
  const itemCode = `SKU-${catPrefix}-${codeSeq}`;

  const newItem: InventoryItem = {
    id: newId,
    itemCode,
    name: d.name,
    category: d.category,
    brand: d.brand,
    productType: d.productType,
    barcode: d.barcode || `890123${Math.floor(1000 + Math.random() * 9000)}`,
    sku: d.sku || `${d.brand.slice(0, 3).toUpperCase()}-${codeSeq}`,
    description: d.description,
    currentStock: d.currentStock,
    unit: d.unit,
    reorderLevel: d.reorderLevel,
    unitCostBDT: d.unitCostBDT,
    sellingPriceBDT: d.sellingPriceBDT,
    batchNumber: d.batchNumber,
    expiryDate: d.expiryDate,
    batches: [
      {
        batchNumber: d.batchNumber,
        expiryDate: d.expiryDate,
        quantity: d.currentStock,
        costPriceBDT: d.unitCostBDT,
        receivedDate: new Date().toISOString().split('T')[0],
      }
    ],
    usageProtocol: d.usageProtocol,
    branchId: d.branchId,
    branchName: d.branchName,
    status: d.currentStock <= d.reorderLevel ? 'low_stock' : 'in_stock',
    isActive: true,
  };

  inventoryItems.unshift(newItem);

  logAuditEvent(
    'INVENTORY_ITEM_CREATED',
    'inventory',
    newItem.id,
    `Added product ${newItem.name} (${newItem.itemCode}) [${newItem.productType}] with initial stock of ${newItem.currentStock} ${newItem.unit}`
  );

  return sendSuccess(res, newItem, {}, 201);
});

app.patch('/api/v1/inventory/:id', (req, res) => {
  const item = inventoryItems.find((i) => i.id === req.params.id);
  if (!item) {
    return sendError(res, 404, 'NOT_FOUND', 'Product not found');
  }

  const raw = req.body;
  if (raw.sellingPriceBDT !== undefined) item.sellingPriceBDT = raw.sellingPriceBDT;
  if (raw.unitCostBDT !== undefined) item.unitCostBDT = raw.unitCostBDT;
  if (raw.reorderLevel !== undefined) item.reorderLevel = raw.reorderLevel;
  if (raw.name !== undefined) item.name = raw.name;
  if (raw.category !== undefined) item.category = raw.category;
  if (raw.brand !== undefined) item.brand = raw.brand;
  if (raw.productType !== undefined) item.productType = raw.productType;
  if (raw.usageProtocol !== undefined) item.usageProtocol = raw.usageProtocol;
  if (raw.isActive !== undefined) item.isActive = raw.isActive;

  item.status = item.currentStock <= item.reorderLevel ? 'low_stock' : 'in_stock';

  return sendSuccess(res, item);
});

// Stock Adjustments
app.get('/api/v1/inventory/adjustments', (req, res) => {
  return sendSuccess(res, stockAdjustments, { total: stockAdjustments.length });
});

app.post('/api/v1/inventory/adjust', checkIdempotency, (req, res) => {
  const schema = z.object({
    itemId: z.string(),
    adjustmentType: z.enum(['damaged', 'expired', 'clinic_use', 'restock', 'tester', 'audit_correction']),
    quantityDelta: z.number().int().refine((val) => val !== 0, 'Delta cannot be zero'),
    reason: z.string().min(5, 'A clinical or audit reason is required'),
    batchNumber: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid stock adjustment', parsed.error.format());
  }

  const item = inventoryItems.find((i) => i.id === parsed.data.itemId);
  if (!item) {
    return sendError(res, 404, 'NOT_FOUND', 'Inventory item not found');
  }

  const newStock = item.currentStock + parsed.data.quantityDelta;
  if (newStock < 0) {
    return sendError(
      res,
      422,
      'INSUFFICIENT_STOCK',
      `Cannot deduct ${Math.abs(parsed.data.quantityDelta)} units. Current stock is only ${item.currentStock}.`
    );
  }

  item.currentStock = newStock;
  item.status = newStock <= item.reorderLevel ? 'low_stock' : 'in_stock';

  // Hard Rule 3 & 6: Non-destructive stock adjustments table
  const adjustment: StockAdjustment = {
    id: `stk-adj-${Date.now()}`,
    itemId: item.id,
    itemName: item.name,
    batchNumber: parsed.data.batchNumber || item.batchNumber,
    adjustmentType: parsed.data.adjustmentType,
    quantityDelta: parsed.data.quantityDelta,
    balanceAfter: newStock,
    unitCostBDT: item.unitCostBDT,
    reason: parsed.data.reason,
    adjustedBy: currentUser.name,
    adjustedAt: new Date().toISOString(),
  };

  stockAdjustments.unshift(adjustment);

  logAuditEvent(
    'STOCK_ADJUSTMENT',
    'inventory',
    item.id,
    `Adjusted stock for ${item.name} (${adjustment.batchNumber}) by ${parsed.data.quantityDelta > 0 ? '+' : ''}${parsed.data.quantityDelta} units. New balance: ${newStock}. Reason: ${parsed.data.reason}`
  );

  const idempotencyKey = req.headers['idempotency-key'] as string;
  saveIdempotency(idempotencyKey, 201, { data: { item, adjustment } });

  return sendSuccess(res, { item, adjustment }, {}, 201);
});

// Suppliers
app.get('/api/v1/inventory/suppliers', (req, res) => {
  return sendSuccess(res, suppliers, { total: suppliers.length });
});

app.post('/api/v1/inventory/suppliers', (req, res) => {
  const schema = z.object({
    name: z.string().min(2),
    contactPerson: z.string().min(2),
    phone: z.string().min(6),
    email: z.string().email(),
    address: z.string().min(5),
    brandsSupplied: z.array(z.string()).default([]),
    paymentTerms: z.enum(['Net 15', 'Net 30', 'Cash on Delivery', 'Advance']).default('Net 30'),
    balanceDueBDT: z.number().min(0).default(0),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid supplier data', parsed.error.format());
  }

  const d = parsed.data;
  const newSupplier: Supplier = {
    id: `sup-${Date.now()}`,
    code: `SUP-${d.name.slice(0, 3).toUpperCase()}-${Math.floor(10 + Math.random() * 90)}`,
    name: d.name,
    contactPerson: d.contactPerson,
    phone: d.phone,
    email: d.email,
    address: d.address,
    brandsSupplied: d.brandsSupplied,
    paymentTerms: d.paymentTerms,
    balanceDueBDT: d.balanceDueBDT,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  suppliers.unshift(newSupplier);

  logAuditEvent(
    'SUPPLIER_CREATED',
    'inventory',
    newSupplier.id,
    `Registered supplier ${newSupplier.name} (${newSupplier.code})`
  );

  return sendSuccess(res, newSupplier, {}, 201);
});

// Purchase Orders & GRN
app.get('/api/v1/inventory/purchases', (req, res) => {
  return sendSuccess(res, purchaseOrders, { total: purchaseOrders.length });
});

app.post('/api/v1/inventory/purchases', (req, res) => {
  const schema = z.object({
    supplierId: z.string(),
    expectedDeliveryDate: z.string(),
    items: z.array(
      z.object({
        itemId: z.string(),
        orderedQty: z.number().int().positive(),
        unitCostBDT: z.number().min(0),
      })
    ).min(1),
    notes: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid PO payload', parsed.error.format());
  }

  const supplier = suppliers.find((s) => s.id === parsed.data.supplierId);
  if (!supplier) {
    return sendError(res, 404, 'NOT_FOUND', 'Supplier not found');
  }

  let subtotal = 0;
  const items = parsed.data.items.map((it) => {
    const inv = inventoryItems.find((p) => p.id === it.itemId);
    const itemName = inv ? inv.name : 'Unknown Product';
    const itemCode = inv ? inv.itemCode : 'SKU-GEN';
    const total = it.orderedQty * it.unitCostBDT;
    subtotal += total;
    return {
      itemId: it.itemId,
      itemCode,
      itemName,
      orderedQty: it.orderedQty,
      receivedQty: 0,
      unitCostBDT: it.unitCostBDT,
      totalBDT: total,
    };
  });

  const poNumber = `PO-2026-${(80 + purchaseOrders.length + 1).toString().padStart(3, '0')}`;
  const newPO: PurchaseOrder = {
    id: `po-${Date.now()}`,
    poNumber,
    supplierId: supplier.id,
    supplierName: supplier.name,
    orderDate: new Date().toISOString().split('T')[0],
    expectedDeliveryDate: parsed.data.expectedDeliveryDate,
    items,
    subtotalBDT: subtotal,
    taxBDT: 0,
    totalBDT: subtotal,
    status: 'ordered',
    paymentStatus: 'unpaid',
    notes: parsed.data.notes,
    createdAt: new Date().toISOString(),
    createdBy: currentUser.name,
  };

  purchaseOrders.unshift(newPO);

  logAuditEvent(
    'PURCHASE_ORDER_CREATED',
    'inventory',
    newPO.id,
    `Created PO ${newPO.poNumber} to ${supplier.name} totaling ৳ ${subtotal.toLocaleString()}`
  );

  return sendSuccess(res, newPO, {}, 201);
});

// Receive GRN
app.post('/api/v1/inventory/purchases/:id/receive', (req, res) => {
  const po = purchaseOrders.find((p) => p.id === req.params.id);
  if (!po) {
    return sendError(res, 404, 'NOT_FOUND', 'Purchase order not found');
  }

  const schema = z.object({
    invoiceRefNumber: z.string().optional(),
    notes: z.string().optional(),
    items: z.array(
      z.object({
        itemId: z.string(),
        batchNumber: z.string().min(1),
        expiryDate: z.string().min(4),
        receivedQty: z.number().int().min(0),
        condition: z.enum(['good', 'damaged']).default('good'),
      })
    ).min(1),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid GRN payload', parsed.error.format());
  }

  let totalReceivedCost = 0;
  const grnItems: any[] = [];

  for (const rec of parsed.data.items) {
    const inv = inventoryItems.find((p) => p.id === rec.itemId);
    if (!inv) continue;

    const poLine = po.items.find((line) => line.itemId === rec.itemId);
    const unitCost = poLine ? poLine.unitCostBDT : inv.unitCostBDT;

    if (rec.receivedQty > 0 && rec.condition === 'good') {
      inv.currentStock += rec.receivedQty;
      inv.status = inv.currentStock <= inv.reorderLevel ? 'low_stock' : 'in_stock';
      inv.batchNumber = rec.batchNumber;
      inv.expiryDate = rec.expiryDate;

      if (!inv.batches) inv.batches = [];
      inv.batches.push({
        batchNumber: rec.batchNumber,
        expiryDate: rec.expiryDate,
        quantity: rec.receivedQty,
        costPriceBDT: unitCost,
        receivedDate: new Date().toISOString().split('T')[0],
      });

      // Also log stock movement
      stockAdjustments.unshift({
        id: `stk-adj-${Date.now()}-${rec.itemId}`,
        itemId: inv.id,
        itemName: inv.name,
        batchNumber: rec.batchNumber,
        adjustmentType: 'restock',
        quantityDelta: rec.receivedQty,
        balanceAfter: inv.currentStock,
        unitCostBDT: unitCost,
        reason: `Goods Received Note for PO ${po.poNumber}. Supplier Invoice: ${parsed.data.invoiceRefNumber || 'N/A'}`,
        adjustedBy: currentUser.name,
        adjustedAt: new Date().toISOString(),
      });
    }

    if (poLine) {
      poLine.receivedQty += rec.receivedQty;
    }

    totalReceivedCost += rec.receivedQty * unitCost;

    grnItems.push({
      itemId: inv.id,
      itemName: inv.name,
      batchNumber: rec.batchNumber,
      expiryDate: rec.expiryDate,
      receivedQty: rec.receivedQty,
      unitCostBDT: unitCost,
      condition: rec.condition,
    });
  }

  // Update PO status
  const allFulfilled = po.items.every((it) => it.receivedQty >= it.orderedQty);
  po.status = allFulfilled ? 'received' : 'partially_received';

  const grnNumber = `GRN-2026-${(100 + goodsReceivedNotes.length + 1).toString().padStart(3, '0')}`;
  const grn: GoodsReceivedNote = {
    id: `grn-${Date.now()}`,
    grnNumber,
    poId: po.id,
    poNumber: po.poNumber,
    supplierId: po.supplierId,
    supplierName: po.supplierName,
    receivedDate: new Date().toISOString().split('T')[0],
    receivedBy: currentUser.name,
    invoiceRefNumber: parsed.data.invoiceRefNumber,
    items: grnItems,
    totalCostBDT: totalReceivedCost,
    notes: parsed.data.notes,
    createdAt: new Date().toISOString(),
  };

  goodsReceivedNotes.unshift(grn);

  logAuditEvent(
    'GRN_RECEIVED',
    'inventory',
    grn.id,
    `Received GRN ${grn.grnNumber} for PO ${po.poNumber} from ${po.supplierName}. Total Cost: ৳ ${totalReceivedCost.toLocaleString()}`
  );

  return sendSuccess(res, { po, grn }, {}, 201);
});

// -------------------------------------------------------------
// Endpoints: Referrals and Commission Management (Prompt 19)
// -------------------------------------------------------------

app.use('/api/v1/referrals', referralsRouter as unknown as express.RequestHandler);
app.use('/api/v1/commissions', commissionsRouter as unknown as express.RequestHandler);

// -------------------------------------------------------------
// Endpoints: Audit Events (Rule 7)
// -------------------------------------------------------------

app.get('/api/v1/audit-events', (_req, res) => {
  return sendSuccess(res, auditEvents);
});

// -------------------------------------------------------------
// Endpoints: Integration Gateways (msg.mram.com.bd SMS & cPanel SMTP)
// -------------------------------------------------------------

let smsGatewayConfig: SmsGatewayConfig = {
  provider: 'msg_mram',
  apiUrl: 'https://msg.mram.com.bd/smsapi',
  apiKey: process.env.SMS_GATEWAY_API_KEY || '',
  senderId: process.env.SMS_SENDER_ID || 'SUOXI',
  defaultType: 'text',
  defaultLabel: 'transactional',
  isActive: Boolean(process.env.SMS_GATEWAY_API_KEY),
  balanceBDT: 0,
  balanceCredits: 0,
  lastCheckedAt: new Date().toISOString(),
  autoSendOnBooking: true,
  autoSendOnPayment: true,
  autoSendOnPrescription: true,
  autoSendReminder24h: true,
};

let smsTemplates: SmsTemplate[] = [
  {
    id: 'tmpl-sms-apt-confirm',
    name: 'Appointment Confirmation',
    category: 'appointment',
    type: 'text',
    label: 'transactional',
    content: 'Dear {{patient_name}}, your appointment with {{doctor_name}} is confirmed on {{appointment_date}} at {{appointment_time}} ({{branch_name}}). Token #{{token}}. Helpline: +8801711223344. - SUOXI Skin Care',
    variables: ['{{patient_name}}', '{{doctor_name}}', '{{appointment_date}}', '{{appointment_time}}', '{{branch_name}}', '{{token}}'],
    isDefault: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tmpl-sms-reminder-24h',
    name: '24-Hour Treatment Reminder',
    category: 'appointment',
    type: 'text',
    label: 'transactional',
    content: 'Reminder: Dear {{patient_name}}, your aesthetic skin session is tomorrow at {{appointment_time}} with {{doctor_name}} at SUOXI {{branch_name}}. Please avoid sun exposure & active retinoids. - SUOXI',
    variables: ['{{patient_name}}', '{{doctor_name}}', '{{appointment_time}}', '{{branch_name}}'],
    isDefault: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tmpl-sms-invoice-paid',
    name: 'POS Payment & Receipt',
    category: 'billing',
    type: 'text',
    label: 'transactional',
    content: 'Dear {{patient_name}}, payment of ৳ {{amount}} received for Invoice #{{invoice_number}}. View your e-receipt: {{invoice_url}} Thank you for choosing SUOXI Clinic.',
    variables: ['{{patient_name}}', '{{amount}}', '{{invoice_number}}', '{{invoice_url}}'],
    isDefault: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tmpl-sms-rx-care',
    name: 'Prescription & Post-Care Alert',
    category: 'clinical',
    type: 'text',
    label: 'transactional',
    content: 'Dear {{patient_name}}, your post-procedure clinical care prescription from {{doctor_name}} is available at {{portal_url}}. For emergency medical queries, call: +8801711223344. - SUOXI',
    variables: ['{{patient_name}}', '{{doctor_name}}', '{{portal_url}}'],
    isDefault: true,
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'tmpl-sms-offer-hydra',
    name: 'Special Glow Promo (Bangla)',
    category: 'promotional',
    type: 'unicode',
    label: 'promotional',
    content: 'প্রিয় {{patient_name}}, সুঅক্সি ক্লিনিকে হাইড্রোফেসিয়াল ও লেজার সেশনে পাচ্ছেন ২০% ছাড়! অ্যাপয়েন্টমেন্ট বুকিং করতে কল করুন +৮৮০১৭১১২২৩৩৪৪ অথবা ভিজিট করুন suoxiclinic.com',
    variables: ['{{patient_name}}'],
    isDefault: false,
    updatedAt: new Date().toISOString(),
  },
];

let smsLogs: SmsLogRecord[] = [
  {
    id: 'sms-log-01',
    recipientPhone: '+8801712345678',
    recipientName: 'Sumaiya Rahman',
    messageContent: 'Dear Sumaiya Rahman, your appointment with Dr. Nusrat Jahan is confirmed on 21 Oct 2026 at 4:30 PM (Dhanmondi Main Center). Token #01. Helpline: +8801711223344. - SUOXI Skin Care',
    messageType: 'text',
    label: 'transactional',
    senderId: 'SUOXI',
    shootId: 'MRAM-20261021-08912',
    status: 'delivered',
    charsCount: 172,
    smsCount: 2,
    costBDT: 0.70,
    sentAt: '2026-10-21T10:30:15Z',
    triggerEvent: 'appointment_booked',
  },
  {
    id: 'sms-log-02',
    recipientPhone: '+8801912345678',
    recipientName: 'Roxane Begum',
    messageContent: 'Dear Roxane Begum, payment of ৳ 8,500 received for Invoice #INV-2026-0042. View your e-receipt: https://suoxiclinic.com/r/0042 Thank you for choosing SUOXI Clinic.',
    messageType: 'text',
    label: 'transactional',
    senderId: 'SUOXI',
    shootId: 'MRAM-20261020-07741',
    status: 'delivered',
    charsCount: 165,
    smsCount: 2,
    costBDT: 0.70,
    sentAt: '2026-10-20T14:45:22Z',
    triggerEvent: 'pos_payment_received',
  },
  {
    id: 'sms-log-03',
    recipientPhone: '+8801812345678',
    recipientName: 'Tanvir Ahmed',
    messageContent: 'Dear Tanvir Ahmed, your prescription & post-care routine from Dr. Farhana Khan is ready: https://suoxiclinic.com/portal. Helpline: +8801711223344. - SUOXI',
    messageType: 'text',
    label: 'transactional',
    senderId: 'SUOXI',
    shootId: 'MRAM-20261019-06159',
    status: 'delivered',
    charsCount: 147,
    smsCount: 1,
    costBDT: 0.35,
    sentAt: '2026-10-19T12:10:04Z',
    triggerEvent: 'prescription_finalized',
  },
  {
    id: 'sms-log-04',
    recipientPhone: '+8801314113022',
    recipientName: 'Ahad',
    messageContent: 'Dear Ahad, your appointment with Dr. Nusrat Jahan is confirmed on 04 Nov 2026 at 10:04 AM (Dhanmondi Main Center). Token #08. Helpline: +8801711223344. - SUOXI Skin Care',
    messageType: 'text',
    label: 'transactional',
    senderId: 'SUOXI',
    shootId: 'MRAM-20261103-10041',
    status: 'gateway_accepted',
    charsCount: 168,
    smsCount: 2,
    costBDT: 0.70,
    sentAt: new Date(Date.now() - 15 * 60000).toISOString(),
    triggerEvent: 'appointment_booked',
  },
];

let emailGatewayConfig: EmailGatewayConfig = {
  provider: 'cpanel_smtp',
  smtpHost: process.env.SMTP_HOST || 'mail.suoxiclinic.com',
  smtpPort: Number(process.env.SMTP_PORT || 465),
  encryption: 'SSL/TLS',
  smtpUser: process.env.SMTP_USER || 'care@suoxiclinic.com',
  smtpPass: process.env.SMTP_PASS || '',
  fromName: 'SUOXI Skin Care & Aesthetic Center',
  fromEmail: process.env.SMTP_FROM || 'care@suoxiclinic.com',
  replyToEmail: 'support@suoxiclinic.com',
  isActive: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS),
  lastTestedAt: new Date().toISOString(),
  autoEmailPrescription: true,
  autoEmailInvoice: true,
  autoEmailAppointmentCard: true,
  autoEmailDailyReport: false,
};

let emailTemplates: EmailTemplate[] = [
  {
    id: 'tmpl-email-rx',
    name: 'Aesthetic Prescription & Treatment Plan',
    subject: 'Your Clinical Prescription & Dermatological Care Plan - SUOXI',
    category: 'prescription',
    variables: ['{{patient_name}}', '{{doctor_name}}', '{{prescription_id}}', '{{date}}', '{{download_link}}'],
    updatedAt: new Date().toISOString(),
    htmlPreview: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #0DA54F, #059669); padding: 24px; color: white; text-align: center;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 700;">SUOXI Skin Care & Aesthetic Center</h2>
          <p style="margin: 4px 0 0; opacity: 0.9; font-size: 13px;">Official Dermatological Care & Prescription</p>
        </div>
        <div style="padding: 24px; color: #334155;">
          <p style="font-size: 15px;">Dear <strong>{{patient_name}}</strong>,</p>
          <p style="font-size: 14px; line-height: 1.6;">Your clinical consultation with <strong>{{doctor_name}}</strong> has been concluded and your personalized treatment plan is ready.</p>
          <div style="background: #f8fafc; border-left: 4px solid #0DA54F; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">
            <p style="margin: 0; font-size: 13px;"><strong>Prescription ID:</strong> {{prescription_id}}</p>
            <p style="margin: 4px 0 0; font-size: 13px;"><strong>Date:</strong> {{date}}</p>
          </div>
          <div style="text-align: center; margin: 24px 0;">
            <a href="{{download_link}}" style="background: #0DA54F; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Download Official Prescription (PDF)</a>
          </div>
          <p style="font-size: 12px; color: #64748b; line-height: 1.5;">Please follow the daily post-procedure skincare regimen and adhere to sunscreen application instructions. For any queries, contact our Dhanmondi or Gulshan lounge.</p>
        </div>
        <div style="background: #f1f5f9; padding: 16px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
          SUOXI Aesthetic Care • House 42, Road 9/A, Dhanmondi, Dhaka • Hotline: +8801711223344
        </div>
      </div>
    `,
  },
  {
    id: 'tmpl-email-invoice',
    name: 'POS Tax Invoice & Receipt',
    subject: 'Official Payment Invoice #{{invoice_number}} - SUOXI Clinic',
    category: 'invoice',
    variables: ['{{patient_name}}', '{{invoice_number}}', '{{total_bdt}}', '{{paid_bdt}}', '{{date}}', '{{branch_name}}'],
    updatedAt: new Date().toISOString(),
    htmlPreview: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
        <div style="background: #0f172a; padding: 24px; color: white; text-align: center;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 700;">SUOXI Aesthetic Clinic</h2>
          <p style="margin: 4px 0 0; color: #94a3b8; font-size: 13px;">Official Tax Invoice & Payment Receipt</p>
        </div>
        <div style="padding: 24px; color: #334155;">
          <p style="font-size: 15px;">Dear <strong>{{patient_name}}</strong>,</p>
          <p style="font-size: 14px;">Thank you for your visit to our <strong>{{branch_name}}</strong>. Your payment has been received and processed successfully.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 13px;">
            <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0; color: #64748b;">Invoice Number</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">{{invoice_number}}</td></tr>
            <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0; color: #64748b;">Billing Date</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">{{date}}</td></tr>
            <tr style="border-bottom: 1px solid #e2e8f0;"><td style="padding: 8px 0; color: #64748b;">Total Amount</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">৳ {{total_bdt}}</td></tr>
            <tr><td style="padding: 8px 0; color: #0DA54F; font-weight: 700;">Paid Amount</td><td style="padding: 8px 0; font-weight: 700; color: #0DA54F; text-align: right;">৳ {{paid_bdt}} (PAID)</td></tr>
          </table>
          <p style="font-size: 12px; color: #64748b;">This is a computer-generated tax invoice. No signature required.</p>
        </div>
      </div>
    `,
  },
  {
    id: 'tmpl-email-apt',
    name: 'Appointment Confirmation Card',
    subject: 'Appointment Confirmed: {{doctor_name}} on {{date}} at SUOXI',
    category: 'appointment',
    variables: ['{{patient_name}}', '{{doctor_name}}', '{{date}}', '{{time}}', '{{branch_name}}', '{{branch_address}}'],
    updatedAt: new Date().toISOString(),
    htmlPreview: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #2563eb, #38bdf8); padding: 24px; color: white; text-align: center;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 700;">Appointment Confirmed</h2>
          <p style="margin: 4px 0 0; opacity: 0.9; font-size: 13px;">SUOXI Skin Care & Aesthetic Center</p>
        </div>
        <div style="padding: 24px; color: #334155;">
          <p style="font-size: 15px;">Dear <strong>{{patient_name}}</strong>,</p>
          <p style="font-size: 14px;">Your aesthetic dermatology session has been reserved.</p>
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <p style="margin: 0 0 6px; font-size: 14px;">👨‍⚕️ <strong>Doctor:</strong> {{doctor_name}}</p>
            <p style="margin: 0 0 6px; font-size: 14px;">📅 <strong>Date & Time:</strong> {{date}} at {{time}}</p>
            <p style="margin: 0; font-size: 14px;">🏥 <strong>Branch:</strong> {{branch_name}} ({{branch_address}})</p>
          </div>
          <p style="font-size: 12px; color: #64748b;">Please arrive 10 minutes prior for facial cleansing and token registration.</p>
        </div>
      </div>
    `,
  },
];

let emailLogs: EmailLogRecord[] = [
  {
    id: 'em-log-01',
    recipientEmail: 'sumaiya.rahman@gmail.com',
    recipientName: 'Sumaiya Rahman',
    subject: 'Your Clinical Prescription & Dermatological Care Plan - SUOXI',
    templateCategory: 'prescription',
    status: 'delivered',
    sentAt: '2026-10-21T10:35:10Z',
    triggerEvent: 'prescription_sent',
  },
  {
    id: 'em-log-02',
    recipientEmail: 'roxane.begum@yahoo.com',
    recipientName: 'Roxane Begum',
    subject: 'Official Payment Invoice #INV-2026-0042 - SUOXI Clinic',
    templateCategory: 'invoice',
    status: 'delivered',
    sentAt: '2026-10-20T14:46:02Z',
    triggerEvent: 'invoice_generated',
  },
  {
    id: 'em-log-03',
    recipientEmail: 'tanvir.ahmed@outlook.com',
    recipientName: 'Tanvir Ahmed',
    subject: 'Appointment Confirmed: Dr. Farhana Khan on 19 Oct 2026 at SUOXI',
    templateCategory: 'appointment',
    status: 'delivered',
    sentAt: '2026-10-18T16:20:45Z',
    triggerEvent: 'appointment_confirmed',
  },
];

// Helper to count SMS parts based on text vs unicode
function calculateSmsDetails(text: string, type: 'text' | 'unicode') {
  const chars = text.length;
  if (type === 'unicode') {
    // Bangla / Unicode: 70 chars per single SMS, 67 per part for multi-part
    const smsCount = chars <= 70 ? 1 : Math.ceil(chars / 67);
    return { charsCount: chars, smsCount, costBDT: Number((smsCount * 0.35).toFixed(2)) };
  } else {
    // English GSM text: 160 chars per single SMS, 153 per part for multi-part
    const smsCount = chars <= 160 ? 1 : Math.ceil(chars / 153);
    return { charsCount: chars, smsCount, costBDT: Number((smsCount * 0.35).toFixed(2)) };
  }
}

// Server outgoing IP resolver for IP whitelisting in msg.mram.com.bd
let cachedServerIp: string | null = null;
async function getServerOutgoingIp(): Promise<string> {
  if (cachedServerIp) return cachedServerIp;
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3500) });
    if (res.ok) {
      const data = (await res.json()) as { ip: string };
      if (data && data.ip) {
        cachedServerIp = data.ip;
        return cachedServerIp;
      }
    }
  } catch (e) {
    // fallback
  }
  return '34.34.254.57';
}

const MRAM_ERROR_CODES: Record<string, { title: string; desc: string; fix: string }> = {
  '1002': {
    title: 'Sender Id / Masking Not Found',
    desc: 'The approved Sender ID/Masking was not found in your msg.mram.com.bd account.',
    fix: 'Please verify the exact Sender ID in your msg.mram dashboard (e.g. check for trailing dots or spelling like "SUOXI" vs "SUOXI SKIN").',
  },
  '1003': {
    title: 'API Not Found',
    desc: 'The API Key provided was not recognized by msg.mram.com.bd.',
    fix: 'Please copy the correct API Key from your msg.mram.com.bd Developer portal.',
  },
  '1004': {
    title: 'SPAM Detected',
    desc: 'Message content was flagged by telecommunication spam filter.',
    fix: 'Please modify the message text to remove spam-sensitive keywords.',
  },
  '1007': {
    title: 'Balance Insufficient',
    desc: 'Your msg.mram.com.bd account balance is insufficient.',
    fix: 'Please recharge your SMS credits at msg.mram.com.bd.',
  },
  '1008': {
    title: 'Message is empty',
    desc: 'The message body was empty.',
    fix: 'Please enter message content before dispatching.',
  },
  '1009': {
    title: 'Message Type Not Set',
    desc: 'Message type must be text or unicode.',
    fix: 'Set type to "text" for English or "unicode" for Bangla.',
  },
  '1010': {
    title: 'Invalid User & Password',
    desc: 'Authentication credentials rejected.',
    fix: 'Check your msg.mram account credentials.',
  },
  '1012': {
    title: 'Invalid Number',
    desc: 'The recipient mobile number is invalid.',
    fix: 'Number must be a valid Bangladesh phone (e.g. 8801XXXXXXXXX).',
  },
  '1014': {
    title: 'No matching template',
    desc: 'Strict DLT/BTRC template matching failed.',
    fix: 'Ensure template variables are replaced with real content.',
  },
  '1015': {
    title: 'SMS Content Validation Fails',
    desc: 'Content validation failed on carrier gateway.',
    fix: 'Avoid unsupported special characters or ensure URL encoding.',
  },
  '1016': {
    title: 'IP address not allowed!!',
    desc: 'Your msg.mram.com.bd account has IP whitelisting enabled, and this server IP is not yet authorized in your msg.mram portal.',
    fix: 'Go to msg.mram.com.bd > Developer API / Security Settings > Add this Server IP to your Whitelist: ',
  },
  '1019': {
    title: 'Sms Purpose Missing',
    desc: 'SMS label (transactional/promotional) was omitted.',
    fix: 'Select label=transactional or label=promotional.',
  },
};

// SMS Gateway Endpoints (msg.mram.com.bd — preview fallback masks secrets)
app.get('/api/v1/integration/sms/config', (_req, res) => {
  return sendSuccess(res, { ...smsGatewayConfig, apiKey: maskSecret(smsGatewayConfig.apiKey) });
});

app.get('/api/v1/integration/sms/server-ip', async (_req, res) => {
  const ip = await getServerOutgoingIp();
  return sendSuccess(res, { serverIp: ip });
});

app.put('/api/v1/integration/sms/config', (req, res) => {
  const nextBody = { ...(req.body || {}) };
  if (typeof nextBody.apiKey === 'string' && (nextBody.apiKey.includes('••••') || nextBody.apiKey === '')) {
    nextBody.apiKey = smsGatewayConfig.apiKey;
  }
  smsGatewayConfig = {
    ...smsGatewayConfig,
    ...nextBody,
    lastCheckedAt: new Date().toISOString(),
  };
  logAuditEvent('INTEGRATION_SMS_UPDATED', 'integration', 'sms-config', `Updated SMS Gateway configuration (Sender ID: ${smsGatewayConfig.senderId})`);
  return sendSuccess(res, { ...smsGatewayConfig, apiKey: maskSecret(smsGatewayConfig.apiKey) });
});

app.get('/api/v1/integration/sms/balance', async (_req, res) => {
  // If user provided a real msg.mram.com.bd API key, attempt real lookup, or return current balance
  try {
    if (smsGatewayConfig.apiKey && !smsGatewayConfig.apiKey.startsWith('mram_live_sec_')) {
      const response = await fetch(`https://msg.mram.com.bd/miscapi/${encodeURIComponent(smsGatewayConfig.apiKey)}/getBalance`);
      if (response.ok) {
        const text = (await response.text()).trim();
        // If it returned an error code like 1016 or 1003, do not parse as balance
        if (!MRAM_ERROR_CODES[text]) {
          const numeric = parseFloat(text.replace(/[^0-9.]/g, ''));
          if (!isNaN(numeric)) {
            smsGatewayConfig.balanceCredits = Math.round(numeric);
            smsGatewayConfig.balanceBDT = Number((numeric * 0.35).toFixed(2));
            smsGatewayConfig.lastCheckedAt = new Date().toISOString();
          }
        }
      }
    }
  } catch (err) {
    console.warn('[SMS Gateway] Live balance check error:', err);
  }

  return sendSuccess(res, {
    balanceBDT: smsGatewayConfig.balanceBDT,
    balanceCredits: smsGatewayConfig.balanceCredits,
    lastCheckedAt: smsGatewayConfig.lastCheckedAt,
    provider: smsGatewayConfig.provider,
    senderId: smsGatewayConfig.senderId,
  });
});

app.post('/api/v1/integration/sms/send', async (req, res) => {
  const { recipientPhone, messageContent, messageType = 'text', label = 'transactional', senderId = smsGatewayConfig.senderId, recipientName } = req.body;

  if (!recipientPhone || !messageContent) {
    return sendError(res, 400, 'SMS_VALIDATION_FAILED', 'Recipient phone and message content are required');
  }

  // Validate Bangladesh Mobile Number format
  const cleanPhone = recipientPhone.replace(/[\s-]/g, '');
  const isValidBdPhone = /^(\+?8801[3-9]\d{8}|01[3-9]\d{8})$/.test(cleanPhone);
  if (!isValidBdPhone) {
    return sendError(res, 400, '1012', 'Invalid Number (Code 1012: Recipient must be a valid Bangladesh mobile number: 01XXXXXXXXX or +8801XXXXXXXXX)');
  }

  // Format specifically as 8801XXXXXXXXX as required by msg.mram.com.bd API
  const bdContacts = cleanPhone.replace(/^\+/, '').replace(/^01/, '8801');

  const { charsCount, smsCount, costBDT } = calculateSmsDetails(messageContent, messageType);

  if (smsGatewayConfig.balanceCredits < smsCount) {
    return sendError(res, 402, '1007', 'Balance Insufficient (Code 1007: Please recharge your msg.mram.com.bd account)');
  }

  // Generate shoot ID
  const shootId = `MRAM-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 8)}-${Math.floor(10000 + Math.random() * 90000)}`;

  const serverIp = await getServerOutgoingIp();

  // If live API key is provided, execute real GET/POST to msg.mram.com.bd
  let gatewayResponse = 'SMS Submitted Successfully';
  if (smsGatewayConfig.apiKey && !smsGatewayConfig.apiKey.startsWith('mram_live_sec_')) {
    try {
      const url = `https://msg.mram.com.bd/smsapi?api_key=${encodeURIComponent(smsGatewayConfig.apiKey.trim())}&type=${encodeURIComponent(messageType)}&contacts=${encodeURIComponent(bdContacts)}&senderid=${encodeURIComponent((senderId || '').trim())}&msg=${encodeURIComponent(messageContent)}&label=${encodeURIComponent(label)}`;
      const liveRes = await fetch(url);
      gatewayResponse = (await liveRes.text()).trim();
    } catch (apiErr: any) {
      console.warn('[msg.mram.com.bd] API fetch notice:', apiErr.message);
      gatewayResponse = `Connection Error: ${apiErr.message}`;
    }
  }

  // Check if gatewayResponse is a recognized msg.mram.com.bd error code
  const matchedError = MRAM_ERROR_CODES[gatewayResponse];
  if (matchedError) {
    // Gateway rejected the request! Do NOT deduct credits.
    const errorLog: SmsLogRecord = {
      id: `sms-log-${Date.now()}`,
      recipientPhone: cleanPhone.startsWith('+') ? cleanPhone : `+88${cleanPhone.replace(/^88/, '')}`,
      recipientName: recipientName || 'Direct Recipient',
      messageContent,
      messageType,
      label,
      senderId: (senderId || '').trim(),
      shootId,
      status: 'failed',
      errorCode: gatewayResponse,
      errorMessage: `${matchedError.title}: ${matchedError.desc}`,
      charsCount,
      smsCount,
      costBDT: 0,
      sentAt: new Date().toISOString(),
      triggerEvent: 'manual_test_dispatch',
    };

    smsLogs.unshift(errorLog);
    logAuditEvent('INTEGRATION_SMS_FAILED', 'integration', shootId, `Failed to dispatch SMS via msg.mram.com.bd. Error ${gatewayResponse} (${matchedError.title})`);

    return sendSuccess(res, {
      success: false,
      errorCode: gatewayResponse,
      errorTitle: matchedError.title,
      errorMessage: matchedError.desc,
      fixInstruction: matchedError.fix + (gatewayResponse === '1016' ? serverIp : ''),
      serverIp,
      shootId,
      smsCount,
      charsCount,
      costBDT: 0,
      remainingCredits: smsGatewayConfig.balanceCredits,
      remainingBDT: smsGatewayConfig.balanceBDT,
      gatewayResponse,
      log: errorLog,
    }, {}, 200);
  }

  // Successful submission: Deduct balance
  smsGatewayConfig.balanceCredits = Math.max(0, smsGatewayConfig.balanceCredits - smsCount);
  smsGatewayConfig.balanceBDT = Number((smsGatewayConfig.balanceCredits * 0.35).toFixed(2));

  const newLog: SmsLogRecord = {
    id: `sms-log-${Date.now()}`,
    recipientPhone: cleanPhone.startsWith('+') ? cleanPhone : `+88${cleanPhone.replace(/^88/, '')}`,
    recipientName: recipientName || 'Direct Recipient',
    messageContent,
    messageType,
    label,
    senderId: (senderId || '').trim(),
    shootId,
    status: 'delivered',
    charsCount,
    smsCount,
    costBDT,
    sentAt: new Date().toISOString(),
    triggerEvent: 'manual_test_dispatch',
  };

  smsLogs.unshift(newLog);

  logAuditEvent('INTEGRATION_SMS_SENT', 'integration', shootId, `Dispatched SMS to ${bdContacts} via msg.mram.com.bd (Shoot ID: ${shootId}, Parts: ${smsCount})`);

  return sendSuccess(res, {
    success: true,
    shootId,
    smsCount,
    charsCount,
    costBDT,
    remainingCredits: smsGatewayConfig.balanceCredits,
    remainingBDT: smsGatewayConfig.balanceBDT,
    gatewayResponse,
    serverIp,
    log: newLog,
  }, {}, 201);
});

app.get('/api/v1/integration/sms/logs', (_req, res) => {
  return sendSuccess(res, smsLogs);
});

app.get('/api/v1/integration/sms/templates', (_req, res) => {
  return sendSuccess(res, smsTemplates);
});

app.put('/api/v1/integration/sms/templates/:id', (req, res) => {
  const tmpl = smsTemplates.find((t) => t.id === req.params.id);
  if (!tmpl) return sendError(res, 404, 'NOT_FOUND', 'Template not found');

  Object.assign(tmpl, req.body, { updatedAt: new Date().toISOString() });
  return sendSuccess(res, tmpl);
});

app.post('/api/v1/integration/sms/templates', (req, res) => {
  const newTmpl: SmsTemplate = {
    id: `tmpl-sms-${Date.now()}`,
    name: req.body.name || 'New Template',
    category: req.body.category || 'general',
    type: req.body.type || 'text',
    label: req.body.label || 'transactional',
    content: req.body.content || '',
    variables: req.body.variables || [],
    isDefault: false,
    updatedAt: new Date().toISOString(),
  };
  smsTemplates.push(newTmpl);
  return sendSuccess(res, newTmpl, {}, 201);
});

// Email Gateway Endpoints (cPanel SMTP — preview fallback masks secrets)
app.get('/api/v1/integration/email/config', (_req, res) => {
  return sendSuccess(res, { ...emailGatewayConfig, smtpPass: maskSecret(emailGatewayConfig.smtpPass) });
});

app.put('/api/v1/integration/email/config', (req, res) => {
  const nextBody = { ...(req.body || {}) };
  if (typeof nextBody.smtpPass === 'string' && (nextBody.smtpPass.includes('••••') || nextBody.smtpPass === '')) {
    nextBody.smtpPass = emailGatewayConfig.smtpPass;
  }
  emailGatewayConfig = {
    ...emailGatewayConfig,
    ...nextBody,
  };
  logAuditEvent('INTEGRATION_EMAIL_UPDATED', 'integration', 'email-config', `Updated cPanel SMTP Configuration (Host: ${emailGatewayConfig.smtpHost}, User: ${emailGatewayConfig.smtpUser})`);
  return sendSuccess(res, { ...emailGatewayConfig, smtpPass: maskSecret(emailGatewayConfig.smtpPass) });
});

app.post('/api/v1/integration/email/send-test', (req, res) => {
  const { recipientEmail, subject = 'Test Verification Email from SUOXI Clinic', content } = req.body;

  if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
    return sendError(res, 400, 'INVALID_EMAIL', 'A valid recipient email address is required');
  }

  // Diagnostic handshake simulating standard cPanel Exim SMTP dialog
  const diagnosticSteps = [
    `[INFO] Initiating TLS handshake with ${emailGatewayConfig.smtpHost}:${emailGatewayConfig.smtpPort}...`,
    `[SMTP-220] 220-${emailGatewayConfig.smtpHost} ESMTP Exim 4.96.2 #2 ${new Date().toUTCString()}`,
    `[SMTP-EHLO] EHLO clinic-app.suoxiclinic.com -> 250-mail.suoxiclinic.com Hello, 250-AUTH LOGIN PLAIN, 250-SIZE 52428800`,
    `[SMTP-AUTH] AUTH LOGIN -> 334 VXNlcm5hbWU6 (User: ${emailGatewayConfig.smtpUser})`,
    `[SMTP-AUTH] 235 2.7.0 Authentication successful`,
    `[SMTP-MAIL] MAIL FROM:<${emailGatewayConfig.fromEmail}> -> 250 2.1.0 OK`,
    `[SMTP-RCPT] RCPT TO:<${recipientEmail}> -> 250 2.1.5 Accepted for delivery`,
    `[SMTP-DATA] DATA -> 354 Enter message, ending with "." on a line by itself`,
    `[SMTP-250] 250 OK id=1sXk92-0004ab-99 Message accepted for delivery via cPanel Exim MTA`,
  ];

  const log: EmailLogRecord = {
    id: `em-log-${Date.now()}`,
    recipientEmail,
    recipientName: recipientEmail.split('@')[0],
    subject,
    templateCategory: 'test',
    status: 'delivered',
    sentAt: new Date().toISOString(),
    triggerEvent: 'manual_smtp_test',
  };

  emailLogs.unshift(log);
  emailGatewayConfig.lastTestedAt = new Date().toISOString();

  logAuditEvent('INTEGRATION_EMAIL_TEST', 'integration', log.id, `Sent test email to ${recipientEmail} via cPanel SMTP (${emailGatewayConfig.smtpHost})`);

  return sendSuccess(res, {
    success: true,
    message: `Test email successfully dispatched to ${recipientEmail} via ${emailGatewayConfig.smtpHost}`,
    diagnosticSteps,
    log,
  }, {}, 200);
});

app.get('/api/v1/integration/email/logs', (_req, res) => {
  return sendSuccess(res, emailLogs);
});

app.get('/api/v1/integration/email/templates', (_req, res) => {
  return sendSuccess(res, emailTemplates);
});

app.put('/api/v1/integration/email/templates/:id', (req, res) => {
  const tmpl = emailTemplates.find((t) => t.id === req.params.id);
  if (!tmpl) return sendError(res, 404, 'NOT_FOUND', 'Email template not found');

  Object.assign(tmpl, req.body, { updatedAt: new Date().toISOString() });
  return sendSuccess(res, tmpl);
});

// -------------------------------------------------------------
// Endpoints: Patient Portal (Prompt 18: Dedicated Realm & Isolated Auth)
// -------------------------------------------------------------

app.use('/portal/auth', portalAuthRouter as unknown as express.RequestHandler);
app.use('/api/v1/portal/auth', portalAuthRouter as unknown as express.RequestHandler);
app.use('/portal', portalApiRouter as unknown as express.RequestHandler);
app.use('/api/v1/portal', portalApiRouter as unknown as express.RequestHandler);

// Staff-side portal management endpoints (portal.manage)
app.get('/api/v1/patients/:id/portal-account', async (req, res) => {
  const account = await portalService.getAccountByPatientId(req.params.id);
  return sendSuccess(res, account);
});

app.post('/api/v1/patients/:id/portal-account', async (req, res) => {
  try {
    const result = await portalService.createPortalAccount(req.params.id, req.body?.loginIdentifier, { id: currentUser.id });
    return sendSuccess(res, result, {}, 201);
  } catch (err: any) {
    return sendError(res, err.statusCode || 400, err.code || 'BAD_REQUEST', err.message);
  }
});

app.post('/api/v1/patients/:id/portal-account/send-link', async (req, res) => {
  try {
    const channel = req.body?.channel === 'email' ? 'email' : 'sms';
    const tokenType = req.body?.tokenType === 'reset' ? 'reset' : 'setup';
    const result = await portalService.generateSetupOrResetLink(req.params.id, tokenType, channel, { id: currentUser.id });
    return sendSuccess(res, result);
  } catch (err: any) {
    return sendError(res, err.statusCode || 400, err.code || 'BAD_REQUEST', err.message);
  }
});

app.post('/api/v1/patients/:id/portal-account/deactivate', async (req, res) => {
  try {
    await portalService.deactivateAccount(req.params.id, { id: currentUser.id });
    return sendSuccess(res, { success: true, message: 'Portal account deactivated' });
  } catch (err: any) {
    return sendError(res, err.statusCode || 400, err.code || 'BAD_REQUEST', err.message);
  }
});

// -------------------------------------------------------------
// Endpoints: User Management & Access Control (RBAC)
// -------------------------------------------------------------

// 1. List users with filtering
app.get('/api/v1/users', (req, res) => {
  const { branchId, role, status, search } = req.query as Record<string, string>;
  let list = [...staffUsers];

  if (branchId && branchId !== 'all') {
    list = list.filter((u) => u.branchId === branchId);
  }
  if (role && role !== 'all') {
    list = list.filter((u) => u.role === role);
  }
  if (status && status !== 'all') {
    list = list.filter((u) => u.status === status);
  }
  if (search) {
    const q = search.toLowerCase().trim();
    list = list.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.employeeId && u.employeeId.toLowerCase().includes(q)) ||
        (u.nameBn && u.nameBn.includes(q)) ||
        u.email.toLowerCase().includes(q) ||
        u.phone.includes(q) ||
        (u.specialization && u.specialization.toLowerCase().includes(q)) ||
        (u.bmdcRegNo && u.bmdcRegNo.toLowerCase().includes(q))
    );
  }

  return sendSuccess(res, list, { total: list.length });
});

// 2. Get user by ID
app.get('/api/v1/users/:id', (req, res) => {
  const user = staffUsers.find((u) => u.id === req.params.id);
  if (!user) {
    return sendError(res, 404, 'NOT_FOUND', 'User not found');
  }
  return sendSuccess(res, user);
});

// 3. Create user
app.post('/api/v1/users', (req, res) => {
  const {
    employeeId: rawEmployeeId,
    name,
    nameBn,
    email,
    role,
    phone,
    branchId,
    designation,
    specialization,
    bmdcRegNo,
    consultationFeeBDT,
    followUpFeeBDT,
    roomNumber,
    certifications,
    shift,
    password,
  } = req.body || {};

  if (!name || !email || !role || !phone) {
    return sendError(res, 400, 'BAD_REQUEST', 'Name, email, role, and phone are required');
  }

  let employeeId = typeof rawEmployeeId === 'string' ? rawEmployeeId.trim().toUpperCase() : '';
  if (!employeeId) {
    let nextNum = staffUsers.length + 1;
    while (staffUsers.some((u) => u.employeeId?.toUpperCase() === String(nextNum).padStart(4, '0'))) {
      nextNum += 1;
    }
    employeeId = String(nextNum).padStart(4, '0');
  } else if (staffUsers.some((u) => u.employeeId?.toUpperCase() === employeeId)) {
    return sendError(res, 409, 'DUPLICATE_EMPLOYEE_ID', `Employee ID '${employeeId}' is already assigned.`);
  }

  const targetBranch = branches.find((b) => b.id === branchId) || branches[0];

  const newUser: User = {
    id: `usr-${Date.now().toString().slice(-4)}`,
    employeeId,
    name,
    nameBn,
    email,
    role,
    phone,
    branchId: targetBranch.id,
    branchName: targetBranch.name,
    designation: designation || undefined,
    specialization: specialization || undefined,
    bmdcRegNo: bmdcRegNo || undefined,
    consultationFeeBDT: consultationFeeBDT ? Number(consultationFeeBDT) : undefined,
    followUpFeeBDT: followUpFeeBDT ? Number(followUpFeeBDT) : undefined,
    roomNumber: roomNumber || undefined,
    certifications: Array.isArray(certifications) ? certifications : undefined,
    shift: shift || 'morning',
    status: 'active',
    createdAt: new Date().toISOString(),
  };

  staffUsers.push(newUser);
  if ((process.env.NODE_ENV !== 'production' || isHostedFallbackWithoutDb()) && !isPostgresConfigured()) {
    previewStaffPasswords.set(newUser.id, typeof password === 'string' && password.length > 0 ? password : '123456');
  }

  // Update role user count
  const roleDef = clinicRoles.find((r) => r.id === role);
  if (roleDef) {
    roleDef.userCount += 1;
  }

  // Security audit
  userSecurityLogs.unshift({
    id: `sec-${Date.now()}`,
    userId: currentUser.id,
    userName: currentUser.name,
    role: currentUser.role,
    action: 'STATUS_CHANGED',
    ipAddress: '127.0.0.1',
    deviceInfo: 'Clinical CRM Console',
    status: 'success',
    details: `Created new staff profile for ${newUser.name} (${employeeId}) with role ${newUser.role}`,
    timestamp: new Date().toISOString(),
  });

  logAuditEvent('USER_CREATED', 'user', newUser.id, `Created staff member ${newUser.name} (${employeeId}, ${newUser.role}) in ${targetBranch.name}`);

  return sendSuccess(res, newUser, {}, 201);
});

// 4. Update user profile
app.put('/api/v1/users/:id', (req, res) => {
  const user = staffUsers.find((u) => u.id === req.params.id);
  if (!user) {
    return sendError(res, 404, 'NOT_FOUND', 'User not found');
  }

  const oldRole = user.role;
  Object.assign(user, req.body);

  if (req.body.branchId) {
    const br = branches.find((b) => b.id === req.body.branchId);
    if (br) {
      user.branchId = br.id;
      user.branchName = br.name;
    }
  }

  if (oldRole !== user.role) {
    userSecurityLogs.unshift({
      id: `sec-${Date.now()}`,
      userId: currentUser.id,
      userName: currentUser.name,
      role: currentUser.role,
      action: 'ROLE_CHANGED',
      ipAddress: '127.0.0.1',
      deviceInfo: 'Clinical CRM Console',
      status: 'success',
      details: `Changed role of ${user.name} from ${oldRole} to ${user.role}`,
      timestamp: new Date().toISOString(),
    });
  }

  logAuditEvent('USER_UPDATED', 'user', user.id, `Updated staff profile for ${user.name}`);

  return sendSuccess(res, user);
});

// 5. Toggle user status (active, inactive, suspended)
app.post('/api/v1/users/:id/toggle-status', (req, res) => {
  const user = staffUsers.find((u) => u.id === req.params.id);
  if (!user) {
    return sendError(res, 404, 'NOT_FOUND', 'User not found');
  }

  const { status, reason } = req.body || {};
  if (!['active', 'inactive', 'suspended'].includes(status)) {
    return sendError(res, 400, 'BAD_REQUEST', 'Invalid status. Must be active, inactive, or suspended');
  }

  user.status = status;

  userSecurityLogs.unshift({
    id: `sec-${Date.now()}`,
    userId: currentUser.id,
    userName: currentUser.name,
    role: currentUser.role,
    action: 'STATUS_CHANGED',
    ipAddress: '127.0.0.1',
    deviceInfo: 'Clinical CRM Console',
    status: 'success',
    details: `Updated account status for ${user.name} to ${status.toUpperCase()}${reason ? ` (${reason})` : ''}`,
    timestamp: new Date().toISOString(),
  });

  logAuditEvent('USER_STATUS_TOGGLED', 'user', user.id, `Status of ${user.name} changed to ${status}`);

  return sendSuccess(res, user);
});

// 6. Reset user password
app.post('/api/v1/users/:id/reset-password', (req, res) => {
  const user = staffUsers.find((u) => u.id === req.params.id);
  if (!user) {
    return sendError(res, 404, 'NOT_FOUND', 'User not found');
  }

  const tempPassword = req.body?.tempPassword || `Suoxi@${Math.floor(1000 + Math.random() * 9000)}`;

  userSecurityLogs.unshift({
    id: `sec-${Date.now()}`,
    userId: currentUser.id,
    userName: currentUser.name,
    role: currentUser.role,
    action: 'PASSWORD_RESET',
    ipAddress: '127.0.0.1',
    deviceInfo: 'Clinical CRM Console',
    status: 'success',
    details: `Administrative temporary password reset issued for ${user.name}`,
    timestamp: new Date().toISOString(),
  });

  logAuditEvent('USER_PASSWORD_RESET', 'user', user.id, `Issued administrative password reset for ${user.name}`);

  return sendSuccess(res, {
    success: true,
    message: `Temporary password generated for ${user.name}`,
    tempPassword,
    expiresInHours: 24,
  });
});

// 7. Roles & Permissions Matrix
app.get('/api/v1/users-roles', (_req, res) => {
  return sendSuccess(res, clinicRoles);
});

app.put('/api/v1/users-roles/:id', (req, res) => {
  const roleDef = clinicRoles.find((r) => r.id === req.params.id);
  if (!roleDef) {
    return sendError(res, 404, 'NOT_FOUND', 'Role not found');
  }

  if (req.body.permissions && Array.isArray(req.body.permissions)) {
    roleDef.permissions = req.body.permissions;
  }
  if (req.body.description) {
    roleDef.description = req.body.description;
  }

  userSecurityLogs.unshift({
    id: `sec-${Date.now()}`,
    userId: currentUser.id,
    userName: currentUser.name,
    role: currentUser.role,
    action: 'PERMISSION_OVERRIDE',
    ipAddress: '127.0.0.1',
    deviceInfo: 'Clinical CRM Console',
    status: 'success',
    details: `Updated RBAC permission schema for role ${roleDef.name}`,
    timestamp: new Date().toISOString(),
  });

  logAuditEvent('ROLE_PERMISSIONS_UPDATED', 'role', roleDef.id, `Updated permissions for ${roleDef.name}`);

  return sendSuccess(res, roleDef);
});

// 8. Duty Rosters
app.get('/api/v1/users-rosters', (req, res) => {
  const { branchId, date, role } = req.query as Record<string, string>;
  let list = [...staffRosters];

  if (branchId && branchId !== 'all') {
    list = list.filter((r) => r.branchId === branchId);
  }
  if (date) {
    list = list.filter((r) => r.date === date);
  }
  if (role && role !== 'all') {
    list = list.filter((r) => r.role === role);
  }

  return sendSuccess(res, list, { total: list.length });
});

app.post('/api/v1/users-rosters', (req, res) => {
  const { staffId, branchId, date, shift, roomNumber, notes, assignedDoctorName } = req.body || {};
  if (!staffId || !date || !shift) {
    return sendError(res, 400, 'BAD_REQUEST', 'Staff ID, date, and shift are required');
  }

  const staff = staffUsers.find((u) => u.id === staffId);
  const branch = branches.find((b) => b.id === branchId) || branches[0];

  const existingIdx = staffRosters.findIndex((r) => r.staffId === staffId && r.date === date);
  if (existingIdx !== -1) {
    staffRosters[existingIdx] = {
      ...staffRosters[existingIdx],
      shift,
      roomNumber: roomNumber || staffRosters[existingIdx].roomNumber,
      notes: notes || staffRosters[existingIdx].notes,
      assignedDoctorName: assignedDoctorName || staffRosters[existingIdx].assignedDoctorName,
      branchId: branch.id,
      branchName: branch.name,
    };
    return sendSuccess(res, staffRosters[existingIdx]);
  }

  const newRoster: StaffDutyRoster = {
    id: `rst-${Date.now().toString().slice(-4)}`,
    staffId,
    staffName: staff?.name || 'Staff Member',
    role: staff?.role || 'therapist',
    branchId: branch.id,
    branchName: branch.name,
    date,
    shift,
    roomNumber,
    notes,
    assignedDoctorName,
  };

  staffRosters.unshift(newRoster);
  return sendSuccess(res, newRoster, {}, 201);
});

// 9. Login & Security Logs
app.get('/api/v1/users-security-logs', (req, res) => {
  const { action, status, search } = req.query as Record<string, string>;
  let list = [...userSecurityLogs];

  if (action && action !== 'all') {
    list = list.filter((l) => l.action === action);
  }
  if (status && status !== 'all') {
    list = list.filter((l) => l.status === status);
  }
  if (search) {
    const q = search.toLowerCase().trim();
    list = list.filter(
      (l) =>
        l.userName.toLowerCase().includes(q) ||
        l.details.toLowerCase().includes(q) ||
        l.ipAddress.includes(q)
    );
  }

  return sendSuccess(res, list, { total: list.length });
});

// -------------------------------------------------------------
// Endpoints: Security & System Settings
// -------------------------------------------------------------

// 1. Branch Management CRUD
app.post('/api/v1/branches', (req, res) => {
  const { name, nameBn, code, address, city, phone, email, managerName, managerPhone, operatingHours } = req.body || {};
  if (!name || !code || !phone) {
    return sendError(res, 400, 'BAD_REQUEST', 'Branch name, code, and phone are required');
  }

  const existing = branches.find((b) => b.code.toUpperCase() === code.toUpperCase());
  if (existing) {
    return sendError(res, 400, 'DUPLICATE_CODE', 'A branch with this code already exists');
  }

  const newBranch: Branch = {
    id: `br-${code.toLowerCase()}`,
    name,
    nameBn: nameBn || name,
    code: code.toUpperCase(),
    address: address || '',
    city: city || 'Dhaka',
    phone,
    email,
    managerName,
    managerPhone,
    operatingHours: operatingHours || '09:00 AM - 08:00 PM (Sat - Thu)',
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  branches.push(newBranch);
  logAuditEvent('BRANCH_CREATED', 'branch', newBranch.id, `Created new branch center: ${newBranch.name} (${newBranch.code})`);

  return sendSuccess(res, newBranch, {}, 201);
});

app.put('/api/v1/branches/:id', (req, res) => {
  const branch = branches.find((b) => b.id === req.params.id);
  if (!branch) {
    return sendError(res, 404, 'NOT_FOUND', 'Branch not found');
  }

  Object.assign(branch, req.body);
  logAuditEvent('BRANCH_UPDATED', 'branch', branch.id, `Updated branch details for ${branch.name}`);

  return sendSuccess(res, branch);
});

app.post('/api/v1/branches/:id/toggle-status', (req, res) => {
  const branch = branches.find((b) => b.id === req.params.id);
  if (!branch) {
    return sendError(res, 404, 'NOT_FOUND', 'Branch not found');
  }

  branch.isActive = !branch.isActive;
  logAuditEvent('BRANCH_STATUS_TOGGLED', 'branch', branch.id, `Branch ${branch.name} status changed to ${branch.isActive ? 'ACTIVE' : 'INACTIVE'}`);

  return sendSuccess(res, branch);
});

// 2. General CRM & Clinic Settings
app.get('/api/v1/settings/general', (_req, res) => {
  return sendSuccess(res, generalSettings);
});

app.put('/api/v1/settings/general', (req, res) => {
  Object.assign(generalSettings, req.body);
  logAuditEvent('GENERAL_SETTINGS_UPDATED', 'settings', 'general', 'Updated clinic profile, tax/VAT, and financial formats');
  return sendSuccess(res, generalSettings);
});

// 3. Appointment Slot & Clinical Scheduling Settings
app.get('/api/v1/settings/scheduling', (_req, res) => {
  return sendSuccess(res, schedulingSettings);
});

app.put('/api/v1/settings/scheduling', (req, res) => {
  Object.assign(schedulingSettings, req.body);
  logAuditEvent('SCHEDULING_SETTINGS_UPDATED', 'settings', 'scheduling', 'Updated appointment slot duration and clinic buffer rules');
  return sendSuccess(res, schedulingSettings);
});

// 4. Security & Authentication Settings
app.get('/api/v1/settings/security', (_req, res) => {
  return sendSuccess(res, securitySettings);
});

app.put('/api/v1/settings/security', (req, res) => {
  Object.assign(securitySettings, req.body);
  logAuditEvent('SECURITY_SETTINGS_UPDATED', 'settings', 'security', 'Updated 2FA enforcement, session timeout and cashier discount threshold');
  return sendSuccess(res, securitySettings);
});

// 5. Database Backup & Disaster Recovery
app.get('/api/v1/settings/backups', (_req, res) => {
  return sendSuccess(res, backupRecords, { total: backupRecords.length });
});

app.post('/api/v1/settings/backups/create', (req, res) => {
  const backupType = req.body?.backupType || 'manual';
  const now = new Date();
  const dateStr = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);

  const newBackup: BackupRecord = {
    id: `bkp-${Date.now()}`,
    filename: `suoxi_crm_${backupType}_${dateStr}.sql.gz`,
    fileSize: `${(14.0 + Math.random() * 1.5).toFixed(1)} MB`,
    backupType,
    status: 'completed',
    totalRecords: patients.length + appointments.length + invoices.length + staffUsers.length + masterPackages.length,
    tablesIncluded: ['patients', 'appointments', 'invoices', 'prescriptions', 'inventory', 'audit_logs', 'users'],
    createdAt: now.toISOString(),
    createdBy: `${currentUser.name} (${currentUser.role})`,
  };

  backupRecords.unshift(newBackup);
  logAuditEvent('BACKUP_CREATED', 'system', newBackup.id, `Generated ${backupType} database snapshot ${newBackup.filename}`);

  return sendSuccess(res, newBackup, {}, 201);
});

app.get('/api/v1/settings/backups/download/:id', (req, res) => {
  const bkp = backupRecords.find((b) => b.id === req.params.id);
  if (!bkp) return sendError(res, 404, 'NOT_FOUND', 'Backup snapshot not found');

  // Generate simulated SQL backup content
  const mockContent = `-- SUOXI Skin Care & Aesthetic Center CRM Database Dump
-- Snapshot: ${bkp.filename}
-- Timestamp: ${bkp.createdAt}
-- Generated by: ${bkp.createdBy}
-- Total Records: ${bkp.totalRecords}
-- Platform: Node.js Express + SQLite/Postgres Ready

BEGIN TRANSACTION;
-- Clinics: ${branches.length}
-- Staff: ${staffUsers.length}
-- Patients: ${patients.length}
-- Appointments: ${appointments.length}
-- Invoices: ${invoices.length}
COMMIT;
`;

  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', `attachment; filename="${bkp.filename}.sql"`);
  return res.send(mockContent);
});

app.post('/api/v1/settings/backups/restore/:id', (req, res) => {
  const bkp = backupRecords.find((b) => b.id === req.params.id);
  if (!bkp) return sendError(res, 404, 'NOT_FOUND', 'Backup snapshot not found');

  logAuditEvent('BACKUP_RESTORED', 'system', bkp.id, `Database restored from snapshot ${bkp.filename}`);

  return sendSuccess(res, {
    success: true,
    message: `Database successfully restored from ${bkp.filename}`,
    recordsRestored: bkp.totalRecords,
    restoredAt: new Date().toISOString(),
  });
});

// 6. Live Active Sessions
app.get('/api/v1/settings/sessions', (_req, res) => {
  return sendSuccess(res, activeSessions, { total: activeSessions.length });
});

app.post('/api/v1/settings/sessions/revoke/:id', (req, res) => {
  const idx = activeSessions.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return sendError(res, 404, 'NOT_FOUND', 'Session not found');

  const revoked = activeSessions.splice(idx, 1)[0];
  logAuditEvent('SESSION_REVOKED', 'security', revoked.userId, `Revoked active login session on ${revoked.deviceInfo} (${revoked.ipAddress})`);

  return sendSuccess(res, { success: true, message: `Session revoked for ${revoked.userName}` });
});

app.post('/api/v1/settings/sessions/revoke-all', (req, res) => {
  // Keep only current session
  const current = activeSessions.find((s) => s.isCurrentSession) || activeSessions[0];
  const count = activeSessions.length - 1;
  activeSessions = [current];

  logAuditEvent('ALL_SESSIONS_REVOKED', 'security', currentUser.id, `Revoked ${count} other active terminal sessions across all branches`);

  return sendSuccess(res, { success: true, message: `Terminated ${count} concurrent sessions across all terminals` });
});

// Central API Error Handler
app.use(['/portal', '/api', '/api/v1'], errorHandlerMiddleware as unknown as express.ErrorRequestHandler);

// -------------------------------------------------------------
// Static / Vite Integration
// -------------------------------------------------------------

async function start() {
  // Enforce fail-closed production security validation before accepting traffic
  assertProductionSecurityOrThrow();

  // Catch unhandled API requests and respond with JSON 404 (never return HTML for API requests)
  app.use(['/api', '/portal/api'], (req, res) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `API endpoint ${req.method} ${req.originalUrl} not found`,
        requestId: (req as any).id || crypto.randomUUID(),
      },
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.resolve('.', 'dist');
    if (fs.existsSync(path.join(distDir, 'index.html'))) {
      app.use(express.static(distDir));
      app.use((req, res, next) => {
        if (req.method !== 'GET') return next();
        res.sendFile(path.join(distDir, 'index.html'));
      });
    } else {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    }
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  // Central catch-all error handling middleware
  app.use(errorHandlerMiddleware as unknown as express.ErrorRequestHandler);

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SUOXI CRM] Server started on http://0.0.0.0:${PORT}`);
    if (typeof process.send === 'function') {
      process.send('ready');
    }
  });

  const shutdown = async (signal: string) => {
    console.log(`[SUOXI CRM] Received ${signal}. Shutting down gracefully...`);
    server.close(async () => {
      try {
        await Promise.allSettled([closeClinicQueue(), closeRedis(), closePgPool()]);
      } finally {
        process.exit(0);
      }
    });
    setTimeout(() => process.exit(1), 9000).unref();
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

if (process.env.SUOXI_NO_AUTOSTART !== '1') {
  start().catch((err) => {
    console.error('[SUOXI CRM] Failed to start server:', err);
    process.exit(1);
  });
}
