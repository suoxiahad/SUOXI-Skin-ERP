import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateCsrf } from '../auth/csrf.js';
import { referralService } from '../services/referralService.js';
import { BadRequestError, ForbiddenError } from '../middleware/errorHandler.js';

export const referralsRouter = Router();

// CSRF Verification for state-changing requests
const verifyCsrf = (req: any, _res: any, next: any) => {
  try {
    if (req.sessionId && req.sessionId !== 'dev-staff-session') {
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
    fullName: req.accessContext?.user?.fullName || req.user?.fullName || 'Staff User',
    role: req.accessContext?.roles?.[0] || req.user?.roles?.[0] || 'admin',
    roles: req.accessContext?.roles || req.user?.roles || ['admin'],
    branchId: req.accessContext?.user?.branchId || req.user?.branchId || 'br-dhk-01',
    permissions: req.accessContext?.effectivePermissions || new Set<string>(),
  };
}

function checkPermission(req: any, permission: string): boolean {
  if (req.accessContext?.hasPermission && req.accessContext.hasPermission(permission)) {
    return true;
  }
  const roles: string[] = req.accessContext?.roles || req.user?.roles || [];
  if (roles.includes('super_admin') || roles.includes('admin') || roles.includes('admin_manager')) {
    return true;
  }
  if (
    permission === 'referral.view' &&
    (roles.includes('cashier') || roles.includes('accounts') || roles.includes('doctor') || roles.includes('receptionist'))
  ) {
    return true;
  }
  if (
    permission === 'referral.create' &&
    (roles.includes('cashier') || roles.includes('accounts') || roles.includes('receptionist'))
  ) {
    return true;
  }
  return false;
}

function getRequestId(req: Request): string {
  return (req as any).id || crypto.randomUUID();
}

function formatZodError(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || 'field'}: ${i.message}`).join(', ');
}

const CreateReferrerSchema = z.object({
  referrerType: z.enum(['doctor', 'patient', 'staff', 'agent', 'organization']),
  fullName: z.string().min(2).max(150),
  fullNameBn: z.string().max(150).optional().nullable(),
  mobile: z.string().min(11).max(20),
  email: z.string().email().optional().nullable().or(z.literal('')),
  organizationName: z.string().max(150).optional().nullable(),
  payoutMethod: z.enum(['bank_transfer', 'bKash', 'Nagad', 'cash', 'cheque']).default('bank_transfer'),
  payoutAccountDetails: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const UpdateReferrerSchema = CreateReferrerSchema.partial().extend({
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
});

const dbIdSchema = z.union([z.number().int().positive(), z.string().trim().min(1)]);

const AssignPatientReferrerSchema = z.object({
  referrerId: dbIdSchema,
  attributionReason: z.string().min(3).max(255),
});

// 1. GET /api/v1/referrals - List referrers
referralsRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'referral.view')) {
      throw new ForbiddenError('Insufficient permissions to view referrers');
    }
    const actor = extractActor(req);
    const search = req.query.search as string | undefined;
    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    const result = await referralService.listReferrers({ search, type, status, page, limit }, actor);

    res.status(200).json({
      data: result.data,
      meta: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        requestId: getRequestId(req),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 2. POST /api/v1/referrals - Create referrer
referralsRouter.post('/', requireAuth, verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'referral.create')) {
      throw new ForbiddenError('Insufficient permissions to create referrers');
    }
    const actor = extractActor(req);
    const parsed = CreateReferrerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(`Validation error: ${formatZodError(parsed.error)}`);
    }

    const created = await referralService.createReferrer(parsed.data as any, actor);

    res.status(201).json({
      data: created,
      meta: {
        requestId: getRequestId(req),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 3. GET /api/v1/referrals/:id - Referrer by ID
referralsRouter.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'referral.view')) {
      throw new ForbiddenError('Insufficient permissions to view referrer');
    }
    const actor = extractActor(req);
    const ref = await referralService.getReferrerById(req.params.id, actor);

    res.status(200).json({
      data: ref,
      meta: {
        requestId: getRequestId(req),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 4. PATCH /api/v1/referrals/:id - Update referrer
referralsRouter.patch('/:id', requireAuth, verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'referral.create')) {
      throw new ForbiddenError('Insufficient permissions to update referrer');
    }
    const actor = extractActor(req);
    const parsed = UpdateReferrerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(`Validation error: ${formatZodError(parsed.error)}`);
    }

    const updated = await referralService.updateReferrer(req.params.id, parsed.data as any, actor);

    res.status(200).json({
      data: updated,
      meta: {
        requestId: getRequestId(req),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 5. GET /api/v1/referrals/:id/detail - Referrer full summary, attributions, commissions, payouts
referralsRouter.get('/:id/detail', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'referral.view')) {
      throw new ForbiddenError('Insufficient permissions to view referrer detail');
    }
    const actor = extractActor(req);
    const detail = await referralService.getReferrerDetail(req.params.id, actor);

    res.status(200).json({
      data: detail,
      meta: {
        requestId: getRequestId(req),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 6. POST /api/v1/referrals/patients/:patientId/assign - Assign or re-attribute patient referrer
referralsRouter.post('/patients/:patientId/assign', requireAuth, verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'referral.create')) {
      throw new ForbiddenError('Insufficient permissions to assign patient referrer');
    }
    const actor = extractActor(req);
    const parsed = AssignPatientReferrerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(`Validation error: ${formatZodError(parsed.error)}`);
    }

    const attribution = await referralService.assignPatientReferrer(
      req.params.patientId,
      parsed.data,
      actor
    );

    res.status(201).json({
      data: attribution,
      meta: {
        requestId: getRequestId(req),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 7. GET /api/v1/referrals/patients/:patientId/history - Patient referral history
referralsRouter.get('/patients/:patientId/history', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'referral.view')) {
      throw new ForbiddenError('Insufficient permissions to view patient referral history');
    }
    const history = referralService.getPatientReferralHistory(req.params.patientId);
    const current = referralService.getPatientCurrentReferrer(req.params.patientId);

    res.status(200).json({
      data: {
        current,
        history,
      },
      meta: {
        requestId: getRequestId(req),
      },
    });
  } catch (err) {
    next(err);
  }
});
