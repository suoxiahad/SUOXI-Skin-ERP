import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { prescriptionService } from '../services/prescriptionService.js';
import { validateBody } from '../middleware/validation.js';
import { ForbiddenError, NotFoundError } from '../middleware/errorHandler.js';

export const prescriptionsRouter = Router();

const prescriptionItemInputSchema = z.object({
  itemName: z.string().min(1, 'Item name is required'),
  itemNameBn: z.string().optional(),
  inventoryProductId: z.string().optional(),
  strength: z.string().optional(),
  dosage: z.string().optional(),
  frequency: z.string().optional(),
  frequencyBn: z.string().optional(),
  duration: z.string().optional(),
  route: z.string().optional(),
  instructions: z.string().optional(),
  instructionsBn: z.string().optional(),
  sortOrder: z.number().int().optional(),
});

const createPrescriptionSchema = z.object({
  consultationId: z.string().optional(),
  patientId: z.string().min(1, 'patientId is required'),
  serviceId: z.string().optional(),
  diagnosis: z.string().min(1, 'Clinical diagnosis is required'),
  advice: z.string().optional(),
  followupAdvice: z.string().optional(),
  nextSessionDate: z.string().optional(),
  language: z.enum(['en', 'bn', 'both']).default('both'),
  suggestFood: z.boolean().default(false),
  items: z.array(prescriptionItemInputSchema).optional(),
});

const patchPrescriptionSchema = z.object({
  serviceId: z.string().optional(),
  diagnosis: z.string().min(1).optional(),
  advice: z.string().optional(),
  followupAdvice: z.string().optional(),
  nextSessionDate: z.string().optional(),
  language: z.enum(['en', 'bn', 'both']).optional(),
  suggestFood: z.boolean().optional(),
  items: z.array(prescriptionItemInputSchema).optional(),
});

const correctPrescriptionSchema = z.object({
  reason: z.string().min(1, 'Correction reason is mandatory'),
});

const voidPrescriptionSchema = z.object({
  reason: z.string().min(1, 'Reason for voiding prescription is mandatory'),
});

const publishPrescriptionSchema = z.object({
  publish: z.boolean().default(true),
});

// 1. POST /prescriptions (Create draft)
prescriptionsRouter.post(
  '/',
  requireAuth,
  requirePermission('prescription.create'),
  validateBody(createPrescriptionSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = {
        id: req.accessContext?.userId || 'usr-system',
        fullName: req.accessContext?.username || 'Doctor',
        primaryBranchId: req.accessContext?.primaryBranchId,
        role: req.accessContext?.roles[0] || 'doctor',
      };

      const result = await prescriptionService.createPrescription(req.body, user);
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// 2. GET /prescriptions/:id
prescriptionsRouter.get(
  '/:id',
  requireAuth,
  requirePermission('prescription.view'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await prescriptionService.getPrescription(req.params.id);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// 3. PATCH /prescriptions/:id (Edit draft)
prescriptionsRouter.patch(
  '/:id',
  requireAuth,
  requirePermission('prescription.edit'),
  validateBody(patchPrescriptionSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = { id: req.accessContext?.userId || 'usr-system' };
      const result = await prescriptionService.patchPrescription(req.params.id, req.body, user);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// 4. POST /prescriptions/:id/finalize
prescriptionsRouter.post(
  '/:id/finalize',
  requireAuth,
  requirePermission('prescription.finalize'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = {
        id: req.accessContext?.userId || 'usr-system',
        role: req.accessContext?.roles[0] || 'doctor',
        fullName: req.accessContext?.username || 'Dr. Farhana Khan',
        permissions: req.accessContext?.effectivePermissions,
      };

      // Strict Clinical Gate: Only doctors or super admins can finalize clinical prescriptions
      const isClinical = user.role === 'doctor' || user.role === 'super_admin';
      if (!isClinical) {
        throw new ForbiddenError(
          'Non-clinical staff (receptionist, call center, cashier) cannot finalize clinical prescriptions'
        );
      }

      const result = await prescriptionService.finalizePrescription(req.params.id, user);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// 5. POST /prescriptions/:id/correct
prescriptionsRouter.post(
  '/:id/correct',
  requireAuth,
  requirePermission('prescription.edit'),
  validateBody(correctPrescriptionSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = {
        id: req.accessContext?.userId || 'usr-system',
        fullName: req.accessContext?.username || 'Doctor',
        role: req.accessContext?.roles[0] || 'doctor',
      };

      const result = await prescriptionService.correctPrescription(
        req.params.id,
        req.body.reason,
        user
      );
      res.status(201).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// 6. POST /prescriptions/:id/void
prescriptionsRouter.post(
  '/:id/void',
  requireAuth,
  requirePermission('prescription.void'),
  validateBody(voidPrescriptionSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = { id: req.accessContext?.userId || 'usr-system' };
      const result = await prescriptionService.voidPrescription(
        req.params.id,
        req.body.reason,
        user
      );
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// 7. POST /prescriptions/:id/publish
prescriptionsRouter.post(
  '/:id/publish',
  requireAuth,
  requirePermission('prescription.publish'),
  validateBody(publishPrescriptionSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = { id: req.accessContext?.userId || 'usr-system' };
      const result = await prescriptionService.publishToPortal(
        req.params.id,
        req.body.publish,
        user
      );
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);

// 8. GET /prescriptions/:id/pdf
prescriptionsRouter.get(
  '/:id/pdf',
  requireAuth,
  requirePermission('prescription.view'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rx = await prescriptionService.getPrescription(req.params.id);
      if (!rx) {
        throw new NotFoundError(`Prescription '${req.params.id}' not found`);
      }

      // Stream PDF response
      const { pdfService } = await import('../services/pdfService.js');
      const pdfRes = await pdfService.generatePrescriptionPdf(rx);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="prescription-${rx.prescriptionCode}.pdf"`);
      res.setHeader('X-Prescription-Sha256', pdfRes.sha256);
      res.status(200).send(pdfRes.pdfBuffer);
    } catch (err) {
      next(err);
    }
  }
);

// 9. GET /prescriptions/:id/history
prescriptionsRouter.get(
  '/:id/history',
  requireAuth,
  requirePermission('prescription.view'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await prescriptionService.getPrescriptionHistory(req.params.id);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
);
