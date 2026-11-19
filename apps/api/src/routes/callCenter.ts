import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateCsrf } from '../auth/csrf.js';
import { callCenterService } from '../services/callCenterService.js';
import { BadRequestError } from '../middleware/errorHandler.js';

export const callCenterRouter = Router();

// CSRF Verification for state-changing requests
const verifyCsrf = (req: any, _res: any, next: any) => {
  try {
    if (req.sessionId) {
      validateCsrf(req, req.sessionId, 's', 'staff');
    }
    next();
  } catch (err) {
    next(err);
  }
};

function extractActor(req: any) {
  return {
    id: req.accessContext?.userId || req.user?.id || 'usr-call-01',
    fullName: req.accessContext?.user?.fullName || req.user?.fullName || 'Call Center Agent',
    roles: req.accessContext?.roles || req.user?.roles || ['call_center'],
    branchId: req.accessContext?.user?.branchId || req.user?.branchId || 'br-dhk-01',
  };
}

// 1. GET /tomorrow-sessions - Call Center Dashboard table (Restricted Privacy DTO)
callCenterRouter.get(
  '/tomorrow-sessions',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const branchId = req.query.branchId as string | undefined;
      const list = await callCenterService.listTomorrowSessions(branchId);

      res.status(200).json({
        data: list,
        meta: {
          total: list.length,
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// 2. GET /summary - Counter metrics for tomorrow's call list
callCenterRouter.get(
  '/summary',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const branchId = req.query.branchId as string | undefined;
      const summary = await callCenterService.getDashboardSummary(branchId);

      res.status(200).json({
        data: summary,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// 3. POST /log-call - "Log Call" drawer submission & reschedule routing
const logCallSchema = z.object({
  patient_id: z.string().min(1, 'Patient ID is required'),
  appointment_id: z.string().optional(),
  task_id: z.string().optional(),
  outcome: z.enum([
    'reached',
    'no_answer',
    'busy',
    'switched_off',
    'wrong_number',
    'reschedule_requested',
    'cancel_requested',
    'completed',
    'declined',
    'other',
  ]),
  notes: z.string().optional(),
  call_reference: z.string().optional(),
  next_action: z.string().optional(),
  next_action_due: z.string().optional(),
  reschedule_requested_date: z.string().optional(),
  reschedule_requested_time: z.string().optional(),
  reschedule_reason: z.string().optional(),
});

callCenterRouter.post(
  '/log-call',
  requireAuth,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parse = logCallSchema.safeParse(req.body);
      if (!parse.success) {
        throw new BadRequestError(parse.error.errors[0].message);
      }

      const actor = extractActor(req);
      const result = await callCenterService.logCallOutcome(parse.data, actor);

      res.status(201).json({
        data: result,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
