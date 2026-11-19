import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody } from '../middleware/validation.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../middleware/errorHandler.js';
import {
  patientRepository,
  formatPatientDto,
  normalizeMobile,
  isValidBangladeshMobile,
} from '../services/patientService.js';
import { appointmentService } from '../services/appointmentService.js';
import { billingService } from '../services/billingService.js';
import { portalService } from '../services/portalService.js';
import type { ApiResponse } from '@suoxi/shared-types';

export const patientsRouter = Router();

// Validation Schemas
const createPatientSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(150),
  fullNameBn: z.string().max(150).optional().nullable(),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']),
  dateOfBirth: z.string().optional().nullable(),
  approximateAge: z.number().int().min(0).max(130).optional().nullable(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional().nullable(),
  primaryMobile: z.string().min(1, 'Primary mobile is required'),
  secondaryMobile: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  area: z.string().optional().nullable(),
  city: z.string().default('Dhaka'),
  district: z.string().default('Dhaka'),
  emergencyContactName: z.string().optional().nullable(),
  emergencyContactPhone: z.string().optional().nullable(),
  emergencyContactRelation: z.string().optional().nullable(),
  preferredLanguage: z.enum(['bn', 'en']).default('bn'),
  acquisitionSource: z.enum(['call', 'walk_in', 'referral', 'social_media', 'other']).default('walk_in'),
  referrerId: z.string().optional().nullable(),
  proceedWithDuplicate: z.boolean().optional(),
});

const updatePatientSchema = createPatientSchema.partial().extend({
  status: z.enum(['active', 'inactive', 'merged']).optional(),
});

const medicalHistorySchema = z.object({
  allergies: z.string().optional().nullable(),
  skinType: z.string().optional().nullable(),
  currentMedications: z.string().optional().nullable(),
  chronicConditions: z.string().optional().nullable(),
  pastAestheticProcedures: z.string().optional().nullable(),
  contraindications: z.string().optional().nullable(),
});

const resolveDuplicateSchema = z.object({
  action: z.enum(['not_duplicate', 'confirm', 'merge']),
  resolutionNotes: z.string().optional(),
});

// -----------------------------------------------------------------------------
// 1. GET /patients (List with search, status, due filter, and branch scoping)
// -----------------------------------------------------------------------------
patientsRouter.get(
  '/',
  requireAuth,
  requirePermission('patient.view'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const hasDue = req.query.hasDue === 'true' ? true : req.query.hasDue === 'false' ? false : undefined;
      const page = req.query.page ? Math.max(1, parseInt(String(req.query.page), 10)) : 1;
      const limit = req.query.limit ? Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10))) : 20;

      const activeBranchId = (req.headers['x-branch-id'] as string) || req.accessContext!.primaryBranchId;
      const allBranches = req.accessContext!.allBranches || req.accessContext!.roles.includes('super_admin');

      const { patients, total } = await patientRepository.searchPatients({
        q,
        status,
        hasDue,
        branchId: activeBranchId,
        allBranches,
        page,
        limit,
      });

      const userRoles = req.accessContext!.roles;
      const formatted = patients.map((p) => formatPatientDto(p, userRoles));

      const response: ApiResponse<typeof formatted> = {
        data: formatted,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
          },
        },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 2. GET /patients/duplicate-check (Real-time duplicate pre-check on mobile)
// -----------------------------------------------------------------------------
patientsRouter.get(
  '/duplicate-check',
  requireAuth,
  requirePermission('patient.create'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawMobile = typeof req.query.mobile === 'string' ? req.query.mobile : '';
      if (!rawMobile.trim()) {
        res.status(200).json({
          data: { hasDuplicate: false },
          meta: { requestId: req.id, timestamp: new Date().toISOString() },
        });
        return;
      }

      const normalized = normalizeMobile(rawMobile);
      const match = await patientRepository.findByNormalizedMobile(normalized);

      if (!match) {
        res.status(200).json({
          data: { hasDuplicate: false },
          meta: { requestId: req.id, timestamp: new Date().toISOString() },
        });
        return;
      }

      res.status(200).json({
        data: {
          hasDuplicate: true,
          match: {
            id: match.id,
            patientCode: match.patient_code,
            fullName: match.full_name,
            fullNameBn: match.full_name_bn || undefined,
            primaryMobile: match.primary_mobile,
            city: match.city,
            area: match.area || undefined,
          },
        },
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 3. GET /patients/duplicates (Duplicate candidate review queue)
// -----------------------------------------------------------------------------
patientsRouter.get(
  '/duplicates',
  requireAuth,
  requirePermission('patient.view'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const candidates = await patientRepository.getDuplicateCandidates();
      const userRoles = req.accessContext!.roles;

      const enriched = await Promise.all(
        candidates.map(async (c) => {
          const p1 = await patientRepository.findById(c.primary_patient_id);
          const p2 = await patientRepository.findById(c.duplicate_patient_id);
          return {
            id: c.id,
            primaryPatientId: c.primary_patient_id,
            duplicatePatientId: c.duplicate_patient_id,
            primaryPatient: p1 ? formatPatientDto(p1, userRoles) : null,
            duplicatePatient: p2 ? formatPatientDto(p2, userRoles) : null,
            matchConfidence: c.match_confidence,
            matchReasons: c.match_reasons,
            status: c.status,
            detectedDuring: c.detected_during,
            createdAt: c.created_at,
          };
        })
      );

      res.status(200).json({
        data: enriched.filter((c) => c.primaryPatient && c.duplicatePatient),
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 4. POST /patients/duplicates/:id/resolve (Resolve / Non-destructive merge)
// -----------------------------------------------------------------------------
patientsRouter.post(
  '/duplicates/:id/resolve',
  requireAuth,
  validateBody(resolveDuplicateSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const candidateId = req.params.id;
      const { action, resolutionNotes } = req.body;

      if (action === 'merge') {
        const canMerge =
          req.accessContext!.hasPermission('patient.merge') ||
          req.accessContext!.roles.includes('super_admin') ||
          req.accessContext!.roles.includes('admin_manager');

        if (!canMerge) {
          throw new ForbiddenError('Permission denied: merging patient profiles requires patient.merge privilege');
        }
      } else {
        if (!req.accessContext!.hasPermission('patient.view')) {
          throw new ForbiddenError('Access Denied');
        }
      }

      const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const result = await patientRepository.resolveDuplicate(
        candidateId,
        action,
        resolutionNotes,
        req.session!.staffUserId,
        clientIp
      );

      res.status(200).json({
        data: result,
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 5. POST /patients (Create patient with idempotency & duplicate prevention)
// -----------------------------------------------------------------------------
patientsRouter.post(
  '/',
  requireAuth,
  requirePermission('patient.create'),
  idempotencyMiddleware(),
  validateBody(createPatientSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const activeBranchId =
        (req.headers['x-branch-id'] as string) || req.accessContext!.primaryBranchId || 'SKC-01';

      if (!req.accessContext!.canAccessBranch(activeBranchId)) {
        throw new ForbiddenError(`Cannot register patients in branch "${activeBranchId}"`);
      }

      const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const { patient, duplicateCandidate } = await patientRepository.createPatient(
        req.body,
        activeBranchId,
        req.session!.staffUserId,
        clientIp
      );

      const userRoles = req.accessContext!.roles;
      const formatted = formatPatientDto(patient, userRoles);

      res.status(201).json({
        data: {
          patient: formatted,
          duplicateCandidateId: duplicateCandidate?.id,
        },
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 6. GET /patients/:id (Details with branch isolation and role-aware filtering)
// -----------------------------------------------------------------------------
patientsRouter.get(
  '/:id',
  requireAuth,
  requirePermission('patient.view'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const patient = await patientRepository.findById(req.params.id);
      if (!patient) {
        throw new NotFoundError('Patient record not found');
      }

      // Branch isolation (Rule 2: out-of-branch returns 404)
      if (!req.accessContext!.canAccessBranch(patient.branch_id)) {
        throw new NotFoundError('Patient record not found');
      }

      const formatted = formatPatientDto(patient, req.accessContext!.roles);

      res.status(200).json({
        data: formatted,
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 7. PATCH /patients/:id (Update patient demographics)
// -----------------------------------------------------------------------------
patientsRouter.patch(
  '/:id',
  requireAuth,
  requirePermission('patient.create'),
  validateBody(updatePatientSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const patient = await patientRepository.findById(req.params.id);
      if (!patient) {
        throw new NotFoundError('Patient record not found');
      }

      if (!req.accessContext!.canAccessBranch(patient.branch_id)) {
        throw new NotFoundError('Patient record not found');
      }

      const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const updated = await patientRepository.updatePatient(
        req.params.id,
        req.body,
        req.session!.staffUserId,
        clientIp
      );

      const formatted = formatPatientDto(updated, req.accessContext!.roles);

      res.status(200).json({
        data: formatted,
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 8. GET /patients/:id/medical-history (Clinical permission medical_history.view)
// -----------------------------------------------------------------------------
patientsRouter.get(
  '/:id/medical-history',
  requireAuth,
  requirePermission('medical_history.view'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const patient = await patientRepository.findById(req.params.id);
      if (!patient) {
        throw new NotFoundError('Patient record not found');
      }

      if (!req.accessContext!.canAccessBranch(patient.branch_id)) {
        throw new NotFoundError('Patient record not found');
      }

      // Hard check: Receptionist and Call Center roles are strictly barred from clinical medical history
      const barredRoles = ['receptionist', 'call_center'];
      const isBarred =
        req.accessContext!.roles.some((r) => barredRoles.includes(r)) &&
        !req.accessContext!.roles.includes('super_admin') &&
        !req.accessContext!.roles.includes('doctor');

      if (isBarred) {
        throw new ForbiddenError('Access Denied: Clinical medical history is restricted to clinical practitioners');
      }

      const history = await patientRepository.getMedicalHistory(req.params.id);

      res.status(200).json({
        data: history || {
          patientId: req.params.id,
          allergies: null,
          skinType: null,
          currentMedications: null,
          chronicConditions: null,
          pastAestheticProcedures: null,
          contraindications: null,
          updatedAt: patient.updated_at,
        },
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 9. POST /patients/:id/medical-history (Clinical permission medical_history.edit)
// -----------------------------------------------------------------------------
patientsRouter.post(
  '/:id/medical-history',
  requireAuth,
  requirePermission('medical_history.edit'),
  validateBody(medicalHistorySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const patient = await patientRepository.findById(req.params.id);
      if (!patient) {
        throw new NotFoundError('Patient record not found');
      }

      if (!req.accessContext!.canAccessBranch(patient.branch_id)) {
        throw new NotFoundError('Patient record not found');
      }

      const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';
      const history = await patientRepository.saveMedicalHistory(
        req.params.id,
        req.body,
        req.session!.staffUserId,
        clientIp
      );

      res.status(200).json({
        data: history,
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 10. GET /patients/:id/timeline (Unified Chronological Patient Timeline)
// -----------------------------------------------------------------------------
patientsRouter.get(
  '/:id/timeline',
  requireAuth,
  requirePermission('patient.view'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const patient = await patientRepository.findById(req.params.id);
      if (!patient) {
        throw new NotFoundError('Patient record not found');
      }

      if (!req.accessContext!.canAccessBranch(patient.branch_id)) {
        throw new NotFoundError('Patient record not found');
      }

      const patientApts = appointmentService.getAppointmentsByPatient(req.params.id);
      const timeline = patientRepository.getPatientTimeline(req.params.id, patientApts);

      res.status(200).json({
        data: timeline,
        meta: { total: timeline.length, requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 11. GET /patients/:id/dues (Patient Dues & Unallocated Advances)
// -----------------------------------------------------------------------------
patientsRouter.get(
  '/:id/dues',
  requireAuth,
  requirePermission('billing.view'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const patient = await patientRepository.findById(req.params.id);
      if (!patient) {
        throw new NotFoundError('Patient record not found');
      }

      const dues = await billingService.getPatientDues(req.params.id);
      res.status(200).json({
        data: dues,
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 12. GET /patients/:id/portal-account (Staff View Portal Account Status)
// -----------------------------------------------------------------------------
patientsRouter.get(
  '/:id/portal-account',
  requireAuth,
  requirePermission('portal.manage'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const patient = await patientRepository.findById(req.params.id);
      if (!patient) throw new NotFoundError('Patient not found');

      const account = await portalService.getAccountByPatientId(req.params.id);
      res.status(200).json({
        data: account,
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 13. POST /patients/:id/portal-account (Staff Create Portal Account & Setup Link)
// -----------------------------------------------------------------------------
patientsRouter.post(
  '/:id/portal-account',
  requireAuth,
  requirePermission('portal.manage'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const patient = await patientRepository.findById(req.params.id);
      if (!patient) throw new NotFoundError('Patient not found');

      const result = await portalService.createPortalAccount(
        req.params.id,
        req.body?.loginIdentifier,
        { id: req.user!.id }
      );

      res.status(201).json({
        data: result,
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 14. POST /patients/:id/portal-account/send-link (Send Setup or Reset Link)
// -----------------------------------------------------------------------------
patientsRouter.post(
  '/:id/portal-account/send-link',
  requireAuth,
  requirePermission('portal.manage'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const channel = req.body?.channel === 'email' ? 'email' : 'sms';
      const tokenType = req.body?.tokenType === 'reset' ? 'reset' : 'setup';

      const result = await portalService.generateSetupOrResetLink(
        req.params.id,
        tokenType,
        channel,
        { id: req.user!.id }
      );

      res.status(200).json({
        data: result,
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 15. POST /patients/:id/portal-account/deactivate (Staff Deactivate Portal Account)
// -----------------------------------------------------------------------------
patientsRouter.post(
  '/:id/portal-account/deactivate',
  requireAuth,
  requirePermission('portal.manage'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await portalService.deactivateAccount(req.params.id, { id: req.user!.id });
      res.status(200).json({
        data: { success: true, message: 'Portal account deactivated' },
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);
