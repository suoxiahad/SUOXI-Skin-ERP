import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateCsrf } from '../auth/csrf.js';
import { packageService } from '../services/packageService.js';
import {
  ValidationError,
  ForbiddenError,
  NotFoundError,
} from '../middleware/errorHandler.js';

export const packagesRouter = Router();

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

function extractUser(req: any) {
  return {
    id: req.accessContext?.userId || req.user?.id || 'usr-admin-01',
    fullName: req.accessContext?.user?.fullName || req.user?.fullName || 'Staff User',
    role: req.accessContext?.roles?.[0] || req.user?.roles?.[0] || 'admin',
    roles: req.accessContext?.roles || req.user?.roles || ['admin'],
    permissions: req.accessContext?.permissions || [],
  };
}

const dbIdSchema = z.union([z.number().int().positive(), z.string().trim().min(1)]);

// Validation Schemas
const CreatePackageSchema = z.object({
  name: z.string().min(2).max(191),
  nameBn: z.string().max(191).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  price: z.union([z.string(), z.number()]),
  validityDays: z.coerce.number().int().min(1).max(3650),
  items: z.array(
    z.object({
      serviceId: dbIdSchema,
      sessionCount: z.coerce.number().int().min(1).max(100),
      sortOrder: z.coerce.number().int().optional(),
    })
  ).min(1),
});

const UpdatePackageSchema = z.object({
  name: z.string().min(2).max(191).optional(),
  nameBn: z.string().max(191).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  price: z.union([z.string(), z.number()]).optional(),
  validityDays: z.coerce.number().int().min(1).max(3650).optional(),
  isActive: z.boolean().optional(),
});

const AssignPackageSchema = z.object({
  patientId: dbIdSchema,
  packageId: dbIdSchema,
  branchId: dbIdSchema.optional(),
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priceSold: z.union([z.string(), z.number()]).optional(),
  saleTerms: z.string().max(1000).optional().nullable(),
});

const CancelPackageSchema = z.object({
  reason: z.string().min(3).max(1000),
  remainingHandling: z.enum(['forfeited', 'refunded', 'credited', 'transferred']),
  refundReference: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

const RenewPackageSchema = z.object({
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  priceSold: z.union([z.string(), z.number()]).optional(),
  saleTerms: z.string().max(1000).optional().nullable(),
});

const ReverseDeductionSchema = z.object({
  reason: z.string().min(3).max(500),
});

// ============================================================================
// Catalog Packages
// ============================================================================

// 1. GET /api/v1/packages - List catalog packages
packagesRouter.get('/', requireAuth, (req, res, next) => {
  try {
    const activeOnly = req.query.activeOnly === 'true';
    const search = req.query.search as string | undefined;
    const pkgs = packageService.listPackages({ activeOnly, search });
    res.status(200).json({
      data: pkgs,
      meta: {
        total: pkgs.length,
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 2. GET /api/v1/packages/expiring - List expiring patient packages
packagesRouter.get('/expiring', requireAuth, (req, res, next) => {
  try {
    const withinDays = req.query.withinDays ? parseInt(req.query.withinDays as string, 10) : 30;
    const list = packageService.listExpiringPackages(withinDays);
    res.status(200).json({
      data: list,
      meta: {
        total: list.length,
        withinDays,
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 3. GET /api/v1/packages/:id - Get catalog package
packagesRouter.get('/:id', requireAuth, (req, res, next) => {
  try {
    const pkg = packageService.getPackageById(req.params.id);
    res.status(200).json({
      data: pkg,
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 4. POST /api/v1/packages - Create catalog package
packagesRouter.post('/', requireAuth, verifyCsrf, (req, res, next) => {
  try {
    const user = extractUser(req);
    const parsed = CreatePackageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid package data', parsed.error.format());
    }

    const created = packageService.createPackage(parsed.data, {
      id: user.id,
      fullName: user.fullName,
      role: user.roles[0] || 'admin',
    });

    res.status(201).json({
      data: created,
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 5. PATCH /api/v1/packages/:id - Update catalog package
packagesRouter.patch('/:id', requireAuth, verifyCsrf, (req, res, next) => {
  try {
    const user = extractUser(req);
    const parsed = UpdatePackageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid package update data', parsed.error.format());
    }

    const updated = packageService.updatePackage(req.params.id, parsed.data, {
      id: user.id,
      fullName: user.fullName,
      role: user.roles[0] || 'admin',
    });

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
});

// ============================================================================
// Patient Packages Assignment & Queries
// ============================================================================

// 6. POST /api/v1/packages/assign - Assign package to patient
packagesRouter.post('/assign', requireAuth, verifyCsrf, async (req, res, next) => {
  try {
    const user = extractUser(req);
    const parsed = AssignPackageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid package assignment data', parsed.error.format());
    }

    const assigned = await packageService.assignPackage(parsed.data, {
      id: user.id,
      fullName: user.fullName,
      role: user.roles[0] || 'staff',
    });

    res.status(201).json({
      data: assigned,
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 7. GET /api/v1/packages/patient/:patientId - List packages assigned to a patient
packagesRouter.get('/patient/:patientId', requireAuth, (req, res, next) => {
  try {
    const list = packageService.listPatientPackages(req.params.patientId);
    res.status(200).json({
      data: list,
      meta: {
        total: list.length,
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 8. GET /api/v1/packages/patient-packages/:id - Get single patient package with balances and ledger
packagesRouter.get('/patient-packages/:id', requireAuth, (req, res, next) => {
  try {
    const ptPkg = packageService.getPatientPackage(req.params.id);
    res.status(200).json({
      data: ptPkg,
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 9. POST /api/v1/packages/patient-packages/:id/renew - Renew patient package
packagesRouter.post('/patient-packages/:id/renew', requireAuth, verifyCsrf, async (req, res, next) => {
  try {
    const user = extractUser(req);
    const parsed = RenewPackageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid package renewal data', parsed.error.format());
    }

    const renewed = await packageService.renewPackage(req.params.id, parsed.data, {
      id: user.id,
      fullName: user.fullName,
      role: user.roles[0] || 'staff',
    });

    res.status(201).json({
      data: renewed,
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 10. POST /api/v1/packages/patient-packages/:id/cancel - Cancel patient package
packagesRouter.post('/patient-packages/:id/cancel', requireAuth, verifyCsrf, async (req, res, next) => {
  try {
    const user = extractUser(req);
    const isManager =
      user.roles.includes('super_admin') ||
      user.roles.includes('admin') ||
      user.permissions?.includes('package.cancel');

    if (!isManager) {
      throw new ForbiddenError('Package cancellation requires admin or manager approval permission');
    }

    const parsed = CancelPackageSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid package cancellation data', parsed.error.format());
    }

    const cancelled = await packageService.cancelPackage(req.params.id, parsed.data, {
      id: user.id,
      fullName: user.fullName,
      role: user.roles[0] || 'staff',
    });

    res.status(200).json({
      data: cancelled,
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================================
// Ledger Reversals & Append-Only Guarantees
// ============================================================================

// 11. POST /api/v1/packages/ledger/:ledgerId/reverse - Reverse deduction
packagesRouter.post('/ledger/:ledgerId/reverse', requireAuth, verifyCsrf, async (req, res, next) => {
  try {
    const user = extractUser(req);
    const parsed = ReverseDeductionSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Reason is required to reverse a package deduction', parsed.error.format());
    }

    const reversal = await packageService.reverseDeduction(
      req.params.ledgerId,
      parsed.data.reason,
      {
        id: user.id,
        fullName: user.fullName,
        role: user.roles[0] || 'admin',
      }
    );

    res.status(201).json({
      data: reversal,
      meta: {
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 12. Direct UPDATE or DELETE on ledger -> Blocked by Rule 6 & Append-only triggers
packagesRouter.all('/ledger/:ledgerId', requireAuth, (req, _res, next) => {
  if (req.method === 'PUT' || req.method === 'PATCH' || req.method === 'DELETE') {
    return next(new ForbiddenError(
      'package_session_ledger is append-only: UPDATE and DELETE operations are strictly prohibited (Engineering Rule 6)'
    ));
  }
  next();
});
