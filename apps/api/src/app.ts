import express, { Express } from 'express';
import { requestIdMiddleware } from './middleware/requestId.js';
import { requestLoggerMiddleware } from './middleware/requestLogger.js';
import { securityHeadersMiddleware, corsMiddleware } from './middleware/security.js';
import { errorHandlerMiddleware, NotFoundError } from './middleware/errorHandler.js';
import { handleHealthCheck } from './routes/health.js';
import { handleReadinessCheck, handleReadyzCheck } from './routes/ready.js';
import { authRouter } from './routes/auth.js';
import { patientsRouter } from './routes/patients.js';
import { filesRouter } from './routes/files.js';
import { appointmentsRouter } from './routes/appointments.js';
import { calendarRouter } from './routes/calendar.js';
import { catalogRouter } from './routes/catalog.js';
import { consultationsRouter } from './routes/consultations.js';
import { prescriptionsRouter } from './routes/prescriptions.js';
import { sessionsRouter } from './routes/sessions.js';
import { packagesRouter } from './routes/packages.js';
import {
  invoicesRouter,
  paymentsRouter,
  receiptsRouter,
  refundsRouter,
  billingRouter,
} from './routes/billing.js';
import { inventoryRouter } from './routes/inventory.js';
import {
  integrationsRouter,
  templatesRouter,
  eventRulesRouter,
} from './routes/integrations.js';
import { notificationsRouter } from './routes/notifications.js';
import { staffAlertsRouter } from './routes/staffAlerts.js';
import { webhooksRouter } from './routes/webhooks.js';
import { callCenterRouter } from './routes/callCenter.js';
import { followUpsRouter } from './routes/followUps.js';
import { portalAuthRouter } from './routes/portalAuth.js';
import { portalApiRouter } from './routes/portalApi.js';
import { referralsRouter } from './routes/referrals.js';
import { commissionsRouter } from './routes/commissions.js';
import { reportsRouter } from './routes/reports.js';
import { appointmentService } from './services/appointmentService.js';
import { requireAuth } from './middleware/requireAuth.js';

export function createApiApp(): Express {
  const app = express();

  // Disable x-powered-by banner
  app.disable('x-powered-by');

  // 1. Request ID and Child Logger
  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware);

  // 2. Defensive Security Headers & CORS
  app.use(securityHeadersMiddleware);
  app.use(corsMiddleware);

  // 3. Body Parsing with bounded size limit (20MB to accommodate 15MB file uploads)
  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  // 4. Standard Health & Readiness Probes
  app.get('/api/v1/health', handleHealthCheck);
  app.get('/healthz', handleHealthCheck);

  app.get('/api/v1/ready', handleReadinessCheck);
  app.get('/readyz', handleReadyzCheck);

  // 5. Authentication & Authorization Routes
  app.use('/api/v1/auth', authRouter);
  app.use('/auth', authRouter);

  // 6. Clinical & Patient Routes
  app.use('/api/v1/patients', patientsRouter);
  app.use('/patients', patientsRouter);

  // 7. File Asset & Storage Routes
  app.use('/api/v1/files', filesRouter);
  app.use('/files', filesRouter);

  // 8. Appointments & Scheduling Routes (Prompt 6)
  app.use('/api/v1/appointments', appointmentsRouter);
  app.use('/appointments', appointmentsRouter);

  // 9. Calendar Scheduling Routes (Prompt 7)
  app.use('/api/v1/calendar', calendarRouter);
  app.use('/calendar', calendarRouter);

  // 10. Treatment Catalog & Guidance Library (Prompt 8)
  app.use('/api/v1/catalog', catalogRouter);
  app.use('/catalog', catalogRouter);

  // 11. Consultations, Treatment Plans & Consents (Prompt 9)
  app.use('/api/v1/consultations', consultationsRouter);
  app.use('/consultations', consultationsRouter);
  app.use('/api/v1', consultationsRouter); // For /appointments/:id/consultation
  app.use('/', consultationsRouter);

  // 12. Prescriptions, Items & PDFs (Prompt 9)
  app.use('/api/v1/prescriptions', prescriptionsRouter);
  app.use('/prescriptions', prescriptionsRouter);

  // 13. Treatment Sessions, Consumables & Next-Session Flow (Prompt 10)
  app.use('/api/v1/sessions', sessionsRouter);
  app.use('/sessions', sessionsRouter);

  // 14. Treatment Packages & Append-Only Session Ledger (Prompt 11)
  app.use('/api/v1/packages', packagesRouter);
  app.use('/packages', packagesRouter);

  // 15. Billing: Invoices, Payments, Receipts, Refunds, Collections (Prompt 12)
  app.use('/api/v1/invoices', invoicesRouter);
  app.use('/invoices', invoicesRouter);
  app.use('/api/v1/payments', paymentsRouter);
  app.use('/payments', paymentsRouter);
  app.use('/api/v1/receipts', receiptsRouter);
  app.use('/receipts', receiptsRouter);
  app.use('/api/v1/refunds', refundsRouter);
  app.use('/refunds', refundsRouter);
  app.use('/api/v1/billing', billingRouter);
  app.use('/billing', billingRouter);

  // 16. Inventory: Products, Batches, Stock Movements, Purchases, Reports (Prompt 13)
  app.use('/api/v1/inventory', inventoryRouter);
  app.use('/inventory', inventoryRouter);

  // 17. Integrations (SMTP + SMS Gateway), Templates, Event Rules, Logs (Prompt 15)
  app.use('/api/v1/integrations', integrationsRouter);
  app.use('/integrations', integrationsRouter);
  app.use('/api/v1/admin/integrations', integrationsRouter);
  app.use('/admin/integrations', integrationsRouter);

  app.use('/api/v1/templates', templatesRouter);
  app.use('/templates', templatesRouter);
  app.use('/api/v1/admin/templates', templatesRouter);
  app.use('/admin/templates', templatesRouter);

  app.use('/api/v1/event-rules', eventRulesRouter);
  app.use('/event-rules', eventRulesRouter);
  app.use('/api/v1/admin/event-rules', eventRulesRouter);
  app.use('/admin/event-rules', eventRulesRouter);

  // 18. Notifications Queue, Reporting & Reminders (Prompt 16)
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/notifications', notificationsRouter);
  app.use('/api/v1/reports/notifications', notificationsRouter);

  // 19. Staff Alerts Bell (Prompt 16)
  app.use('/api/v1/staff-alerts', staffAlertsRouter);
  app.use('/staff-alerts', staffAlertsRouter);

  // 20. Carrier Delivery Receipt Webhooks (Prompt 16 - CSRF Exempt per B.5a)
  app.use('/webhooks', webhooksRouter);
  app.use('/api/v1/webhooks', webhooksRouter);

  // 21. Call Center Dashboard & Tomorrow Sessions (Prompt 17)
  app.use('/api/v1/call-center', callCenterRouter);
  app.use('/call-center', callCenterRouter);

  // 22. Follow-Up Tasks & Automation Rules (Prompt 17)
  app.use('/api/v1/follow-ups', followUpsRouter);
  app.use('/follow-ups', followUpsRouter);

  // 23. Patient Portal Realm (Prompt 18)
  app.use('/portal/auth', portalAuthRouter);
  app.use('/api/v1/portal/auth', portalAuthRouter);

  // 24. Patient Portal Secure Endpoints (Prompt 18)
  app.use('/portal', portalApiRouter);
  app.use('/api/v1/portal', portalApiRouter);

  // 25. Referrals & Patient Attribution (Prompt 19)
  app.use('/api/v1/referrals', referralsRouter);
  app.use('/referrals', referralsRouter);

  // 26. Commissions Ledger, Rules & Payouts (Prompt 19)
  app.use('/api/v1/commissions', commissionsRouter);
  app.use('/commissions', commissionsRouter);

  // 27. Reports Hub & Analytics (Prompt 20)
  app.use('/api/v1/reports', reportsRouter);
  app.use('/reports', reportsRouter);

  app.get(['/api/v1/appointment-sources', '/appointment-sources'], requireAuth, (req, res) => {
    const sources = appointmentService.getSources();
    res.status(200).json({ data: sources, meta: { total: sources.length, requestId: req.id, timestamp: new Date().toISOString() } });
  });

  app.get(['/api/v1/resources', '/resources'], requireAuth, (req, res) => {
    const branchId = req.query.branchId as string;
    const resources = appointmentService.getResources(branchId);
    res.status(200).json({ data: resources, meta: { total: resources.length, requestId: req.id, timestamp: new Date().toISOString() } });
  });

  // 5. 404 Catch-All Handler (API-CONV formatted)
  app.use((req, _res, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
  });

  // 6. Central API-CONV Error Handler
  app.use(errorHandlerMiddleware);

  return app;
}
