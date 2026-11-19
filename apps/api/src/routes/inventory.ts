import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateCsrf } from '../auth/csrf.js';
import { inventoryService } from '../services/inventoryService.js';
import {
  BadRequestError,
  ForbiddenError,
  NotFoundError,
} from '../middleware/errorHandler.js';

export const inventoryRouter = Router();

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
  if (roles.includes('super_admin') || roles.includes('admin') || roles.includes('inventory_manager')) {
    return true;
  }
  if (permission === 'inventory.view' || permission === 'inventory:products') {
    return (
      roles.includes('doctor') ||
      roles.includes('therapist') ||
      roles.includes('receptionist') ||
      roles.includes('cashier') ||
      roles.includes('accounts')
    );
  }
  if (permission === 'inventory.adjust' || permission === 'inventory:adjust') {
    return roles.includes('super_admin') || roles.includes('admin') || roles.includes('inventory_manager');
  }
  return false;
}

// All inventory endpoints require authentication
inventoryRouter.use(requireAuth);

// --- 1. Product Categories ---
inventoryRouter.get('/categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await inventoryService.listCategories();
    res.status(200).json({
      data: list,
      meta: { total: list.length, requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

const createCategorySchema = z.object({
  category_code: z.string().min(2).max(32),
  name: z.string().min(2).max(150),
  name_bn: z.string().max(150).optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional(),
});

inventoryRouter.post('/categories', verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createCategorySchema.parse(req.body);
    const cat = await inventoryService.createCategory(parsed);
    res.status(201).json({
      data: cat,
      meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// --- 2. Products ---
inventoryRouter.get('/products', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { categoryId, search, activeOnly, branchId } = req.query;
    const actor = extractActor(req);
    const list = await inventoryService.listProducts({
      categoryId: categoryId as string,
      search: search as string,
      activeOnly: activeOnly === 'true',
      branchId: (branchId as string) || actor.branchId || 'br-dhk-01',
    });
    res.status(200).json({
      data: list,
      meta: { total: list.length, requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/products/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = extractActor(req);
    const branch = (req.query.branchId as string) || actor.branchId || 'br-dhk-01';
    const prod = await inventoryService.getProduct(req.params.id, branch);
    res.status(200).json({
      data: prod,
      meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

const createProductSchema = z.object({
  sku: z.string().min(2).max(64),
  name: z.string().min(2).max(200),
  name_bn: z.string().max(200).optional(),
  category_id: z.string().min(1),
  unit: z.string().min(1).max(32),
  cost_price: z.union([z.number(), z.string()]),
  sale_price: z.union([z.number(), z.string()]),
  reorder_level: z.number().int().nonnegative().optional(),
  allow_negative_stock: z.boolean().optional(),
  track_batches: z.boolean().optional(),
  track_expiry: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

inventoryRouter.post('/products', verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createProductSchema.parse(req.body);
    const actor = extractActor(req);
    const prod = await inventoryService.createProduct(parsed, actor);
    res.status(201).json({
      data: prod,
      meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.patch('/products/:id', verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = extractActor(req);
    const prod = await inventoryService.updateProduct(req.params.id, req.body, actor);
    res.status(200).json({
      data: prod,
      meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// --- 3. Suppliers ---
inventoryRouter.get('/suppliers', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const list = await inventoryService.listSuppliers();
    res.status(200).json({
      data: list,
      meta: { total: list.length, requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/suppliers/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const s = await inventoryService.getSupplier(req.params.id);
    res.status(200).json({
      data: s,
      meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

const createSupplierSchema = z.object({
  name: z.string().min(2).max(200),
  name_bn: z.string().max(200).optional(),
  contact_person: z.string().optional(),
  phone: z.string().min(6).max(32),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  payment_terms: z.string().optional(),
  is_active: z.boolean().optional(),
});

inventoryRouter.post('/suppliers', verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createSupplierSchema.parse(req.body);
    const s = await inventoryService.createSupplier(parsed);
    res.status(201).json({
      data: s,
      meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.patch('/suppliers/:id', verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const s = await inventoryService.updateSupplier(req.params.id, req.body);
    res.status(200).json({
      data: s,
      meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// --- 4. Purchases ---
inventoryRouter.get('/purchases', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { branchId, supplierId, status } = req.query;
    const list = await inventoryService.listPurchases({
      branchId: branchId as string,
      supplierId: supplierId as string,
      status: status as string,
    });
    res.status(200).json({
      data: list,
      meta: { total: list.length, requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/purchases/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const p = await inventoryService.getPurchase(req.params.id);
    res.status(200).json({
      data: p,
      meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

const createPurchaseSchema = z.object({
  supplier_id: z.string().min(1),
  branch_id: z.string().min(1),
  purchase_date: z.string().min(10),
  supplier_invoice_no: z.string().optional(),
  items: z
    .array(
      z.object({
        product_id: z.string().min(1),
        quantity: z.number().positive(),
        unit_cost: z.number().nonnegative(),
        batch_no: z.string().optional(),
        expiry_date: z.string().optional(),
      })
    )
    .min(1),
  notes: z.string().optional(),
  document_file_id: z.string().optional(),
});

inventoryRouter.post('/purchases', verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createPurchaseSchema.parse(req.body);
    const actor = extractActor(req);
    const p = await inventoryService.createPurchase(parsed, actor);
    res.status(201).json({
      data: p,
      meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/purchases/:id/receive', verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = extractActor(req);
    const p = await inventoryService.markPurchaseReceived(req.params.id, actor);
    res.status(200).json({
      data: p,
      meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// --- 5. Stock on Hand, Low Stock, Expiring Batches ---
inventoryRouter.get('/stock', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = extractActor(req);
    const branch = (req.query.branchId as string) || actor.branchId || 'br-dhk-01';
    const list = await inventoryService.getStockOnHandView(branch);
    res.status(200).json({
      data: list,
      meta: { total: list.length, requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/stock/low', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = extractActor(req);
    const branch = (req.query.branchId as string) || actor.branchId || 'br-dhk-01';
    const list = await inventoryService.getLowStockView(branch);
    res.status(200).json({
      data: list,
      meta: { total: list.length, requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.get('/stock/expiring', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = extractActor(req);
    const branch = (req.query.branchId as string) || actor.branchId || 'br-dhk-01';
    const list = await inventoryService.getExpiringBatchesView(branch);
    res.status(200).json({
      data: list,
      meta: { total: list.length, requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// --- 6. Stock Movements Ledger ---
inventoryRouter.get('/movements', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { productId, branchId, movementType } = req.query;
    const list = await inventoryService.listMovements({
      productId: productId as string,
      branchId: branchId as string,
      movementType: movementType as string,
    });
    res.status(200).json({
      data: list,
      meta: { total: list.length, requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

const recordMovementSchema = z.object({
  product_id: z.string().min(1),
  batch_id: z.string().optional(),
  branch_id: z.string().optional(),
  movement_type: z.enum([
    'purchase_receipt',
    'session_usage',
    'adjustment',
    'wastage',
    'reversal',
    'transfer_in',
    'transfer_out',
  ]),
  quantity_change: z.number(),
  unit_cost: z.number().optional(),
  reference_type: z
    .enum(['purchase', 'session_consumable', 'manual_adjustment', 'prescription', 'none'])
    .optional(),
  reference_id: z.string().optional(),
  reason: z.string().optional(),
  approved_by: z.string().optional(),
});

inventoryRouter.post('/movements', verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = recordMovementSchema.parse(req.body);
    const actor = extractActor(req);

    if (['adjustment', 'wastage', 'reversal'].includes(parsed.movement_type)) {
      if (!checkPermission(req, 'inventory.adjust')) {
        throw new ForbiddenError('Requires inventory adjustment permission (inventory.adjust)');
      }
    }

    const branch = parsed.branch_id || actor.branchId || 'br-dhk-01';
    const movement = await inventoryService.recordMovement(
      {
        ...parsed,
        branch_id: branch,
      },
      actor
    );
    res.status(201).json({
      data: movement,
      meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

inventoryRouter.post('/movements/:id/reverse', verifyCsrf, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason, approved_by } = req.body;
    if (!reason || !approved_by) {
      throw new BadRequestError('Reason and approved_by are required for movement reversal');
    }
    const actor = extractActor(req);
    const mov = await inventoryService.reverseMovement(
      req.params.id,
      reason,
      approved_by,
      actor
    );
    res.status(200).json({
      data: mov,
      meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// Triggers emulation: Block UPDATE and DELETE on stock_movements (Rule 6)
inventoryRouter.put('/movements/:id', (_req: Request, _res: Response, next: NextFunction) => {
  try {
    inventoryService.blockMovementMutation('UPDATE');
  } catch (err) {
    next(err);
  }
});

inventoryRouter.delete('/movements/:id', (_req: Request, _res: Response, next: NextFunction) => {
  try {
    inventoryService.blockMovementMutation('DELETE');
  } catch (err) {
    next(err);
  }
});

// --- 7. Reports ---
inventoryRouter.get('/reports', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { report_type, from_date, to_date, branch_id, category_id, product_id } = req.query;
    if (!report_type) {
      throw new BadRequestError('Query param "report_type" is required');
    }
    const actor = extractActor(req);
    const report = await inventoryService.generateReport(
      {
        report_type: report_type as any,
        from_date: from_date as string,
        to_date: to_date as string,
        branch_id: (branch_id as string) || actor.branchId || 'br-dhk-01',
        category_id: category_id as string,
        product_id: product_id as string,
      },
      actor
    );
    res.status(200).json({
      data: report,
      meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});
