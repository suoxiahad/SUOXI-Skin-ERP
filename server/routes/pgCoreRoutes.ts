/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * Phase 2 PostgreSQL Core Clinical & Financial Express Router
 *
 * Covers:
 *  - Branches & Staff Users / Roles / Duty Rosters / Security Logs
 *  - Patients & Medical Documents
 *  - Appointments (List, Detail, Create, Update, Status, Cancel, Reschedule)
 *  - Doctor Consultations, Prescriptions (Frozen Lifestyle Snapshot) & Rx Protocols
 *  - Treatment Packages, Package Installments & Non-Duplicate Session Deductions (ACID)
 *  - Billing Invoices, Derived Payments, Voiding & Daily Closing Reports (ACID)
 *
 * Automatically activates when `DATABASE_URL` (postgresql://...) is configured.
 * Falls through transparently via `next()` when running in prototype preview mode.
 */

import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { User } from '../../src/types/index.ts';
import {
  canUserAccessBranch,
  requireRoles,
  resolveAuthorizedBranchScope,
} from '../auth/rbacMiddleware.ts';
import { isPostgresConfigured } from '../db/pgPool.ts';
import { pgBillingPackageRepo } from '../repositories/pgBillingPackageRepo.ts';
import {
  extractClientIp,
  isDoctorOrAdmin,
  sendPgError,
  sendPgSuccess,
} from '../repositories/pgHelpers.ts';
import { pgOrgRepo } from '../repositories/pgOrgRepo.ts';
import { pgPatientClinicalRepo } from '../repositories/pgPatientClinicalRepo.ts';

export interface PgCoreRouterDeps {
  getCurrentUser: () => User;
  checkIdempotency: (req: Request, res: Response, next: NextFunction) => void;
  saveIdempotency: (key: string | undefined, statusCode: number, body: unknown) => void;
}

function handlePgRouteError(res: Response, err: unknown, fallbackMessage: string) {
  const e = err as Error & { statusCode?: number; code?: string; details?: unknown };
  const status = e.statusCode || (e.code === '23505' ? 409 : 500);
  const code =
    e.code && !/^\d+$/.test(e.code)
      ? e.code
      : status === 404
      ? 'NOT_FOUND'
      : status === 409
      ? 'CONFLICT'
      : status === 422
      ? 'UNPROCESSABLE_ENTITY'
      : status === 402
      ? 'PAYMENT_REQUIRED'
      : status === 400
      ? 'BAD_REQUEST'
      : 'INTERNAL_ERROR';
  return sendPgError(res, status, code, e.message || fallbackMessage, e.details);
}

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
  category: z
    .enum([
      'Pigmentation & Melasma',
      'Acne & Sebum',
      'Laser & Scar Recovery',
      'Hair & PRP',
      'Anti-Aging & Glow',
      'General Dermatology',
    ])
    .default('General Dermatology'),
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

export function createPgCoreRouter(deps: PgCoreRouterDeps): express.Router {
  const router = express.Router();

  // Only intercept when PostgreSQL is configured
  router.use((_req, _res, next) => {
    if (!isPostgresConfigured()) {
      return next('router');
    }
    return next();
  });

  // ---------------------------------------------------------------------------
  // 1. Branches
  // ---------------------------------------------------------------------------
  router.get('/api/v1/branches', async (req, res) => {
    try {
      const activeOnly = req.query.activeOnly === 'true' || req.query.status === 'active';
      const list = await pgOrgRepo.listBranches({ activeOnly });
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load branches');
    }
  });

  router.get('/api/v1/branches/:id', async (req, res) => {
    try {
      const branch = await pgOrgRepo.getBranchById(String(req.params.id));
      if (!branch) return sendPgError(res, 404, 'NOT_FOUND', 'Branch not found');
      return sendPgSuccess(res, branch);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load branch');
    }
  });

  const adminOnly = requireRoles(['super_admin', 'admin_manager'], deps.getCurrentUser);
  const billingRoles = requireRoles(['super_admin', 'admin_manager', 'cashier', 'receptionist'], deps.getCurrentUser);
  const clinicalRoles = requireRoles(['super_admin', 'admin_manager', 'doctor', 'therapist'], deps.getCurrentUser);

  const createBranchSchema = z.object({
    id: z.string().trim().min(2).max(80).optional(),
    organizationId: z.string().trim().optional(),
    name: z.string().trim().min(2, 'Branch name is required'),
    nameBn: z.string().trim().optional(),
    code: z.string().trim().min(2, 'Branch code is required').max(20),
    address: z.string().trim().optional(),
    city: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    email: z.string().trim().email('Invalid branch email').optional().or(z.literal('')).nullable(),
    managerName: z.string().trim().optional().nullable(),
    managerPhone: z.string().trim().optional().nullable(),
    operatingHours: z.string().trim().optional().nullable(),
    isActive: z.boolean().optional(),
  });

  router.post('/api/v1/branches', adminOnly, async (req, res) => {
    try {
      const parsed = createBranchSchema.safeParse(req.body || {});
      if (!parsed.success) {
        return sendPgError(
          res,
          400,
          'BAD_REQUEST',
          parsed.error.issues[0]?.message || 'Branch name and code are required',
          parsed.error.format()
        );
      }
      const created = await pgOrgRepo.createBranch(
        parsed.data,
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to create branch');
    }
  });

  const handleUpdateBranch = async (req: Request, res: Response) => {
    try {
      const updated = await pgOrgRepo.updateBranch(
        String(req.params.id),
        req.body || {},
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      if (!updated) return sendPgError(res, 404, 'NOT_FOUND', 'Branch not found');
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to update branch');
    }
  };

  router.put('/api/v1/branches/:id', adminOnly, handleUpdateBranch);
  router.patch('/api/v1/branches/:id', adminOnly, handleUpdateBranch);

  router.post('/api/v1/branches/:id/toggle-status', adminOnly, async (req, res) => {
    try {
      const updated = await pgOrgRepo.toggleBranchStatus(
        String(req.params.id),
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      if (!updated) return sendPgError(res, 404, 'NOT_FOUND', 'Branch not found');
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to toggle branch status');
    }
  });

  router.post('/api/v1/branches/:id/activate', adminOnly, async (req, res) => {
    try {
      const updated = await pgOrgRepo.setBranchStatus(
        String(req.params.id),
        true,
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      if (!updated) return sendPgError(res, 404, 'NOT_FOUND', 'Branch not found');
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to activate branch');
    }
  });

  router.post('/api/v1/branches/:id/deactivate', adminOnly, async (req, res) => {
    try {
      const updated = await pgOrgRepo.setBranchStatus(
        String(req.params.id),
        false,
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      if (!updated) return sendPgError(res, 404, 'NOT_FOUND', 'Branch not found');
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to deactivate branch');
    }
  });

  router.patch('/api/v1/branches/:id/status', adminOnly, async (req, res) => {
    try {
      if (typeof req.body?.isActive !== 'boolean') {
        return sendPgError(res, 400, 'BAD_REQUEST', 'isActive boolean is required');
      }
      const updated = await pgOrgRepo.setBranchStatus(
        String(req.params.id),
        req.body.isActive,
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      if (!updated) return sendPgError(res, 404, 'NOT_FOUND', 'Branch not found');
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to update branch status');
    }
  });

  // ---------------------------------------------------------------------------
  // 2. Users, Roles, Duty Rosters & Security Logs
  // ---------------------------------------------------------------------------
  router.get('/api/v1/users', async (req, res) => {
    try {
      const { branchId, role, status, search } = req.query as Record<string, string>;
      const list = await pgOrgRepo.listUsers({ branchId, role, status, search });
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load users');
    }
  });

  router.get('/api/v1/users/:id', async (req, res) => {
    try {
      const user = await pgOrgRepo.getUserById(String(req.params.id));
      if (!user) return sendPgError(res, 404, 'NOT_FOUND', 'User not found');
      return sendPgSuccess(res, user);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to fetch user');
    }
  });

  router.post('/api/v1/users', adminOnly, async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.name || !body.email || !body.role || !body.phone) {
        return sendPgError(res, 400, 'BAD_REQUEST', 'Name, email, role, and phone are required');
      }
      const created = await pgOrgRepo.createUser(body, deps.getCurrentUser(), extractClientIp(req.headers));
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to create user');
    }
  });

  router.put('/api/v1/users/:id', adminOnly, async (req, res) => {
    try {
      const updated = await pgOrgRepo.updateUser(
        String(req.params.id),
        req.body || {},
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      if (!updated) return sendPgError(res, 404, 'NOT_FOUND', 'User not found');
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to update user');
    }
  });

  router.post('/api/v1/users/:id/toggle-status', adminOnly, async (req, res) => {
    try {
      const { status, reason } = req.body || {};
      if (!['active', 'inactive', 'suspended'].includes(status)) {
        return sendPgError(res, 400, 'BAD_REQUEST', 'Invalid status. Must be active, inactive, or suspended');
      }
      const updated = await pgOrgRepo.toggleUserStatus(
        String(req.params.id),
        status,
        reason,
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      if (!updated) return sendPgError(res, 404, 'NOT_FOUND', 'User not found');
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to update user status');
    }
  });

  router.post('/api/v1/users/:id/reset-password', adminOnly, async (req, res) => {
    try {
      const result = await pgOrgRepo.resetUserPassword(
        String(req.params.id),
        req.body?.tempPassword,
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      if (!result) return sendPgError(res, 404, 'NOT_FOUND', 'User not found');
      return sendPgSuccess(res, {
        success: true,
        message: `Temporary password generated for ${result.user.name}`,
        tempPassword: result.tempPassword,
        expiresInHours: 24,
      });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to reset user password');
    }
  });

  router.get('/api/v1/users-roles', adminOnly, async (_req, res) => {
    try {
      const roles = await pgOrgRepo.listRoles();
      return sendPgSuccess(res, roles);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load clinic roles');
    }
  });

  router.put('/api/v1/users-roles/:id', adminOnly, async (req, res) => {
    try {
      const updated = await pgOrgRepo.updateRole(
        String(req.params.id),
        req.body || {},
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      if (!updated) return sendPgError(res, 404, 'NOT_FOUND', 'Role not found');
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to update role');
    }
  });

  router.get('/api/v1/users-rosters', async (req, res) => {
    try {
      const { branchId, date, role } = req.query as Record<string, string>;
      const list = await pgOrgRepo.listRosters({ branchId, date, role });
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load staff rosters');
    }
  });

  router.post('/api/v1/users-rosters', async (req, res) => {
    try {
      const { staffId, branchId, date, shift, roomNumber, notes, assignedDoctorName } = req.body || {};
      if (!staffId || !date || !shift) {
        return sendPgError(res, 400, 'BAD_REQUEST', 'Staff ID, date, and shift are required');
      }
      const { roster, created } = await pgOrgRepo.upsertRoster({
        staffId,
        branchId,
        date,
        shift,
        roomNumber,
        notes,
        assignedDoctorName,
      });
      return sendPgSuccess(res, roster, {}, created ? 201 : 200);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to save duty roster');
    }
  });

  router.get('/api/v1/users-security-logs', adminOnly, async (req, res) => {
    try {
      const { action, status, search } = req.query as Record<string, string>;
      const list = await pgOrgRepo.listSecurityLogs({ action, status, search });
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load security logs');
    }
  });

  // ---------------------------------------------------------------------------
  // 3. Patients & Clinical History
  // ---------------------------------------------------------------------------
  router.get('/api/v1/patients', async (req, res) => {
    try {
      const actor = deps.getCurrentUser();
      const scope = await resolveAuthorizedBranchScope(actor, (req.query.branchId as string) || (req.headers['x-branch-id'] as string));
      if (!scope.allowed) {
        return sendPgError(res, 403, 'FORBIDDEN', 'Branch access denied');
      }
      let list = await pgPatientClinicalRepo.listPatients(req.query.q as string);
      if (scope.branchId) {
        list = list.filter((p) => p.branchId === scope.branchId);
      }
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to list patients');
    }
  });

  router.get('/api/v1/patients/:id', async (req, res) => {
    try {
      const actor = deps.getCurrentUser();
      const patient = await pgPatientClinicalRepo.findPatientByIdentifier(String(req.params.id));
      if (!patient) return sendPgError(res, 404, 'NOT_FOUND', 'Patient not found');
      if (patient.branchId && !(await canUserAccessBranch(actor, patient.branchId))) {
        return sendPgError(res, 403, 'FORBIDDEN', 'Cross-branch patient access denied');
      }

      const [aptsRes, consultations, prescriptions, packages, invoices] = await Promise.all([
        pgPatientClinicalRepo.listAppointments({ patientId: patient.id, limit: 200 }),
        pgPatientClinicalRepo.listConsultations(patient.id),
        pgPatientClinicalRepo.listPrescriptions(patient.id),
        pgBillingPackageRepo.listPackages(patient.id),
        pgBillingPackageRepo.listInvoices({ patientId: patient.id }),
      ]);

      return sendPgSuccess(res, {
        patient,
        appointments: aptsRes.items,
        consultations,
        prescriptions,
        packages,
        invoices,
      });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load patient details');
    }
  });

  router.post('/api/v1/patients', async (req, res) => {
    try {
      const actor = deps.getCurrentUser();
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
        branchId: z.string().optional(),
        allergies: z.array(z.string()).optional(),
        medicalHistory: z.string().optional(),
        skinType: z.enum(['normal', 'dry', 'oily', 'combination', 'sensitive']).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid patient data', parsed.error.format());
      }
      const targetBranchId = parsed.data.branchId || actor.branchId;
      if (targetBranchId && !(await canUserAccessBranch(actor, targetBranchId))) {
        return sendPgError(res, 403, 'FORBIDDEN', 'Cannot create patient in unauthorized branch');
      }
      const created = await pgPatientClinicalRepo.createPatient(
        { ...parsed.data, branchId: targetBranchId },
        actor,
        extractClientIp(req.headers)
      );
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to create patient');
    }
  });

  const handlePatientUpdate = async (req: Request, res: Response) => {
    try {
      const actor = deps.getCurrentUser();
      const existing = await pgPatientClinicalRepo.findPatientByIdentifier(String(req.params.id));
      if (!existing) return sendPgError(res, 404, 'NOT_FOUND', 'Patient not found');
      if (existing.branchId && !(await canUserAccessBranch(actor, existing.branchId))) {
        return sendPgError(res, 403, 'FORBIDDEN', 'Cross-branch patient update denied');
      }
      const updated = await pgPatientClinicalRepo.updatePatient(
        String(req.params.id),
        req.body || {},
        actor,
        extractClientIp(req.headers)
      );
      if (!updated) return sendPgError(res, 404, 'NOT_FOUND', 'Patient not found');
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to update patient');
    }
  };

  router.put(['/api/v1/patients/:id', '/patients/:id'], handlePatientUpdate);
  router.patch(['/api/v1/patients/:id', '/patients/:id'], handlePatientUpdate);

  // ---------------------------------------------------------------------------
  // 4. Appointments
  // ---------------------------------------------------------------------------
  router.get('/api/v1/appointments', async (req, res) => {
    try {
      const { branchId, patientId, providerId, status, startDate, endDate, search, page, limit, date } =
        req.query as Record<string, string>;
      const result = await pgPatientClinicalRepo.listAppointments({
        branchId,
        patientId,
        providerId,
        status,
        startDate: date || startDate,
        endDate: date || endDate,
        search,
        page: page ? Number.parseInt(page, 10) : 1,
        limit: limit ? Number.parseInt(limit, 10) : 100,
      });
      return sendPgSuccess(res, result.items, {
        total: result.total,
        page: page ? Number.parseInt(page, 10) : 1,
        limit: limit ? Number.parseInt(limit, 10) : 100,
      });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to list appointments');
    }
  });

  router.get('/api/v1/appointments/:id', async (req, res, next) => {
    // Let `/api/v1/appointments/availability` pass through
    if (req.params.id === 'availability') return next();
    try {
      const detail = await pgPatientClinicalRepo.getAppointmentById(String(req.params.id));
      if (!detail) return sendPgError(res, 404, 'NOT_FOUND', 'Appointment not found');
      return sendPgSuccess(res, detail);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to get appointment');
    }
  });

  router.post('/api/v1/appointments', deps.checkIdempotency, async (req, res) => {
    try {
      const raw = req.body || {};
      const patientId = raw.patient_id || raw.patientId;
      const appointmentDate = raw.appointment_date || raw.appointmentDate;
      const startTime = raw.start_time || raw.appointmentTime;
      if (!patientId || !appointmentDate || !startTime) {
        return sendPgError(
          res,
          400,
          'VALIDATION_ERROR',
          'Missing required fields: patient_id, appointment_date, start_time'
        );
      }
      const created = await pgPatientClinicalRepo.createAppointment(
        raw,
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      deps.saveIdempotency(req.headers['idempotency-key'] as string, 201, { data: created });
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to create appointment');
    }
  });

  router.patch('/api/v1/appointments/:id', async (req, res) => {
    try {
      const updated = await pgPatientClinicalRepo.updateAppointment(
        String(req.params.id),
        req.body || {},
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      if (!updated) return sendPgError(res, 404, 'NOT_FOUND', 'Appointment not found');
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to update appointment');
    }
  });

  router.post('/api/v1/appointments/:id/status', async (req, res) => {
    try {
      const { status, reason } = req.body || {};
      const updated = await pgPatientClinicalRepo.changeAppointmentStatus(
        String(req.params.id),
        status,
        reason,
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      if (!updated) return sendPgError(res, 404, 'NOT_FOUND', 'Appointment not found');
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to update appointment status');
    }
  });

  router.post('/api/v1/appointments/:id/cancel', async (req, res) => {
    try {
      const { reason } = req.body || {};
      if (!reason || !String(reason).trim()) {
        return sendPgError(res, 400, 'BAD_REQUEST', 'Cancellation reason is mandatory');
      }
      const updated = await pgPatientClinicalRepo.changeAppointmentStatus(
        String(req.params.id),
        'cancelled',
        String(reason).trim(),
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      if (!updated) return sendPgError(res, 404, 'NOT_FOUND', 'Appointment not found');
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to cancel appointment');
    }
  });

  router.post('/api/v1/appointments/:id/reschedule', deps.checkIdempotency, async (req, res) => {
    try {
      const body = req.body || {};
      const updated = await pgPatientClinicalRepo.updateAppointment(
        String(req.params.id),
        {
          appointmentDate: body.new_date || body.appointment_date || body.appointmentDate,
          appointmentTime: body.new_start_time || body.start_time || body.appointmentTime,
          status: 'rescheduled',
          statusReason: body.reason,
        },
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      if (!updated) return sendPgError(res, 404, 'NOT_FOUND', 'Appointment not found');
      deps.saveIdempotency(req.headers['idempotency-key'] as string, 200, { data: updated });
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to reschedule appointment');
    }
  });

  // ---------------------------------------------------------------------------
  // 5. Consultations, Prescriptions, Rx Protocols & Medical Documents
  // ---------------------------------------------------------------------------
  router.get('/api/v1/consultations', async (req, res) => {
    try {
      const list = await pgPatientClinicalRepo.listConsultations(req.query.patientId as string);
      return sendPgSuccess(res, list);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load consultations');
    }
  });

  router.post('/api/v1/consultations', async (req, res) => {
    try {
      const actor = deps.getCurrentUser();
      if (!isDoctorOrAdmin(actor.role)) {
        return sendPgError(res, 403, 'FORBIDDEN', 'Only doctors can create or finalize consultations');
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
        nextSessionDate: z.string().optional(),
        nextSessionNotes: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid consultation data', parsed.error.format());
      }
      const created = await pgPatientClinicalRepo.createConsultation(
        parsed.data,
        actor,
        extractClientIp(req.headers)
      );
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to create consultation');
    }
  });

  router.get('/api/v1/prescriptions', async (req, res) => {
    try {
      const list = await pgPatientClinicalRepo.listPrescriptions(req.query.patientId as string);
      return sendPgSuccess(res, list);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load prescriptions');
    }
  });

  router.post('/api/v1/prescriptions', async (req, res) => {
    try {
      const actor = deps.getCurrentUser();
      if (!isDoctorOrAdmin(actor.role)) {
        return sendPgError(
          res,
          403,
          'FORBIDDEN',
          'Only a licensed doctor can create and finalize prescriptions'
        );
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
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid prescription payload', parsed.error.format());
      }
      const created = await pgPatientClinicalRepo.createPrescription(
        parsed.data,
        actor,
        extractClientIp(req.headers)
      );
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to create prescription');
    }
  });

  router.get('/api/v1/rx-protocols', async (req, res) => {
    try {
      const list = await pgPatientClinicalRepo.listRxProtocols(req.query.activeOnly === 'true');
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load Rx protocols');
    }
  });

  router.post('/api/v1/rx-protocols', async (req, res) => {
    try {
      const actor = deps.getCurrentUser();
      if (!isDoctorOrAdmin(actor.role)) {
        return sendPgError(res, 403, 'FORBIDDEN', 'Only doctors or super admins can manage Rx protocols');
      }
      const parsed = rxProtocolSchema.safeParse(req.body);
      if (!parsed.success) {
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid Rx protocol payload', parsed.error.format());
      }
      const created = await pgPatientClinicalRepo.createRxProtocol(
        parsed.data,
        actor,
        extractClientIp(req.headers)
      );
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to create Rx protocol');
    }
  });

  router.put('/api/v1/rx-protocols/:id', async (req, res) => {
    try {
      const actor = deps.getCurrentUser();
      if (!isDoctorOrAdmin(actor.role)) {
        return sendPgError(res, 403, 'FORBIDDEN', 'Only doctors or super admins can update Rx protocols');
      }
      const parsed = rxProtocolSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid Rx protocol update payload', parsed.error.format());
      }
      const updated = await pgPatientClinicalRepo.updateRxProtocol(
        String(req.params.id),
        parsed.data,
        actor,
        extractClientIp(req.headers)
      );
      if (!updated) return sendPgError(res, 404, 'NOT_FOUND', `Rx protocol "${req.params.id}" not found`);
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to update Rx protocol');
    }
  });

  router.delete('/api/v1/rx-protocols/:id', async (req, res) => {
    try {
      const actor = deps.getCurrentUser();
      if (!isDoctorOrAdmin(actor.role)) {
        return sendPgError(res, 403, 'FORBIDDEN', 'Only doctors or super admins can delete Rx protocols');
      }
      const deleted = await pgPatientClinicalRepo.deleteRxProtocol(
        String(req.params.id),
        actor,
        extractClientIp(req.headers)
      );
      if (!deleted) return sendPgError(res, 404, 'NOT_FOUND', `Rx protocol "${req.params.id}" not found`);
      return sendPgSuccess(res, { deleted: true, id: req.params.id });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to delete Rx protocol');
    }
  });

  router.get('/api/v1/medical-documents', async (req, res) => {
    try {
      const list = await pgPatientClinicalRepo.listMedicalDocuments({
        patientId: req.query.patientId as string,
        type: req.query.type as string,
      });
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load medical documents');
    }
  });

  router.post('/api/v1/medical-documents', async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.patientId || !body.title) {
        return sendPgError(res, 400, 'BAD_REQUEST', 'Patient ID and Title are required');
      }
      const created = await pgPatientClinicalRepo.createMedicalDocument(
        body,
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to create medical document');
    }
  });

  // ---------------------------------------------------------------------------
  // 6. Packages & Non-Duplicate Session Deductions (ACID)
  // ---------------------------------------------------------------------------
  router.get('/api/v1/packages', async (req, res) => {
    try {
      const list = await pgBillingPackageRepo.listPackages(req.query.patientId as string);
      return sendPgSuccess(res, list);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load packages');
    }
  });

  router.get('/api/v1/packages/master', async (_req, res) => {
    try {
      const list = await pgBillingPackageRepo.listMasterPackages();
      return sendPgSuccess(res, list);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load master packages');
    }
  });

  router.post('/api/v1/packages/master', adminOnly, async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.name || !body.totalSessions || !body.packagePriceBDT) {
        return sendPgError(res, 400, 'BAD_REQUEST', 'Name, totalSessions, and packagePriceBDT are required');
      }
      const created = await pgBillingPackageRepo.createMasterPackage(body);
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to create master package');
    }
  });

  router.get('/api/v1/packages/deductions', async (req, res) => {
    try {
      const list = await pgBillingPackageRepo.listPackageDeductions(req.query.packageId as string);
      return sendPgSuccess(res, list);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load package deductions');
    }
  });

  router.post('/api/v1/packages', billingRoles, async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.patientId || !body.patientName || !body.packageName || !body.totalSessions) {
        return sendPgError(res, 400, 'BAD_REQUEST', 'Missing required package fields');
      }
      const created = await pgBillingPackageRepo.createPackage(
        body,
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to create treatment package');
    }
  });

  router.post('/api/v1/packages/:id/payments', billingRoles, deps.checkIdempotency, async (req, res) => {
    try {
      const schema = z.object({
        amountBDT: z.number().positive('Payment amount must be greater than zero'),
        method: z.enum(['cash', 'card', 'bkash', 'nagad', 'bank_transfer']),
        transactionRef: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid payment payload', parsed.error.format());
      }
      const result = await pgBillingPackageRepo.recordPackagePayment(
        String(req.params.id),
        parsed.data,
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      deps.saveIdempotency(req.headers['idempotency-key'] as string, 201, { data: result });
      return sendPgSuccess(res, result, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to record package payment');
    }
  });

  router.post('/api/v1/packages/deduct-session', clinicalRoles, deps.checkIdempotency, async (req, res) => {
    try {
      const actor = deps.getCurrentUser();
      const schema = z.object({
        packageId: z.string(),
        treatmentNotes: z.string().min(3),
        machineSettings: z.string().optional(),
        therapistName: z.string().default(actor.name),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid session deduction', parsed.error.format());
      }
      const result = await pgBillingPackageRepo.deductSession(
        parsed.data,
        actor,
        extractClientIp(req.headers)
      );
      deps.saveIdempotency(req.headers['idempotency-key'] as string, 200, { data: result });
      return sendPgSuccess(res, result);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to deduct package session');
    }
  });

  // ---------------------------------------------------------------------------
  // 7. Invoices, Derived Payments, Voiding & Daily Closing Reports (ACID)
  // ---------------------------------------------------------------------------
  router.get('/api/v1/invoices', async (req, res) => {
    try {
      const actor = deps.getCurrentUser();
      const scope = await resolveAuthorizedBranchScope(actor, req.query.branchId as string);
      if (!scope.allowed) {
        return sendPgError(res, 403, 'FORBIDDEN', 'Branch access denied');
      }
      let list = await pgBillingPackageRepo.listInvoices({
        patientId: req.query.patientId as string,
        status: req.query.status as string,
      });
      if (scope.branchId) {
        list = list.filter((inv) => inv.branchId === scope.branchId);
      }
      return sendPgSuccess(res, list);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to list invoices');
    }
  });

  router.post('/api/v1/invoices', billingRoles, deps.checkIdempotency, async (req, res) => {
    try {
      const actor = deps.getCurrentUser();
      const schema = z.object({
        patientId: z.string(),
        branchId: z.string().optional(),
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
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid invoice items', parsed.error.format());
      }
      const targetBranchId = parsed.data.branchId || actor.branchId;
      if (targetBranchId && !(await canUserAccessBranch(actor, targetBranchId))) {
        return sendPgError(res, 403, 'FORBIDDEN', 'Cannot issue invoice in unauthorized branch');
      }
      const created = await pgBillingPackageRepo.createInvoice(
        { ...parsed.data, branchId: targetBranchId },
        actor,
        extractClientIp(req.headers)
      );
      deps.saveIdempotency(req.headers['idempotency-key'] as string, 201, { data: created });
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to create invoice');
    }
  });

  router.post('/api/v1/invoices/:id/payments', billingRoles, deps.checkIdempotency, async (req, res) => {
    try {
      const schema = z.object({
        amountBDT: z.number().positive('Payment amount must be greater than zero'),
        method: z.enum(['cash', 'card', 'bkash', 'nagad', 'bank_transfer']),
        transactionRef: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid payment payload', parsed.error.format());
      }
      const result = await pgBillingPackageRepo.recordInvoicePayment(
        String(req.params.id),
        parsed.data,
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      deps.saveIdempotency(req.headers['idempotency-key'] as string, 201, { data: result });
      return sendPgSuccess(res, result, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to record invoice payment');
    }
  });

  router.post('/api/v1/invoices/:id/void', adminOnly, async (req, res) => {
    try {
      const schema = z.object({
        reason: z.string().min(5, 'Reason for voiding must be at least 5 characters'),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return sendPgError(
          res,
          400,
          'VALIDATION_ERROR',
          'A mandatory reason is required to void an invoice',
          parsed.error.format()
        );
      }
      const voided = await pgBillingPackageRepo.voidInvoice(
        String(req.params.id),
        parsed.data.reason,
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      return sendPgSuccess(res, voided);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to void invoice');
    }
  });

  router.get('/api/v1/daily-closings', billingRoles, async (req, res) => {
    try {
      const actor = deps.getCurrentUser();
      const scope = await resolveAuthorizedBranchScope(actor, req.query.branchId as string);
      if (!scope.allowed) {
        return sendPgError(res, 403, 'FORBIDDEN', 'Branch access denied');
      }
      const list = await pgBillingPackageRepo.listDailyClosings(scope.branchId);
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load daily closing reports');
    }
  });

  router.post('/api/v1/daily-closings', billingRoles, async (req, res) => {
    try {
      const body = req.body || {};
      if (!body.closingDate) {
        return sendPgError(res, 400, 'BAD_REQUEST', 'closingDate is required');
      }
      const created = await pgBillingPackageRepo.createDailyClosing(
        body,
        deps.getCurrentUser(),
        extractClientIp(req.headers)
      );
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to submit daily closing report');
    }
  });

  return router;
}
