import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { consultationService } from '../services/consultationService.js';
import { validateBody } from '../middleware/validation.js';

export const consultationsRouter = Router();

const createConsultationSchema = z.object({
  patientId: z.string().min(1, 'patientId is required'),
  chiefComplaint: z.string().optional(),
  assessment: z.string().optional(),
  clinicalNotes: z.string().optional(),
  recommendedServiceId: z.string().optional(),
});

const patchConsultationSchema = z.object({
  version: z.number().int().min(1, 'version is required for concurrency control'),
  chiefComplaint: z.string().optional(),
  assessment: z.string().optional(),
  clinicalNotes: z.string().optional(),
  recommendedServiceId: z.string().optional(),
  status: z.enum(['draft', 'completed']).optional(),
});

const createTreatmentPlanSchema = z.object({
  serviceId: z.string().min(1, 'serviceId is required'),
  plannedSessions: z.number().int().min(1).default(1),
  startDate: z.string().min(1, 'startDate is required'),
  expectedEndDate: z.string().optional(),
  notes: z.string().optional(),
});

const createConsentSchema = z.object({
  serviceId: z.string().min(1, 'serviceId is required'),
  consentType: z.enum(['treatment', 'procedure', 'photography', 'general']).default('treatment'),
  consentText: z.string().min(1, 'consentText is required'),
  consentTextBn: z.string().optional(),
  isSigned: z.boolean().optional(),
  witnessName: z.string().optional(),
  fileId: z.string().optional(),
});

// 1. POST /appointments/:id/consultation
consultationsRouter.post(
  '/appointments/:id/consultation',
  requireAuth,
  requirePermission('consultation.create'),
  validateBody(createConsultationSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = {
        id: req.accessContext?.userId || 'usr-system',
        fullName: req.accessContext?.username || 'Doctor',
        primaryBranchId: req.accessContext?.primaryBranchId,
      };

      const result = await consultationService.createConsultation(
        {
          ...req.body,
          appointmentId: req.params.id,
        },
        user
      );

      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// 2. GET /consultations/:id
consultationsRouter.get(
  '/consultations/:id',
  requireAuth,
  requirePermission('consultation.view'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await consultationService.getConsultation(req.params.id);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// 3. PATCH /consultations/:id (Auto-save & status update)
consultationsRouter.patch(
  '/consultations/:id',
  requireAuth,
  requirePermission('consultation.edit'),
  validateBody(patchConsultationSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = { id: req.accessContext?.userId || 'usr-system' };
      const result = await consultationService.patchConsultation(req.params.id, req.body, user);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// 4. POST /consultations/:id/treatment-plan
consultationsRouter.post(
  '/consultations/:id/treatment-plan',
  requireAuth,
  requirePermission('consultation.edit'),
  validateBody(createTreatmentPlanSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = {
        id: req.accessContext?.userId || 'usr-system',
        fullName: req.accessContext?.username,
      };
      const result = await consultationService.createTreatmentPlan(req.params.id, req.body, user);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// 5. POST /consultations/:id/consent
consultationsRouter.post(
  '/consultations/:id/consent',
  requireAuth,
  requirePermission('consultation.edit'),
  validateBody(createConsentSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = {
        id: req.accessContext?.userId || 'usr-system',
        fullName: req.accessContext?.username,
      };
      const result = await consultationService.createConsentRecord(req.params.id, req.body, user);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);
