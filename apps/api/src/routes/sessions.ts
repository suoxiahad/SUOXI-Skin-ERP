import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { sessionService } from '../services/sessionService.js';
import { validateBody } from '../middleware/validation.js';

export const sessionsRouter = Router();

const createSessionSchema = z.object({
  patientId: z.string().min(1, 'patientId is required'),
  appointmentId: z.string().min(1, 'appointmentId is required'),
  serviceId: z.string().min(1, 'serviceId is required'),
  doctorId: z.string().min(1, 'doctorId is required'),
  branchId: z.string().min(1, 'branchId is required'),
  planId: z.string().optional().nullable(),
  therapistId: z.string().optional().nullable(),
  resourceId: z.string().optional().nullable(),
  sessionNo: z.number().int().min(1).optional(),
  totalSessions: z.number().int().min(1).optional(),
  treatmentNotes: z.string().optional().nullable(),
  packageId: z.string().optional().nullable(),
});

const patchSessionSchema = z.object({
  therapistId: z.string().optional().nullable(),
  resourceId: z.string().optional().nullable(),
  treatmentNotes: z.string().optional().nullable(),
  outcomeNotes: z.string().optional().nullable(),
  aftercareInstructions: z.string().optional().nullable(),
  publishAftercareToPortal: z.boolean().optional(),
});

const completeSessionSchema = z.object({
  outcomeNotes: z.string().optional().nullable(),
  treatmentNotes: z.string().optional().nullable(),
  aftercareInstructions: z.string().optional().nullable(),
  publishAftercareToPortal: z.boolean().optional(),
});

const addPhotoSchema = z.object({
  photoType: z.enum(['before', 'after', 'progress']),
  bodySite: z.string().optional().nullable(),
  takenAt: z.string().optional(),
  isVisibleToPatient: z.boolean().optional(),
  clinicalNotes: z.string().optional().nullable(),
  fileBuffer: z.string().optional(), // base64
  filename: z.string().optional(),
  mimeType: z.string().optional(),
});

const addConsumableSchema = z.object({
  productId: z.string().optional().nullable(),
  productName: z.string().min(1, 'Product name is required'),
  batchNumber: z.string().optional().nullable(),
  quantity: z.number().positive('Quantity must be greater than zero'),
  unit: z.string().optional().default('pcs'),
  notes: z.string().optional().nullable(),
});

const setNextSessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be in HH:mm format'),
  durationMinutes: z.number().int().positive().optional(),
  doctorId: z.string().optional(),
  resourceId: z.string().optional().nullable(),
  notes: z.string().optional(),
  patientInstructions: z.string().optional(),
});

const updateNextSessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be in HH:mm format').optional(),
  durationMinutes: z.number().int().positive().optional(),
  notes: z.string().optional(),
  reason: z.string().min(1, 'Reason for next-session schedule update is required'),
});

// 1. GET /sessions (List with filters)
sessionsRouter.get(
  '/',
  requireAuth,
  requirePermission('treatment.session.view'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const filters = {
        status: req.query.status as any,
        doctorId: req.query.doctorId as string | undefined,
        therapistId: req.query.therapistId as string | undefined,
        date: req.query.date as string | undefined,
        patientId: req.query.patientId as string | undefined,
      };

      const user = {
        id: req.accessContext?.userId || 'usr-system',
        roles: req.accessContext?.roles || [],
        allowedBranchIds: req.accessContext?.allowedBranchIds,
      };

      const result = await sessionService.listSessions(filters, user);

      res.status(200).json({
        data: result,
        meta: {
          total: result.length,
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// 2. GET /sessions/:id (Session details)
sessionsRouter.get(
  '/:id',
  requireAuth,
  requirePermission('treatment.session.view'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = {
        id: req.accessContext?.userId || 'usr-system',
        roles: req.accessContext?.roles || [],
        allowedBranchIds: req.accessContext?.allowedBranchIds,
      };

      const result = await sessionService.getSession(req.params.id, user);

      res.status(200).json({
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// 3. POST /sessions (Create new session)
sessionsRouter.post(
  '/',
  requireAuth,
  requirePermission('treatment.session.create'),
  validateBody(createSessionSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = {
        id: req.accessContext?.userId || 'usr-system',
        fullName: req.accessContext?.username || 'Clinician',
        role: req.accessContext?.roles[0] || 'doctor',
      };

      const result = await sessionService.createSession(req.body, user);

      res.status(201).json({
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// 4. PATCH /sessions/:id (Update session notes/outcome/aftercare)
sessionsRouter.patch(
  '/:id',
  requireAuth,
  requirePermission('treatment.session.create'),
  validateBody(patchSessionSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = {
        id: req.accessContext?.userId || 'usr-system',
        role: req.accessContext?.roles[0] || 'doctor',
      };

      const result = await sessionService.updateSession(req.params.id, req.body, user);

      res.status(200).json({
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// 5. POST /sessions/:id/complete (Idempotency-Key required)
sessionsRouter.post(
  '/:id/complete',
  requireAuth,
  requirePermission('treatment.session.complete'),
  validateBody(completeSessionSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

      const actor = {
        id: req.accessContext?.userId || 'usr-system',
        fullName: req.accessContext?.username || 'Clinician',
        role: req.accessContext?.roles[0] || 'doctor',
      };

      const result = await sessionService.completeSession(
        req.params.id,
        actor,
        req.body,
        idempotencyKey
      );

      res.status(200).json({
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// 6. POST /sessions/:id/photos (Upload clinical before/after/progress photo)
sessionsRouter.post(
  '/:id/photos',
  requireAuth,
  requirePermission('treatment.photos.upload'),
  validateBody(addPhotoSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = {
        id: req.accessContext?.userId || 'usr-system',
        fullName: req.accessContext?.username || 'Clinician',
        role: req.accessContext?.roles[0] || 'doctor',
      };

      const result = await sessionService.addPhoto(req.params.id, req.body, actor);

      res.status(201).json({
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// 7. GET /sessions/:id/photos (List session photos with signed URLs)
sessionsRouter.get(
  '/:id/photos',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = {
        id: req.accessContext?.userId || 'usr-system',
        roles: req.accessContext?.roles || [],
        permissions: Array.from(req.accessContext?.effectivePermissions || []),
      };

      const result = await sessionService.getPhotos(req.params.id, user);

      res.status(200).json({
        data: result,
        meta: {
          total: result.length,
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// 8. POST /sessions/:id/consumables (Add consumable used)
sessionsRouter.post(
  '/:id/consumables',
  requireAuth,
  requirePermission('treatment.session.create'),
  validateBody(addConsumableSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = {
        id: req.accessContext?.userId || 'usr-system',
        role: req.accessContext?.roles[0] || 'doctor',
      };

      const result = await sessionService.addConsumable(req.params.id, req.body, actor);

      res.status(201).json({
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// 9. POST /sessions/:id/next-session (Doctor-defined next session)
sessionsRouter.post(
  '/:id/next-session',
  requireAuth,
  validateBody(setNextSessionSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = {
        id: req.accessContext?.userId || 'usr-system',
        fullName: req.accessContext?.username || 'Attending Doctor',
        roles: req.accessContext?.roles || [],
        permissions: Array.from(req.accessContext?.effectivePermissions || []),
      };

      const result = await sessionService.setNextSession(req.params.id, req.body, actor);

      res.status(201).json({
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// 10. PATCH /sessions/:id/next-session (Update next session appointment)
sessionsRouter.patch(
  '/:id/next-session',
  requireAuth,
  validateBody(updateNextSessionSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const actor = {
        id: req.accessContext?.userId || 'usr-system',
        fullName: req.accessContext?.username || 'Attending Doctor',
        roles: req.accessContext?.roles || [],
        permissions: Array.from(req.accessContext?.effectivePermissions || []),
      };

      const result = await sessionService.updateNextSession(req.params.id, req.body, actor);

      res.status(200).json({
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.id,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
