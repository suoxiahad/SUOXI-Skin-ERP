import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateCsrf } from '../auth/csrf.js';
import { billingService } from '../services/billingService.js';
import {
  ValidationError,
  ForbiddenError,
  NotFoundError,
} from '../middleware/errorHandler.js';

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
    fullName: req.accessContext?.user?.fullName || req.user?.fullName || 'Staff User',
    role: req.accessContext?.roles?.[0] || req.user?.roles?.[0] || 'admin',
    roles: req.accessContext?.roles || req.user?.roles || ['admin'],
    branchId: req.accessContext?.user?.branchId || req.user?.branchId || 'br-dhk-01',
    permissions: req.accessContext?.permissions || [],
  };
}

function checkPermission(req: any, permission: string): boolean {
  if (req.accessContext?.hasPermission && req.accessContext.hasPermission(permission)) {
    return true;
  }
  const roles: string[] = req.accessContext?.roles || req.user?.roles || [];
  if (roles.includes('super_admin') || roles.includes('admin')) {
    return true;
  }
  if (
    permission === 'billing.view' &&
    (roles.includes('cashier') ||
      roles.includes('doctor') ||
      roles.includes('receptionist') ||
      roles.includes('accounts'))
  ) {
    return true;
  }
  if (
    permission === 'billing.create' &&
    (roles.includes('cashier') || roles.includes('receptionist') || roles.includes('accounts'))
  ) {
    return true;
  }
  if (
    permission === 'billing.refund' &&
    (roles.includes('cashier') || roles.includes('accounts') || roles.includes('admin'))
  ) {
    return true;
  }
  if (permission === 'billing.void' && (roles.includes('admin') || roles.includes('super_admin'))) {
    return true;
  }
  if (
    permission === 'export.run' &&
    (roles.includes('admin') || roles.includes('cashier') || roles.includes('accounts'))
  ) {
    return true;
  }
  return false;
}

// ============================================================================
// 1. INVOICES ROUTER (/invoices)
// ============================================================================
export const invoicesRouter = Router();

const dbIdSchema = z.union([z.number().int().positive(), z.string().trim().min(1)]);

// Validation Schemas
const CreateInvoiceSchema = z.object({
  patientId: dbIdSchema,
  branchId: dbIdSchema,
  appointmentId: dbIdSchema.optional().nullable(),
  consultationId: dbIdSchema.optional().nullable(),
  invoiceDate: z.string().optional(),
  dueDate: z.string().optional(),
  discountPercent: z.union([z.string(), z.number()]).optional(),
  discountAmount: z.union([z.string(), z.number()]).optional(),
  discountReason: z.string().max(255).optional().nullable(),
  discountAuthorizedBy: dbIdSchema.optional().nullable(),
  taxPercent: z.union([z.string(), z.number()]).optional(),
  taxAmount: z.union([z.string(), z.number()]).optional(),
  notes: z.string().max(2000).optional().nullable(),
  issueImmediately: z.boolean().optional(),
  items: z
    .array(
      z.object({
        itemType: z.enum(['treatment', 'package', 'product', 'other']),
        serviceId: dbIdSchema.optional().nullable(),
        packageId: dbIdSchema.optional().nullable(),
        productId: dbIdSchema.optional().nullable(),
        description: z.string().min(1).max(255),
        quantity: z.coerce.number().int().min(1),
        unitPrice: z.union([z.string(), z.number()]),
        discountAmount: z.union([z.string(), z.number()]).optional(),
      })
    )
    .min(1),
});

const VoidInvoiceSchema = z.object({
  voidReason: z.string().min(3).max(255),
});

// GET /invoices
invoicesRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'billing.view')) {
      throw new ForbiddenError('Permission denied: billing.view required to list invoices');
    }
    const list = await billingService.listInvoices({
      patientId: req.query.patientId as string,
      branchId: req.query.branchId as string,
      status: req.query.status as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
    });
    res.status(200).json({
      data: list,
      meta: {
        total: list.length,
        requestId: (req as any).id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /invoices/:id
invoicesRouter.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'billing.view')) {
      throw new ForbiddenError('Permission denied: billing.view required');
    }
    const inv = await billingService.getInvoiceById(req.params.id);
    res.status(200).json({
      data: inv,
      meta: {
        requestId: (req as any).id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /invoices
invoicesRouter.post('/', requireAuth, verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'billing.create')) {
      throw new ForbiddenError('Permission denied: billing.create required to create invoices');
    }
    const parsed = CreateInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError((parsed.error.issues || (parsed.error as any).errors || []).map((e: any) => e.message).join(', '));
    }
    const actor = extractActor(req);
    const invoice = await billingService.createInvoice(parsed.data as any, actor);
    res.status(201).json({
      data: invoice,
      meta: {
        requestId: (req as any).id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /invoices/:id/issue
invoicesRouter.post('/:id/issue', requireAuth, verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'billing.create')) {
      throw new ForbiddenError('Permission denied: billing.create required');
    }
    const actor = extractActor(req);
    const invoice = await billingService.issueInvoice(req.params.id, actor);
    res.status(200).json({
      data: invoice,
      meta: {
        requestId: (req as any).id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /invoices/:id/void
invoicesRouter.post('/:id/void', requireAuth, verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'billing.void')) {
      throw new ForbiddenError('Permission denied: billing.void required to void an invoice');
    }
    const parsed = VoidInvoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError((parsed.error.issues || (parsed.error as any).errors || []).map((e: any) => e.message).join(', '));
    }
    const actor = extractActor(req);
    const invoice = await billingService.voidInvoice(req.params.id, parsed.data, actor);
    res.status(200).json({
      data: invoice,
      meta: {
        requestId: (req as any).id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 2. PAYMENTS ROUTER (/payments)
// ============================================================================
export const paymentsRouter = Router();

const RecordPaymentSchema = z
  .object({
    patientId: dbIdSchema,
    branchId: dbIdSchema,
    paymentMethodId: dbIdSchema.optional(),
    paymentMethodCode: z.string().trim().min(1).optional(),
    amount: z.union([z.string(), z.number()]),
    paymentDate: z.string().optional(),
    transactionReference: z.string().max(128).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    isAdvance: z.boolean().optional(),
    allocations: z
      .array(
        z.object({
          invoiceId: dbIdSchema,
          amount: z.union([z.string(), z.number()]),
        })
      )
      .optional(),
  })
  .refine((data) => Boolean(data.paymentMethodId || data.paymentMethodCode), {
    message: 'Either paymentMethodId or paymentMethodCode is required',
  });

const AllocatePaymentSchema = z.object({
  allocations: z
    .array(
      z.object({
        invoiceId: dbIdSchema,
        amount: z.union([z.string(), z.number()]),
      })
    )
    .min(1),
});

// GET /payments
paymentsRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'billing.view')) {
      throw new ForbiddenError('Permission denied: billing.view required');
    }
    const list = await billingService.listPayments({
      patientId: req.query.patientId as string,
      branchId: req.query.branchId as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
    });
    res.status(200).json({
      data: list,
      meta: {
        total: list.length,
        requestId: (req as any).id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /payments/:id
paymentsRouter.get('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'billing.view')) {
      throw new ForbiddenError('Permission denied: billing.view required');
    }
    const p = await billingService.getPaymentById(req.params.id);
    res.status(200).json({
      data: p,
      meta: {
        requestId: (req as any).id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /payments (Idempotency-Key required for money mutations)
paymentsRouter.post('/', requireAuth, verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'billing.create')) {
      throw new ForbiddenError('Permission denied: billing.create required to record payments');
    }
    const parsed = RecordPaymentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError((parsed.error.issues || (parsed.error as any).errors || []).map((e: any) => e.message).join(', '));
    }

    const idempotencyKey =
      (req.headers['idempotency-key'] as string) ||
      (req.headers['x-idempotency-key'] as string);

    if (!idempotencyKey) {
      throw new ValidationError('Idempotency-Key header is required for recording payments (Engineering Rule 5)');
    }

    const actor = extractActor(req);
    const payment = await billingService.recordPayment(parsed.data as any, idempotencyKey, actor);
    res.status(201).json({
      data: payment,
      meta: {
        requestId: (req as any).id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /payments/:id/allocate
paymentsRouter.post(
  '/:id/allocate',
  requireAuth,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!checkPermission(req, 'billing.create')) {
        throw new ForbiddenError('Permission denied: billing.create required');
      }
      const parsed = AllocatePaymentSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError((parsed.error.issues || (parsed.error as any).errors || []).map((e: any) => e.message).join(', '));
      }
      const actor = extractActor(req);
      const payment = await billingService.allocatePayment(req.params.id, parsed.data as any, actor);
      res.status(200).json({
        data: payment,
        meta: {
          requestId: (req as any).id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// 3. RECEIPTS ROUTER (/receipts)
// ============================================================================
export const receiptsRouter = Router();

// GET /receipts/:paymentId (printable)
receiptsRouter.get('/:paymentId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'billing.view')) {
      throw new ForbiddenError('Permission denied: billing.view required to view receipts');
    }
    const receipt = await billingService.getReceipt(req.params.paymentId);
    res.status(200).json({
      data: receipt,
      meta: {
        requestId: (req as any).id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// 4. REFUNDS ROUTER (/refunds)
// ============================================================================
export const refundsRouter = Router();

const RequestRefundSchema = z.object({
  sourcePaymentId: dbIdSchema,
  invoiceId: dbIdSchema.optional().nullable(),
  amount: z.union([z.string(), z.number()]),
  reason: z.string().min(3).max(255),
  refundMethodId: dbIdSchema.optional().nullable(),
  refundMethodCode: z.string().trim().min(1).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const ApproveRefundSchema = z.object({
  notes: z.string().max(2000).optional().nullable(),
});

const MarkRefundPaidSchema = z.object({
  refundMethodId: dbIdSchema.optional().nullable(),
  refundMethodCode: z.string().trim().min(1).optional().nullable(),
  transactionReference: z.string().max(128).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// GET /refunds
refundsRouter.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'billing.view')) {
      throw new ForbiddenError('Permission denied: billing.view required');
    }
    const list = await billingService.listRefunds({
      patientId: req.query.patientId as string,
      status: req.query.status as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
    });
    res.status(200).json({
      data: list,
      meta: {
        total: list.length,
        requestId: (req as any).id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /refunds
refundsRouter.post('/', requireAuth, verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'billing.refund')) {
      throw new ForbiddenError('Permission denied: billing.refund privilege required');
    }
    const parsed = RequestRefundSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError((parsed.error.issues || (parsed.error as any).errors || []).map((e: any) => e.message).join(', '));
    }
    const actor = extractActor(req);
    const refund = await billingService.requestRefund(parsed.data as any, actor);
    res.status(201).json({
      data: refund,
      meta: {
        requestId: (req as any).id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /refunds/:id/approve
refundsRouter.post(
  '/:id/approve',
  requireAuth,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!checkPermission(req, 'billing.refund')) {
        throw new ForbiddenError('Permission denied: billing.refund privilege required');
      }
      const parsed = ApproveRefundSchema.safeParse(req.body);
      const actor = extractActor(req);
      const approvePayload = parsed.success
        ? { notes: parsed.data.notes ?? undefined }
        : {};
      const refund = await billingService.approveRefund(req.params.id, approvePayload, actor);
      res.status(200).json({
        data: refund,
        meta: {
          requestId: (req as any).id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /refunds/:id/mark-paid
refundsRouter.post(
  '/:id/mark-paid',
  requireAuth,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!checkPermission(req, 'billing.refund')) {
        throw new ForbiddenError('Permission denied: billing.refund privilege required');
      }
      const parsed = MarkRefundPaidSchema.safeParse(req.body);
      const actor = extractActor(req);
      const paidPayload = parsed.success
        ? {
            refundMethodId: parsed.data.refundMethodId ?? undefined,
            refundMethodCode: parsed.data.refundMethodCode ?? undefined,
            transactionReference: parsed.data.transactionReference ?? undefined,
            notes: parsed.data.notes ?? undefined,
          }
        : {};
      const refund = await billingService.markRefundPaid(req.params.id, paidPayload, actor);
      res.status(200).json({
        data: refund,
        meta: {
          requestId: (req as any).id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================================
// 5. BILLING & COLLECTIONS ROUTER (/billing)
// ============================================================================
export const billingRouter = Router();

// GET /billing/payment-methods
billingRouter.get('/payment-methods', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await billingService.getPaymentMethods();
    res.status(200).json({
      data: list,
      meta: {
        total: list.length,
        requestId: (req as any).id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /billing/collections
billingRouter.get('/collections', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'billing.view')) {
      throw new ForbiddenError('Permission denied: billing.view required');
    }
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
    const branchId = req.query.branchId as string;
    const actor = extractActor(req);
    const report = await billingService.getDailyCollections(date, branchId, actor);
    res.status(200).json({
      data: report,
      meta: {
        requestId: (req as any).id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /billing/patients/:id/dues
billingRouter.get('/patients/:id/dues', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkPermission(req, 'billing.view')) {
      throw new ForbiddenError('Permission denied: billing.view required');
    }
    const dues = await billingService.getPatientDues(req.params.id);
    res.status(200).json({
      data: dues,
      meta: {
        requestId: (req as any).id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});
