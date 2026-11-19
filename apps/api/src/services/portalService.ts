import crypto from 'node:crypto';
import type {
  PatientAccountDto,
  PatientAccountStatus,
  PortalMeDto,
  PortalHomeDto,
  PortalSessionItemDto,
  PortalPrescriptionDto,
  PortalBillingSummaryDto,
  PortalDocumentDto,
  PortalProfileDto,
  PortalProfileUpdateDto,
} from '@suoxi/shared-types';
import {
  BadRequestError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  TooManyRequestsError,
  ConflictError,
} from '../middleware/errorHandler.js';
import { hashPassword, verifyPassword, verifyDummyPassword } from '../auth/password.js';
import { patientService } from './patientService.js';
import { appointmentService } from './appointmentService.js';
import { sessionService } from './sessionService.js';
import { prescriptionService } from './prescriptionService.js';
import { billingService } from './billingService.js';
import { packageService } from './packageService.js';
import { fileService } from './fileService.js';
import { pdfService } from './pdfService.js';
import { logAudit } from './auditLogger.js';

export interface PatientAccountRecord {
  id: string;
  patientId: string;
  loginIdentifier: string;
  passwordHash: string | null;
  status: PatientAccountStatus;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PortalSessionRecord {
  id: string;
  sessionIdHash: string;
  patientAccountId: string;
  patientId: string;
  createdIp: string;
  userAgent: string;
  lastActivityAt: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface PatientTokenRecord {
  id: string;
  patientAccountId: string;
  tokenHash: string;
  tokenType: 'setup' | 'reset';
  channel: 'sms' | 'email';
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
}

export interface ContactOtpRecord {
  id: string;
  patientAccountId: string;
  changeType: 'mobile' | 'email';
  targetValue: string;
  otpHash: string;
  attemptCount: number;
  maxAttempts: number;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export class PortalService {
  private accounts = new Map<string, PatientAccountRecord>();
  private sessions = new Map<string, PortalSessionRecord>();
  private tokens = new Map<string, PatientTokenRecord>();
  private otps = new Map<string, ContactOtpRecord>();

  constructor() {
    this.seedInitialData();
  }

  private async seedInitialData() {
    // Seed initial portal account for sample patient Sumaiya Rahman ('pt-sumaiya-01')
    const sampleAccountId = 'pa-sumaiya-01';
    const sampleHash = await hashPassword('PatientPass123!');

    this.accounts.set(sampleAccountId, {
      id: sampleAccountId,
      patientId: 'pt-sumaiya-01',
      loginIdentifier: '+8801711223344',
      passwordHash: sampleHash,
      status: 'active',
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date().toISOString(),
      createdAt: '2026-10-15T08:00:00.000Z',
      updatedAt: new Date().toISOString(),
    });
  }

  public async resetData() {
    this.accounts.clear();
    this.sessions.clear();
    this.tokens.clear();
    this.otps.clear();
    await this.seedInitialData();
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
  }

  // ============================================================================
  // STAFF-SIDE MANAGEMENT (portal.manage)
  // ============================================================================

  public async getAccountByPatientId(patientId: string): Promise<PatientAccountDto | null> {
    const acc = Array.from(this.accounts.values()).find((a) => a.patientId === patientId);
    if (!acc) return null;
    return {
      id: acc.id,
      patientId: acc.patientId,
      loginIdentifier: acc.loginIdentifier,
      status: acc.status,
      failedLoginAttempts: acc.failedLoginAttempts,
      lockedUntil: acc.lockedUntil,
      lastLoginAt: acc.lastLoginAt,
      createdAt: acc.createdAt,
    };
  }

  public async createPortalAccount(
    patientId: string,
    loginIdentifier?: string,
    actor?: { id: string }
  ): Promise<{ account: PatientAccountDto; setupToken: string; setupUrl: string }> {
    const patient = await patientService.getPatientById(patientId);
    if (!patient) {
      throw new NotFoundError(`Patient not found: ${patientId}`);
    }

    let existing = Array.from(this.accounts.values()).find((a) => a.patientId === patientId);
    if (existing) {
      throw new ConflictError('Portal account already exists for this patient');
    }

    const rawIdentifier = loginIdentifier?.trim() || patient.primary_mobile || patient.patient_code;
    const accountId = `pa-${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const account: PatientAccountRecord = {
      id: accountId,
      patientId,
      loginIdentifier: rawIdentifier,
      passwordHash: null,
      status: 'pending_setup',
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.accounts.set(accountId, account);

    // Generate initial setup token (expiring in 24 hours per A-05)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const tokenId = `tok-${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    this.tokens.set(tokenId, {
      id: tokenId,
      patientAccountId: accountId,
      tokenHash,
      tokenType: 'setup',
      channel: 'sms',
      expiresAt,
      usedAt: null,
      createdAt: now,
    });

    if (actor) {
      await logAudit(null, {
        actorUserId: actor.id,
        action: 'PORTAL_ACCOUNT_CREATE',
        entityType: 'patient_accounts',
        entityId: accountId,
        ipAddress: '127.0.0.1',
        payloadAfter: { patientId, loginIdentifier: rawIdentifier },
      });
    }

    return {
      account: {
        id: account.id,
        patientId: account.patientId,
        loginIdentifier: account.loginIdentifier,
        status: account.status,
        failedLoginAttempts: 0,
        createdAt: account.createdAt,
      },
      setupToken: rawToken,
      setupUrl: `/portal/setup?token=${rawToken}`,
    };
  }

  public async generateSetupOrResetLink(
    patientId: string,
    tokenType: 'setup' | 'reset' = 'setup',
    channel: 'sms' | 'email' = 'sms',
    actor?: { id: string }
  ): Promise<{ token: string; setupUrl: string }> {
    const account = Array.from(this.accounts.values()).find((a) => a.patientId === patientId);
    if (!account) {
      throw new NotFoundError('No portal account found for this patient');
    }

    if (account.status === 'deactivated') {
      throw new BadRequestError('Cannot generate link for deactivated portal account');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const tokenId = `tok-${crypto.randomUUID()}`;
    const ttlMs = tokenType === 'setup' ? 24 * 60 * 60 * 1000 : 2 * 60 * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    this.tokens.set(tokenId, {
      id: tokenId,
      patientAccountId: account.id,
      tokenHash,
      tokenType,
      channel,
      expiresAt,
      usedAt: null,
      createdAt: new Date().toISOString(),
    });

    if (actor) {
      await logAudit(null, {
        actorUserId: actor.id,
        action: tokenType === 'setup' ? 'PORTAL_SETUP_LINK_GENERATED' : 'PORTAL_RESET_LINK_GENERATED',
        entityType: 'patient_accounts',
        entityId: account.id,
        ipAddress: '127.0.0.1',
        payloadAfter: { channel, tokenType },
      });
    }

    const path = tokenType === 'setup' ? '/portal/setup' : '/portal/reset';
    return {
      token: rawToken,
      setupUrl: `${path}?token=${rawToken}`,
    };
  }

  public async deactivateAccount(patientId: string, actor?: { id: string }): Promise<void> {
    const account = Array.from(this.accounts.values()).find((a) => a.patientId === patientId);
    if (!account) {
      throw new NotFoundError('Portal account not found');
    }

    account.status = 'deactivated';
    account.updatedAt = new Date().toISOString();
    this.accounts.set(account.id, account);

    // Revoke all active sessions
    const now = new Date().toISOString();
    for (const s of this.sessions.values()) {
      if (s.patientAccountId === account.id && !s.revokedAt) {
        s.revokedAt = now;
      }
    }

    if (actor) {
      await logAudit(null, {
        actorUserId: actor.id,
        action: 'PORTAL_ACCOUNT_DEACTIVATE',
        entityType: 'patient_accounts',
        entityId: account.id,
        ipAddress: '127.0.0.1',
      });
    }
  }

  // ============================================================================
  // PATIENT PORTAL AUTHENTICATION & SETUP
  // ============================================================================

  public async completeSetupOrReset(rawToken: string, newPassword: string): Promise<void> {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestError('Password must be at least 8 characters long');
    }

    const tokenHash = this.hashToken(rawToken);
    const tokenRec = Array.from(this.tokens.values()).find((t) => t.tokenHash === tokenHash);

    if (!tokenRec) {
      throw new BadRequestError('Invalid or expired link token');
    }

    if (tokenRec.usedAt) {
      throw new BadRequestError('This link token has already been used');
    }

    if (new Date(tokenRec.expiresAt) < new Date()) {
      throw new BadRequestError('This link token has expired');
    }

    const account = this.accounts.get(tokenRec.patientAccountId);
    if (!account) {
      throw new NotFoundError('Associated patient account not found');
    }

    const hashed = await hashPassword(newPassword);
    account.passwordHash = hashed;
    account.status = 'active';
    account.failedLoginAttempts = 0;
    account.lockedUntil = null;
    account.updatedAt = new Date().toISOString();
    this.accounts.set(account.id, account);

    tokenRec.usedAt = new Date().toISOString();
    this.tokens.set(tokenRec.id, tokenRec);

    // Revoke previous sessions on password change
    const now = new Date().toISOString();
    for (const s of this.sessions.values()) {
      if (s.patientAccountId === account.id && !s.revokedAt) {
        s.revokedAt = now;
      }
    }
  }

  public async requestForgotPassword(loginIdentifier: string): Promise<{ success: boolean; token?: string }> {
    const ident = loginIdentifier.trim();
    let account = Array.from(this.accounts.values()).find(
      (a) => a.loginIdentifier.toLowerCase() === ident.toLowerCase()
    );

    if (!account) {
      // Try resolving via patient mobile or patient code
      const allPatients = await patientService.searchPatients({ q: ident, limit: 1 });
      if (allPatients.patients && allPatients.patients.length > 0) {
        const pId = allPatients.patients[0].id;
        account = Array.from(this.accounts.values()).find((a) => a.patientId === pId);
      }
    }

    if (!account || account.status !== 'active') {
      // Constant time behavior / do not reveal account existence
      return { success: true };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const tokenId = `tok-${crypto.randomUUID()}`;

    this.tokens.set(tokenId, {
      id: tokenId,
      patientAccountId: account.id,
      tokenHash,
      tokenType: 'reset',
      channel: 'sms',
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      usedAt: null,
      createdAt: new Date().toISOString(),
    });

    return { success: true, token: rawToken };
  }

  public async login(
    loginIdentifier: string,
    passwordPlain: string,
    ip: string,
    userAgent = ''
  ): Promise<{ sessionToken: string; account: PortalMeDto }> {
    const ident = loginIdentifier.trim();
    let account = Array.from(this.accounts.values()).find(
      (a) => a.loginIdentifier.toLowerCase() === ident.toLowerCase()
    );

    if (!account) {
      // Try resolving via patient code or mobile
      const searchRes = await patientService.searchPatients({ q: ident, limit: 1 });
      if (searchRes.patients && searchRes.patients.length > 0) {
        account = Array.from(this.accounts.values()).find(
          (a) => a.patientId === searchRes.patients[0].id
        );
      }
    }

    if (!account) {
      await verifyDummyPassword(passwordPlain);
      throw new UnauthorizedError('Invalid login credentials');
    }

    // Check account lockout (15 minutes)
    if (account.lockedUntil && new Date(account.lockedUntil) > new Date()) {
      throw new TooManyRequestsError(
        'Account is locked due to multiple failed login attempts. Please try again after 15 minutes.'
      );
    }

    if (account.status === 'pending_setup') {
      throw new UnauthorizedError('Please complete your initial account setup using your SMS link');
    }

    if (account.status !== 'active') {
      throw new UnauthorizedError('Your account is currently suspended or deactivated');
    }

    if (!account.passwordHash) {
      await verifyDummyPassword(passwordPlain);
      throw new UnauthorizedError('Invalid login credentials');
    }

    const isMatch = await verifyPassword(account.passwordHash, passwordPlain);
    if (!isMatch) {
      account.failedLoginAttempts += 1;
      if (account.failedLoginAttempts >= 5) {
        account.lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      }
      account.updatedAt = new Date().toISOString();
      this.accounts.set(account.id, account);
      throw new UnauthorizedError('Invalid login credentials');
    }

    // Reset failed attempts upon successful login
    account.failedLoginAttempts = 0;
    account.lockedUntil = null;
    account.lastLoginAt = new Date().toISOString();
    account.updatedAt = new Date().toISOString();
    this.accounts.set(account.id, account);

    // Create session in portal_sessions
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const sessionIdHash = this.hashToken(sessionToken);
    const sessionId = `ps-${crypto.randomUUID()}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(); // 12 hours

    this.sessions.set(sessionId, {
      id: sessionId,
      sessionIdHash,
      patientAccountId: account.id,
      patientId: account.patientId,
      createdIp: ip,
      userAgent,
      lastActivityAt: now.toISOString(),
      expiresAt,
      revokedAt: null,
      createdAt: now.toISOString(),
    });

    const patient = await patientService.getPatientById(account.patientId);

    return {
      sessionToken,
      account: {
        accountId: account.id,
        patientId: account.patientId,
        patientCode: patient?.patient_code || '',
        fullName: patient?.full_name || 'Patient',
        fullNameBangla: patient?.full_name_bn || undefined,
        primaryMobile: patient?.primary_mobile || '',
        email: patient?.email || undefined,
        preferredLanguage: 'bn',
      },
    };
  }

  public async getSession(
    sessionToken: string
  ): Promise<{ account: PatientAccountRecord; patientId: string } | null> {
    if (!sessionToken) return null;
    const tokenHash = this.hashToken(sessionToken);
    const session = Array.from(this.sessions.values()).find(
      (s) => s.sessionIdHash === tokenHash && !s.revokedAt && new Date(s.expiresAt) > new Date()
    );

    if (!session) return null;

    session.lastActivityAt = new Date().toISOString();
    const account = this.accounts.get(session.patientAccountId);
    if (!account || account.status !== 'active') return null;

    return { account, patientId: session.patientId };
  }

  public async logout(sessionToken: string): Promise<void> {
    if (!sessionToken) return;
    const tokenHash = this.hashToken(sessionToken);
    const session = Array.from(this.sessions.values()).find((s) => s.sessionIdHash === tokenHash);
    if (session) {
      session.revokedAt = new Date().toISOString();
    }
  }

  // ============================================================================
  // SECURE ZERO-TRUST PORTAL VIEWS (PATIENT RESOLVED FROM SESSION ONLY)
  // ============================================================================

  public async getPortalHome(patientId: string): Promise<PortalHomeDto> {
    const patient = await patientService.getPatientById(patientId);
    if (!patient) throw new NotFoundError('Patient not found');

    // 1. Next session query
    const apts = appointmentService.listAppointments({ patientId });
    const upcoming = apts.items
      .filter((a) => (a.status === 'booked' || a.status === 'confirmed') && new Date(a.appointment_date) >= new Date())
      .sort((a, b) => new Date(`${a.appointment_date}T${a.start_time}`).getTime() - new Date(`${b.appointment_date}T${b.start_time}`).getTime());

    const nextApt = upcoming[0] || null;

    // 2. Package progress
    const packages = packageService.listPatientPackages(patientId);
    const activePkg = packages.find((p) => p.status === 'active') || null;

    let packageProgress = null;
    if (activePkg) {
      const totalSessions = activePkg.items.reduce((acc, it) => acc + it.initialSessions, 0);
      const remainingSessions = activePkg.items.reduce((acc, it) => acc + it.remainingSessions, 0);
      const completedSessions = Math.max(0, totalSessions - remainingSessions);

      packageProgress = {
        packageName: activePkg.packageName,
        totalSessions,
        completedSessions,
        remainingSessions,
        expiryDate: activePkg.expiryDate,
        isExpiringSoon: activePkg.daysToExpiry <= 14,
      };
    }

    // 3. Billing dues summary
    const dues = await billingService.getPatientDues(patientId);
    const outstandingDue = parseFloat(dues.netPatientDue || '0');

    return {
      patientName: patient.full_name,
      patientNameBangla: patient.full_name_bn || undefined,
      patientCode: patient.patient_code,
      nextSession: nextApt
        ? {
            id: nextApt.id,
            appointmentId: nextApt.id,
            date: nextApt.appointment_date,
            time: nextApt.start_time,
            serviceName: nextApt.service_name || 'Consultation & Treatment',
            doctorName: nextApt.provider_name || 'Doctor',
            branchName: nextApt.branch_name || 'Dhanmondi Main Clinic',
            status: nextApt.status,
          }
        : null,
      packageProgress,
      billingSummary: {
        outstandingDue,
        totalInvoiced: parseFloat(dues.totalInvoiced || '0'),
        totalPaid: parseFloat(dues.totalPaid || '0'),
        hasOutstandingDue: outstandingDue > 0,
      },
    };
  }

  public async getPortalSessions(patientId: string): Promise<PortalSessionItemDto[]> {
    const rawSessions = await sessionService.getSessionsByPatientId(patientId);

    return rawSessions.map((s) => ({
      id: s.id,
      sessionNumber: s.sessionCode,
      date: s.startedAt ? s.startedAt.split('T')[0] : s.createdAt.split('T')[0],
      time: s.startedAt ? s.startedAt.split('T')[1].substring(0, 5) : '10:00',
      serviceName: s.serviceName || 'Treatment Session',
      serviceNameBangla: s.serviceNameBn || undefined,
      doctorName: s.doctorName || 'Doctor',
      branchName: s.branchName || 'Dhanmondi Main Clinic',
      status: s.status as any,
      // CRITICAL SECURITY GATE: publish_aftercare_to_portal must be true
      aftercareInstructions: s.publishAftercareToPortal ? s.aftercareInstructions : null,
      aftercarePublished: Boolean(s.publishAftercareToPortal),
    }));
  }

  public async getPortalPrescriptions(patientId: string): Promise<PortalPrescriptionDto[]> {
    const rawRxList = await prescriptionService.getPrescriptionsByPatientId(patientId);

    // CRITICAL SECURITY GATE: Finalized + Published only!
    const visibleList = rawRxList.filter(
      (rx) => rx.status === 'finalized' && rx.publishedToPortal === true
    );

    return visibleList.map((rx) => ({
      id: rx.id,
      prescriptionNumber: rx.prescriptionCode,
      date: rx.createdAt.split('T')[0],
      doctorName: rx.doctorName || 'Dr. Farhana Khan',
      doctorDesignation: rx.doctorDesignation,
      diagnosisSummary: rx.diagnosis,
      medications: rx.items.map((it) => ({
        name: it.itemName,
        dosage: it.dosage || it.strength || 'As advised',
        instructions: it.instructions || 'Follow doctor directions',
        duration: it.duration || '',
      })),
      advice: rx.advice || undefined,
      lifestyleGuidance: rx.guidanceSnapshot
        ? {
            title: rx.guidanceSnapshot.title,
            guidelines: rx.guidanceSnapshot.items
              .filter((i) => i.section !== 'recommended_foods' && i.section !== 'foods_to_avoid')
              .map((i) => (i.contentBn || i.contentEn || '').trim())
              .filter(Boolean),
            foodsToEat: rx.guidanceSnapshot.items
              .filter((i) => i.section === 'recommended_foods')
              .map((i) => (i.contentBn || i.contentEn || '').trim())
              .filter(Boolean),
            foodsToAvoid: rx.guidanceSnapshot.items
              .filter((i) => i.section === 'foods_to_avoid')
              .map((i) => (i.contentBn || i.contentEn || '').trim())
              .filter(Boolean),
          }
        : null,
      hasPdf: Boolean(rx.pdfSha256 || rx.pdfUrl),
      pdfDownloadUrl: `/portal/prescriptions/${rx.id}/pdf`,
    }));
  }

  public async getPortalPrescriptionPdf(
    patientId: string,
    prescriptionId: string
  ): Promise<{ buffer: Buffer; filename: string }> {
    const rx = await prescriptionService.getPrescriptionById(prescriptionId);

    // ZERO-TRUST IDOR DEFENSE: If not found, not this patient, not finalized, or not published -> 404
    if (!rx || rx.patientId !== patientId || rx.status !== 'finalized' || !rx.publishedToPortal) {
      throw new NotFoundError('Prescription not found');
    }

    const pdfResult = await pdfService.generatePrescriptionPdf(rx);
    return {
      buffer: pdfResult.pdfBuffer,
      filename: `prescription-${rx.prescriptionCode}.pdf`,
    };
  }

  public async getPortalBilling(patientId: string): Promise<PortalBillingSummaryDto> {
    const dues = await billingService.getPatientDues(patientId);

    // Fetch invoices for this patient only
    const allInvoices = await billingService.listInvoices({ patientId });
    const invoices = (allInvoices || [])
      .filter((i) => i.patientId === patientId && i.status !== 'void')
      .map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNo,
        date: i.createdAt.split('T')[0],
        totalAmount: parseFloat(i.totalAmount),
        paidAmount: parseFloat(i.paidAmount || '0'),
        dueAmount: parseFloat(i.dueAmount || '0'),
        status: (i.status === 'unpaid' ? 'due' : i.status) as any,
      }));

    // Fetch payments for this patient only
    const allPayments = await billingService.listPayments({ patientId });
    const payments = (allPayments || [])
      .filter((p) => p.patientId === patientId)
      .map((p) => ({
        id: p.id,
        receiptNumber: p.paymentNo,
        date: p.paymentDate.split('T')[0],
        amount: parseFloat(p.amount),
        paymentMethod: p.paymentMethodName || p.paymentMethodCode || 'Cash',
      }));

    // Fetch packages for this patient only
    const rawPackages = packageService.listPatientPackages(patientId);
    const packages = rawPackages.map((p) => {
      const totalSessions = p.items.reduce((acc, it) => acc + it.initialSessions, 0);
      const remainingSessions = p.items.reduce((acc, it) => acc + it.remainingSessions, 0);
      return {
        id: p.id,
        packageName: p.packageName,
        totalSessions,
        consumedSessions: Math.max(0, totalSessions - remainingSessions),
        remainingSessions,
        validityEnd: p.expiryDate,
        isExpired: p.status === 'expired' || new Date(p.expiryDate) < new Date(),
      };
    });

    return {
      totalInvoiced: parseFloat(dues.totalInvoiced || '0'),
      totalPaid: parseFloat(dues.totalPaid || '0'),
      outstandingDue: parseFloat(dues.netPatientDue || '0'),
      invoices,
      payments,
      packages,
    };
  }

  public async getPortalDocuments(patientId: string): Promise<PortalDocumentDto[]> {
    // CRITICAL SECURITY GATE: filterVisibleOnly = true
    const files = fileService.getPatientFiles(patientId, true);

    return files.map((f) => {
      const accessUrl = fileService.generateSignedAccessUrl(
        f.fileId,
        patientId,
        `patient-${patientId}`,
        300
      );
      return {
        id: f.id,
        fileName: f.title || f.file.originalFilename,
        fileCategory: f.fileCategory,
        captureDate: f.takenAt ? f.takenAt.split('T')[0] : f.createdAt.split('T')[0],
        mimeType: f.file.mimeType,
        fileSize: f.file.sizeBytes,
        downloadUrl: accessUrl.signedUrl,
      };
    });
  }

  public async getPortalProfile(patientId: string): Promise<PortalProfileDto> {
    const patient = await patientService.getPatientById(patientId);
    if (!patient) throw new NotFoundError('Patient not found');

    return {
      id: patient.id,
      patientCode: patient.patient_code,
      fullName: patient.full_name,
      fullNameBangla: patient.full_name_bn || undefined,
      primaryMobile: patient.primary_mobile,
      email: patient.email || undefined,
      address: patient.address || undefined,
      emergencyContactName: patient.emergency_contact_name || undefined,
      emergencyContactRelation: patient.emergency_contact_relation || undefined,
      emergencyContactMobile: patient.emergency_contact_phone || undefined,
      preferredLanguage: 'bn',
    };
  }

  public async updatePortalProfile(
    patientId: string,
    input: PortalProfileUpdateDto
  ): Promise<PortalProfileDto> {
    const patient = await patientService.getPatientById(patientId);
    if (!patient) throw new NotFoundError('Patient not found');

    // Safe allowed profile updates: address & emergency contact details
    const updated = await patientService.updatePatient(
      patientId,
      {
        address: input.address !== undefined ? input.address : (patient.address || undefined),
        emergencyContactName:
          input.emergencyContactName !== undefined
            ? input.emergencyContactName
            : (patient.emergency_contact_name || undefined),
        emergencyContactRelation:
          input.emergencyContactRelation !== undefined
            ? input.emergencyContactRelation
            : (patient.emergency_contact_relation || undefined),
        emergencyContactPhone:
          input.emergencyContactMobile !== undefined
            ? input.emergencyContactMobile
            : (patient.emergency_contact_phone || undefined),
      },
      `patient-${patientId}`,
      '127.0.0.1'
    );

    return {
      id: updated.id,
      patientCode: updated.patient_code,
      fullName: updated.full_name,
      fullNameBangla: updated.full_name_bn || undefined,
      primaryMobile: updated.primary_mobile,
      email: updated.email || undefined,
      address: updated.address || undefined,
      emergencyContactName: updated.emergency_contact_name || undefined,
      emergencyContactRelation: updated.emergency_contact_relation || undefined,
      emergencyContactMobile: updated.emergency_contact_phone || undefined,
      preferredLanguage: input.preferredLanguage || 'bn',
    };
  }

  // ============================================================================
  // RATE-LIMITED CONTACT CHANGE OTP VERIFICATION (MOBILE / EMAIL)
  // ============================================================================

  public async requestContactOtp(
    accountId: string,
    patientId: string,
    changeType: 'mobile' | 'email',
    targetValue: string
  ): Promise<{ success: boolean; simulatedOtp?: string }> {
    const val = targetValue.trim();
    if (!val) throw new BadRequestError('Target value cannot be empty');

    if (changeType === 'mobile') {
      const bdMobileRegex = /^\+8801[3-9]\d{8}$/;
      if (!bdMobileRegex.test(val)) {
        throw new BadRequestError('Invalid Bangladeshi mobile number. Format: +8801XXXXXXXXX');
      }
    } else if (changeType === 'email') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(val)) {
        throw new BadRequestError('Invalid email address');
      }
    }

    // Invalidate prior active OTPs for this account & changeType
    for (const otp of this.otps.values()) {
      if (otp.patientAccountId === accountId && otp.changeType === changeType && !otp.consumedAt) {
        otp.consumedAt = new Date().toISOString();
      }
    }

    const rawOtp = crypto.randomInt(100000, 999999).toString();
    const otpHash = this.hashToken(rawOtp);
    const otpId = `otp-${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    this.otps.set(otpId, {
      id: otpId,
      patientAccountId: accountId,
      changeType,
      targetValue: val,
      otpHash,
      attemptCount: 0,
      maxAttempts: 3,
      expiresAt,
      consumedAt: null,
      createdAt: new Date().toISOString(),
    });

    return { success: true, simulatedOtp: rawOtp };
  }

  public async confirmContactOtp(
    accountId: string,
    patientId: string,
    changeType: 'mobile' | 'email',
    targetValue: string,
    otp: string
  ): Promise<{ success: boolean }> {
    const val = targetValue.trim();
    const otpRec = Array.from(this.otps.values()).find(
      (o) =>
        o.patientAccountId === accountId &&
        o.changeType === changeType &&
        o.targetValue === val &&
        !o.consumedAt
    );

    if (!otpRec || new Date(otpRec.expiresAt) < new Date()) {
      throw new BadRequestError('Verification code expired or not found. Please request a new code.');
    }

    if (otpRec.attemptCount >= otpRec.maxAttempts) {
      throw new TooManyRequestsError('Maximum verification attempts exceeded. Please request a new code.');
    }

    const inputHash = this.hashToken(otp.trim());
    if (inputHash !== otpRec.otpHash) {
      otpRec.attemptCount += 1;
      this.otps.set(otpRec.id, otpRec);
      throw new BadRequestError('Invalid verification code');
    }

    otpRec.consumedAt = new Date().toISOString();
    this.otps.set(otpRec.id, otpRec);

    // Apply verified update to patient record
    if (changeType === 'mobile') {
      await patientService.updatePatient(
        patientId,
        { primaryMobile: val },
        `patient-${patientId}`,
        '127.0.0.1'
      );
      const acc = this.accounts.get(accountId);
      if (acc) {
        acc.loginIdentifier = val;
        acc.updatedAt = new Date().toISOString();
        this.accounts.set(acc.id, acc);
      }
    } else if (changeType === 'email') {
      await patientService.updatePatient(
        patientId,
        { email: val },
        `patient-${patientId}`,
        '127.0.0.1'
      );
    }

    return { success: true };
  }
}

export const portalService = new PortalService();
