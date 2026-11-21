import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { BadRequestError, ForbiddenError } from '../middleware/errorHandler.js';
import { catalogService } from '../services/catalogService.js';
import type { GuidanceStatus, GuidanceSection } from '@suoxi/shared-types';

export const catalogRouter = Router();

// Zod Schemas
const createTreatmentSchema = z.object({
  service_code: z.string().min(1, 'Service code is required').max(50),
  category_id: z.string().min(1, 'Category is required'),
  name: z.string().min(1, 'Treatment name is required').max(150),
  name_bn: z.string().max(150).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  base_price: z.union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,2})?$/, 'Price must be a valid positive amount')]),
  default_duration_minutes: z.number().int().min(5).max(480).default(30),
  default_followup_days: z.number().int().min(0).max(365).optional().nullable(),
  requires_clinical_approval: z.boolean().optional().default(false),
  allowed_resource_ids: z.array(z.string()).optional().default([]),
  is_active: z.boolean().optional().default(true),
});

const updateTreatmentSchema = z.object({
  service_code: z.string().min(1).max(50).optional(),
  category_id: z.string().min(1).optional(),
  name: z.string().min(1).max(150).optional(),
  name_bn: z.string().max(150).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  base_price: z.union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,2})?$/)]).optional(),
  default_duration_minutes: z.number().int().min(5).max(480).optional(),
  default_followup_days: z.number().int().min(0).max(365).optional().nullable(),
  requires_clinical_approval: z.boolean().optional(),
  allowed_resource_ids: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});

const createFollowupRuleSchema = z.object({
  interval_days: z.number().int().min(1, 'Interval days must be at least 1').max(365),
  max_followups: z.number().int().min(1).max(12).default(1),
  instructions: z.string().max(2000).optional().nullable(),
  instructions_bn: z.string().max(2000).optional().nullable(),
  needs_clinical_approval: z.boolean().optional().default(false),
});

const guidanceItemSchema = z.object({
  id: z.string().optional(),
  section: z.enum([
    'recommended_foods',
    'foods_to_avoid',
    'lifestyle_do',
    'lifestyle_avoid',
    'general_advice',
  ]),
  content_en: z.string().optional().nullable(),
  content_bn: z.string().optional().nullable(),
  sort_order: z.number().int().optional().default(0),
}).refine(
  (data) => (data.content_en && data.content_en.trim().length > 0) || (data.content_bn && data.content_bn.trim().length > 0),
  { message: 'Each guidance item requires at least one language (English or Bangla)' }
);

const createGuidanceSchema = z.object({
  service_id: z.string().min(1, 'Treatment service ID is required'),
  title: z.string().min(1, 'Title is required').max(200),
  title_bn: z.string().max(200).optional().nullable(),
  clinical_notes: z.string().max(2000).optional().nullable(),
  items: z.array(guidanceItemSchema).min(1, 'At least one guidance item is required'),
});

const updateGuidanceSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  title_bn: z.string().max(200).optional().nullable(),
  clinical_notes: z.string().max(2000).optional().nullable(),
  items: z.array(guidanceItemSchema).optional(),
});

// -----------------------------------------------------------------------------
// 1. GET /catalog/categories
// -----------------------------------------------------------------------------
catalogRouter.get(
  '/categories',
  requireAuth,
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const categories = catalogService.listCategories();
      res.status(200).json({
        data: categories,
        meta: { total: categories.length, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 2. Treatment Services
// -----------------------------------------------------------------------------
catalogRouter.get(
  '/treatments',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const categoryId = req.query.categoryId as string | undefined;
      const activeOnly = req.query.activeOnly === 'true';
      const search = req.query.search as string | undefined;

      const treatments = catalogService.listServices({ categoryId, activeOnly, search });
      res.status(200).json({
        data: treatments,
        meta: { total: treatments.length, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

catalogRouter.get(
  '/treatments/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const treatment = catalogService.getServiceById(req.params.id);
      res.status(200).json({ data: treatment });
    } catch (err) {
      next(err);
    }
  }
);

catalogRouter.post(
  '/treatments',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = createTreatmentSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation failed for treatment creation', parsed.error.format());
      }

      const user = {
        id: req.accessContext?.userId || 'usr-system',
        role: req.accessContext?.roles[0] || 'admin_manager',
      };

      const created = await catalogService.createService(
        {
          ...parsed.data,
          name_bn: parsed.data.name_bn || undefined,
          description: parsed.data.description || undefined,
          default_followup_days: parsed.data.default_followup_days ?? undefined,
        },
        user
      );

      res.status(201).json({ data: created });
    } catch (err) {
      next(err);
    }
  }
);

catalogRouter.patch(
  '/treatments/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = updateTreatmentSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation failed for treatment update', parsed.error.format());
      }

      const user = {
        id: req.accessContext?.userId || 'usr-system',
        role: req.accessContext?.roles[0] || 'admin_manager',
      };

      const updated = await catalogService.updateService(
        req.params.id,
        {
          ...parsed.data,
          name_bn: parsed.data.name_bn || undefined,
          description: parsed.data.description || undefined,
          default_followup_days: parsed.data.default_followup_days ?? undefined,
        },
        user
      );

      res.status(200).json({ data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 3. Treatment Follow-up Rules
// -----------------------------------------------------------------------------
catalogRouter.get(
  '/treatments/:id/followup-rules',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rules = catalogService.getFollowupRules(req.params.id);
      res.status(200).json({ data: rules });
    } catch (err) {
      next(err);
    }
  }
);

catalogRouter.post(
  '/treatments/:id/followup-rules',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = createFollowupRuleSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation failed for follow-up rule', parsed.error.format());
      }

      const user = {
        id: req.accessContext?.userId || 'usr-system',
        role: req.accessContext?.roles[0] || 'admin_manager',
        fullName: req.accessContext?.username || undefined,
      };

      const created = await catalogService.createFollowupRule(
        req.params.id,
        {
          ...parsed.data,
          instructions: parsed.data.instructions || undefined,
          instructions_bn: parsed.data.instructions_bn || undefined,
        },
        user
      );

      res.status(201).json({ data: created });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 4. Food & Lifestyle Guidance Library
// -----------------------------------------------------------------------------
catalogRouter.get(
  '/guidance',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const serviceId = req.query.serviceId as string | undefined;
      const status = req.query.status as GuidanceStatus | undefined;

      const list = catalogService.listGuidance({ serviceId, status });
      res.status(200).json({
        data: list,
        meta: { total: list.length, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

catalogRouter.get(
  '/guidance/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const guidance = catalogService.getGuidanceById(req.params.id);
      res.status(200).json({ data: guidance });
    } catch (err) {
      next(err);
    }
  }
);

catalogRouter.post(
  '/guidance',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = createGuidanceSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation failed for guidance document', parsed.error.format());
      }

      const user = {
        id: req.accessContext?.userId || 'usr-system',
        role: req.accessContext?.roles[0] || 'admin_manager',
        fullName: req.accessContext?.username || undefined,
      };

      const created = await catalogService.createGuidance(
        {
          ...parsed.data,
          title_bn: parsed.data.title_bn || undefined,
          clinical_notes: parsed.data.clinical_notes || undefined,
          items: parsed.data.items.map((it) => ({
            section: it.section as GuidanceSection,
            content_en: it.content_en || undefined,
            content_bn: it.content_bn || undefined,
            sort_order: it.sort_order,
          })),
        },
        user
      );

      res.status(201).json({ data: created });
    } catch (err) {
      next(err);
    }
  }
);

catalogRouter.patch(
  '/guidance/:id',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = updateGuidanceSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Validation failed for guidance update', parsed.error.format());
      }

      const user = {
        id: req.accessContext?.userId || 'usr-system',
        role: req.accessContext?.roles[0] || 'admin_manager',
      };

      const updated = await catalogService.updateGuidance(
        req.params.id,
        {
          ...parsed.data,
          title_bn: parsed.data.title_bn || undefined,
          clinical_notes: parsed.data.clinical_notes || undefined,
          items: parsed.data.items
            ? parsed.data.items.map((it) => ({
                id: it.id,
                section: it.section as GuidanceSection,
                content_en: it.content_en || undefined,
                content_bn: it.content_bn || undefined,
                sort_order: it.sort_order,
              }))
            : undefined,
        },
        user
      );

      res.status(200).json({ data: updated });
    } catch (err) {
      next(err);
    }
  }
);

catalogRouter.post(
  '/guidance/:id/submit',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = {
        id: req.accessContext?.userId || 'usr-system',
        role: req.accessContext?.roles[0] || 'admin_manager',
      };

      const submitted = await catalogService.submitGuidance(req.params.id, user);
      res.status(200).json({ data: submitted });
    } catch (err) {
      next(err);
    }
  }
);

catalogRouter.post(
  '/guidance/:id/approve',
  requireAuth,
  requirePermission('guidance.approve'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = {
        id: req.accessContext?.userId || 'usr-system',
        role: req.accessContext?.roles[0] || 'doctor',
        fullName: req.accessContext?.username || undefined,
        permissions: req.accessContext?.effectivePermissions,
      };

      // Approver cannot be someone without clinical role
      const isClinical = user.role === 'doctor' || user.role === 'super_admin';
      if (!isClinical) {
        throw new ForbiddenError(
          'Non-clinical staff cannot approve clinical food & lifestyle guidance'
        );
      }

      const approved = await catalogService.approveGuidance(req.params.id, user);
      res.status(200).json({ data: approved });
    } catch (err) {
      next(err);
    }
  }
);
