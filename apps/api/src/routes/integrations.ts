import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { validateCsrf } from '../auth/csrf.js';
import { integrationService } from '../services/integrationService.js';
import {
  ForbiddenError,
  NotFoundError,
  UnprocessableEntityError,
} from '../middleware/errorHandler.js';
import type {
  IntegrationType,
} from '@suoxi/shared-types';

export const integrationsRouter = Router();
export const templatesRouter = Router();
export const eventRulesRouter = Router();

// CSRF Verification for state-changing requests (Rule 2 & B.5a)
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
    fullName: req.accessContext?.user?.fullName || req.user?.fullName || 'Staff Administrator',
    roles: req.accessContext?.roles || req.user?.roles || ['super_admin'],
    branchId: req.accessContext?.user?.branchId || req.user?.branchId || 'br-dhk-01',
  };
}

function requireAdmin(req: any, _res: any, next: NextFunction) {
  const roles: string[] = req.accessContext?.roles || req.user?.roles || [];
  if (
    roles.includes('super_admin') ||
    roles.includes('admin') ||
    roles.includes('admin_manager')
  ) {
    return next();
  }
  return next(new ForbiddenError('Forbidden: Only administrators can configure integrations and event rules'));
}

// Zod schemas
const SmtpConfigSchema = z.object({
  host: z.string().min(1, 'Host is required'),
  port: z.number().int().min(1).max(65535),
  encryption: z.enum(['none', 'ssl', 'tls']),
  username: z.string().min(1, 'Username is required'),
  sender_email: z.string().email('Valid sender email required'),
  sender_name: z.string().min(1, 'Sender name is required'),
});

const SmsGatewayConfigSchema = z.object({
  provider: z.enum(['elitbuzz', 'generic', 'mock']),
  api_url: z.string().url('Valid API URL required'),
  auth_method: z.enum(['query_param', 'header_bearer', 'header_api_key', 'basic_auth']),
  sender_id: z.string().min(1, 'Sender ID is required'),
  rate_limit_per_minute: z.number().int().min(1).default(120),
  max_retries: z.number().int().min(0).max(10).default(3),
  retry_backoff_sec: z.number().int().min(1).max(300).default(15),
  extra_params: z.record(z.string()).optional(),
});

const SaveIntegrationConfigSchema = z.object({
  integration_type: z.enum(['email_smtp', 'sms_gateway']),
  name: z.string().min(1, 'Name is required'),
  is_default: z.boolean().optional(),
  is_active: z.boolean().optional(),
  config: z.union([SmtpConfigSchema, SmsGatewayConfigSchema]),
  credential: z.string().optional(),
});

const TestIntegrationSchema = z.object({
  recipient: z.string().min(1, 'Recipient is required'),
  sample_message: z.string().optional(),
});

const SaveTemplateSchema = z.object({
  template_code: z.string().min(2, 'Template code is required'),
  channel: z.enum(['sms', 'email', 'in_app']),
  language: z.enum(['bn', 'en']),
  name: z.string().min(1, 'Template name is required'),
  subject: z.string().optional(),
  body: z.string().min(1, 'Template body is required'),
  allowed_variables: z.array(z.string()).optional(),
});

const TemplatePreviewSchema = z.object({
  body: z.string().min(1, 'Body is required'),
  subject: z.string().optional(),
  language: z.enum(['bn', 'en']).default('bn'),
  sample_data: z.record(z.string()).optional(),
});

const SaveEventRuleSchema = z.object({
  event_type: z.enum([
    'appointment_confirmed',
    'appointment_upcoming',
    'appointment_rescheduled',
    'appointment_cancelled',
    'session_reminder',
    'package_expiry',
    'payment_due',
    'followup_reminder',
    'portal_credentials',
  ]),
  channel: z.enum(['sms', 'email', 'in_app']),
  template_id: z.string().min(1, 'Template ID is required'),
  offset_minutes: z.number().int().default(0),
  quiet_hours_start: z.string().optional(),
  quiet_hours_end: z.string().optional(),
  requires_patient_consent: z.boolean().optional(),
  is_enabled: z.boolean().optional(),
});

// All sub-routers require authentication
integrationsRouter.use(requireAuth);
templatesRouter.use(requireAuth);
eventRulesRouter.use(requireAuth);

// ==========================================
// 1. INTEGRATIONS ROUTER (/integrations)
// ==========================================

integrationsRouter.get(
  ['/configs', '/'],
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await integrationService.listConfigurations();
      res.status(200).json({
        data,
        meta: { total: data.length, requestId: (req as any).id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// --- LOGS (must precede parameterized /:id) ---
integrationsRouter.get(
  ['/logs', '/configs/logs'],
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const type = req.query.type as IntegrationType | undefined;
      const data = await integrationService.listLogs(type);
      res.status(200).json({
        data,
        meta: { total: data.length, requestId: (req as any).id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

integrationsRouter.get(
  ['/configs/:id', '/:id'],
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await integrationService.getConfiguration(req.params.id);
      res.status(200).json({
        data,
        meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

integrationsRouter.post(
  ['/configs', '/'],
  requireAdmin,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = SaveIntegrationConfigSchema.parse(req.body);
      const actor = extractActor(req);
      const data = await integrationService.saveConfiguration(null, parsed, actor);
      res.status(201).json({
        data,
        meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

integrationsRouter.put(
  ['/configs/:id', '/:id'],
  requireAdmin,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = SaveIntegrationConfigSchema.parse(req.body);
      const actor = extractActor(req);
      const data = await integrationService.saveConfiguration(req.params.id, parsed, actor);
      res.status(200).json({
        data,
        meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

integrationsRouter.post(
  ['/configs/:id/test', '/:id/test'],
  requireAdmin,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = TestIntegrationSchema.parse(req.body);
      const actor = extractActor(req);
      const data = await integrationService.testIntegration(req.params.id, parsed, actor);
      res.status(200).json({
        data,
        meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 2. TEMPLATES ROUTER (/templates)
// ==========================================

templatesRouter.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { channel, language } = req.query as { channel?: string; language?: string };
      const data = await integrationService.listTemplates({ channel, language });
      res.status(200).json({
        data,
        meta: { total: data.length, requestId: (req as any).id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

templatesRouter.post(
  '/preview',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = TemplatePreviewSchema.parse(req.body);
      const data = integrationService.previewTemplate(parsed);
      res.status(200).json({
        data,
        meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

templatesRouter.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await integrationService.getTemplate(req.params.id);
      res.status(200).json({
        data,
        meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

templatesRouter.post(
  '/',
  requireAdmin,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = SaveTemplateSchema.parse(req.body);
      const actor = extractActor(req);
      const data = await integrationService.saveTemplate(null, parsed, actor);
      res.status(201).json({
        data,
        meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

templatesRouter.put(
  '/:id',
  requireAdmin,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = SaveTemplateSchema.parse(req.body);
      const actor = extractActor(req);
      const data = await integrationService.saveTemplate(req.params.id, parsed, actor);
      res.status(200).json({
        data,
        meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

templatesRouter.post(
  '/:id/approve',
  requireAdmin,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const actor = extractActor(req);
      const data = await integrationService.approveTemplate(req.params.id, actor);
      res.status(200).json({
        data,
        meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ==========================================
// 3. EVENT RULES ROUTER (/event-rules)
// ==========================================

eventRulesRouter.get(
  '/',
  requireAdmin,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await integrationService.listEventRules();
      res.status(200).json({
        data,
        meta: { total: data.length, requestId: (req as any).id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

eventRulesRouter.post(
  '/',
  requireAdmin,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = SaveEventRuleSchema.parse(req.body);
      const actor = extractActor(req);
      const data = await integrationService.saveEventRule(null, parsed, actor);
      res.status(201).json({
        data,
        meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);

eventRulesRouter.put(
  '/:id',
  requireAdmin,
  verifyCsrf,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = SaveEventRuleSchema.parse(req.body);
      const actor = extractActor(req);
      const data = await integrationService.saveEventRule(req.params.id, parsed, actor);
      res.status(200).json({
        data,
        meta: { requestId: (req as any).id, timestamp: new Date().toISOString() },
      });
    } catch (err) {
      next(err);
    }
  }
);
