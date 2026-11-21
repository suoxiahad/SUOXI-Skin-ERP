import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { validateBody } from '../middleware/validation.js';
import { idempotencyMiddleware } from '../middleware/idempotency.js';
import { BadRequestError, NotFoundError, ForbiddenError, ConflictError } from '../middleware/errorHandler.js';
import { appointmentService } from '../services/appointmentService.js';
import { computeAvailability } from '../services/scheduleService.js';
import type { CreateAppointmentRequest } from '@suoxi/shared-types';

export const appointmentsRouter = Router();

// Validation Schemas
const createAppointmentSchema = z.object({
  patient_id: z.string().min(1, 'Patient ID is required'),
  patient_name: z.string().optional().nullable(),
  patient_mobile: z.string().optional().nullable(),
  patient_code: z.string().optional().nullable(),
  disease_name: z.string().optional().nullable(),
  booking_method: z.string().optional().nullable(),
  branch_id: z.string().min(1, 'Branch ID is required'),
  provider_id: z.string().min(1, 'Provider ID is required'),
  resource_id: z.string().optional().nullable(),
  source_id: z.string().min(1, 'Appointment source is required').default('src-1'),
  service_category: z.string().optional().nullable(),
  service_name: z.string().min(1, 'Treatment / service name is required'),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be HH:mm (24-hour)'),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  appointment_type: z.enum(['consultation', 'treatment_session', 'follow_up', 'other']).default('consultation'),
  set_by_clinician: z.boolean().optional(),
  is_walk_in: z.boolean().optional(),
  call_reference: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  confirm_override: z.boolean().optional(),
  override_reason: z.string().max(500).optional().nullable(),
});

const updateAppointmentSchema = z.object({
  provider_id: z.string().optional(),
  resource_id: z.string().optional().nullable(),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  service_name: z.string().optional(),
  call_reference: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const statusChangeSchema = z.object({
  status: z.enum(['booked', 'confirmed', 'visited', 'cancelled', 'no_show', 'rescheduled']),
  reason: z.string().max(500).optional(),
});

const cancelSchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is mandatory').max(500),
});

const rescheduleSchema = z.object({
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Start time must be HH:mm (24-hour)'),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  resource_id: z.string().optional().nullable(),
  provider_id: z.string().optional(),
  reason: z.string().min(1, 'Rescheduling reason is mandatory').max(500),
  confirm_override: z.boolean().optional(),
  override_reason: z.string().max(500).optional().nullable(),
});

// -----------------------------------------------------------------------------
// 1. GET /appointments/availability (Query available slots for provider & date)
// -----------------------------------------------------------------------------
appointmentsRouter.get(
  '/availability',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
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

      res.status(200).json({
        data: availability,
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 2. GET /appointments (List appointments with filters and tabs)
// -----------------------------------------------------------------------------
appointmentsRouter.get(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        branchId,
        patientId,
        providerId,
        status,
        sourceId,
        startDate,
        endDate,
        tab,
        search,
        page,
        limit,
      } = req.query;

      const targetBranch = (branchId as string) || (req.accessContext?.primaryBranchId as string) || 'br-dhanmondi';

      if (req.accessContext && !req.accessContext.canAccessBranch(targetBranch)) {
        throw new NotFoundError('Branch not accessible');
      }

      const result = appointmentService.listAppointments({
        branchId: targetBranch,
        patientId: patientId as string,
        providerId: providerId as string,
        status: status as string,
        sourceId: sourceId as string,
        startDate: startDate as string,
        endDate: endDate as string,
        tab: tab as any,
        search: search as string,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      });

      res.status(200).json({
        data: result.items,
        meta: {
          total: result.total,
          page: page ? parseInt(page as string, 10) : 1,
          limit: limit ? parseInt(limit as string, 10) : 20,
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 3. POST /appointments (Create new appointment, under-60s booking flow)
// -----------------------------------------------------------------------------
appointmentsRouter.post(
  '/',
  requireAuth,
  requirePermission('appointment.create'),
  idempotencyMiddleware(),
  validateBody(createAppointmentSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = {
        id: req.session!.staffUserId,
        name: req.accessContext?.username || req.session!.staffUserId,
        role: req.accessContext?.roles[0] || 'receptionist',
        branchId: req.body.branch_id,
      };

      if (!req.accessContext!.canAccessBranch(req.body.branch_id)) {
        throw new NotFoundError('Branch not accessible');
      }

      const appointment = await appointmentService.createAppointment(req.body as CreateAppointmentRequest, user);

      res.status(201).json({
        data: appointment,
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 4. GET /appointments/:id (Detail view with audit history & patient summary)
// -----------------------------------------------------------------------------
appointmentsRouter.get(
  '/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const detail = appointmentService.getAppointmentDetail(req.params.id);
      if (!detail) {
        throw new NotFoundError('Appointment not found');
      }

      if (req.accessContext && !req.accessContext.canAccessBranch(detail.branch_id)) {
        throw new NotFoundError('Appointment not found');
      }

      res.status(200).json({
        data: detail,
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 5. PATCH /appointments/:id (Update appointment slot or details)
// -----------------------------------------------------------------------------
appointmentsRouter.patch(
  '/:id',
  requireAuth,
  validateBody(updateAppointmentSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const apt = appointmentService.getAppointmentById(req.params.id);
      if (!apt) {
        throw new NotFoundError('Appointment not found');
      }

      if (req.accessContext && !req.accessContext.canAccessBranch(apt.branch_id)) {
        throw new NotFoundError('Appointment not found');
      }

      const user = {
        id: req.session!.staffUserId,
        name: req.accessContext?.username,
        role: req.accessContext?.roles[0] || 'receptionist',
      };

      const updated = await appointmentService.updateAppointment(req.params.id, req.body, user);

      res.status(200).json({
        data: updated,
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 6. POST /appointments/:id/status (Confirm, Visited/Check-in, No-show)
// -----------------------------------------------------------------------------
appointmentsRouter.post(
  '/:id/status',
  requireAuth,
  validateBody(statusChangeSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const apt = appointmentService.getAppointmentById(req.params.id);
      if (!apt) {
        throw new NotFoundError('Appointment not found');
      }

      if (req.accessContext && !req.accessContext.canAccessBranch(apt.branch_id)) {
        throw new NotFoundError('Appointment not found');
      }

      const user = {
        id: req.session!.staffUserId,
        name: req.accessContext?.username,
        role: req.accessContext?.roles[0] || 'receptionist',
      };

      const updated = await appointmentService.changeStatus(req.params.id, req.body.status, req.body.reason, user);

      res.status(200).json({
        data: updated,
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 7. POST /appointments/:id/cancel (Cancel appointment with reason)
// -----------------------------------------------------------------------------
appointmentsRouter.post(
  '/:id/cancel',
  requireAuth,
  validateBody(cancelSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const apt = appointmentService.getAppointmentById(req.params.id);
      if (!apt) {
        throw new NotFoundError('Appointment not found');
      }

      if (req.accessContext && !req.accessContext.canAccessBranch(apt.branch_id)) {
        throw new NotFoundError('Appointment not found');
      }

      const user = {
        id: req.session!.staffUserId,
        name: req.accessContext?.username,
        role: req.accessContext?.roles[0] || 'receptionist',
      };

      const cancelled = await appointmentService.cancelAppointment(req.params.id, req.body, user);

      res.status(200).json({
        data: cancelled,
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 8. POST /appointments/:id/reschedule (Atomic reschedule transaction)
// -----------------------------------------------------------------------------
appointmentsRouter.post(
  '/:id/reschedule',
  requireAuth,
  requirePermission('appointment.reschedule'),
  idempotencyMiddleware(),
  validateBody(rescheduleSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const apt = appointmentService.getAppointmentById(req.params.id);
      if (!apt) {
        throw new NotFoundError('Appointment not found');
      }

      if (req.accessContext && !req.accessContext.canAccessBranch(apt.branch_id)) {
        throw new NotFoundError('Appointment not found');
      }

      const user = {
        id: req.session!.staffUserId,
        name: req.accessContext?.username,
        role: req.accessContext?.roles[0] || 'receptionist',
      };

      const result = await appointmentService.rescheduleAppointment(req.params.id, req.body, user);

      res.status(200).json({
        data: result,
        meta: { requestId: req.id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);
