/**
 * SUOXI Skin Care & Aesthetic Center ERP
 * Extended PostgreSQL API Router (Phases 2, 3 & 4):
 *  - Treatment Catalog, Follow-up Rules & Guidance Templates
 *  - Calendar Range View, Provider Schedules, Sources, Resources & Slot Availability
 *  - Treatment Sessions, Atomic Consumables Deduction, Plans, Consents & Patient Medical Records
 *  - Refunds, Payment Gateway Webhooks & Commission Outbox Processing
 *  - Isolated Patient Portal Realm (`/portal/*` & `/api/v1/portal/*`)
 *  - Notifications, Webhook Events, Staff Alerts, Call Contact Logs & Real Reports Hub + CSV Export
 */

import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import type { User } from '../../src/types/index.ts';
import {
  canUserAccessBranch,
  requireRoles,
  resolveAuthorizedBranchScope,
  resolveRequestActor,
} from '../auth/rbacMiddleware.ts';
import { isPostgresConfigured } from '../db/pgPool.ts';
import { pgBillingPackageRepo } from '../repositories/pgBillingPackageRepo.ts';
import { pgCallCenterReferralsRepo } from '../repositories/pgCallCenterReferralsRepo.ts';
import {
  pgCreateCatalogCategory,
  pgCreateGuidanceTemplate,
  pgCreateTreatmentFollowUpRule,
  pgCreateTreatmentService,
  pgGetCalendarEvents,
  pgGetSlotAvailability,
  pgListAppointmentSources,
  pgListCatalogCategories,
  pgListClinicResources,
  pgListGuidanceTemplates,
  pgListProviderSchedules,
  pgListTreatmentFollowUpRules,
  pgListTreatmentServices,
  pgTransitionGuidanceTemplateStatus,
  pgUpdateTreatmentService,
  pgUpsertProviderSchedule,
} from '../repositories/pgCatalogCalendarRepo.ts';
import {
  pgAddSessionConsumable,
  pgAddTreatmentPhoto,
  pgCompleteTreatmentSession,
  pgCreateConsentRecord,
  pgCreatePatientNote,
  pgCreateTreatmentPlan,
  pgGetPatientMedicalHistory,
  pgListPatientNotes,
  pgListTreatmentPlans,
  pgListTreatmentSessions,
  pgStartTreatmentSession,
  pgUpsertPatientMedicalHistory,
} from '../repositories/pgClinicalSessionsRepo.ts';
import { extractClientIp, sendPgError, sendPgSuccess } from '../repositories/pgHelpers.ts';
import {
  pgCreateStaffAlert,
  pgEnqueueNotification,
  pgExportReportCsv,
  pgGenerateReport,
  pgListNotifications,
  pgListStaffAlerts,
  pgLogCallContact,
  pgMarkStaffAlertRead,
  pgRecordWebhookEvent,
} from '../repositories/pgNotificationsReportsRepo.ts';
import {
  pgCompletePortalSetup,
  pgGetPortalPatientBundle,
  pgPortalLogin,
  pgPortalLogout,
  pgProvisionPortalAccount,
  pgRequestPortalContactOtp,
  pgVerifyPortalContactOtp,
  resolvePortalSession,
} from '../repositories/pgPortalRepo.ts';

export interface PgExtendedRouterDeps {
  getFallbackUser: () => User;
}

export function createPgExtendedRouter(deps: PgExtendedRouterDeps): express.Router {
  const router = express.Router();

  // Only intercept when PostgreSQL is configured
  router.use((_req, _res, next) => {
    if (!isPostgresConfigured()) return next('router');
    return next();
  });

  const actorOf = (req: Request): User =>
    resolveRequestActor(req, deps.getFallbackUser) || deps.getFallbackUser();

  const param = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] || '' : v || '');

  const handleErr = (res: Response, err: unknown, fallbackCode = 'INTERNAL_ERROR') => {
    const e = err as Error & { statusCode?: number; code?: string; details?: unknown };
    return sendPgError(res, e.statusCode || 500, e.code || fallbackCode, e.message || 'Operation failed', e.details);
  };

  // ===========================================================================
  // 1. TREATMENT CATALOG & GUIDANCE LIBRARY
  // ===========================================================================

  router.get('/api/v1/catalog/categories', async (_req, res) => {
    try {
      return sendPgSuccess(res, await pgListCatalogCategories());
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.post(
    '/api/v1/catalog/categories',
    requireRoles(['super_admin', 'admin_manager'], deps.getFallbackUser),
    async (req, res) => {
      const schema = z.object({
        code: z.string().min(2),
        name: z.string().min(2),
        nameBn: z.string().optional(),
        description: z.string().optional(),
        sortOrder: z.number().int().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid category payload', parsed.error.format());
      try {
        const created = await pgCreateCatalogCategory(parsed.data, actorOf(req), extractClientIp(req.headers, req.ip));
        return sendPgSuccess(res, created, {}, 201);
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  router.get('/api/v1/catalog/treatments', async (req, res) => {
    try {
      const items = await pgListTreatmentServices({
        categoryId: req.query.categoryId ? String(req.query.categoryId) : undefined,
        activeOnly: req.query.activeOnly === 'true',
        search: req.query.search ? String(req.query.search) : undefined,
      });
      return sendPgSuccess(res, items);
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.post(
    '/api/v1/catalog/treatments',
    requireRoles(['super_admin', 'admin_manager'], deps.getFallbackUser),
    async (req, res) => {
      const schema = z.object({
        categoryId: z.string().min(1),
        code: z.string().min(2),
        name: z.string().min(2),
        nameBn: z.string().optional(),
        description: z.string().optional(),
        defaultDurationMinutes: z.number().int().positive().optional(),
        basePriceBDT: z.number().min(0),
        requiresDoctor: z.boolean().optional(),
        requiresConsent: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid treatment payload', parsed.error.format());
      try {
        const created = await pgCreateTreatmentService(parsed.data, actorOf(req), extractClientIp(req.headers, req.ip));
        return sendPgSuccess(res, created, {}, 201);
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  router.patch(
    '/api/v1/catalog/treatments/:id',
    requireRoles(['super_admin', 'admin_manager'], deps.getFallbackUser),
    async (req, res) => {
      try {
        const updated = await pgUpdateTreatmentService(param(req.params.id), req.body || {}, actorOf(req), extractClientIp(req.headers, req.ip));
        if (!updated) return sendPgError(res, 404, 'NOT_FOUND', 'Treatment service not found');
        return sendPgSuccess(res, updated);
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  router.get('/api/v1/catalog/treatments/:id/follow-up-rules', async (req, res) => {
    try {
      return sendPgSuccess(res, await pgListTreatmentFollowUpRules(param(req.params.id)));
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.post(
    '/api/v1/catalog/treatments/:id/follow-up-rules',
    requireRoles(['super_admin', 'admin_manager', 'doctor'], deps.getFallbackUser),
    async (req, res) => {
      try {
        const created = await pgCreateTreatmentFollowUpRule(
          param(req.params.id),
          req.body || {},
          actorOf(req),
          extractClientIp(req.headers, req.ip)
        );
        return sendPgSuccess(res, created, {}, 201);
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  router.get('/api/v1/catalog/guidance-templates', async (req, res) => {
    try {
      const status = req.query.status ? String(req.query.status) : undefined;
      return sendPgSuccess(res, await pgListGuidanceTemplates(status));
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.post(
    '/api/v1/catalog/guidance-templates',
    requireRoles(['super_admin', 'admin_manager', 'doctor'], deps.getFallbackUser),
    async (req, res) => {
      try {
        const created = await pgCreateGuidanceTemplate(req.body || {}, actorOf(req), extractClientIp(req.headers, req.ip));
        return sendPgSuccess(res, created, {}, 201);
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  router.post(
    '/api/v1/catalog/guidance-templates/:id/submit',
    requireRoles(['super_admin', 'admin_manager', 'doctor'], deps.getFallbackUser),
    async (req, res) => {
      try {
        const updated = await pgTransitionGuidanceTemplateStatus(param(req.params.id), 'pending_approval', actorOf(req), extractClientIp(req.headers, req.ip));
        if (!updated) return sendPgError(res, 404, 'NOT_FOUND', 'Guidance template not found');
        return sendPgSuccess(res, updated);
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  router.post(
    '/api/v1/catalog/guidance-templates/:id/approve',
    requireRoles(['super_admin', 'doctor'], deps.getFallbackUser),
    async (req, res) => {
      try {
        const updated = await pgTransitionGuidanceTemplateStatus(param(req.params.id), 'approved', actorOf(req), extractClientIp(req.headers, req.ip));
        if (!updated) return sendPgError(res, 404, 'NOT_FOUND', 'Guidance template not found');
        return sendPgSuccess(res, updated);
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  // ===========================================================================
  // 2. CALENDAR, PROVIDER SCHEDULES, SOURCES, RESOURCES & AVAILABILITY
  // ===========================================================================

  router.get('/api/v1/appointment-sources', async (_req, res) => {
    try {
      return sendPgSuccess(res, await pgListAppointmentSources());
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.get('/api/v1/resources', async (req, res) => {
    try {
      const scope = await resolveAuthorizedBranchScope(actorOf(req), req.query.branchId ? String(req.query.branchId) : undefined);
      if (!scope.allowed) return sendPgError(res, 403, 'FORBIDDEN', 'Cross-branch resource access denied');
      return sendPgSuccess(res, await pgListClinicResources(scope.branchId));
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.get('/api/v1/provider-schedules', async (req, res) => {
    try {
      const scope = await resolveAuthorizedBranchScope(actorOf(req), req.query.branchId ? String(req.query.branchId) : undefined);
      if (!scope.allowed) return sendPgError(res, 403, 'FORBIDDEN', 'Cross-branch schedule access denied');
      return sendPgSuccess(
        res,
        await pgListProviderSchedules({
          branchId: scope.branchId,
          providerId: req.query.providerId ? String(req.query.providerId) : undefined,
        })
      );
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.post(
    '/api/v1/provider-schedules',
    requireRoles(['super_admin', 'admin_manager'], deps.getFallbackUser),
    async (req, res) => {
      try {
        const created = await pgUpsertProviderSchedule(req.body, actorOf(req), extractClientIp(req.headers, req.ip));
        return sendPgSuccess(res, created, {}, 201);
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  router.get('/api/v1/calendar', async (req, res) => {
    try {
      const startDate = String(req.query.startDate || new Date().toISOString().slice(0, 10));
      const endDate = String(req.query.endDate || startDate);
      const scope = await resolveAuthorizedBranchScope(actorOf(req), req.query.branchId ? String(req.query.branchId) : undefined);
      if (!scope.allowed) return sendPgError(res, 403, 'FORBIDDEN', 'Cross-branch calendar access denied');
      const events = await pgGetCalendarEvents({
        startDate,
        endDate,
        branchId: scope.branchId,
        doctorId: req.query.doctorId ? String(req.query.doctorId) : undefined,
      });
      return sendPgSuccess(res, events);
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.get('/api/v1/appointments/availability', async (req, res) => {
    try {
      const branchId = String(req.query.branchId || actorOf(req).branchId || 'br-dhanmondi');
      const allowed = await canUserAccessBranch(actorOf(req), branchId);
      if (!allowed) return sendPgError(res, 403, 'FORBIDDEN', 'Cross-branch availability access denied');
      const doctorId = String(req.query.doctorId || '');
      const date = String(req.query.date || new Date().toISOString().slice(0, 10));
      if (!doctorId) return sendPgError(res, 400, 'VALIDATION_ERROR', 'doctorId query param is required');
      return sendPgSuccess(res, await pgGetSlotAvailability({ branchId, doctorId, date }));
    } catch (err) {
      return handleErr(res, err);
    }
  });

  // ===========================================================================
  // 3. PATIENT MEDICAL RECORDS, TREATMENT PLANS, CONSENTS & SESSIONS
  // ===========================================================================

  router.get('/api/v1/patients/:id/medical-history', async (req, res) => {
    try {
      return sendPgSuccess(res, await pgGetPatientMedicalHistory(param(req.params.id)));
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.put(
    '/api/v1/patients/:id/medical-history',
    requireRoles(['super_admin', 'doctor', 'therapist'], deps.getFallbackUser),
    async (req, res) => {
      try {
        const updated = await pgUpsertPatientMedicalHistory(
          param(req.params.id),
          req.body || {},
          actorOf(req),
          extractClientIp(req.headers, req.ip)
        );
        return sendPgSuccess(res, updated);
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  router.get('/api/v1/patients/:id/notes', async (req, res) => {
    try {
      const actor = actorOf(req);
      const includeClinical = ['super_admin', 'doctor', 'therapist'].includes(actor.role);
      return sendPgSuccess(res, await pgListPatientNotes(param(req.params.id), includeClinical));
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.post('/api/v1/patients/:id/notes', async (req, res) => {
    try {
      const actor = actorOf(req);
      const isClinical = Boolean(req.body?.isClinical);
      if (isClinical && !['super_admin', 'doctor', 'therapist'].includes(actor.role)) {
        return sendPgError(res, 403, 'FORBIDDEN', 'Only clinical staff can record clinical notes');
      }
      const created = await pgCreatePatientNote(param(req.params.id), req.body, actor, extractClientIp(req.headers, req.ip));
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.get('/api/v1/patients/:id/treatment-plans', async (req, res) => {
    try {
      return sendPgSuccess(res, await pgListTreatmentPlans(param(req.params.id)));
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.post(
    '/api/v1/treatment-plans',
    requireRoles(['super_admin', 'doctor'], deps.getFallbackUser),
    async (req, res) => {
      try {
        const created = await pgCreateTreatmentPlan(req.body, actorOf(req), extractClientIp(req.headers, req.ip));
        return sendPgSuccess(res, created, {}, 201);
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  router.post(
    '/api/v1/consents',
    requireRoles(['super_admin', 'admin_manager', 'doctor', 'therapist', 'receptionist'], deps.getFallbackUser),
    async (req, res) => {
      try {
        const created = await pgCreateConsentRecord(req.body, actorOf(req), extractClientIp(req.headers, req.ip));
        return sendPgSuccess(res, created, {}, 201);
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  router.get('/api/v1/sessions', async (req, res) => {
    try {
      const scope = await resolveAuthorizedBranchScope(actorOf(req), req.query.branchId ? String(req.query.branchId) : undefined);
      if (!scope.allowed) return sendPgError(res, 403, 'FORBIDDEN', 'Cross-branch session access denied');
      const items = await pgListTreatmentSessions({
        patientId: req.query.patientId ? String(req.query.patientId) : undefined,
        branchId: scope.branchId,
        status: req.query.status ? String(req.query.status) : undefined,
      });
      return sendPgSuccess(res, items);
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.post(
    '/api/v1/sessions',
    requireRoles(['super_admin', 'admin_manager', 'doctor', 'therapist'], deps.getFallbackUser),
    async (req, res) => {
      try {
        const created = await pgStartTreatmentSession(req.body, actorOf(req), extractClientIp(req.headers, req.ip));
        return sendPgSuccess(res, created, {}, 201);
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  router.post(
    '/api/v1/sessions/:id/consumables',
    requireRoles(['super_admin', 'admin_manager', 'doctor', 'therapist'], deps.getFallbackUser),
    async (req, res) => {
      try {
        const result = await pgAddSessionConsumable(
          param(req.params.id),
          {
            inventoryItemId: String(req.body?.inventoryItemId || ''),
            quantity: Number(req.body?.quantity || 0),
            batchNumber: req.body?.batchNumber ? String(req.body.batchNumber) : undefined,
          },
          actorOf(req),
          extractClientIp(req.headers, req.ip)
        );
        return sendPgSuccess(res, result, {}, 201);
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  router.post(
    '/api/v1/sessions/:id/complete',
    requireRoles(['super_admin', 'admin_manager', 'doctor', 'therapist'], deps.getFallbackUser),
    async (req, res) => {
      try {
        const updated = await pgCompleteTreatmentSession(
          param(req.params.id),
          req.body || {},
          actorOf(req),
          extractClientIp(req.headers, req.ip)
        );
        if (!updated) return sendPgError(res, 404, 'NOT_FOUND', 'Session not found');
        return sendPgSuccess(res, updated);
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  router.post(
    '/api/v1/sessions/:id/photos',
    requireRoles(['super_admin', 'doctor', 'therapist'], deps.getFallbackUser),
    async (req, res) => {
      try {
        const created = await pgAddTreatmentPhoto(param(req.params.id), req.body, actorOf(req), extractClientIp(req.headers, req.ip));
        return sendPgSuccess(res, created, {}, 201);
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  // ===========================================================================
  // 4. REFUNDS, PAYMENT WEBHOOKS & COMMISSION OUTBOX
  // ===========================================================================

  router.get(
    '/api/v1/refunds',
    requireRoles(['super_admin', 'admin_manager', 'cashier'], deps.getFallbackUser),
    async (req, res) => {
      try {
        const invoiceId = req.query.invoiceId ? String(req.query.invoiceId) : undefined;
        return sendPgSuccess(res, await pgBillingPackageRepo.listRefunds(invoiceId));
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  router.post(
    '/api/v1/refunds',
    requireRoles(['super_admin', 'admin_manager'], deps.getFallbackUser),
    async (req, res) => {
      const schema = z.object({
        invoiceId: z.string().min(1),
        paymentId: z.string().min(1),
        amountBDT: z.number().positive(),
        method: z.string().optional(),
        transactionRef: z.string().optional(),
        reason: z.string().min(3),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid refund payload', parsed.error.format());
      try {
        const created = await pgBillingPackageRepo.createRefund(parsed.data, actorOf(req), extractClientIp(req.headers, req.ip));
        return sendPgSuccess(res, created, {}, 201);
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  router.post('/api/v1/webhooks/payments/:provider', async (req, res) => {
    try {
      const provider = param(req.params.provider);
      const body = req.body || {};
      const result = await pgBillingPackageRepo.processPaymentWebhook({
        provider,
        providerEventId: String(body.eventId || body.providerEventId || body.transactionId || ''),
        invoiceId: String(body.invoiceId || ''),
        amountBDT: Number(body.amountBDT ?? body.amount ?? 0),
        currency: String(body.currency || 'BDT'),
        eventStatus: String(body.status || body.eventStatus || 'succeeded'),
        rawPayload: JSON.stringify(body),
        signatureHeader: String(req.headers['x-webhook-signature'] || req.headers['x-signature'] || ''),
        webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || undefined,
        payload: body,
      });
      return sendPgSuccess(res, result);
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.post(
    '/api/v1/commissions/process-outbox',
    requireRoles(['super_admin', 'admin_manager'], deps.getFallbackUser),
    async (_req, res) => {
      try {
        return sendPgSuccess(res, await pgCallCenterReferralsRepo.processCommissionOutbox());
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  // ===========================================================================
  // 5. ISOLATED PATIENT PORTAL REALM (/api/v1/portal/* & /portal/*)
  // ===========================================================================

  router.post(
    '/api/v1/patients/:id/portal-account',
    requireRoles(['super_admin', 'admin_manager', 'receptionist'], deps.getFallbackUser),
    async (req, res) => {
      try {
        const provisioned = await pgProvisionPortalAccount(
          param(req.params.id),
          req.body?.loginIdentifier,
          actorOf(req),
          extractClientIp(req.headers, req.ip)
        );
        return sendPgSuccess(res, provisioned, {}, 201);
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  const handlePortalSetup = async (req: Request, res: Response) => {
    try {
      const result = await pgCompletePortalSetup(String(req.body?.token || ''), String(req.body?.password || ''));
      return sendPgSuccess(res, result);
    } catch (err) {
      return handleErr(res, err);
    }
  };
  router.post('/api/v1/portal/auth/setup', handlePortalSetup);
  router.post('/portal/auth/setup', handlePortalSetup);

  const handlePortalLogin = async (req: Request, res: Response) => {
    try {
      const data = await pgPortalLogin({
        identifier: String(req.body?.identifier || req.body?.mobile || req.body?.email || ''),
        password: String(req.body?.password || ''),
        req,
        res,
        ipAddress: extractClientIp(req.headers, req.ip),
      });
      return sendPgSuccess(res, data);
    } catch (err) {
      return handleErr(res, err);
    }
  };
  router.post('/api/v1/portal/auth/login', handlePortalLogin);
  router.post('/portal/auth/login', handlePortalLogin);

  const handlePortalLogout = async (req: Request, res: Response) => {
    await pgPortalLogout(req, res);
    return sendPgSuccess(res, { loggedOut: true });
  };
  router.post('/api/v1/portal/auth/logout', handlePortalLogout);
  router.post('/portal/auth/logout', handlePortalLogout);

  const handlePortalMe = async (req: Request, res: Response) => {
    try {
      const portalSession = await resolvePortalSession(req);
      if (!portalSession) return sendPgError(res, 401, 'PORTAL_AUTH_REQUIRED', 'Patient portal sign-in required');
      const bundle = await pgGetPortalPatientBundle(portalSession.patientId);
      if (!bundle) return sendPgError(res, 404, 'NOT_FOUND', 'Patient record not found');
      return sendPgSuccess(res, bundle);
    } catch (err) {
      return handleErr(res, err);
    }
  };
  router.get('/api/v1/portal/me', handlePortalMe);
  router.get('/portal/me', handlePortalMe);
  router.get('/api/v1/portal/summary', handlePortalMe);
  router.get('/portal/summary', handlePortalMe);

  // Staff preview of a patient's portal data (protected by staff auth + branch check)
  router.get('/api/v1/patient-portal/:patientId', async (req, res) => {
    try {
      const bundle = await pgGetPortalPatientBundle(param(req.params.patientId));
      if (!bundle) return sendPgError(res, 404, 'NOT_FOUND', 'Patient not found');
      const allowed = await canUserAccessBranch(actorOf(req), bundle.profile.branchId);
      if (!allowed) return sendPgError(res, 403, 'FORBIDDEN', 'Cross-branch patient access denied');
      return sendPgSuccess(res, bundle);
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.post('/api/v1/portal/contact-otp/request', async (req, res) => {
    try {
      const portalSession = await resolvePortalSession(req);
      if (!portalSession) return sendPgError(res, 401, 'PORTAL_AUTH_REQUIRED', 'Patient portal sign-in required');
      const changeType = req.body?.changeType === 'email' ? 'email' : 'mobile';
      const targetValue = String(req.body?.targetValue || '');
      if (!targetValue) return sendPgError(res, 400, 'VALIDATION_ERROR', 'targetValue is required');
      return sendPgSuccess(res, await pgRequestPortalContactOtp(portalSession, changeType, targetValue), {}, 201);
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.post('/api/v1/portal/contact-otp/verify', async (req, res) => {
    try {
      const portalSession = await resolvePortalSession(req);
      if (!portalSession) return sendPgError(res, 401, 'PORTAL_AUTH_REQUIRED', 'Patient portal sign-in required');
      return sendPgSuccess(
        res,
        await pgVerifyPortalContactOtp(portalSession, String(req.body?.otpId || ''), String(req.body?.otpCode || ''))
      );
    } catch (err) {
      return handleErr(res, err);
    }
  });

  // ===========================================================================
  // 6. NOTIFICATIONS, WEBHOOKS, STAFF ALERTS, CALL LOGS & REPORTS HUB
  // ===========================================================================

  router.get('/api/v1/notifications', async (req, res) => {
    try {
      const scope = await resolveAuthorizedBranchScope(actorOf(req), req.query.branchId ? String(req.query.branchId) : undefined);
      if (!scope.allowed) return sendPgError(res, 403, 'FORBIDDEN', 'Cross-branch notification access denied');
      return sendPgSuccess(
        res,
        await pgListNotifications({
          branchId: scope.branchId,
          channel: req.query.channel ? String(req.query.channel) : undefined,
          status: req.query.status ? String(req.query.status) : undefined,
        })
      );
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.post('/api/v1/notifications/enqueue', async (req, res) => {
    try {
      const created = await pgEnqueueNotification({
        idempotencyKey: req.body?.idempotencyKey,
        branchId: req.body?.branchId || actorOf(req).branchId,
        patientId: req.body?.patientId || null,
        channel: req.body?.channel || 'sms',
        recipient: String(req.body?.recipient || ''),
        subject: req.body?.subject,
        body: String(req.body?.body || ''),
        scheduledFor: req.body?.scheduledFor,
      });
      return sendPgSuccess(res, created, {}, 202);
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.post('/api/v1/webhooks/notifications/:provider', async (req, res) => {
    try {
      const body = req.body || {};
      const result = await pgRecordWebhookEvent({
        provider: param(req.params.provider),
        providerEventId: String(body.eventId || body.id || `${Date.now()}`),
        eventType: String(body.eventType || 'delivery_receipt'),
        signatureVerified: Boolean(req.headers['x-webhook-signature']),
        payload: body,
        providerMessageId: body.providerMessageId ? String(body.providerMessageId) : undefined,
        deliveryStatus: body.status === 'delivered' ? 'delivered' : body.status === 'failed' ? 'failed' : undefined,
      });
      return sendPgSuccess(res, result);
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.get('/api/v1/staff-alerts', async (req, res) => {
    try {
      return sendPgSuccess(res, await pgListStaffAlerts(actorOf(req)));
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.post('/api/v1/staff-alerts', requireRoles(['super_admin', 'admin_manager'], deps.getFallbackUser), async (req, res) => {
    try {
      return sendPgSuccess(res, await pgCreateStaffAlert(req.body), {}, 201);
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.post('/api/v1/staff-alerts/:id/read', async (req, res) => {
    try {
      const updated = await pgMarkStaffAlertRead(param(req.params.id), actorOf(req));
      if (!updated) return sendPgError(res, 404, 'NOT_FOUND', 'Alert not found');
      return sendPgSuccess(res, updated);
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.post('/api/v1/call-center/contact-logs', async (req, res) => {
    try {
      const created = await pgLogCallContact(req.body, actorOf(req), extractClientIp(req.headers, req.ip));
      return sendPgSuccess(res, created, {}, 201);
    } catch (err) {
      return handleErr(res, err);
    }
  });

  router.get(
    '/api/v1/reports/:type',
    requireRoles(['super_admin', 'admin_manager', 'cashier', 'inventory_manager', 'doctor'], deps.getFallbackUser),
    async (req, res) => {
      const allowedTypes = new Set(['revenue', 'collections', 'appointments', 'inventory', 'commissions', 'call_center']);
      const reportType = String(req.params.type);
      if (!allowedTypes.has(reportType)) {
        return sendPgError(res, 400, 'INVALID_REPORT_TYPE', `Unsupported report type '${reportType}'`);
      }
      try {
        const scope = await resolveAuthorizedBranchScope(actorOf(req), req.query.branchId ? String(req.query.branchId) : undefined);
        if (!scope.allowed) return sendPgError(res, 403, 'FORBIDDEN', 'Cross-branch report access denied');
        const data = await pgGenerateReport({
          reportType: reportType as 'revenue' | 'collections' | 'appointments' | 'inventory' | 'commissions' | 'call_center',
          branchId: scope.branchId,
          startDate: req.query.startDate ? String(req.query.startDate) : undefined,
          endDate: req.query.endDate ? String(req.query.endDate) : undefined,
        });
        return sendPgSuccess(res, data);
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  router.get(
    '/api/v1/reports/:type/export.csv',
    requireRoles(['super_admin', 'admin_manager', 'cashier', 'inventory_manager'], deps.getFallbackUser),
    async (req, res) => {
      const allowedTypes = new Set(['revenue', 'collections', 'appointments', 'inventory', 'commissions', 'call_center']);
      const reportType = String(req.params.type);
      if (!allowedTypes.has(reportType)) {
        return sendPgError(res, 400, 'INVALID_REPORT_TYPE', `Unsupported report type '${reportType}'`);
      }
      try {
        const scope = await resolveAuthorizedBranchScope(actorOf(req), req.query.branchId ? String(req.query.branchId) : undefined);
        if (!scope.allowed) return sendPgError(res, 403, 'FORBIDDEN', 'Cross-branch export denied');
        const exported = await pgExportReportCsv({
          reportType: reportType as 'revenue' | 'collections' | 'appointments' | 'inventory' | 'commissions' | 'call_center',
          branchId: scope.branchId,
          startDate: req.query.startDate ? String(req.query.startDate) : undefined,
          endDate: req.query.endDate ? String(req.query.endDate) : undefined,
          actor: actorOf(req),
          ipAddress: extractClientIp(req.headers, req.ip),
        });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.status(200).send(exported.csv);
      } catch (err) {
        return handleErr(res, err);
      }
    }
  );

  return router;
}
