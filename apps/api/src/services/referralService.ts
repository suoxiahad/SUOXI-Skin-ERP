import crypto from 'node:crypto';
import type {
  DbId,
  ReferrerDto,
  CreateReferrerRequest,
  UpdateReferrerRequest,
  PatientReferralDto,
  AssignPatientReferrerRequest,
  CommissionRuleDto,
  CreateCommissionRuleRequest,
  CommissionDto,
  CommissionPayoutDto,
  CreatePayoutRequest,
  ReferrerDetailSummaryDto,
  CommissionKind,
  CommissionStatus,
  PayoutMethod,
} from '@suoxi/shared-types';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  UnprocessableEntityError,
} from '../middleware/errorHandler.js';
import { logAudit } from './auditLogger.js';
import { patientService } from './patientService.js';

// Default Master Key for AES-256-GCM (32 bytes / 256 bits)
const DEFAULT_DEV_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

interface RequestActor {
  id: DbId;
  fullName?: string;
  role?: string;
  roles?: string[];
  branchId?: DbId;
  permissions?: Set<string>;
}

export class ReferralService {
  // In-memory data structures (mirroring MySQL 8 tables)
  private referrers = new Map<string, ReferrerDto>();
  private referrerPayoutAccounts = new Map<
    string,
    { ciphertext: Buffer; iv: Buffer; authTag: Buffer; keyVersion: number }
  >();
  private patientReferrals = new Map<string, PatientReferralDto>();
  private commissionRules = new Map<string, CommissionRuleDto>();
  private commissions = new Map<string, CommissionDto>();
  private payouts = new Map<string, CommissionPayoutDto>();

  private refSequence = 1;
  private ruleSequence = 1;
  private commSequence = 1;
  private payoutSequence = 1;

  // Concurrency mutexes
  private attributionLocks = new Map<string, Promise<void>>();
  private payoutLocks = new Map<string, Promise<void>>();

  constructor() {
    this.seedInitialData();
  }

  public resetData() {
    this.referrers.clear();
    this.referrerPayoutAccounts.clear();
    this.patientReferrals.clear();
    this.commissionRules.clear();
    this.commissions.clear();
    this.payouts.clear();
    this.refSequence = 1;
    this.ruleSequence = 1;
    this.commSequence = 1;
    this.payoutSequence = 1;
    this.seedInitialData();
  }

  // ============================================================================
  // CRYPTOGRAPHY ENGINE (AES-256-GCM) — Hard Rule 10
  // ============================================================================
  private getMasterKey(): Buffer {
    const keyHex = process.env.APP_MASTER_KEY || DEFAULT_DEV_MASTER_KEY;
    try {
      const buf = Buffer.from(keyHex, 'hex');
      if (buf.length === 32) return buf;
    } catch {
      // fallback
    }
    return crypto.createHash('sha256').update(keyHex).digest();
  }

  public encryptPayoutDetails(plaintext: string): {
    ciphertext: Buffer;
    iv: Buffer;
    authTag: Buffer;
    keyVersion: number;
  } {
    const key = this.getMasterKey();
    const iv = crypto.randomBytes(12); // Standard 12-byte GCM IV
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      ciphertext,
      iv,
      authTag,
      keyVersion: 1,
    };
  }

  public decryptPayoutDetails(ciphertext: Buffer, iv: Buffer, authTag: Buffer): string {
    const key = this.getMasterKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  }

  private async recordAudit(params: {
    actorId: DbId;
    action: string;
    entityType: string;
    entityId: DbId;
    branchId?: DbId;
    patientId?: DbId;
    payload?: any;
  }) {
    await logAudit(null, {
      actorUserId: params.actorId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      branchId: params.branchId ?? null,
      patientId: params.patientId ?? null,
      ipAddress: '127.0.0.1',
      payloadAfter: params.payload,
    });
  }

  // ============================================================================
  // SEED DATA
  // ============================================================================
  private seedInitialData() {
    const now = new Date().toISOString();

    // 1. Initial Referrer: External Doctor
    const drRefId = 'ref-001';
    const drRefCode = 'REF-00001';
    this.referrers.set(drRefId, {
      id: drRefId,
      referrerCode: drRefCode,
      referrerType: 'doctor',
      fullName: 'Dr. Mahbubur Rahman',
      fullNameBn: 'ডা. মাহবুবুর রহমান',
      mobile: '+8801711223344',
      email: 'dr.mahbub@example.com',
      organizationName: 'Square Hospitals Dhaka',
      status: 'active',
      payoutMethod: 'bank_transfer',
      payoutDetailsMasked: '•••••••• 8921 (City Bank Dhaka)',
      hasPayoutDetails: true,
      totalPendingAmount: 0.0,
      totalPaidAmount: 0.0,
      notes: 'Consultant Dermatologist, Square Hospital',
      createdBy: 'usr-admin-01',
      createdAt: now,
      updatedAt: now,
      referredPatientCount: 1,
    });
    this.referrerPayoutAccounts.set(
      drRefId,
      this.encryptPayoutDetails('A/C: 110293848921, The City Bank Limited, Dhanmondi Branch')
    );

    // 2. Initial Referrer: Corporate Partner / Agent
    const agRefId = 'ref-002';
    const agRefCode = 'REF-00002';
    this.referrers.set(agRefId, {
      id: agRefId,
      referrerCode: agRefCode,
      referrerType: 'agent',
      fullName: 'Aesthetic Partners BD',
      fullNameBn: 'এস্থেটিক পার্টনার্স বিডি',
      mobile: '+8801911887766',
      email: 'payouts@aestheticpartners.com',
      organizationName: 'Aesthetic Partners BD Ltd.',
      status: 'active',
      payoutMethod: 'bKash',
      payoutDetailsMasked: '•••••••• 7766 (bKash Merchant)',
      hasPayoutDetails: true,
      totalPendingAmount: 0.0,
      totalPaidAmount: 0.0,
      notes: 'Corporate marketing partner for Gulshan and Banani',
      createdBy: 'usr-admin-01',
      createdAt: now,
      updatedAt: now,
      referredPatientCount: 0,
    });
    this.referrerPayoutAccounts.set(
      agRefId,
      this.encryptPayoutDetails('bKash Merchant Wallet: 01911887766')
    );

    // 2. Initial Referrers continued: Clinic Staff & VIP Patient Ambassador
    const stRefId = 'ref-003';
    const stRefCode = 'REF-00003';
    this.referrers.set(stRefId, {
      id: stRefId,
      referrerCode: stRefCode,
      referrerType: 'staff',
      fullName: 'Sharmin Sultana (Lead Aesthetician)',
      fullNameBn: 'শারমিন সুলতানা',
      mobile: '+8801722334455',
      email: 'sharmin@suoxiclinic.com',
      organizationName: 'SUOXI Aesthetic Care',
      status: 'active',
      payoutMethod: 'bKash',
      payoutDetailsMasked: '•••••••• 4455 (bKash Personal)',
      hasPayoutDetails: true,
      totalPendingAmount: 1200.0,
      totalPaidAmount: 2400.0,
      notes: 'Internal clinic therapist referral for advanced laser packages',
      createdBy: 'usr-admin-01',
      createdAt: now,
      updatedAt: now,
      referredPatientCount: 3,
    });
    this.referrerPayoutAccounts.set(
      stRefId,
      this.encryptPayoutDetails('bKash Personal: 01722334455')
    );

    const ptRefId = 'ref-004';
    const ptRefCode = 'REF-00004';
    this.referrers.set(ptRefId, {
      id: ptRefId,
      referrerCode: ptRefCode,
      referrerType: 'patient',
      fullName: 'Farzana Chowdhury (VIP Ambassador)',
      fullNameBn: 'ফারজানা চৌধুরী',
      mobile: '+8801811223344',
      email: 'farzana.c@gmail.com',
      organizationName: 'VIP Patient Club',
      status: 'active',
      payoutMethod: 'bank_transfer',
      payoutDetailsMasked: '•••••••• 5521 (BRAC Bank)',
      hasPayoutDetails: true,
      totalPendingAmount: 800.0,
      totalPaidAmount: 1600.0,
      notes: 'Loyal VIP client advocate actively referring family and friends',
      createdBy: 'usr-admin-01',
      createdAt: now,
      updatedAt: now,
      referredPatientCount: 2,
    });
    this.referrerPayoutAccounts.set(
      ptRefId,
      this.encryptPayoutDetails('BRAC Bank Gulshan Branch, A/C: 15022099885521')
    );

    // Update Dr. Mahbubur Rahman initial totals
    const drRef = this.referrers.get(drRefId)!;
    drRef.totalPendingAmount = 1831.5;
    drRef.totalPaidAmount = 5400.0;
    drRef.referredPatientCount = 4;

    const agRef = this.referrers.get(agRefId)!;
    agRef.totalPendingAmount = 1000.0;
    agRef.totalPaidAmount = 3000.0;
    agRef.referredPatientCount = 2;

    // 3. Initial Commission Rules
    const r1Id = 'rule-001';
    this.commissionRules.set(r1Id, {
      id: r1Id,
      ruleCode: 'CR-00001',
      ruleName: 'Doctor Standard Referral (10%)',
      description: 'Standard 10% commission on paid amounts for doctor referrals',
      referrerType: 'doctor',
      calculationType: 'percentage',
      rateValue: 10.0,
      basis: 'paid_amount',
      appliesTo: 'all',
      firstPurchaseOnly: false,
      minBaseAmount: 1000.0,
      maxCommissionAmount: 5000.0,
      refundPolicy: 'proportional',
      withholdingTaxPercent: 10.0,
      validFrom: '2026-01-01',
      validTo: null,
      isActive: true,
      createdBy: 'usr-admin-01',
      createdAt: now,
      updatedAt: now,
    });

    const r2Id = 'rule-002';
    this.commissionRules.set(r2Id, {
      id: r2Id,
      ruleCode: 'CR-00002',
      ruleName: 'Agent First Purchase Flat Bonus',
      description: '৳ 500 fixed bonus for new patient first purchase over ৳ 3,000',
      referrerType: 'agent',
      calculationType: 'fixed',
      rateValue: 500.0,
      basis: 'paid_amount',
      appliesTo: 'all',
      firstPurchaseOnly: true,
      minBaseAmount: 3000.0,
      maxCommissionAmount: null,
      refundPolicy: 'full_reversal',
      withholdingTaxPercent: 0.0,
      validFrom: '2026-01-01',
      validTo: null,
      isActive: true,
      createdBy: 'usr-admin-01',
      createdAt: now,
      updatedAt: now,
    });

    const r3Id = 'rule-003';
    this.commissionRules.set(r3Id, {
      id: r3Id,
      ruleCode: 'CR-00003',
      ruleName: 'Staff In-House Cross-Referral (5%)',
      description: '5% incentive for internal aesthetician package recommendations',
      referrerType: 'staff',
      calculationType: 'percentage',
      rateValue: 5.0,
      basis: 'paid_amount',
      appliesTo: 'all',
      firstPurchaseOnly: false,
      minBaseAmount: 2000.0,
      maxCommissionAmount: 3000.0,
      refundPolicy: 'proportional',
      withholdingTaxPercent: 10.0,
      validFrom: '2026-01-01',
      validTo: null,
      isActive: true,
      createdBy: 'usr-admin-01',
      createdAt: now,
      updatedAt: now,
    });

    const r4Id = 'rule-004';
    this.commissionRules.set(r4Id, {
      id: r4Id,
      ruleCode: 'CR-00004',
      ruleName: 'Patient Refer-A-Friend Voucher (৳ 800)',
      description: 'Fixed ৳ 800 clinic treatment credit for patient referrals',
      referrerType: 'patient',
      calculationType: 'fixed',
      rateValue: 800.0,
      basis: 'paid_amount',
      appliesTo: 'all',
      firstPurchaseOnly: true,
      minBaseAmount: 4000.0,
      maxCommissionAmount: null,
      refundPolicy: 'full_reversal',
      withholdingTaxPercent: 0.0,
      validFrom: '2026-01-01',
      validTo: null,
      isActive: true,
      createdBy: 'usr-admin-01',
      createdAt: now,
      updatedAt: now,
    });

    // 4. Initial Patient Attributions
    const pref1Id = 'pref-001';
    this.patientReferrals.set(pref1Id, {
      id: pref1Id,
      patientId: 'pat_87',
      referrerId: drRefId,
      referrerCode: drRefCode,
      referrerName: 'Dr. Mahbubur Rahman',
      referrerType: 'doctor',
      isCurrent: true,
      effectiveFrom: '2026-01-15T10:00:00Z',
      effectiveTo: null,
      attributionReason: 'Initial patient consultation referral from Square Hospitals',
      assignedBy: 'usr-admin-01',
      assignedByName: 'System Admin',
      createdAt: now,
    });

    const pref2Id = 'pref-002';
    this.patientReferrals.set(pref2Id, {
      id: pref2Id,
      patientId: 'pat-1',
      referrerId: drRefId,
      referrerCode: drRefCode,
      referrerName: 'Dr. Mahbubur Rahman',
      referrerType: 'doctor',
      isCurrent: true,
      effectiveFrom: '2026-02-15T10:00:00Z',
      effectiveTo: null,
      attributionReason: 'Direct dermatological consultation referral for acne protocol',
      assignedBy: 'usr-admin-01',
      assignedByName: 'System Admin',
      createdAt: now,
    });

    const pref3Id = 'pref-003';
    this.patientReferrals.set(pref3Id, {
      id: pref3Id,
      patientId: 'pat-3',
      referrerId: agRefId,
      referrerCode: agRefCode,
      referrerName: 'Aesthetic Partners BD',
      referrerType: 'agent',
      isCurrent: true,
      effectiveFrom: '2026-03-01T10:00:00Z',
      effectiveTo: null,
      attributionReason: 'Gulshan community social marketing campaign outreach',
      assignedBy: 'usr-admin-01',
      assignedByName: 'System Admin',
      createdAt: now,
    });

    // 5. Initial Seed Commissions
    const c1: CommissionDto = {
      id: 'comm-001',
      commissionCode: 'COM-00001',
      referrerId: drRefId,
      referrerCode: drRefCode,
      referrerName: 'Dr. Mahbubur Rahman',
      patientId: 'pat-1',
      patientName: 'Sumaiya Rahman',
      patientCode: 'SKC-000088',
      invoiceId: 'inv-304',
      invoiceNumber: 'INV-2026-0594',
      paymentId: 'pay-304-1',
      ruleId: r1Id,
      ruleName: 'Doctor Standard Referral (10%)',
      kind: 'accrual',
      status: 'approved',
      appliedCalculationType: 'percentage',
      appliedRate: 10.0,
      appliedBasis: 'paid_amount',
      baseAmount: 14000.0,
      computedAmount: 1400.0,
      withholdingPercent: 10.0,
      withholdingAmount: 140.0,
      netAmount: 1260.0,
      payoutId: null,
      payoutNumber: null,
      accrualKey: 'accrual-inv-304-dr-01',
      approvedBy: 'usr-101',
      approvedAt: now,
      createdAt: '2026-10-25T11:30:00Z',
      updatedAt: now,
    };
    this.commissions.set(c1.id, c1);

    const c2: CommissionDto = {
      id: 'comm-002',
      commissionCode: 'COM-00002',
      referrerId: drRefId,
      referrerCode: drRefCode,
      referrerName: 'Dr. Mahbubur Rahman',
      patientId: 'pat-2',
      patientName: 'Tanvir Ahmed',
      patientCode: 'SKC-000089',
      invoiceId: 'inv-305',
      invoiceNumber: 'INV-2026-0595',
      paymentId: 'pay-305-1',
      ruleId: r1Id,
      ruleName: 'Doctor Standard Referral (10%)',
      kind: 'accrual',
      status: 'pending',
      appliedCalculationType: 'percentage',
      appliedRate: 10.0,
      appliedBasis: 'paid_amount',
      baseAmount: 6350.0,
      computedAmount: 635.0,
      withholdingPercent: 10.0,
      withholdingAmount: 63.5,
      netAmount: 571.5,
      payoutId: null,
      payoutNumber: null,
      accrualKey: 'accrual-inv-305-dr-01',
      approvedBy: null,
      approvedAt: null,
      createdAt: '2026-10-28T14:45:00Z',
      updatedAt: '2026-10-28T14:45:00Z',
    };
    this.commissions.set(c2.id, c2);

    const c3: CommissionDto = {
      id: 'comm-003',
      commissionCode: 'COM-00003',
      referrerId: agRefId,
      referrerCode: agRefCode,
      referrerName: 'Aesthetic Partners BD',
      patientId: 'pat-3',
      patientName: 'Roxane Begum',
      patientCode: 'SKC-000090',
      invoiceId: 'inv-306',
      invoiceNumber: 'INV-2026-0596',
      paymentId: 'pay-306-1',
      ruleId: r2Id,
      ruleName: 'Agent First Purchase Flat Bonus',
      kind: 'accrual',
      status: 'pending',
      appliedCalculationType: 'fixed',
      appliedRate: 1000.0,
      appliedBasis: 'paid_amount',
      baseAmount: 10000.0,
      computedAmount: 1000.0,
      withholdingPercent: 0.0,
      withholdingAmount: 0.0,
      netAmount: 1000.0,
      payoutId: null,
      payoutNumber: null,
      accrualKey: 'accrual-inv-306-ag-01',
      approvedBy: null,
      approvedAt: null,
      createdAt: '2026-10-30T16:10:00Z',
      updatedAt: '2026-10-30T16:10:00Z',
    };
    this.commissions.set(c3.id, c3);

    const c4: CommissionDto = {
      id: 'comm-004',
      commissionCode: 'COM-00004',
      referrerId: stRefId,
      referrerCode: stRefCode,
      referrerName: 'Sharmin Sultana (Lead Aesthetician)',
      patientId: 'pt-1',
      patientName: 'Taslima Akter',
      patientCode: 'SX-2026-0841',
      invoiceId: 'inv-307',
      invoiceNumber: 'INV-2026-0597',
      paymentId: 'pay-307-1',
      ruleId: r3Id,
      ruleName: 'Staff In-House Cross-Referral (5%)',
      kind: 'accrual',
      status: 'paid',
      appliedCalculationType: 'percentage',
      appliedRate: 5.0,
      appliedBasis: 'paid_amount',
      baseAmount: 8500.0,
      computedAmount: 425.0,
      withholdingPercent: 0.0,
      withholdingAmount: 0.0,
      netAmount: 425.0,
      payoutId: 'payout-001',
      payoutNumber: 'PAYOUT-00001',
      accrualKey: 'accrual-inv-307-st-01',
      approvedBy: 'usr-101',
      approvedAt: '2026-10-27T10:00:00Z',
      createdAt: '2026-10-26T15:00:00Z',
      updatedAt: '2026-10-28T16:30:00Z',
    };
    this.commissions.set(c4.id, c4);

    // 6. Initial Seed Payout
    const p1: CommissionPayoutDto = {
      id: 'payout-001',
      payoutNumber: 'PAYOUT-00001',
      referrerId: stRefId,
      referrerName: 'Sharmin Sultana (Lead Aesthetician)',
      referrerCode: stRefCode,
      grossAmount: 2400.0,
      withholdingAmount: 0.0,
      netPayoutAmount: 2400.0,
      payoutMethod: 'bKash',
      paymentReference: 'TrxID: BK9928172X (bKash Personal: 01722334455)',
      paidDate: '2026-10-28',
      authorizedBy: 'usr-101',
      authorizedByName: 'Dr. Nusrat Jahan (Medical Director)',
      commissionCount: 3,
      commissions: [c4],
      notes: 'October monthly referral incentive settlement batch',
      createdAt: '2026-10-28T16:30:00Z',
    };
    this.payouts.set(p1.id, p1);

    this.refSequence = 5;
    this.ruleSequence = 5;
    this.commSequence = 5;
    this.payoutSequence = 2;
  }

  // ============================================================================
  // REFERRERS CRUD
  // ============================================================================
  public async createReferrer(input: CreateReferrerRequest, actor: RequestActor): Promise<ReferrerDto> {
    if (!input.fullName || input.fullName.trim().length === 0) {
      throw new BadRequestError('Full name is required');
    }
    if (!input.mobile || input.mobile.trim().length === 0) {
      throw new BadRequestError('Mobile number is required');
    }

    const id = `ref-${crypto.randomUUID()}`;
    const codeNum = String(this.refSequence++).padStart(5, '0');
    const referrerCode = `REF-${codeNum}`;
    const now = new Date().toISOString();

    let payoutDetailsMasked: string | null = null;
    let hasPayoutDetails = false;

    if (input.payoutAccountDetails && input.payoutAccountDetails.trim().length > 0) {
      const details = input.payoutAccountDetails.trim();
      const encrypted = this.encryptPayoutDetails(details);
      this.referrerPayoutAccounts.set(id, encrypted);
      hasPayoutDetails = true;
      const lastDigits = details.replace(/\D/g, '').slice(-4);
      payoutDetailsMasked = `•••••••• ${lastDigits || '••••'} (${input.payoutMethod})`;
    }

    const referrer: ReferrerDto = {
      id,
      referrerCode,
      referrerType: input.referrerType,
      fullName: input.fullName.trim(),
      fullNameBn: input.fullNameBn ? input.fullNameBn.trim() : null,
      mobile: input.mobile.trim(),
      email: input.email ? input.email.trim() : null,
      organizationName: input.organizationName ? input.organizationName.trim() : null,
      status: 'active',
      payoutMethod: input.payoutMethod,
      payoutDetailsMasked,
      hasPayoutDetails,
      totalPendingAmount: 0.0,
      totalPaidAmount: 0.0,
      notes: input.notes ? input.notes.trim() : null,
      createdBy: String(actor.id),
      createdAt: now,
      updatedAt: now,
      referredPatientCount: 0,
    };

    this.referrers.set(id, referrer);

    await this.recordAudit({
      actorId: actor.id,
      action: 'REFERRER_CREATED',
      entityType: 'referrer',
      entityId: id,
      payload: { referrerCode, fullName: referrer.fullName, type: referrer.referrerType },
      branchId: actor.branchId,
    });

    return referrer;
  }

  public async updateReferrer(
    id: DbId,
    input: UpdateReferrerRequest,
    actor: RequestActor
  ): Promise<ReferrerDto> {
    const key = String(id);
    const ref = this.referrers.get(key);
    if (!ref) {
      throw new NotFoundError(`Referrer with ID '${key}' not found`);
    }

    const now = new Date().toISOString();

    if (input.fullName !== undefined) ref.fullName = input.fullName.trim();
    if (input.fullNameBn !== undefined) ref.fullNameBn = input.fullNameBn ? input.fullNameBn.trim() : null;
    if (input.mobile !== undefined) ref.mobile = input.mobile.trim();
    if (input.email !== undefined) ref.email = input.email ? input.email.trim() : null;
    if (input.organizationName !== undefined) ref.organizationName = input.organizationName ? input.organizationName.trim() : null;
    if (input.status !== undefined) ref.status = input.status;
    if (input.payoutMethod !== undefined) ref.payoutMethod = input.payoutMethod;
    if (input.notes !== undefined) ref.notes = input.notes ? input.notes.trim() : null;

    if (input.payoutAccountDetails !== undefined) {
      if (input.payoutAccountDetails && input.payoutAccountDetails.trim().length > 0) {
        const details = input.payoutAccountDetails.trim();
        const encrypted = this.encryptPayoutDetails(details);
        this.referrerPayoutAccounts.set(key, encrypted);
        ref.hasPayoutDetails = true;
        const lastDigits = details.replace(/\D/g, '').slice(-4);
        ref.payoutDetailsMasked = `•••••••• ${lastDigits || '••••'} (${ref.payoutMethod})`;
      } else {
        this.referrerPayoutAccounts.delete(key);
        ref.hasPayoutDetails = false;
        ref.payoutDetailsMasked = null;
      }
    }

    ref.updatedAt = now;

    await this.recordAudit({
      actorId: actor.id,
      action: 'REFERRER_UPDATED',
      entityType: 'referrer',
      entityId: key,
      payload: { referrerCode: ref.referrerCode, status: ref.status },
      branchId: actor.branchId,
    });

    return ref;
  }

  public async getReferrerById(id: DbId, actor: RequestActor): Promise<ReferrerDto> {
    const key = String(id);
    const ref = this.referrers.get(key);
    if (!ref) {
      throw new NotFoundError(`Referrer with ID '${key}' not found`);
    }

    // Permission check for sensitive payout details
    const canViewSecrets =
      actor.roles?.includes('super_admin') ||
      actor.permissions?.has('commission.payout_details') ||
      false;

    let payoutDetails = ref.payoutDetailsMasked;
    if (canViewSecrets && ref.hasPayoutDetails) {
      const enc = this.referrerPayoutAccounts.get(key);
      if (enc) {
        try {
          payoutDetails = this.decryptPayoutDetails(enc.ciphertext, enc.iv, enc.authTag);
        } catch {
          payoutDetails = ref.payoutDetailsMasked;
        }
      }
    }

    // Count currently referred patients
    const activeAttributions = Array.from(this.patientReferrals.values()).filter(
      (pr) => String(pr.referrerId) === key && pr.isCurrent
    );

    return {
      ...ref,
      payoutDetailsMasked: payoutDetails,
      referredPatientCount: activeAttributions.length,
    };
  }

  public async listReferrers(
    options: {
      search?: string;
      type?: string;
      status?: string;
      page?: number;
      limit?: number;
    },
    actor: RequestActor
  ): Promise<{ data: ReferrerDto[]; total: number; page: number; limit: number }> {
    const { search, type, status, page = 1, limit = 20 } = options;

    let list = Array.from(this.referrers.values());

    if (type && type !== 'all') {
      list = list.filter((r) => r.referrerType === type);
    }
    if (status && status !== 'all') {
      list = list.filter((r) => r.status === status);
    }
    if (search && search.trim().length > 0) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (r) =>
          r.referrerCode.toLowerCase().includes(q) ||
          r.fullName.toLowerCase().includes(q) ||
          (r.fullNameBn && r.fullNameBn.toLowerCase().includes(q)) ||
          r.mobile.includes(q) ||
          (r.organizationName && r.organizationName.toLowerCase().includes(q))
      );
    }

    const total = list.length;
    const startIndex = (page - 1) * limit;
    const sliced = list.slice(startIndex, startIndex + limit);

    // Populate patient counts
    const populated = sliced.map((r) => {
      const patientCount = Array.from(this.patientReferrals.values()).filter(
        (pr) => pr.referrerId === r.id && pr.isCurrent
      ).length;
      return {
        ...r,
        referredPatientCount: patientCount,
      };
    });

    return {
      data: populated,
      total,
      page,
      limit,
    };
  }

  public async getReferrerDetail(id: DbId, actor: RequestActor): Promise<ReferrerDetailSummaryDto> {
    const key = String(id);
    const referrer = await this.getReferrerById(key, actor);

    const attributions = Array.from(this.patientReferrals.values()).filter(
      (pr) => String(pr.referrerId) === key
    );

    const commissions = Array.from(this.commissions.values()).filter((c) => String(c.referrerId) === key);

    const payouts = Array.from(this.payouts.values()).filter((p) => String(p.referrerId) === key);

    let totalPending = 0;
    let totalApproved = 0;
    let totalPaid = 0;
    let totalReversed = 0;

    for (const c of commissions) {
      if (c.status === 'pending') totalPending += c.netAmount;
      else if (c.status === 'approved') totalApproved += c.netAmount;
      else if (c.status === 'paid') totalPaid += c.netAmount;
      else if (c.status === 'reversed') totalReversed += Math.abs(c.netAmount);
    }

    const activePatients = attributions.filter((a) => a.isCurrent).length;

    return {
      referrer,
      attributions,
      commissions,
      payouts,
      summary: {
        totalPending: Number(totalPending.toFixed(2)),
        totalApproved: Number(totalApproved.toFixed(2)),
        totalPaid: Number(totalPaid.toFixed(2)),
        totalReversed: Number(totalReversed.toFixed(2)),
        patientCount: activePatients,
      },
    };
  }

  // ============================================================================
  // PATIENT ATTRIBUTION (Single Current Referrer Invariant)
  // ============================================================================
  public async assignPatientReferrer(
    patientId: DbId,
    input: AssignPatientReferrerRequest,
    actor: RequestActor
  ): Promise<PatientReferralDto> {
    if (!input.referrerId) {
      throw new BadRequestError('Referrer ID is required');
    }
    if (!input.attributionReason || input.attributionReason.trim().length === 0) {
      throw new BadRequestError('A non-empty attribution reason is mandatory for referrer assignment (Rule 6 & 7)');
    }

    const patientIdStr = String(patientId);
    const referrerIdStr = String(input.referrerId);
    const actorIdStr = String(actor.id);

    // Verify patient exists
    const patient = patientService.getPatientById(patientIdStr);
    if (!patient) {
      throw new NotFoundError(`Patient with ID '${patientIdStr}' not found`);
    }

    // Verify referrer exists and is active
    const referrer = this.referrers.get(referrerIdStr);
    if (!referrer) {
      throw new NotFoundError(`Referrer with ID '${referrerIdStr}' not found`);
    }
    if (referrer.status !== 'active') {
      throw new ConflictError(`Cannot assign inactive or suspended referrer '${referrer.fullName}'`);
    }

    // Mutex lock per patient to guarantee single-current-referrer serial execution
    let lockResolver: (() => void) | undefined;
    const existingLock = this.attributionLocks.get(patientIdStr);
    if (existingLock) {
      await existingLock;
    }
    const lockPromise = new Promise<void>((resolve) => {
      lockResolver = resolve;
    });
    this.attributionLocks.set(patientIdStr, lockPromise);

    try {
      const now = new Date().toISOString();

      // Deactivate any currently active referral for this patient
      for (const [_id, ref] of this.patientReferrals.entries()) {
        if (String(ref.patientId) === patientIdStr && ref.isCurrent) {
          ref.isCurrent = false;
          ref.effectiveTo = now;
        }
      }

      // Insert new current attribution record
      const id = `pref-${crypto.randomUUID()}`;
      const newAttribution: PatientReferralDto = {
        id,
        patientId: patientIdStr,
        referrerId: referrer.id,
        referrerCode: referrer.referrerCode,
        referrerName: referrer.fullName,
        referrerType: referrer.referrerType,
        isCurrent: true,
        effectiveFrom: now,
        effectiveTo: null,
        attributionReason: input.attributionReason.trim(),
        assignedBy: actorIdStr,
        assignedByName: actor.fullName || 'Authorized Staff',
        createdAt: now,
      };

      this.patientReferrals.set(id, newAttribution);

      await this.recordAudit({
        actorId: actorIdStr,
        action: 'PATIENT_REFERRER_ASSIGNED',
        entityType: 'patient',
        entityId: patientIdStr,
        patientId: patientIdStr,
        payload: {
          referrerId: referrer.id,
          referrerCode: referrer.referrerCode,
          reason: input.attributionReason,
        },
        branchId: actor.branchId,
      });

      return newAttribution;
    } finally {
      if (lockResolver) lockResolver();
      this.attributionLocks.delete(patientIdStr);
    }
  }

  public getPatientCurrentReferrer(patientId: DbId): PatientReferralDto | null {
    const pid = String(patientId);
    for (const ref of this.patientReferrals.values()) {
      if (String(ref.patientId) === pid && ref.isCurrent) {
        return ref;
      }
    }
    return null;
  }

  public getPatientReferralHistory(patientId: DbId): PatientReferralDto[] {
    const pid = String(patientId);
    return Array.from(this.patientReferrals.values())
      .filter((ref) => String(ref.patientId) === pid)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  // ============================================================================
  // COMMISSION RULES
  // ============================================================================
  public async createCommissionRule(
    input: CreateCommissionRuleRequest,
    actor: RequestActor
  ): Promise<CommissionRuleDto> {
    if (!input.ruleName || input.ruleName.trim().length === 0) {
      throw new BadRequestError('Rule name is required');
    }
    if (input.rateValue <= 0) {
      throw new BadRequestError('Commission rate value must be greater than zero');
    }
    if (input.calculationType === 'percentage' && input.rateValue > 100) {
      throw new BadRequestError('Percentage rate value cannot exceed 100%');
    }
    if (input.withholdingTaxPercent && (input.withholdingTaxPercent < 0 || input.withholdingTaxPercent > 100)) {
      throw new BadRequestError('Withholding tax percentage must be between 0% and 100%');
    }
    if (!input.validFrom) {
      throw new BadRequestError('Valid-from date is required');
    }
    if (input.validTo && new Date(input.validTo) < new Date(input.validFrom)) {
      throw new BadRequestError('Valid-to date cannot be earlier than valid-from date');
    }

    const id = `rule-${crypto.randomUUID()}`;
    const codeNum = String(this.ruleSequence++).padStart(5, '0');
    const ruleCode = `CR-${codeNum}`;
    const now = new Date().toISOString();

    const rule: CommissionRuleDto = {
      id,
      ruleCode,
      ruleName: input.ruleName.trim(),
      description: input.description ? input.description.trim() : null,
      referrerType: input.referrerType || 'all',
      calculationType: input.calculationType,
      rateValue: Number(input.rateValue.toFixed(2)),
      basis: input.basis || 'paid_amount',
      appliesTo: input.appliesTo || 'all',
      serviceId: input.serviceId ? String(input.serviceId) : null,
      serviceName: null,
      packageId: input.packageId ? String(input.packageId) : null,
      packageName: null,
      firstPurchaseOnly: Boolean(input.firstPurchaseOnly),
      minBaseAmount: input.minBaseAmount ? Number(input.minBaseAmount.toFixed(2)) : 0.0,
      maxCommissionAmount: input.maxCommissionAmount ? Number(input.maxCommissionAmount.toFixed(2)) : null,
      refundPolicy: input.refundPolicy || 'proportional',
      withholdingTaxPercent: input.withholdingTaxPercent ? Number(input.withholdingTaxPercent.toFixed(2)) : 0.0,
      validFrom: input.validFrom,
      validTo: input.validTo || null,
      isActive: input.isActive !== undefined ? input.isActive : true,
      createdBy: String(actor.id),
      createdAt: now,
      updatedAt: now,
    };

    this.commissionRules.set(id, rule);

    await this.recordAudit({
      actorId: actor.id,
      action: 'COMMISSION_RULE_CREATED',
      entityType: 'commission_rule',
      entityId: id,
      payload: { ruleCode, ruleName: rule.ruleName, rate: rule.rateValue },
      branchId: actor.branchId,
    });

    return rule;
  }

  public async updateCommissionRule(
    id: DbId,
    input: Partial<CreateCommissionRuleRequest>,
    actor: RequestActor
  ): Promise<CommissionRuleDto> {
    const key = String(id);
    const rule = this.commissionRules.get(key);
    if (!rule) {
      throw new NotFoundError(`Commission rule with ID '${key}' not found`);
    }

    const now = new Date().toISOString();

    if (input.ruleName !== undefined) rule.ruleName = input.ruleName.trim();
    if (input.description !== undefined) rule.description = input.description ? input.description.trim() : null;
    if (input.referrerType !== undefined) rule.referrerType = input.referrerType;
    if (input.calculationType !== undefined) rule.calculationType = input.calculationType;
    if (input.rateValue !== undefined) {
      if (input.rateValue <= 0) throw new BadRequestError('Rate value must be greater than zero');
      if (rule.calculationType === 'percentage' && input.rateValue > 100) {
        throw new BadRequestError('Percentage rate value cannot exceed 100%');
      }
      rule.rateValue = Number(input.rateValue.toFixed(2));
    }
    if (input.basis !== undefined) rule.basis = input.basis;
    if (input.appliesTo !== undefined) rule.appliesTo = input.appliesTo;
    if (input.serviceId !== undefined) rule.serviceId = input.serviceId ? String(input.serviceId) : null;
    if (input.packageId !== undefined) rule.packageId = input.packageId ? String(input.packageId) : null;
    if (input.firstPurchaseOnly !== undefined) rule.firstPurchaseOnly = Boolean(input.firstPurchaseOnly);
    if (input.minBaseAmount !== undefined) rule.minBaseAmount = Number(input.minBaseAmount.toFixed(2));
    if (input.maxCommissionAmount !== undefined) {
      rule.maxCommissionAmount = input.maxCommissionAmount ? Number(input.maxCommissionAmount.toFixed(2)) : null;
    }
    if (input.refundPolicy !== undefined) rule.refundPolicy = input.refundPolicy;
    if (input.withholdingTaxPercent !== undefined) {
      rule.withholdingTaxPercent = Number(input.withholdingTaxPercent.toFixed(2));
    }
    if (input.validFrom !== undefined) rule.validFrom = input.validFrom;
    if (input.validTo !== undefined) rule.validTo = input.validTo || null;
    if (input.isActive !== undefined) rule.isActive = input.isActive;

    rule.updatedAt = now;

    await this.recordAudit({
      actorId: actor.id,
      action: 'COMMISSION_RULE_UPDATED',
      entityType: 'commission_rule',
      entityId: key,
      payload: { ruleCode: rule.ruleCode, rate: rule.rateValue, isActive: rule.isActive },
      branchId: actor.branchId,
    });

    return rule;
  }

  public listCommissionRules(filters?: { isActive?: boolean; referrerType?: string }): CommissionRuleDto[] {
    let list = Array.from(this.commissionRules.values());
    if (filters?.isActive !== undefined) {
      list = list.filter((r) => r.isActive === filters.isActive);
    }
    if (filters?.referrerType && filters.referrerType !== 'all') {
      list = list.filter((r) => r.referrerType === filters.referrerType || r.referrerType === 'all');
    }
    return list;
  }

  public findMatchingRule(referrerType: string, options?: { serviceId?: DbId; packageId?: DbId }): CommissionRuleDto | null {
    const today = new Date().toISOString().slice(0, 10);
    const serviceIdStr = options?.serviceId !== undefined ? String(options.serviceId) : undefined;
    const packageIdStr = options?.packageId !== undefined ? String(options.packageId) : undefined;
    const activeRules = Array.from(this.commissionRules.values()).filter((r) => {
      if (!r.isActive) return false;
      if (r.validFrom > today) return false;
      if (r.validTo && r.validTo < today) return false;
      return true;
    });

    // 1. Specific service/package match for specific referrer type
    if (serviceIdStr) {
      const match = activeRules.find((r) => r.referrerType === referrerType && String(r.serviceId) === serviceIdStr);
      if (match) return match;
    }
    if (packageIdStr) {
      const match = activeRules.find((r) => r.referrerType === referrerType && String(r.packageId) === packageIdStr);
      if (match) return match;
    }

    // 2. Specific service/package match for 'all' referrer types
    if (serviceIdStr) {
      const match = activeRules.find((r) => r.referrerType === 'all' && String(r.serviceId) === serviceIdStr);
      if (match) return match;
    }
    if (packageIdStr) {
      const match = activeRules.find((r) => r.referrerType === 'all' && String(r.packageId) === packageIdStr);
      if (match) return match;
    }

    // 3. General match for specific referrer type
    const generalTypeMatch = activeRules.find(
      (r) => r.referrerType === referrerType && r.appliesTo === 'all'
    );
    if (generalTypeMatch) return generalTypeMatch;

    // 4. General match for 'all'
    const fallbackMatch = activeRules.find((r) => r.referrerType === 'all' && r.appliesTo === 'all');
    return fallbackMatch || null;
  }

  // ============================================================================
  // COMMISSIONS ACCRUAL & REVERSAL (Idempotent Event-Driven)
  // ============================================================================
  public async accrueForPayment(params: {
    paymentId: DbId;
    invoiceId?: DbId;
    patientId: DbId;
    amount: number;
    serviceId?: DbId;
    packageId?: DbId;
  }): Promise<CommissionDto | null> {
    const paymentIdStr = String(params.paymentId);
    const invoiceIdStr = params.invoiceId !== undefined ? String(params.invoiceId) : undefined;
    const patientIdStr = String(params.patientId);
    const { amount, serviceId, packageId } = params;

    // 1. Check patient referrer attribution
    const currentAttribution = this.getPatientCurrentReferrer(patientIdStr);
    if (!currentAttribution) {
      return null; // Patient has no attributed referrer
    }

    const referrer = this.referrers.get(currentAttribution.referrerId);
    if (!referrer || referrer.status !== 'active') {
      return null; // Referrer inactive or missing
    }

    // 2. Find matching rule
    const rule = this.findMatchingRule(referrer.referrerType, { serviceId, packageId });
    if (!rule) {
      return null; // No applicable rule
    }

    // 3. Min base amount check
    if (amount < rule.minBaseAmount) {
      return null; // Does not meet minimum amount requirement
    }

    // 4. First purchase check
    if (rule.firstPurchaseOnly) {
      // Check if patient already has prior commissions
      const prior = Array.from(this.commissions.values()).some(
        (c) => String(c.patientId) === patientIdStr && c.kind === 'accrual' && String(c.paymentId) !== paymentIdStr
      );
      if (prior) {
        return null; // Not first purchase
      }
    }

    // 5. Deterministic Idempotency Key
    const accrualKey = `${paymentIdStr}_${referrer.id}_${rule.id}_accrual`;
    const existing = Array.from(this.commissions.values()).find((c) => c.accrualKey === accrualKey);
    if (existing) {
      return existing; // Already processed idempotently
    }

    // 6. Calculate commission amounts
    let computed = 0;
    if (rule.calculationType === 'percentage') {
      computed = (amount * rule.rateValue) / 100;
    } else {
      computed = rule.rateValue;
    }

    // Apply cap if defined
    if (rule.maxCommissionAmount && computed > rule.maxCommissionAmount) {
      computed = rule.maxCommissionAmount;
    }

    computed = Number(computed.toFixed(2));
    const withholding = Number(((computed * rule.withholdingTaxPercent) / 100).toFixed(2));
    const net = Number((computed - withholding).toFixed(2));

    const id = `comm-${crypto.randomUUID()}`;
    const codeNum = String(this.commSequence++).padStart(5, '0');
    const commissionCode = `COM-${codeNum}`;
    const now = new Date().toISOString();

    const patient = patientService.getPatientById(patientIdStr);

    const commission: CommissionDto = {
      id,
      commissionCode,
      referrerId: referrer.id,
      referrerName: referrer.fullName,
      referrerCode: referrer.referrerCode,
      patientId: patientIdStr,
      patientName: patient?.full_name || 'Patient',
      patientCode: patient?.patient_code || 'PAT-00000',
      invoiceId: invoiceIdStr || `inv-auto-${paymentIdStr}`,
      invoiceNumber: invoiceIdStr || 'Direct Payment',
      paymentId: paymentIdStr,
      refundId: null,
      ruleId: rule.id,
      ruleName: rule.ruleName,
      parentCommissionId: null,
      kind: 'accrual',
      status: 'pending',
      appliedCalculationType: rule.calculationType,
      appliedRate: rule.rateValue,
      appliedBasis: rule.basis,
      baseAmount: Number(amount.toFixed(2)),
      computedAmount: computed,
      withholdingPercent: rule.withholdingTaxPercent,
      withholdingAmount: withholding,
      netAmount: net,
      payoutId: null,
      payoutNumber: null,
      accrualKey,
      approvedBy: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.commissions.set(id, commission);

    // Update referrer total pending amount
    referrer.totalPendingAmount = Number((referrer.totalPendingAmount + net).toFixed(2));
    referrer.updatedAt = now;

    return commission;
  }

  public async reverseForRefund(params: {
    refundId: DbId;
    sourcePaymentId: DbId;
    amount: number;
    patientId: DbId;
  }): Promise<CommissionDto | null> {
    const refundIdStr = String(params.refundId);
    const sourcePaymentIdStr = String(params.sourcePaymentId);
    const { amount } = params;

    // Find original commission(s) associated with this source payment
    const origComms = Array.from(this.commissions.values()).filter(
      (c) => String(c.paymentId) === sourcePaymentIdStr && c.kind === 'accrual'
    );

    if (origComms.length === 0) {
      return null;
    }

    for (const orig of origComms) {
      const rule = this.commissionRules.get(orig.ruleId);
      const refundPolicy = rule?.refundPolicy || 'proportional';

      if (refundPolicy === 'none') {
        continue;
      }

      const accrualKey = `${refundIdStr}_${orig.referrerId}_${orig.ruleId}_reversal`;
      const existing = Array.from(this.commissions.values()).find((c) => c.accrualKey === accrualKey);
      if (existing) {
        return existing;
      }

      let reversedComputed = 0;
      if (refundPolicy === 'full_reversal') {
        reversedComputed = orig.computedAmount;
      } else {
        // Proportional reversal
        const ratio = Math.min(1.0, amount / (orig.baseAmount || 1));
        reversedComputed = Number((orig.computedAmount * ratio).toFixed(2));
      }

      const reversedWithholding = Number(((reversedComputed * orig.withholdingPercent) / 100).toFixed(2));
      const reversedNet = Number((reversedComputed - reversedWithholding).toFixed(2));

      const id = `comm-${crypto.randomUUID()}`;
      const codeNum = String(this.commSequence++).padStart(5, '0');
      const commissionCode = `COM-${codeNum}`;
      const now = new Date().toISOString();

      const reversal: CommissionDto = {
        id,
        commissionCode,
        referrerId: orig.referrerId,
        referrerName: orig.referrerName,
        referrerCode: orig.referrerCode,
        patientId: orig.patientId,
        patientName: orig.patientName,
        patientCode: orig.patientCode,
        invoiceId: orig.invoiceId,
        invoiceNumber: orig.invoiceNumber,
        paymentId: sourcePaymentIdStr,
        refundId: refundIdStr,
        ruleId: orig.ruleId,
        ruleName: `${orig.ruleName} (Reversal)`,
        parentCommissionId: orig.id,
        kind: 'reversal',
        status: 'adjusted',
        appliedCalculationType: orig.appliedCalculationType,
        appliedRate: orig.appliedRate,
        appliedBasis: orig.appliedBasis,
        baseAmount: Number((-amount).toFixed(2)),
        computedAmount: Number((-reversedComputed).toFixed(2)),
        withholdingPercent: orig.withholdingPercent,
        withholdingAmount: Number((-reversedWithholding).toFixed(2)),
        netAmount: Number((-reversedNet).toFixed(2)),
        payoutId: null,
        payoutNumber: null,
        accrualKey,
        approvedBy: null,
        approvedAt: null,
        createdAt: now,
        updatedAt: now,
      };

      this.commissions.set(id, reversal);

      // Adjust referrer pending total
      const referrer = this.referrers.get(orig.referrerId);
      if (referrer) {
        referrer.totalPendingAmount = Number(
          Math.max(0, referrer.totalPendingAmount - reversedNet).toFixed(2)
        );
        referrer.updatedAt = now;
      }

      return reversal;
    }

    return null;
  }

  // ============================================================================
  // COMMISSIONS MANAGEMENT & APPROVALS
  // ============================================================================
  public listCommissions(filters?: {
    referrerId?: DbId;
    patientId?: DbId;
    status?: CommissionStatus | 'all';
    kind?: CommissionKind | 'all';
  }): CommissionDto[] {
    let list = Array.from(this.commissions.values());

    if (filters?.referrerId !== undefined && filters.referrerId !== '') {
      const rid = String(filters.referrerId);
      list = list.filter((c) => String(c.referrerId) === rid);
    }
    if (filters?.patientId !== undefined && filters.patientId !== '') {
      const pid = String(filters.patientId);
      list = list.filter((c) => String(c.patientId) === pid);
    }
    if (filters?.status && filters.status !== 'all') {
      list = list.filter((c) => c.status === filters.status);
    }
    if (filters?.kind && filters.kind !== 'all') {
      list = list.filter((c) => c.kind === filters.kind);
    }

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public async approveCommissions(commissionIds: DbId[], actor: RequestActor): Promise<CommissionDto[]> {
    if (!commissionIds || commissionIds.length === 0) {
      throw new BadRequestError('At least one commission ID is required for approval');
    }

    const updated: CommissionDto[] = [];
    const now = new Date().toISOString();
    const actorIdStr = String(actor.id);

    for (const rawId of commissionIds) {
      const id = String(rawId);
      const comm = this.commissions.get(id);
      if (!comm) {
        throw new NotFoundError(`Commission with ID '${id}' not found`);
      }
      if (comm.status === 'pending') {
        comm.status = 'approved';
        comm.approvedBy = actorIdStr;
        comm.approvedAt = now;
        comm.updatedAt = now;
        updated.push(comm);
      }
    }

    await this.recordAudit({
      actorId: actorIdStr,
      action: 'COMMISSIONS_APPROVED',
      entityType: 'commission',
      entityId: String(commissionIds[0]),
      payload: { count: updated.length, commissionIds: commissionIds.map(String) },
      branchId: actor.branchId,
    });

    return updated;
  }

  // ============================================================================
  // PAYOUTS (Single-Payout Guarantee & Locking)
  // ============================================================================
  public async createPayout(input: CreatePayoutRequest, actor: RequestActor): Promise<CommissionPayoutDto> {
    if (!input.referrerId) {
      throw new BadRequestError('Referrer ID is required for payout');
    }
    if (!input.commissionIds || input.commissionIds.length === 0) {
      throw new BadRequestError('At least one approved commission is required for payout creation');
    }
    if (!input.payoutMethod) {
      throw new BadRequestError('Payout method is required');
    }
    if (!input.paymentReference || input.paymentReference.trim().length === 0) {
      throw new BadRequestError('Transaction / payment reference is required (e.g. Bank TrxID, Cheque No)');
    }

    const referrerIdStr = String(input.referrerId);
    const actorIdStr = String(actor.id);
    const referrer = this.referrers.get(referrerIdStr);
    if (!referrer) {
      throw new NotFoundError(`Referrer with ID '${referrerIdStr}' not found`);
    }

    // Mutex lock per referrer for atomic payout generation
    let lockResolver: (() => void) | undefined;
    const existingLock = this.payoutLocks.get(referrerIdStr);
    if (existingLock) {
      await existingLock;
    }
    const lockPromise = new Promise<void>((resolve) => {
      lockResolver = resolve;
    });
    this.payoutLocks.set(referrerIdStr, lockPromise);

    try {
      const candidateCommissions: CommissionDto[] = [];
      let gross = 0;
      let withholding = 0;
      let net = 0;

      for (const rawCommId of input.commissionIds) {
        const commId = String(rawCommId);
        const comm = this.commissions.get(commId);
        if (!comm) {
          throw new NotFoundError(`Commission with ID '${commId}' not found`);
        }
        if (String(comm.referrerId) !== referrerIdStr) {
          throw new ConflictError(
            `Commission '${comm.commissionCode}' belongs to a different referrer than '${referrer.fullName}'`
          );
        }
        // Invariant: Must be approved and NOT already part of any payout
        if (comm.status !== 'approved' || comm.payoutId !== null) {
          throw new ConflictError(
            `Commission '${comm.commissionCode}' cannot be paid out: status is '${comm.status}' and payout_id is '${comm.payoutId || 'none'}'. Only unassigned, approved commissions may be settled.`
          );
        }

        candidateCommissions.push(comm);
        gross += comm.computedAmount;
        withholding += comm.withholdingAmount;
        net += comm.netAmount;
      }

      if (net <= 0) {
        throw new UnprocessableEntityError('Net payout amount must be greater than zero');
      }

      gross = Number(gross.toFixed(2));
      withholding = Number(withholding.toFixed(2));
      net = Number(net.toFixed(2));

      const id = `payout-${crypto.randomUUID()}`;
      const codeNum = String(this.payoutSequence++).padStart(5, '0');
      const payoutNumber = `PAYOUT-${codeNum}`;
      const now = new Date().toISOString();

      const payout: CommissionPayoutDto = {
        id,
        payoutNumber,
        referrerId: referrer.id,
        referrerName: referrer.fullName,
        referrerCode: referrer.referrerCode,
        grossAmount: gross,
        withholdingAmount: withholding,
        netPayoutAmount: net,
        payoutMethod: input.payoutMethod,
        paymentReference: input.paymentReference.trim(),
        paidDate: input.paidDate || now.slice(0, 10),
        authorizedBy: actorIdStr,
        authorizedByName: actor.fullName || 'Accounts / Cashier',
        commissionCount: candidateCommissions.length,
        commissions: candidateCommissions,
        notes: input.notes ? input.notes.trim() : null,
        createdAt: now,
      };

      this.payouts.set(id, payout);

      // Atomically attach payout_id to all candidate commissions
      for (const comm of candidateCommissions) {
        comm.payoutId = id;
        comm.payoutNumber = payoutNumber;
        comm.status = 'paid';
        comm.updatedAt = now;
      }

      // Update referrer balances
      referrer.totalPaidAmount = Number((referrer.totalPaidAmount + net).toFixed(2));
      referrer.totalPendingAmount = Number(
        Math.max(0, referrer.totalPendingAmount - net).toFixed(2)
      );
      referrer.updatedAt = now;

      await this.recordAudit({
        actorId: actorIdStr,
        action: 'COMMISSION_PAYOUT_CREATED',
        entityType: 'commission_payout',
        entityId: id,
        payload: {
          payoutNumber,
          referrerCode: referrer.referrerCode,
          netAmount: net,
          commissionCount: candidateCommissions.length,
        },
        branchId: actor.branchId,
      });

      return payout;
    } finally {
      if (lockResolver) lockResolver();
      this.payoutLocks.delete(referrerIdStr);
    }
  }

  public listPayouts(filters?: { referrerId?: DbId }): CommissionPayoutDto[] {
    let list = Array.from(this.payouts.values());
    if (filters?.referrerId !== undefined && filters.referrerId !== '') {
      const rid = String(filters.referrerId);
      list = list.filter((p) => String(p.referrerId) === rid);
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export const referralService = new ReferralService();
