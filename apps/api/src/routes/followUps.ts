import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateCsrf } from '../auth/csrf.js';
import { callCenterService } from '../services/callCenterService.js';
import { BadRequestError } from '../middleware/errorHandler.js';
import type {
  FollowUpTaskStatus,
  FollowUpTaskType,
  FollowUpTaskPriority,
} from '@suoxi/shared-types';

export const followUpsRouter = Router();

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
    fullName: req.accessContext?.user?.fullName || req.user?.fullName || 'Call Center Staff',
    roles: req.accessContext?.roles || req.user?.roles || ['call_center'],
    branchId: req.accessContext?.user?.branchId || req.user?.branchId || 'br-dhk-01',
  };
}

// 1. GET /tasks - List follow-up tasks (filters, pagination, overdue flag)
followUpsRouter.get('/tasks', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as FollowUpTaskStatus | 'all' | undefined;
    const task_type = req.query.task_type as FollowUpTaskType | 'all' | undefined;
    const priority = req.query.priority as FollowUpTaskPriority | 'all' | undefined;
    const owner = req.query.owner as string | undefined;
    const due_date = req.query.due_date as string | undefined;
    const branch_id = req.query.branch_id as string | undefined;
    const search = req.query.search as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const result = await callCenterService.listFollowUpTasks({
      status,
      task_type,
      priority,
      owner,
      due_date,
      branch_id,
      search,
      page,
      limit,
    });

    res.status(200).json({
      data: result.items,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 2. POST /tasks/generate - Automated Task Generation (Idempotent via dedupe_key)
followUpsRouter.post(
  '/tasks/generate',
  requireAuth,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await callCenterService.generateFollowUpTasks();

      res.status(200).json({
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

// 3. POST /tasks/:id/assign - Assign task owner
followUpsRouter.post(
  '/tasks/:id/assign',
  requireAuth,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const taskId = req.params.id;
      const assignTo = req.body?.assigned_to as string | null | undefined;
      const actor = extractActor(req);

      const task = await callCenterService.assignTask(taskId, assignTo || null, actor);

      res.status(200).json({
        data: task,
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

// 4. POST /tasks/:id/complete - Mark task as completed
followUpsRouter.post(
  '/tasks/:id/complete',
  requireAuth,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const taskId = req.params.id;
      const notes = (req.body?.resolution_notes as string) || 'Completed by staff';
      const actor = extractActor(req);

      const task = await callCenterService.completeTask(taskId, notes, actor);

      res.status(200).json({
        data: task,
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

// 5. GET /rules - List follow-up automation rules
followUpsRouter.get('/rules', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = req.query.branchId as string | undefined;
    const rules = await callCenterService.getRules(branchId);

    res.status(200).json({
      data: rules,
      meta: {
        total: rules.length,
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 6. PUT /rules/:id - Update rule configuration
const updateRuleSchema = z.object({
  is_enabled: z.boolean().optional(),
  trigger_days: z.number().int().min(1).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
});

followUpsRouter.put(
  '/rules/:id',
  requireAuth,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const ruleId = req.params.id;
      const parse = updateRuleSchema.safeParse(req.body);
      if (!parse.success) {
        throw new BadRequestError(parse.error.errors[0].message);
      }

      const actor = extractActor(req);
      const rule = await callCenterService.updateRule(ruleId, parse.data, actor);

      res.status(200).json({
        data: rule,
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
