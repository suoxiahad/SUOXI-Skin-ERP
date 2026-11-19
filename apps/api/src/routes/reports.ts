import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateCsrf } from '../auth/csrf.js';
import { reportService } from '../services/reportService.js';
import { ForbiddenError, BadRequestError } from '../middleware/errorHandler.js';
import type { ApiResponse } from '@suoxi/shared-types';

export const reportsRouter = Router();

// CSRF check for state-changing endpoints (e.g. export)
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

function getRequestId(req: Request): string {
  return (req as any).id || crypto.randomUUID();
}

function checkReportPermission(req: Request, permission: string): boolean {
  if (req.accessContext?.hasPermission(permission)) {
    return true;
  }
  const roles: string[] = req.accessContext?.roles || [];
  if (roles.includes('super_admin') || roles.includes('admin_manager')) {
    return true;
  }
  if (permission === 'report.revenue.view' && (roles.includes('cashier') || roles.includes('accounts'))) {
    return true;
  }
  if (permission === 'report.clinical.view' && roles.includes('doctor')) {
    return true;
  }
  if (permission === 'report.call_center.view' && roles.includes('call_center')) {
    return true;
  }
  if (permission === 'report.inventory.view' && roles.includes('inventory_manager')) {
    return true;
  }
  if (permission === 'report.referral.view' && (roles.includes('cashier') || roles.includes('accounts'))) {
    return true;
  }
  if (permission === 'report.notifications.view' && (roles.includes('super_admin') || roles.includes('admin_manager'))) {
    return true;
  }
  if (permission === 'export.run' && (roles.includes('super_admin') || roles.includes('admin_manager'))) {
    return true;
  }
  return false;
}

function enforcePermission(req: Request, permission: string): void {
  if (!checkReportPermission(req, permission)) {
    throw new ForbiddenError(
      `Access Denied: Missing required permission "${permission}" for this report`,
      { requiredPermission: permission }
    );
  }
}

// -----------------------------------------------------------------------------
// 1. GET /api/v1/reports/revenue (report.revenue.view)
// -----------------------------------------------------------------------------
reportsRouter.get('/revenue', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    enforcePermission(req, 'report.revenue.view');

    const from = (req.query.from as string) || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
    const branchId = req.query.branchId as string | undefined;
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);

    const report = await reportService.getRevenueReport(
      { from, to, branchId, page, limit },
      req.accessContext
    );

    const payload: ApiResponse<typeof report> = {
      data: report,
      meta: {
        requestId: getRequestId(req),
        timestamp: new Date().toISOString(),
      },
    };

    res.status(200).json(payload);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 2. GET /api/v1/reports/doctor-activity (report.clinical.view)
// -----------------------------------------------------------------------------
reportsRouter.get('/doctor-activity', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    enforcePermission(req, 'report.clinical.view');

    const from = (req.query.from as string) || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
    const branchId = req.query.branchId as string | undefined;
    const doctorId = req.query.doctorId as string | undefined;
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);

    const report = await reportService.getDoctorActivityReport(
      { from, to, branchId, doctorId, page, limit },
      req.accessContext
    );

    const payload: ApiResponse<typeof report> = {
      data: report,
      meta: {
        requestId: getRequestId(req),
        timestamp: new Date().toISOString(),
      },
    };

    res.status(200).json(payload);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 3. GET /api/v1/reports/follow-ups (report.call_center.view)
// -----------------------------------------------------------------------------
reportsRouter.get('/follow-ups', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    enforcePermission(req, 'report.call_center.view');

    const from = (req.query.from as string) || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
    const branchId = req.query.branchId as string | undefined;
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);

    const report = await reportService.getFollowUpReport(
      { from, to, branchId, page, limit },
      req.accessContext
    );

    const payload: ApiResponse<typeof report> = {
      data: report,
      meta: {
        requestId: getRequestId(req),
        timestamp: new Date().toISOString(),
      },
    };

    res.status(200).json(payload);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 4. GET /api/v1/reports/inventory (report.inventory.view)
// -----------------------------------------------------------------------------
reportsRouter.get('/inventory', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    enforcePermission(req, 'report.inventory.view');

    const from = (req.query.from as string) || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
    const branchId = req.query.branchId as string | undefined;
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);

    const report = await reportService.getInventoryReport(
      { from, to, branchId, page, limit },
      req.accessContext
    );

    const payload: ApiResponse<typeof report> = {
      data: report,
      meta: {
        requestId: getRequestId(req),
        timestamp: new Date().toISOString(),
      },
    };

    res.status(200).json(payload);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 5. GET /api/v1/reports/referrals (report.referral.view)
// -----------------------------------------------------------------------------
reportsRouter.get('/referrals', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    enforcePermission(req, 'report.referral.view');

    const from = (req.query.from as string) || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
    const branchId = req.query.branchId as string | undefined;
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);

    const report = await reportService.getReferralReport(
      { from, to, branchId, page, limit },
      req.accessContext
    );

    const payload: ApiResponse<typeof report> = {
      data: report,
      meta: {
        requestId: getRequestId(req),
        timestamp: new Date().toISOString(),
      },
    };

    res.status(200).json(payload);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 6. GET /api/v1/reports/sms (report.notifications.view)
// -----------------------------------------------------------------------------
reportsRouter.get('/sms', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    enforcePermission(req, 'report.notifications.view');

    const from = (req.query.from as string) || new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
    const branchId = req.query.branchId as string | undefined;
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '20', 10);

    const report = await reportService.getSmsReport(
      { from, to, branchId, page, limit },
      req.accessContext
    );

    const payload: ApiResponse<typeof report> = {
      data: report,
      meta: {
        requestId: getRequestId(req),
        timestamp: new Date().toISOString(),
      },
    };

    res.status(200).json(payload);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 7. POST /api/v1/reports/export (export.run + CSRF)
// -----------------------------------------------------------------------------
const dbIdSchema = z.union([z.number().int().positive(), z.string().trim().min(1)]);

const exportSchema = z.object({
  reportType: z.enum(['revenue', 'doctor_activity', 'follow_up', 'inventory', 'referral', 'sms']),
  format: z.enum(['csv', 'pdf']),
  from: z.string().min(10).max(10),
  to: z.string().min(10).max(10),
  branchId: dbIdSchema.optional(),
  doctorId: dbIdSchema.optional(),
  serviceId: dbIdSchema.optional(),
  paymentMethod: z.string().optional(),
});

reportsRouter.post('/export', requireAuth, verifyCsrf, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    enforcePermission(req, 'export.run');

    const parsed = exportSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid export request parameters', parsed.error.format());
    }

    const actor = {
      id: req.accessContext?.userId || 'usr-export-01',
      name: req.accessContext?.username || 'Staff User',
      ip: req.ip || req.socket.remoteAddress || '127.0.0.1',
      userAgent: req.headers['user-agent'],
    };

    const result = await reportService.exportReport(parsed.data, actor, req.accessContext);

    // If client requested downloadable attachment via Accept header or query
    if (req.headers.accept?.includes('text/csv') || req.query.download === 'true') {
      res.setHeader('Content-Type', result.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
      res.status(200).send(result.content);
      return;
    }

    // Standard JSON envelope response containing content & metadata
    const payload: ApiResponse<typeof result> = {
      data: result,
      meta: {
        requestId: getRequestId(req),
        timestamp: new Date().toISOString(),
      },
    };

    res.status(200).json(payload);
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------------------
// 8. GET /api/v1/reports/export-logs (export.run)
// -----------------------------------------------------------------------------
reportsRouter.get('/export-logs', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    enforcePermission(req, 'export.run');

    const logs = reportService.getExportLogs(50);
    const payload: ApiResponse<typeof logs> = {
      data: logs,
      meta: {
        requestId: getRequestId(req),
        timestamp: new Date().toISOString(),
      },
    };

    res.status(200).json(payload);
  } catch (err) {
    next(err);
  }
});
