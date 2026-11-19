/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * Phase 3 PostgreSQL Operational Modules Express Router
 *
 * Covers:
 *  - Inventory, Non-Destructive Stock Adjustments, Suppliers, Purchase Orders & GRN (ACID)
 *  - Call Center "Tomorrow's Sessions" Workbench (Independent Call/SMS Status + Safe Appointment Sync)
 *  - Referrals & Commission Management (AES-256-GCM Payout Details, Rules, Ledger & Payouts)
 *  - Audit Events
 *  - SMS (msg.mram.com.bd) & Email (cPanel SMTP) Gateways
 *  - Clinic Settings (General, Scheduling, Security), Backup Snapshots & Active Sessions
 *
 * Automatically activates when `DATABASE_URL` (postgresql://...) is configured.
 * Falls through transparently via `next('router')` when running in prototype preview mode.
 */

import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { User } from '../../src/types/index.ts';
import { isPostgresConfigured } from '../db/pgPool.ts';
import { pgCallCenterReferralsRepo } from '../repositories/pgCallCenterReferralsRepo.ts';
import {
  extractClientIp,
  sendPgError,
  sendPgSuccess,
} from '../repositories/pgHelpers.ts';
import { pgInventoryRepo } from '../repositories/pgInventoryRepo.ts';
import { pgOpsSettingsRepo } from '../repositories/pgOpsSettingsRepo.ts';

export interface PgOpsRouterDeps {
  getCurrentUser: () => User;
  checkIdempotency: (req: Request, res: Response, next: NextFunction) => void;
  saveIdempotency: (key: string | undefined, statusCode: number, body: unknown) => void;
  getServerOutgoingIp?: () => Promise<string>;
}

function handlePgRouteError(res: Response, err: unknown, fallbackMessage: string) {
  const e = err as Error & { statusCode?: number; code?: string; details?: unknown };
  const status = e.statusCode || (e.code === '23505' ? 409 : 500);
  const code =
    e.code && !/^\d+$/.test(e.code)
      ? e.code
      : status === 404
      ? 'NOT_FOUND'
      : status === 409
      ? 'CONFLICT'
      : status === 422
      ? 'UNPROCESSABLE_ENTITY'
      : status === 402
      ? 'PAYMENT_REQUIRED'
      : status === 400
      ? 'BAD_REQUEST'
      : 'INTERNAL_ERROR';
  return sendPgError(res, status, code, e.message || fallbackMessage, e.details);
}

const dbIdSchema = z.union([z.number().int().positive(), z.string().trim().min(1)]).transform(String);

const createReferrerSchema = z.object({
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

const updateReferrerSchema = createReferrerSchema.partial().extend({
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
});

const assignPatientReferrerSchema = z.object({
  referrerId: dbIdSchema,
  attributionReason: z.string().min(3).max(255),
});

const createCommissionRuleSchema = z.object({
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

const approveCommissionsSchema = z.object({
  commissionIds: z.array(dbIdSchema).min(1),
});

const createPayoutSchema = z.object({
  referrerId: dbIdSchema,
  commissionIds: z.array(dbIdSchema).min(1),
  payoutMethod: z.enum(['bank_transfer', 'bKash', 'Nagad', 'cash', 'cheque']),
  paymentReference: z.string().min(2).max(100),
  paidDate: z.string().optional(),
  notes: z.string().optional().nullable(),
});

export function createPgOpsRouter(deps: PgOpsRouterDeps): express.Router {
  const router = express.Router();

  // Only intercept when PostgreSQL is configured
  router.use((_req, _res, next) => {
    if (!isPostgresConfigured()) {
      return next('router');
    }
    return next();
  });

  // ===========================================================================
  // 1. INVENTORY, STOCK ADJUSTMENTS, SUPPLIERS, PURCHASE ORDERS & GRN
  // ===========================================================================

  router.get('/api/v1/inventory', async (req, res) => {
    try {
      const list = await pgInventoryRepo.listInventory({
        branchId: req.query.branchId as string | undefined,
        category: req.query.category as string | undefined,
        productType: req.query.productType as string | undefined,
        status: req.query.status as string | undefined,
        search: req.query.search as string | undefined,
      });
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load inventory');
    }
  });

  router.post('/api/v1/inventory', async (req, res) => {
    const schema = z.object({
      name: z.string().min(2),
      category: z.enum(['Serums & Peels', 'Laser Consumables', 'Injectables', 'Post-Care Creams', 'Disposables']),
      brand: z.string().min(1),
      productType: z.enum(['retail', 'consumable', 'dual_use']).default('retail'),
      currentStock: z.number().int().min(0).default(0),
      unit: z.enum(['vials', 'bottles', 'boxes', 'pieces', 'tubes']),
      reorderLevel: z.number().int().min(1).default(5),
      unitCostBDT: z.number().min(0),
      sellingPriceBDT: z.number().min(0),
      batchNumber: z.string().min(1),
      expiryDate: z.string().min(4),
      barcode: z.string().optional(),
      sku: z.string().optional(),
      description: z.string().optional(),
      usageProtocol: z.string().optional(),
      branchId: z.string().default('br-dhanmondi'),
      branchName: z.string().default('Dhanmondi Main Center'),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid product data', parsed.error.format());
    }

    try {
      const created = await pgInventoryRepo.createInventoryItem(
        parsed.data,
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to create inventory product');
    }
  });

  router.get('/api/v1/inventory/adjustments', async (_req, res) => {
    try {
      const list = await pgInventoryRepo.listAdjustments();
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load stock adjustments');
    }
  });

  router.post('/api/v1/inventory/adjust', deps.checkIdempotency, async (req, res) => {
    const schema = z.object({
      itemId: z.string(),
      adjustmentType: z.enum(['damaged', 'expired', 'clinic_use', 'restock', 'tester', 'audit_correction']),
      quantityDelta: z.number().int().refine((val) => val !== 0, 'Delta cannot be zero'),
      reason: z.string().min(5, 'A clinical or audit reason is required'),
      batchNumber: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid stock adjustment', parsed.error.format());
    }

    try {
      const result = await pgInventoryRepo.adjustStock(
        parsed.data,
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      deps.saveIdempotency(idempotencyKey, 201, { data: result });
      return sendPgSuccess(res, result, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to adjust stock');
    }
  });

  router.get('/api/v1/inventory/suppliers', async (_req, res) => {
    try {
      const list = await pgInventoryRepo.listSuppliers();
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load suppliers');
    }
  });

  router.post('/api/v1/inventory/suppliers', async (req, res) => {
    const schema = z.object({
      name: z.string().min(2),
      contactPerson: z.string().min(2),
      phone: z.string().min(6),
      email: z.string().email(),
      address: z.string().min(5),
      brandsSupplied: z.array(z.string()).default([]),
      paymentTerms: z.enum(['Net 15', 'Net 30', 'Cash on Delivery', 'Advance']).default('Net 30'),
      balanceDueBDT: z.number().min(0).default(0),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid supplier data', parsed.error.format());
    }

    try {
      const created = await pgInventoryRepo.createSupplier(
        parsed.data,
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to create supplier');
    }
  });

  router.get('/api/v1/inventory/purchases', async (_req, res) => {
    try {
      const list = await pgInventoryRepo.listPurchaseOrders();
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load purchase orders');
    }
  });

  router.post('/api/v1/inventory/purchases', async (req, res) => {
    const schema = z.object({
      supplierId: z.string(),
      expectedDeliveryDate: z.string(),
      items: z
        .array(
          z.object({
            itemId: z.string(),
            orderedQty: z.number().int().positive(),
            unitCostBDT: z.number().min(0),
          })
        )
        .min(1),
      notes: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid PO payload', parsed.error.format());
    }

    try {
      const created = await pgInventoryRepo.createPurchaseOrder(
        parsed.data,
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to create purchase order');
    }
  });

  router.post('/api/v1/inventory/purchases/:id/receive', async (req, res) => {
    const schema = z.object({
      invoiceRefNumber: z.string().optional(),
      notes: z.string().optional(),
      items: z
        .array(
          z.object({
            itemId: z.string(),
            batchNumber: z.string().min(1),
            expiryDate: z.string().min(4),
            receivedQty: z.number().int().min(0),
            condition: z.enum(['good', 'damaged']).default('good'),
          })
        )
        .min(1),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid GRN payload', parsed.error.format());
    }

    try {
      const result = await pgInventoryRepo.receiveGRN(
        req.params.id,
        parsed.data,
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      return sendPgSuccess(res, result, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to receive GRN');
    }
  });

  router.get('/api/v1/inventory/grns', async (_req, res) => {
    try {
      const list = await pgInventoryRepo.listGoodsReceivedNotes();
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load GRNs');
    }
  });

  router.patch('/api/v1/inventory/:id', async (req, res) => {
    try {
      const updated = await pgInventoryRepo.updateInventoryItem(
        req.params.id,
        req.body,
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      if (!updated) {
        return sendPgError(res, 404, 'NOT_FOUND', 'Product not found');
      }
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to update inventory item');
    }
  });

  // ===========================================================================
  // 2. CALL CENTER "TOMORROW'S SESSIONS" WORKBENCH
  // ===========================================================================

  router.get('/api/v1/call-center/tomorrow-calls', async (_req, res) => {
    try {
      const list = await pgCallCenterReferralsRepo.listTomorrowCalls();
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load call center queue');
    }
  });

  router.patch('/api/v1/call-center/calls/:id', async (req, res) => {
    const schema = z.object({
      callStatus: z
        .enum([
          'pending',
          'call_attempted',
          'confirmed',
          'rescheduled',
          'no_answer',
          'left_voicemail',
          'cancelled',
        ])
        .optional(),
      smsStatus: z.enum(['pending', 'gateway_accepted', 'sent', 'failed']).optional(),
      callNotes: z.string().optional(),
      callOutcome: z.string().optional(),
      patientIntent: z.string().optional(),
      followupPurpose: z.string().optional(),
      nextFollowupDate: z.string().optional(),
      nextFollowupTime: z.string().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid call log data', parsed.error.format());
    }

    try {
      const updated = await pgCallCenterReferralsRepo.updateCallTask(
        req.params.id,
        parsed.data,
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      if (!updated) {
        return sendPgError(res, 404, 'NOT_FOUND', 'Call task not found');
      }
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to update call task');
    }
  });

  // ===========================================================================
  // 3. REFERRALS & COMMISSION MANAGEMENT
  // ===========================================================================

  router.get('/api/v1/referrals', async (req, res) => {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const result = await pgCallCenterReferralsRepo.listReferrers({
        search: req.query.search as string | undefined,
        type: req.query.type as string | undefined,
        status: req.query.status as string | undefined,
        page,
        limit,
      });
      return sendPgSuccess(res, result.data, {
        total: result.total,
        page: result.page,
        limit: result.limit,
      });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load referrers');
    }
  });

  router.post('/api/v1/referrals', async (req, res) => {
    const parsed = createReferrerSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid referrer payload', parsed.error.format());
    }

    try {
      const created = await pgCallCenterReferralsRepo.createReferrer(
        parsed.data,
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to create referrer');
    }
  });

  router.post('/api/v1/referrals/patients/:patientId/assign', async (req, res) => {
    const parsed = assignPatientReferrerSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid referral attribution payload', parsed.error.format());
    }

    try {
      const created = await pgCallCenterReferralsRepo.assignPatientReferrer(
        req.params.patientId,
        parsed.data,
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to assign patient referrer');
    }
  });

  router.get('/api/v1/referrals/patients/:patientId/history', async (req, res) => {
    try {
      const data = await pgCallCenterReferralsRepo.getPatientReferralHistory(req.params.patientId);
      return sendPgSuccess(res, data);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load patient referral history');
    }
  });

  router.get('/api/v1/referrals/:id/detail', async (req, res) => {
    try {
      const actor = deps.getCurrentUser();
      const revealSecrets = actor.role === 'super_admin';
      const detail = await pgCallCenterReferralsRepo.getReferrerDetail(req.params.id, revealSecrets);
      if (!detail) {
        return sendPgError(res, 404, 'NOT_FOUND', `Referrer '${req.params.id}' not found`);
      }
      return sendPgSuccess(res, detail);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load referrer details');
    }
  });

  router.get('/api/v1/referrals/:id', async (req, res) => {
    try {
      const actor = deps.getCurrentUser();
      const revealSecrets = actor.role === 'super_admin';
      const ref = await pgCallCenterReferralsRepo.getReferrerById(req.params.id, revealSecrets);
      if (!ref) {
        return sendPgError(res, 404, 'NOT_FOUND', `Referrer '${req.params.id}' not found`);
      }
      return sendPgSuccess(res, ref);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load referrer');
    }
  });

  router.patch('/api/v1/referrals/:id', async (req, res) => {
    const parsed = updateReferrerSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid referrer update payload', parsed.error.format());
    }

    try {
      const updated = await pgCallCenterReferralsRepo.updateReferrer(
        req.params.id,
        parsed.data,
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      if (!updated) {
        return sendPgError(res, 404, 'NOT_FOUND', `Referrer '${req.params.id}' not found`);
      }
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to update referrer');
    }
  });

  router.get('/api/v1/commissions', async (req, res) => {
    try {
      const list = await pgCallCenterReferralsRepo.listCommissions({
        referrerId: req.query.referrerId as string | undefined,
        patientId: req.query.patientId as string | undefined,
        status: req.query.status as string | undefined,
        kind: req.query.kind as string | undefined,
      });
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load commissions');
    }
  });

  router.post('/api/v1/commissions/approve', async (req, res) => {
    const parsed = approveCommissionsSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid approval payload', parsed.error.format());
    }

    try {
      const approved = await pgCallCenterReferralsRepo.approveCommissions(
        parsed.data.commissionIds,
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      return sendPgSuccess(res, approved, { count: approved.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to approve commissions');
    }
  });

  router.get('/api/v1/commissions/rules', async (req, res) => {
    try {
      const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
      const rules = await pgCallCenterReferralsRepo.listCommissionRules({
        isActive,
        referrerType: req.query.referrerType as string | undefined,
      });
      return sendPgSuccess(res, rules, { total: rules.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load commission rules');
    }
  });

  router.post('/api/v1/commissions/rules', async (req, res) => {
    const parsed = createCommissionRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid commission rule payload', parsed.error.format());
    }

    try {
      const created = await pgCallCenterReferralsRepo.createCommissionRule(
        parsed.data,
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to create commission rule');
    }
  });

  router.patch('/api/v1/commissions/rules/:id', async (req, res) => {
    const parsed = createCommissionRuleSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid commission rule update payload', parsed.error.format());
    }

    try {
      const updated = await pgCallCenterReferralsRepo.updateCommissionRule(
        req.params.id,
        parsed.data,
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      if (!updated) {
        return sendPgError(res, 404, 'NOT_FOUND', `Commission rule '${req.params.id}' not found`);
      }
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to update commission rule');
    }
  });

  router.get('/api/v1/commissions/payouts', async (req, res) => {
    try {
      const list = await pgCallCenterReferralsRepo.listPayouts({
        referrerId: req.query.referrerId as string | undefined,
      });
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load commission payouts');
    }
  });

  router.post('/api/v1/commissions/payouts', async (req, res) => {
    const parsed = createPayoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid payout payload', parsed.error.format());
    }

    try {
      const payout = await pgCallCenterReferralsRepo.createPayout(
        {
          ...parsed.data,
          notes: parsed.data.notes || undefined,
        },
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      return sendPgSuccess(res, payout, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to create payout');
    }
  });

  router.post('/api/v1/commissions/process-outbox', async (_req, res) => {
    return sendPgSuccess(res, { processed: 0, mode: 'postgresql_direct' });
  });

  // ===========================================================================
  // 4. AUDIT EVENTS
  // ===========================================================================

  router.get('/api/v1/audit-events', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 250;
      const list = await pgOpsSettingsRepo.listAuditEvents(limit);
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load audit events');
    }
  });

  // ===========================================================================
  // 5. INTEGRATIONS: SMS (msg.mram.com.bd) & EMAIL (cPanel SMTP)
  // ===========================================================================

  router.get('/api/v1/integration/sms/config', async (_req, res) => {
    try {
      const cfg = await pgOpsSettingsRepo.getSmsConfig();
      return sendPgSuccess(res, cfg);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load SMS configuration');
    }
  });

  router.put('/api/v1/integration/sms/config', async (req, res) => {
    try {
      const saved = await pgOpsSettingsRepo.updateSmsConfig(
        req.body || {},
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      return sendPgSuccess(res, saved);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to update SMS configuration');
    }
  });

  router.get('/api/v1/integration/sms/balance', async (_req, res) => {
    try {
      const bal = await pgOpsSettingsRepo.checkSmsBalance(deps.getCurrentUser());
      return sendPgSuccess(res, bal);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to check SMS balance');
    }
  });

  router.post('/api/v1/integration/sms/send', async (req, res) => {
    const { recipientPhone, messageContent, messageType, label, senderId, recipientName, triggerEvent } = req.body || {};
    if (!recipientPhone || !messageContent) {
      return sendPgError(res, 400, 'SMS_VALIDATION_FAILED', 'Recipient phone and message content are required');
    }

    try {
      const serverIp = deps.getServerOutgoingIp ? await deps.getServerOutgoingIp() : 'VPS Server IP';
      const result = await pgOpsSettingsRepo.sendSms(
        { recipientPhone, messageContent, messageType, label, senderId, recipientName, triggerEvent },
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip),
        serverIp
      );
      return sendPgSuccess(res, result.body, {}, result.statusCode);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to send SMS');
    }
  });

  router.get('/api/v1/integration/sms/logs', async (_req, res) => {
    try {
      const list = await pgOpsSettingsRepo.listSmsLogs();
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load SMS logs');
    }
  });

  router.get('/api/v1/integration/sms/templates', async (_req, res) => {
    try {
      const list = await pgOpsSettingsRepo.listSmsTemplates();
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load SMS templates');
    }
  });

  router.post('/api/v1/integration/sms/templates', async (req, res) => {
    try {
      const created = await pgOpsSettingsRepo.createSmsTemplate(req.body || {});
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to create SMS template');
    }
  });

  router.put('/api/v1/integration/sms/templates/:id', async (req, res) => {
    try {
      const updated = await pgOpsSettingsRepo.updateSmsTemplate(req.params.id, req.body || {});
      if (!updated) {
        return sendPgError(res, 404, 'NOT_FOUND', 'SMS template not found');
      }
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to update SMS template');
    }
  });

  router.get('/api/v1/integration/email/config', async (_req, res) => {
    try {
      const cfg = await pgOpsSettingsRepo.getEmailConfig();
      return sendPgSuccess(res, cfg);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load Email configuration');
    }
  });

  router.put('/api/v1/integration/email/config', async (req, res) => {
    try {
      const saved = await pgOpsSettingsRepo.updateEmailConfig(
        req.body || {},
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      return sendPgSuccess(res, saved);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to update Email configuration');
    }
  });

  router.post('/api/v1/integration/email/send-test', async (req, res) => {
    const { recipientEmail, subject } = req.body || {};
    if (!recipientEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
      return sendPgError(res, 400, 'INVALID_EMAIL', 'A valid recipient email address is required');
    }

    try {
      const result = await pgOpsSettingsRepo.sendTestEmail(
        { recipientEmail, subject },
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      return sendPgSuccess(res, result);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to send test email');
    }
  });

  router.get('/api/v1/integration/email/logs', async (_req, res) => {
    try {
      const list = await pgOpsSettingsRepo.listEmailLogs();
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load Email logs');
    }
  });

  router.get('/api/v1/integration/email/templates', async (_req, res) => {
    try {
      const list = await pgOpsSettingsRepo.listEmailTemplates();
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load Email templates');
    }
  });

  router.put('/api/v1/integration/email/templates/:id', async (req, res) => {
    try {
      const updated = await pgOpsSettingsRepo.updateEmailTemplate(req.params.id, req.body || {});
      if (!updated) {
        return sendPgError(res, 404, 'NOT_FOUND', 'Email template not found');
      }
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to update Email template');
    }
  });

  // ===========================================================================
  // 6. SYSTEM SETTINGS, BACKUP RECORDS & ACTIVE SESSIONS
  // ===========================================================================

  router.get('/api/v1/settings/general', async (_req, res) => {
    try {
      const data = await pgOpsSettingsRepo.getGeneralSettings();
      return sendPgSuccess(res, data);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load general settings');
    }
  });

  router.put('/api/v1/settings/general', async (req, res) => {
    try {
      const saved = await pgOpsSettingsRepo.updateGeneralSettings(
        req.body || {},
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      return sendPgSuccess(res, saved);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to update general settings');
    }
  });

  router.get('/api/v1/settings/scheduling', async (_req, res) => {
    try {
      const data = await pgOpsSettingsRepo.getSchedulingSettings();
      return sendPgSuccess(res, data);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load scheduling settings');
    }
  });

  router.put('/api/v1/settings/scheduling', async (req, res) => {
    try {
      const saved = await pgOpsSettingsRepo.updateSchedulingSettings(
        req.body || {},
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      return sendPgSuccess(res, saved);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to update scheduling settings');
    }
  });

  router.get('/api/v1/settings/security', async (_req, res) => {
    try {
      const data = await pgOpsSettingsRepo.getSecuritySettings();
      return sendPgSuccess(res, data);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load security settings');
    }
  });

  router.put('/api/v1/settings/security', async (req, res) => {
    try {
      const saved = await pgOpsSettingsRepo.updateSecuritySettings(
        req.body || {},
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      return sendPgSuccess(res, saved);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to update security settings');
    }
  });

  router.get('/api/v1/settings/backups', async (_req, res) => {
    try {
      const list = await pgOpsSettingsRepo.listBackups();
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load backup snapshots');
    }
  });

  router.post('/api/v1/settings/backups/create', async (req, res) => {
    try {
      const backupType = (req.body?.backupType || 'manual') as 'auto_daily' | 'manual' | 'pre_update';
      const created = await pgOpsSettingsRepo.createBackupRecord(
        backupType,
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to create backup record');
    }
  });

  router.get('/api/v1/settings/backups/download/:id', async (req, res) => {
    try {
      const bkp = await pgOpsSettingsRepo.getBackupById(req.params.id);
      if (!bkp) {
        return sendPgError(res, 404, 'NOT_FOUND', 'Backup snapshot not found');
      }
      const counts = await pgOpsSettingsRepo.getDatabaseTableCounts();
      const summary = `-- SUOXI Skin Care & Aesthetic Center CRM — PostgreSQL Backup Manifest
-- Snapshot: ${bkp.filename}
-- Created At: ${bkp.createdAt}
-- Generated By: ${bkp.createdBy}
-- Total Records: ${bkp.totalRecords}
-- Engine: PostgreSQL (VPS Production)
--
-- Live Table Row Counts:
--   branches:           ${counts.branches}
--   users:              ${counts.users}
--   patients:           ${counts.patients}
--   appointments:       ${counts.appointments}
--   invoices:           ${counts.invoices}
--   prescriptions:      ${counts.prescriptions}
--   inventory_items:    ${counts.inventory}
--   treatment_packages: ${counts.packages}
--   audit_events:       ${counts.auditEvents}
--
-- Note: Full encrypted pg_dump archives are stored in Cloudflare R2 via automated cron backup.
`;
      res.setHeader('Content-Type', 'application/sql');
      res.setHeader('Content-Disposition', `attachment; filename="${bkp.filename}.sql"`);
      return res.send(summary);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to download backup manifest');
    }
  });

  router.post('/api/v1/settings/backups/restore/:id', async (req, res) => {
    try {
      const result = await pgOpsSettingsRepo.recordBackupRestore(
        req.params.id,
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      if (!result) {
        return sendPgError(res, 404, 'NOT_FOUND', 'Backup snapshot not found');
      }
      return sendPgSuccess(res, result);
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to process restore request');
    }
  });

  router.get('/api/v1/settings/sessions', async (req, res) => {
    try {
      const currentSessionId = (req as Request & { sessionId?: string }).sessionId;
      const list = await pgOpsSettingsRepo.listActiveSessions(currentSessionId);
      return sendPgSuccess(res, list, { total: list.length });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to load active sessions');
    }
  });

  router.post('/api/v1/settings/sessions/revoke/:id', async (req, res) => {
    try {
      const revoked = await pgOpsSettingsRepo.revokeSession(
        req.params.id,
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      if (!revoked) {
        return sendPgError(res, 404, 'NOT_FOUND', 'Session not found');
      }
      return sendPgSuccess(res, {
        success: true,
        message: `Session revoked for ${revoked.userName}`,
      });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to revoke session');
    }
  });

  router.post('/api/v1/settings/sessions/revoke-all', async (req, res) => {
    try {
      const currentSessionId = (req as Request & { sessionId?: string }).sessionId;
      const count = await pgOpsSettingsRepo.revokeAllOtherSessions(
        currentSessionId,
        deps.getCurrentUser(),
        extractClientIp(req.headers, req.ip)
      );
      return sendPgSuccess(res, {
        success: true,
        message: `Terminated ${count} concurrent sessions across all terminals`,
      });
    } catch (err) {
      return handlePgRouteError(res, err, 'Failed to revoke concurrent sessions');
    }
  });

  return router;
}
