/**
 * SUOXI Skin Care & Aesthetic Center ERP
 * PostgreSQL Express Router: Standalone Clinic Store Module
 */

import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { User } from '../../src/types/index.ts';
import {
  canUserAccessBranch,
  hasPermissionCode,
  resolveAuthorizedBranchScope,
  resolveEffectivePermissions,
} from '../auth/rbacMiddleware.ts';
import { isPostgresConfigured } from '../db/pgPool.ts';
import { pgClinicStoreRepo } from '../repositories/pgClinicStoreRepo.ts';
import { extractClientIp, pgRequireBranch, sendPgError, sendPgSuccess } from '../repositories/pgHelpers.ts';

export interface PgClinicStoreRouterDeps {
  getCurrentUser: () => User;
  checkIdempotency: (req: Request, res: Response, next: NextFunction) => void;
  saveIdempotency: (key: string | undefined, statusCode: number, body: unknown) => void;
}

const STORE_CATEGORY_ENUM = z.enum([
  'Clinical & Hygiene Consumables',
  'Clinical Instruments & Tools',
  'Office & Front-Desk Supplies',
]);

const STORE_UNIT_ENUM = z.enum(['pieces', 'boxes', 'bottles', 'packs', 'reams', 'sets', 'rolls']);

function handleRouteErr(res: Response, err: unknown, fallback: string) {
  const e = err as Error & { statusCode?: number; code?: string; details?: unknown };
  const status = e.statusCode || (e.code === '23505' ? 409 : 500);
  return sendPgError(res, status, e.code || 'INTERNAL_ERROR', e.message || fallback, e.details);
}

export function createPgClinicStoreRouter(deps: PgClinicStoreRouterDeps): express.Router {
  const router = express.Router();

  router.use((_req, _res, next) => {
    if (!isPostgresConfigured()) return next('router');
    return next();
  });

  const param = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] || '' : v || '');

  const requireAnyStorePerm = (codes: string[]) => {
    return async (req: Request, res: Response, next: NextFunction) => {
      const actor = deps.getCurrentUser();
      if (!actor) return sendPgError(res, 401, 'AUTH_REQUIRED', 'Authentication required');
      const granted = Array.from(await resolveEffectivePermissions(actor));
      if (!codes.some((c) => hasPermissionCode(granted, c))) {
        return sendPgError(res, 403, 'FORBIDDEN', `Missing required store permission (${codes.join(' or ')})`);
      }
      return next();
    };
  };

  // ---------------------------------------------------------------------------
  // Store Catalog & Stock
  // ---------------------------------------------------------------------------
  router.get(
    '/api/v1/store/items',
    requireAnyStorePerm(['store:read', 'store:request', 'store:manage', 'store:*']),
    async (req, res) => {
      try {
        const actor = deps.getCurrentUser();
        const scope = await resolveAuthorizedBranchScope(actor, req.query.branchId as string | undefined);
        if (!scope.allowed) return sendPgError(res, 403, 'FORBIDDEN', 'Branch access denied');

        const items = await pgClinicStoreRepo.listItems({
          branchId: scope.branchId,
          category: req.query.category as string | undefined,
          status: req.query.status as string | undefined,
          search: req.query.search as string | undefined,
        });

        const granted = Array.from(await resolveEffectivePermissions(actor));
        const canSeeCost =
          hasPermissionCode(granted, 'store:manage') || hasPermissionCode(granted, 'store:reports');
        const sanitized = canSeeCost ? items : items.map((it) => ({ ...it, unitCostBDT: 0 }));

        return sendPgSuccess(res, sanitized, { total: sanitized.length });
      } catch (err) {
        return handleRouteErr(res, err, 'Failed to load Clinic Store items');
      }
    }
  );

  router.post(
    '/api/v1/store/items',
    requireAnyStorePerm(['store:manage', 'store:*']),
    async (req, res) => {
      const schema = z.object({
        name: z.string().min(2),
        category: STORE_CATEGORY_ENUM,
        subCategory: z.string().optional(),
        unit: STORE_UNIT_ENUM.default('pieces'),
        currentStock: z.number().int().min(0).default(0),
        reorderLevel: z.number().int().min(0).default(5),
        unitCostBDT: z.number().min(0).default(0),
        vendorName: z.string().optional(),
        storageLocation: z.string().optional(),
        branchId: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid Clinic Store item payload', parsed.error.format());
      }

      try {
        const actor = deps.getCurrentUser();
        const branch = await pgRequireBranch(parsed.data.branchId || actor.branchId);
        if (!(await canUserAccessBranch(actor, branch.id))) {
          return sendPgError(res, 403, 'FORBIDDEN', 'Unauthorized branch for Clinic Store item');
        }
        const created = await pgClinicStoreRepo.createItem(
          { ...parsed.data, branchId: branch.id },
          actor,
          extractClientIp(req.headers, req.ip)
        );
        return sendPgSuccess(res, created, {}, 201);
      } catch (err) {
        return handleRouteErr(res, err, 'Failed to create Clinic Store item');
      }
    }
  );

  router.patch(
    '/api/v1/store/items/:id',
    requireAnyStorePerm(['store:manage', 'store:*']),
    async (req, res) => {
      try {
        const updated = await pgClinicStoreRepo.updateItem(
          param(req.params.id),
          req.body || {},
          deps.getCurrentUser(),
          extractClientIp(req.headers, req.ip)
        );
        if (!updated) return sendPgError(res, 404, 'NOT_FOUND', 'Clinic Store item not found');
        return sendPgSuccess(res, updated);
      } catch (err) {
        return handleRouteErr(res, err, 'Failed to update Clinic Store item');
      }
    }
  );

  router.post(
    '/api/v1/store/items/:id/stock-in',
    requireAnyStorePerm(['store:manage', 'store:*']),
    deps.checkIdempotency,
    async (req, res) => {
      const schema = z.object({
        quantity: z.number().int().positive(),
        unitCostBDT: z.number().min(0).optional(),
        vendorName: z.string().optional(),
        referenceNo: z.string().optional(),
        notes: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid stock-in payload', parsed.error.format());
      }
      try {
        const result = await pgClinicStoreRepo.stockInItem(
          param(req.params.id),
          parsed.data,
          deps.getCurrentUser(),
          extractClientIp(req.headers, req.ip)
        );
        deps.saveIdempotency(req.headers['idempotency-key'] as string | undefined, 201, { data: result });
        return sendPgSuccess(res, result, {}, 201);
      } catch (err) {
        return handleRouteErr(res, err, 'Failed to stock in Clinic Store item');
      }
    }
  );

  router.post(
    '/api/v1/store/items/:id/adjust',
    requireAnyStorePerm(['store:manage', 'store:*']),
    deps.checkIdempotency,
    async (req, res) => {
      const schema = z.object({
        adjustmentType: z.enum(['damaged', 'expired', 'wastage', 'audit_correction']),
        quantityDelta: z.number().int().refine((v) => v !== 0, 'Quantity delta cannot be zero'),
        reason: z.string().min(4, 'Reason must be at least 4 characters'),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid adjustment payload', parsed.error.format());
      }
      try {
        const result = await pgClinicStoreRepo.adjustItemStock(
          param(req.params.id),
          parsed.data,
          deps.getCurrentUser(),
          extractClientIp(req.headers, req.ip)
        );
        deps.saveIdempotency(req.headers['idempotency-key'] as string | undefined, 201, { data: result });
        return sendPgSuccess(res, result, {}, 201);
      } catch (err) {
        return handleRouteErr(res, err, 'Failed to adjust Clinic Store stock');
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Requisitions & Issue
  // ---------------------------------------------------------------------------
  router.get(
    '/api/v1/store/requisitions',
    requireAnyStorePerm(['store:request', 'store:manage', 'store:*']),
    async (req, res) => {
      try {
        const actor = deps.getCurrentUser();
        const scope = await resolveAuthorizedBranchScope(actor, req.query.branchId as string | undefined);
        if (!scope.allowed) return sendPgError(res, 403, 'FORBIDDEN', 'Branch access denied');

        const granted = Array.from(await resolveEffectivePermissions(actor));
        const isManager = hasPermissionCode(granted, 'store:manage');
        const list = await pgClinicStoreRepo.listRequisitions({
          branchId: scope.branchId,
          status: req.query.status as string | undefined,
          requestedById: isManager ? undefined : actor.id,
        });
        const sanitized = isManager
          ? list
          : list.map((r) => ({
              ...r,
              totalEstimatedCostBDT: 0,
              items: r.items.map((it) => ({ ...it, unitCostBDT: 0 })),
            }));
        return sendPgSuccess(res, sanitized, { total: sanitized.length });
      } catch (err) {
        return handleRouteErr(res, err, 'Failed to load store requisitions');
      }
    }
  );

  router.post(
    '/api/v1/store/requisitions',
    requireAnyStorePerm(['store:request', 'store:manage', 'store:*']),
    deps.checkIdempotency,
    async (req, res) => {
      const schema = z.object({
        department: z.string().min(2),
        roomNumber: z.string().optional(),
        priority: z.enum(['normal', 'urgent']).default('normal'),
        notes: z.string().optional(),
        branchId: z.string().optional(),
        items: z
          .array(
            z.object({
              itemId: z.string().min(1),
              requestedQty: z.number().int().positive(),
            })
          )
          .min(1),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid requisition payload', parsed.error.format());
      }
      try {
        const actor = deps.getCurrentUser();
        const branch = await pgRequireBranch(parsed.data.branchId || actor.branchId);
        if (!(await canUserAccessBranch(actor, branch.id))) {
          return sendPgError(res, 403, 'FORBIDDEN', 'Cannot create requisition in unauthorized branch');
        }
        const created = await pgClinicStoreRepo.createRequisition(
          { ...parsed.data, branchId: branch.id },
          actor,
          extractClientIp(req.headers, req.ip)
        );
        const granted = Array.from(await resolveEffectivePermissions(actor));
        const canSeeCost =
          hasPermissionCode(granted, 'store:manage') || hasPermissionCode(granted, 'store:reports');
        const out = canSeeCost
          ? created
          : {
              ...created,
              totalEstimatedCostBDT: 0,
              items: created.items.map((it) => ({ ...it, unitCostBDT: 0 })),
            };
        deps.saveIdempotency(req.headers['idempotency-key'] as string | undefined, 201, { data: out });
        return sendPgSuccess(res, out, {}, 201);
      } catch (err) {
        return handleRouteErr(res, err, 'Failed to submit requisition');
      }
    }
  );

  router.post(
    '/api/v1/store/requisitions/:id/approve',
    requireAnyStorePerm(['store:manage', 'store:*']),
    async (req, res) => {
      const schema = z.object({
        decision: z.enum(['approve', 'reject']).default('approve'),
        rejectionReason: z.string().optional(),
        approvedQuantities: z.record(z.string(), z.number().int().min(0)).optional(),
      });
      const parsed = schema.safeParse(req.body || {});
      if (!parsed.success) {
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid approval payload', parsed.error.format());
      }
      try {
        const updated = await pgClinicStoreRepo.decideRequisition(
          param(req.params.id),
          parsed.data,
          deps.getCurrentUser(),
          extractClientIp(req.headers, req.ip)
        );
        return sendPgSuccess(res, updated);
      } catch (err) {
        return handleRouteErr(res, err, 'Failed to process requisition decision');
      }
    }
  );

  router.post(
    '/api/v1/store/requisitions/:id/issue',
    requireAnyStorePerm(['store:manage', 'store:*']),
    deps.checkIdempotency,
    async (req, res) => {
      const schema = z.object({
        issueQuantities: z.record(z.string(), z.number().int().min(0)).optional(),
        notes: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body || {});
      if (!parsed.success) {
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid issue payload', parsed.error.format());
      }
      try {
        const updated = await pgClinicStoreRepo.issueRequisition(
          param(req.params.id),
          parsed.data,
          deps.getCurrentUser(),
          extractClientIp(req.headers, req.ip)
        );
        deps.saveIdempotency(req.headers['idempotency-key'] as string | undefined, 200, { data: updated });
        return sendPgSuccess(res, updated);
      } catch (err) {
        return handleRouteErr(res, err, 'Failed to issue requisition items');
      }
    }
  );

  router.post(
    '/api/v1/store/requisitions/:id/confirm-receipt',
    requireAnyStorePerm(['store:request', 'store:manage', 'store:*']),
    async (req, res) => {
      try {
        const actor = deps.getCurrentUser();
        const updated = await pgClinicStoreRepo.confirmReceipt(
          param(req.params.id),
          actor,
          extractClientIp(req.headers, req.ip)
        );
        const granted = Array.from(await resolveEffectivePermissions(actor));
        const canSeeCost =
          hasPermissionCode(granted, 'store:manage') || hasPermissionCode(granted, 'store:reports');
        const out = canSeeCost
          ? updated
          : {
              ...updated,
              totalEstimatedCostBDT: 0,
              items: updated.items.map((it) => ({ ...it, unitCostBDT: 0 })),
            };
        return sendPgSuccess(res, out);
      } catch (err) {
        return handleRouteErr(res, err, 'Failed to confirm receipt');
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Instruments & Custody
  // ---------------------------------------------------------------------------
  router.get(
    '/api/v1/store/instruments',
    requireAnyStorePerm(['store:read', 'store:manage', 'store:*']),
    async (req, res) => {
      try {
        const actor = deps.getCurrentUser();
        const scope = await resolveAuthorizedBranchScope(actor, req.query.branchId as string | undefined);
        if (!scope.allowed) return sendPgError(res, 403, 'FORBIDDEN', 'Branch access denied');
        const list = await pgClinicStoreRepo.listInstruments({
          branchId: scope.branchId,
          custodyStatus: req.query.custodyStatus as string | undefined,
          condition: req.query.condition as string | undefined,
          search: req.query.search as string | undefined,
        });
        const granted = Array.from(await resolveEffectivePermissions(actor));
        const canSeeCost =
          hasPermissionCode(granted, 'store:manage') || hasPermissionCode(granted, 'store:reports');
        const sanitized = canSeeCost ? list : list.map((i) => ({ ...i, purchaseCostBDT: 0 }));
        return sendPgSuccess(res, sanitized, { total: sanitized.length });
      } catch (err) {
        return handleRouteErr(res, err, 'Failed to load instruments');
      }
    }
  );

  router.post(
    '/api/v1/store/instruments',
    requireAnyStorePerm(['store:manage', 'store:*']),
    async (req, res) => {
      const schema = z.object({
        name: z.string().min(2),
        category: z.string().optional(),
        serialNumber: z.string().optional(),
        purchaseCostBDT: z.number().min(0).default(0),
        assignedRoom: z.string().optional(),
        assignedToUserName: z.string().optional(),
        notes: z.string().optional(),
        branchId: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid instrument payload', parsed.error.format());
      }
      try {
        const actor = deps.getCurrentUser();
        const branch = await pgRequireBranch(parsed.data.branchId || actor.branchId);
        if (!(await canUserAccessBranch(actor, branch.id))) {
          return sendPgError(res, 403, 'FORBIDDEN', 'Unauthorized branch for instrument');
        }
        const created = await pgClinicStoreRepo.createInstrument(
          { ...parsed.data, branchId: branch.id },
          actor,
          extractClientIp(req.headers, req.ip)
        );
        return sendPgSuccess(res, created, {}, 201);
      } catch (err) {
        return handleRouteErr(res, err, 'Failed to register instrument');
      }
    }
  );

  router.post(
    '/api/v1/store/instruments/:id/assign',
    requireAnyStorePerm(['store:manage', 'store:*']),
    async (req, res) => {
      const schema = z.object({
        assignedRoom: z.string().min(1),
        assignedToUserId: z.string().optional(),
        assignedToUserName: z.string().min(2),
        notes: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid assignment payload', parsed.error.format());
      }
      try {
        const updated = await pgClinicStoreRepo.assignInstrument(
          param(req.params.id),
          parsed.data,
          deps.getCurrentUser(),
          extractClientIp(req.headers, req.ip)
        );
        return sendPgSuccess(res, updated);
      } catch (err) {
        return handleRouteErr(res, err, 'Failed to assign instrument');
      }
    }
  );

  router.post(
    '/api/v1/store/instruments/:id/return',
    requireAnyStorePerm(['store:manage', 'store:*']),
    async (req, res) => {
      const schema = z.object({
        condition: z.enum(['good', 'under_repair', 'damaged']).default('good'),
        notes: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body || {});
      if (!parsed.success) {
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid return payload', parsed.error.format());
      }
      try {
        const updated = await pgClinicStoreRepo.returnInstrument(
          param(req.params.id),
          parsed.data,
          deps.getCurrentUser(),
          extractClientIp(req.headers, req.ip)
        );
        return sendPgSuccess(res, updated);
      } catch (err) {
        return handleRouteErr(res, err, 'Failed to return instrument');
      }
    }
  );

  router.post(
    '/api/v1/store/instruments/:id/status',
    requireAnyStorePerm(['store:read', 'store:manage', 'store:*']),
    async (req, res) => {
      const schema = z.object({
        condition: z.enum(['good', 'in_use', 'under_repair', 'damaged', 'retired']),
        notes: z.string().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid status payload', parsed.error.format());
      }
      try {
        const actor = deps.getCurrentUser();
        const granted = Array.from(await resolveEffectivePermissions(actor));
        const isManager = hasPermissionCode(granted, 'store:manage');
        if (!isManager && !['under_repair', 'damaged'].includes(parsed.data.condition)) {
          return sendPgError(
            res,
            403,
            'FORBIDDEN',
            'Clinical staff can only report an instrument as damaged or needing repair'
          );
        }
        const updated = await pgClinicStoreRepo.updateInstrumentStatus(
          param(req.params.id),
          parsed.data,
          actor,
          extractClientIp(req.headers, req.ip)
        );
        const canSeeCost =
          hasPermissionCode(granted, 'store:manage') || hasPermissionCode(granted, 'store:reports');
        return sendPgSuccess(res, canSeeCost ? updated : { ...updated, purchaseCostBDT: 0 });
      } catch (err) {
        return handleRouteErr(res, err, 'Failed to update instrument status');
      }
    }
  );

  // ---------------------------------------------------------------------------
  // Store Ledger & OPEX Summary
  // ---------------------------------------------------------------------------
  router.get(
    '/api/v1/store/ledger',
    requireAnyStorePerm(['store:reports', 'store:manage', 'store:*']),
    async (req, res) => {
      try {
        const actor = deps.getCurrentUser();
        const scope = await resolveAuthorizedBranchScope(actor, req.query.branchId as string | undefined);
        if (!scope.allowed) return sendPgError(res, 403, 'FORBIDDEN', 'Branch access denied');

        const [entries, summary] = await Promise.all([
          pgClinicStoreRepo.listLedger({
            branchId: scope.branchId,
            movementType: req.query.movementType as string | undefined,
            search: req.query.search as string | undefined,
          }),
          pgClinicStoreRepo.getSummary(scope.branchId),
        ]);
        return sendPgSuccess(res, { entries, summary }, { total: entries.length });
      } catch (err) {
        return handleRouteErr(res, err, 'Failed to load Clinic Store ledger');
      }
    }
  );

  return router;
}
