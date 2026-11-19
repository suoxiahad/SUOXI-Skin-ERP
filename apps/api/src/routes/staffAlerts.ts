import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateCsrf } from '../auth/csrf.js';
import { staffAlertService } from '../services/staffAlertService.js';

export const staffAlertsRouter = Router();

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
    id: req.accessContext?.userId || req.user?.id || 'usr-admin-01',
    branchId: req.accessContext?.user?.branchId || req.user?.branchId || 'br-dhk-01',
  };
}

// 1. GET / - List staff alerts
staffAlertsRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = extractActor(req);
    const isReadParam = req.query.is_read as string | undefined;
    const isRead = isReadParam !== undefined ? isReadParam === 'true' || isReadParam === '1' : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const result = await staffAlertService.listAlerts({
      userId: actor.id,
      branchId: actor.branchId,
      isRead,
      limit,
    });

    res.status(200).json({
      data: result.alerts,
      meta: {
        unreadCount: result.unreadCount,
        total: result.alerts.length,
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 2. POST /:id/read - Mark single alert as read
staffAlertsRouter.post(
  '/:id/read',
  requireAuth,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const alertId = req.params.id;
      const actor = extractActor(req);
      const alert = await staffAlertService.markAsRead(alertId, actor.id);

      res.status(200).json({
        data: alert,
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

// 3. POST /read-all - Mark all alerts as read
staffAlertsRouter.post(
  '/read-all',
  requireAuth,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = extractActor(req);
      const count = await staffAlertService.markAllAsRead(actor.id, actor.branchId);

      res.status(200).json({
        data: { markedReadCount: count },
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
