import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateCsrf } from '../auth/csrf.js';
import { notificationService } from '../services/notificationService.js';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
} from '../middleware/errorHandler.js';
import type { NotificationStatus, NotificationChannel } from '@suoxi/shared-types';

export const notificationsRouter = Router();

// CSRF Verification for state-changing requests (Rule 2 & B.5a)
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
    id: req.accessContext?.userId || req.user?.id || 'usr-admin-01',
    fullName: req.accessContext?.user?.fullName || req.user?.fullName || 'Staff Administrator',
    roles: req.accessContext?.roles || req.user?.roles || ['super_admin'],
    branchId: req.accessContext?.user?.branchId || req.user?.branchId || 'br-dhk-01',
  };
}

// 1. GET /summary - Report Summary Metrics
notificationsRouter.get('/summary', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const branchId = req.query.branchId as string | undefined;
    const summary = await notificationService.getReportSummary(branchId);
    res.status(200).json({
      data: summary,
      meta: { requestId: req.id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// 2. GET / - List Notifications (Paginated with filters)
notificationsRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as NotificationStatus | undefined;
    const channel = req.query.channel as NotificationChannel | undefined;
    const date_from = req.query.date_from as string | undefined;
    const date_to = req.query.date_to as string | undefined;
    const search = req.query.search as string | undefined;
    const branch_id = req.query.branch_id as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const result = await notificationService.listNotifications({
      status,
      channel,
      date_from,
      date_to,
      search,
      branch_id,
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

// 3. POST /generate-reminders - Automated 24h Reminder Generator
notificationsRouter.post(
  '/generate-reminders',
  requireAuth,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const targetDate = req.body?.target_date as string | undefined;
      const result = await notificationService.generateSessionReminders(targetDate);

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

// 4. POST /:id/retry - Manual retry for failed notification
notificationsRouter.post(
  '/:id/retry',
  requireAuth,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      const actor = extractActor(req);
      const updated = await notificationService.retryNotification(id, actor);

      res.status(200).json({
        data: updated,
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

// 5. POST /:id/cancel - Manual cancel for queued notification
notificationsRouter.post(
  '/:id/cancel',
  requireAuth,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      const reason = req.body?.reason as string | undefined;
      const actor = extractActor(req);
      const updated = await notificationService.cancelNotification(id, reason, actor);

      res.status(200).json({
        data: updated,
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
