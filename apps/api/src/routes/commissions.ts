import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateCsrf } from '../auth/csrf.js';
import { referralService } from '../services/referralService.js';
import { processOutboxDomainEvents } from '../services/commissionWorker.js';
import { BadRequestError, ForbiddenError } from '../middleware/errorHandler.js';

export const commissionsRouter = Router();

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
    permission === 'commission.view' &&
    (roles.includes('cashier') || roles.includes('accounts') || roles.includes('doctor'))
  ) {
    return true;
  }
  if (
    (permission === 'commission.approve' || permission === 'commission.payout') &&
    (roles.includes('cashier') || roles.includes('accounts'))
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

const dbIdSchema = z.union([z.number().int().positive(), z.string().trim().min(1)]);

const CreateCommissionRuleSchema = z.object({
  ruleName: z.string().min(2).max(150),
  description: z.string().optional().nullable(),
  referrerType: z.enum(['doctor', 'patient', 'staff', 'agent', 'organization', 'all']).default('all'),
  calculationType: z.enum(['percentage', 'fixed']).default('percentage'),
  rateValue: z.number().positive(),
  basis: z.enum(['paid_amount', 'invoice_total', 'service_price', 'package_price']).default('paid_amount'),
  appliesTo: z.enum(['all', 'service', 'package']).default('all'),
  serviceId: dbIdSchema.optional().nullable(),
  packageId: dbIdSchema.optional().nullable(),
  firstPurchaseOnly: z.boolean().default(false),
  minBaseAmount: z.number().min(0).default(0),
  maxCommissionAmount: z.number().positive().optional().nullable(),
  refundPolicy: z.enum(['none', 'full_reversal', 'proportional']).default('proportional'),
  withholdingTaxPercent: z.number().min(0).max(100).default(0),
  validFrom: z.string().min(10),
  validTo: z.string().min(10).optional().nullable(),
  isActive: z.boolean().default(true),
});

const ApproveCommissionsSchema = z.object({
  commissionIds: z.array(dbIdSchema).min(1),
});

const CreatePayoutSchema = z.object({
  referrerId: dbIdSchema,
  commissionIds: z.array(dbIdSchema).min(1),
  payoutMethod: z.enum(['bank_transfer', 'bKash', 'Nagad', 'cash', 'cheque']),
  paymentReference: z.string().min(2).max(100),
  paidDate: z.string().optional(),
  notes: z.string().optional().nullable(),
});

// 1. GET /api/v1/commissions - List commissions ledger
commissionsRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'commission.view')) {
      throw new ForbiddenError('Insufficient permissions to view commissions');
    }
    const referrerId = req.query.referrerId as string | undefined;
    const patientId = req.query.patientId as string | undefined;
    const status = req.query.status as any;
    const kind = req.query.kind as any;

    const list = referralService.listCommissions({ referrerId, patientId, status, kind });

    res.status(200).json({
      data: list,
      meta: {
        total: list.length,
        requestId: getRequestId(req),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 2. POST /api/v1/commissions/approve - Approve pending commissions
commissionsRouter.post('/approve', requireAuth, verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'commission.approve')) {
      throw new ForbiddenError('Insufficient permissions to approve commissions');
    }
    const actor = extractActor(req);
    const parsed = ApproveCommissionsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(`Validation error: ${formatZodError(parsed.error)}`);
    }

    const approved = await referralService.approveCommissions(parsed.data.commissionIds, actor);

    res.status(200).json({
      data: approved,
      meta: {
        count: approved.length,
        requestId: getRequestId(req),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 3. GET /api/v1/commissions/rules - List commission rules
commissionsRouter.get('/rules', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'commission.view')) {
      throw new ForbiddenError('Insufficient permissions to view commission rules');
    }
    const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
    const referrerType = req.query.referrerType as string | undefined;

    const rules = referralService.listCommissionRules({ isActive, referrerType });

    res.status(200).json({
      data: rules,
      meta: {
        total: rules.length,
        requestId: getRequestId(req),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 4. POST /api/v1/commissions/rules - Create commission rule
commissionsRouter.post('/rules', requireAuth, verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'commission.rule_manage')) {
      throw new ForbiddenError('Insufficient permissions to manage commission rules');
    }
    const actor = extractActor(req);
    const parsed = CreateCommissionRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(`Validation error: ${formatZodError(parsed.error)}`);
    }

    const created = await referralService.createCommissionRule(parsed.data as any, actor);

    res.status(201).json({
      data: created,
      meta: {
        requestId: getRequestId(req),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 5. PATCH /api/v1/commissions/rules/:id - Update commission rule
commissionsRouter.patch('/rules/:id', requireAuth, verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'commission.rule_manage')) {
      throw new ForbiddenError('Insufficient permissions to manage commission rules');
    }
    const actor = extractActor(req);
    const parsed = CreateCommissionRuleSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(`Validation error: ${formatZodError(parsed.error)}`);
    }

    const updated = await referralService.updateCommissionRule(req.params.id, parsed.data as any, actor);

    res.status(200).json({
      data: updated,
      meta: {
        requestId: getRequestId(req),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 6. GET /api/v1/commissions/payouts - List commission payouts
commissionsRouter.get('/payouts', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'commission.view')) {
      throw new ForbiddenError('Insufficient permissions to view payouts');
    }
    const referrerId = req.query.referrerId as string | undefined;
    const payouts = referralService.listPayouts({ referrerId });

    res.status(200).json({
      data: payouts,
      meta: {
        total: payouts.length,
        requestId: getRequestId(req),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 7. POST /api/v1/commissions/payouts - Create payout settlement
commissionsRouter.post('/payouts', requireAuth, verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'commission.payout')) {
      throw new ForbiddenError('Insufficient permissions to create commission payouts');
    }
    const actor = extractActor(req);
    const parsed = CreatePayoutSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError(`Validation error: ${formatZodError(parsed.error)}`);
    }

    const payout = await referralService.createPayout({
      ...parsed.data,
      notes: parsed.data.notes || undefined,
    }, actor);

    res.status(201).json({
      data: payout,
      meta: {
        requestId: getRequestId(req),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 8. POST /api/v1/commissions/process-outbox - Process outbox events
commissionsRouter.post('/process-outbox', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await processOutboxDomainEvents();
    res.status(200).json({
      data: result,
      meta: {
        requestId: getRequestId(req),
      },
    });
  } catch (err) {
    next(err);
  }
});
