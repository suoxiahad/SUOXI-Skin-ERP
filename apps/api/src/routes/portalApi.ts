import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requirePortalAuth } from '../middleware/requirePortalAuth.js';
import { validateCsrf } from '../auth/csrf.js';
import { portalService } from '../services/portalService.js';
import { patientService } from '../services/patientService.js';
import { NotFoundError } from '../middleware/errorHandler.js';

export const portalApiRouter = Router();

// Protect ALL routes on this router with portal session authentication
portalApiRouter.use(requirePortalAuth);

// 1. GET /portal/me
portalApiRouter.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = req.portalUser!;
    const patient = await patientService.getPatientById(session.patientId);
    if (!patient) throw new NotFoundError('Patient profile not found');

    res.status(200).json({
      data: {
        accountId: session.accountId,
        patientId: patient.id,
        patientCode: patient.patient_code,
        fullName: patient.full_name,
        fullNameBangla: patient.full_name_bn || undefined,
        primaryMobile: patient.primary_mobile,
        email: patient.email || undefined,
        preferredLanguage: 'bn',
      },
      meta: { requestId: (req as any).id || (req.headers['x-request-id'] as string) || crypto.randomUUID(), timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// 2. GET /portal/home
portalApiRouter.get('/home', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const home = await portalService.getPortalHome(req.portalUser!.patientId);
    res.status(200).json({
      data: home,
      meta: { requestId: (req as any).id || (req.headers['x-request-id'] as string) || crypto.randomUUID(), timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// 3. GET /portal/sessions
portalApiRouter.get('/sessions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sessions = await portalService.getPortalSessions(req.portalUser!.patientId);
    res.status(200).json({
      data: sessions,
      meta: { total: sessions.length, requestId: (req as any).id || (req.headers['x-request-id'] as string) || crypto.randomUUID(), timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// 4. GET /portal/prescriptions
portalApiRouter.get('/prescriptions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const prescriptions = await portalService.getPortalPrescriptions(req.portalUser!.patientId);
    res.status(200).json({
      data: prescriptions,
      meta: { total: prescriptions.length, requestId: (req as any).id || (req.headers['x-request-id'] as string) || crypto.randomUUID(), timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// 5. GET /portal/prescriptions/:id/pdf (Zero-Trust IDOR-safe PDF streaming)
portalApiRouter.get('/prescriptions/:id/pdf', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pdf = await portalService.getPortalPrescriptionPdf(
      req.portalUser!.patientId,
      req.params.id
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
    res.send(pdf.buffer);
  } catch (err) {
    next(err);
  }
});

// 6. GET /portal/billing
portalApiRouter.get('/billing', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const billing = await portalService.getPortalBilling(req.portalUser!.patientId);
    res.status(200).json({
      data: billing,
      meta: { requestId: (req as any).id || (req.headers['x-request-id'] as string) || crypto.randomUUID(), timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// 7. GET /portal/documents
portalApiRouter.get('/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const docs = await portalService.getPortalDocuments(req.portalUser!.patientId);
    res.status(200).json({
      data: docs,
      meta: { total: docs.length, requestId: (req as any).id || (req.headers['x-request-id'] as string) || crypto.randomUUID(), timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// 8. GET /portal/profile
portalApiRouter.get('/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = await portalService.getPortalProfile(req.portalUser!.patientId);
    res.status(200).json({
      data: profile,
      meta: { requestId: (req as any).id || (req.headers['x-request-id'] as string) || crypto.randomUUID(), timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// 9. PATCH /portal/profile (Session-bound CSRF validated)
const updateProfileSchema = z.object({
  address: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactRelation: z.string().optional(),
  emergencyContactMobile: z.string().optional(),
  preferredLanguage: z.enum(['bn', 'en']).optional(),
});

portalApiRouter.patch('/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = req.portalUser!;
    validateCsrf(req, session.accountId, 's', 'portal');

    const body = updateProfileSchema.parse(req.body);
    const updated = await portalService.updatePortalProfile(session.patientId, body);

    res.status(200).json({
      data: updated,
      meta: { requestId: (req as any).id || (req.headers['x-request-id'] as string) || crypto.randomUUID(), timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// 10. POST /portal/verify/request (Request OTP for mobile/email change)
const otpRequestSchema = z.object({
  changeType: z.enum(['mobile', 'email']),
  targetValue: z.string().min(1),
});

portalApiRouter.post('/verify/request', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = req.portalUser!;
    validateCsrf(req, session.accountId, 's', 'portal');

    const body = otpRequestSchema.parse(req.body);
    const result = await portalService.requestContactOtp(
      session.accountId,
      session.patientId,
      body.changeType,
      body.targetValue
    );

    res.status(200).json({
      data: {
        success: true,
        message: `Verification code sent to ${body.targetValue}`,
        simulatedOtp: result.simulatedOtp,
      },
      meta: { requestId: (req as any).id || (req.headers['x-request-id'] as string) || crypto.randomUUID(), timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// 11. POST /portal/verify/confirm (Confirm OTP for mobile/email change)
const otpConfirmSchema = z.object({
  changeType: z.enum(['mobile', 'email']),
  targetValue: z.string().min(1),
  otp: z.string().min(4).max(10),
});

portalApiRouter.post('/verify/confirm', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = req.portalUser!;
    validateCsrf(req, session.accountId, 's', 'portal');

    const body = otpConfirmSchema.parse(req.body);
    await portalService.confirmContactOtp(
      session.accountId,
      session.patientId,
      body.changeType,
      body.targetValue,
      body.otp
    );

    res.status(200).json({
      data: {
        success: true,
        message: `${body.changeType === 'mobile' ? 'Mobile number' : 'Email'} updated successfully`,
      },
      meta: { requestId: (req as any).id || (req.headers['x-request-id'] as string) || crypto.randomUUID(), timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});
