/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * PostgreSQL Repository: Call Center Workbench, Referrals & Commission Management
 *
 * Implements:
 *  - Independent Call Status & SMS Status tracking with safe Appointment status sync
 *  - AES-256-GCM encryption at rest for sensitive Referrer Payout Account Details
 *  - Strict Single-Current-Referrer invariant per patient (ACID + partial unique index)
 *  - Row-locked Commission Approval & Payout Settlement (prevents double-payouts)
 */

import crypto from 'node:crypto';
import type { CallCenterTask, User } from '../../src/types/index.ts';
import { pgQuery, withPgTransaction } from '../db/pgPool.ts';
import {
  pgLogAuditEvent,
  toDateOnly,
  toIsoString,
  toNumber,
} from './pgHelpers.ts';

// =============================================================================
// AES-256-GCM Encryption Helpers for Referrer Payout Account Details
// =============================================================================

import { getEncryptionMasterKey } from '../config/securityConfig.ts';

function getPayoutEncryptionKey(): Buffer {
  return getEncryptionMasterKey();
}

interface EncryptedPayoutPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
}

function encryptPayoutDetails(plaintext: string): EncryptedPayoutPayload {
  const key = getPayoutEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    keyVersion: 1,
  };
}

function decryptPayoutDetails(payload: EncryptedPayoutPayload): string {
  const key = getPayoutEncryptionKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

function maskPayoutDetails(plaintext: string, method: string): string {
  const digits = plaintext.replace(/\D/g, '').slice(-4);
  return `•••••••• ${digits || '••••'} (${method})`;
}

// =============================================================================
// Row Mappers
// =============================================================================

function mapCallTaskRow(row: Record<string, unknown>): CallCenterTask {
  return {
    id: String(row.id),
    appointmentId: row.appointment_id ? String(row.appointment_id) : '',
    patientId: String(row.patient_id),
    patientName: String(row.patient_name),
    patientPhone: String(row.patient_phone),
    appointmentDate: toDateOnly(row.appointment_date),
    appointmentTime: String(row.appointment_time || ''),
    doctorName: String(row.doctor_name || ''),
    serviceName: String(row.service_name || ''),
    branchName: String(row.branch_name || ''),
    callStatus: (row.call_status as CallCenterTask['callStatus']) || 'pending',
    smsStatus: (row.sms_status as CallCenterTask['smsStatus']) || 'pending',
    callAttempts: toNumber(row.call_attempts),
    lastCalledAt: row.last_called_at ? toIsoString(row.last_called_at) : undefined,
    callNotes: row.call_notes ? String(row.call_notes) : undefined,
    agentId: row.agent_id ? String(row.agent_id) : undefined,
    agentName: row.agent_name ? String(row.agent_name) : undefined,
    followupPurpose: row.followup_purpose ? String(row.followup_purpose) : undefined,
    callOutcome: row.call_outcome ? String(row.call_outcome) : undefined,
    patientIntent: row.patient_intent ? String(row.patient_intent) : undefined,
    nextFollowupDate: row.next_followup_date ? toDateOnly(row.next_followup_date) : undefined,
    nextFollowupTime: row.next_followup_time ? String(row.next_followup_time) : undefined,
  };
}

export interface PgReferrerDto {
  id: string;
  referrerCode: string;
  referrerType: 'doctor' | 'patient' | 'staff' | 'agent' | 'organization';
  fullName: string;
  fullNameBn: string | null;
  mobile: string;
  email: string | null;
  organizationName: string | null;
  status: 'active' | 'inactive' | 'suspended';
  payoutMethod: 'bank_transfer' | 'bKash' | 'Nagad' | 'cash' | 'cheque';
  payoutDetailsMasked: string | null;
  hasPayoutDetails: boolean;
  totalPendingAmount: number;
  totalPaidAmount: number;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  referredPatientCount: number;
}

export interface PgPatientReferralDto {
  id: string;
  patientId: string;
  referrerId: string;
  referrerCode: string;
  referrerName: string;
  referrerType: string;
  isCurrent: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  attributionReason: string;
  assignedBy: string;
  assignedByName: string;
  createdAt: string;
}

export interface PgCommissionRuleDto {
  id: string;
  ruleCode: string;
  ruleName: string;
  description: string | null;
  referrerType: string;
  calculationType: 'percentage' | 'fixed';
  rateValue: number;
  basis: string;
  appliesTo: string;
  serviceId: string | null;
  serviceName: string | null;
  packageId: string | null;
  packageName: string | null;
  firstPurchaseOnly: boolean;
  minBaseAmount: number;
  maxCommissionAmount: number | null;
  refundPolicy: string;
  withholdingTaxPercent: number;
  validFrom: string;
  validTo: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PgCommissionDto {
  id: string;
  commissionCode: string;
  referrerId: string;
  referrerCode: string;
  referrerName: string;
  patientId: string;
  patientName: string;
  patientCode: string;
  invoiceId: string;
  invoiceNumber: string;
  paymentId: string | null;
  ruleId: string | null;
  ruleName: string;
  kind: 'accrual' | 'reversal';
  status: 'pending' | 'approved' | 'paid' | 'reversed' | 'void';
  appliedCalculationType: 'percentage' | 'fixed';
  appliedRate: number;
  appliedBasis: string;
  baseAmount: number;
  computedAmount: number;
  withholdingPercent: number;
  withholdingAmount: number;
  netAmount: number;
  payoutId: string | null;
  payoutNumber: string | null;
  accrualKey: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PgCommissionPayoutDto {
  id: string;
  payoutNumber: string;
  referrerId: string;
  referrerName: string;
  referrerCode: string;
  grossAmount: number;
  withholdingAmount: number;
  netPayoutAmount: number;
  payoutMethod: string;
  paymentReference: string;
  paidDate: string;
  authorizedBy: string;
  authorizedByName: string;
  commissionCount: number;
  commissions: PgCommissionDto[];
  notes: string | null;
  createdAt: string;
}

function mapReferrerRow(
  row: Record<string, unknown>,
  options: { revealPayoutDetails?: boolean } = {}
): PgReferrerDto {
  const hasPayout = Boolean(row.has_payout_details);
  let payoutDisplay = row.payout_details_masked ? String(row.payout_details_masked) : null;

  if (options.revealPayoutDetails && hasPayout && row.payout_account_details && typeof row.payout_account_details === 'object') {
    const enc = row.payout_account_details as Partial<EncryptedPayoutPayload>;
    if (enc.ciphertext && enc.iv && enc.authTag) {
      try {
        payoutDisplay = decryptPayoutDetails(enc as EncryptedPayoutPayload);
      } catch {
        // Keep masked representation if key mismatch
      }
    }
  }

  return {
    id: String(row.id),
    referrerCode: String(row.code),
    referrerType: row.referrer_type as PgReferrerDto['referrerType'],
    fullName: String(row.name),
    fullNameBn: row.name_bn ? String(row.name_bn) : null,
    mobile: String(row.phone || ''),
    email: row.email ? String(row.email) : null,
    organizationName: row.organization ? String(row.organization) : null,
    status: (row.status as PgReferrerDto['status']) || 'active',
    payoutMethod: (row.default_payout_method as PgReferrerDto['payoutMethod']) || 'bank_transfer',
    payoutDetailsMasked: payoutDisplay,
    hasPayoutDetails: hasPayout,
    totalPendingAmount: toNumber(row.total_pending_amount),
    totalPaidAmount: toNumber(row.total_paid_amount),
    notes: row.notes ? String(row.notes) : null,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    referredPatientCount: toNumber(row.referred_patient_count),
  };
}

function mapPatientReferralRow(row: Record<string, unknown>): PgPatientReferralDto {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    referrerId: String(row.referrer_id),
    referrerCode: String(row.referrer_code || ''),
    referrerName: String(row.referrer_name || ''),
    referrerType: String(row.referrer_type || 'doctor'),
    isCurrent: Boolean(row.is_current),
    effectiveFrom: toIsoString(row.effective_from),
    effectiveTo: row.effective_to ? toIsoString(row.effective_to) : null,
    attributionReason: String(row.attribution_reason || ''),
    assignedBy: String(row.assigned_by || ''),
    assignedByName: String(row.assigned_by_name || row.assigned_by || 'Authorized Staff'),
    createdAt: toIsoString(row.created_at),
  };
}

function mapCommissionRuleRow(row: Record<string, unknown>): PgCommissionRuleDto {
  return {
    id: String(row.id),
    ruleCode: String(row.rule_code || row.id),
    ruleName: String(row.name),
    description: row.description ? String(row.description) : null,
    referrerType: String(row.referrer_type || 'all'),
    calculationType: (row.calculation_type as 'percentage' | 'fixed') || 'percentage',
    rateValue: toNumber(row.rate_value),
    basis: String(row.basis || 'paid_amount'),
    appliesTo: String(row.applies_to || 'all'),
    serviceId: row.service_id ? String(row.service_id) : null,
    serviceName: null,
    packageId: row.package_id ? String(row.package_id) : null,
    packageName: null,
    firstPurchaseOnly: Boolean(row.first_purchase_only),
    minBaseAmount: toNumber(row.min_base_amount),
    maxCommissionAmount:
      row.max_commission_amount !== null && row.max_commission_amount !== undefined
        ? toNumber(row.max_commission_amount)
        : null,
    refundPolicy: String(row.refund_policy || 'proportional'),
    withholdingTaxPercent: toNumber(row.withholding_tax_percent),
    validFrom: toDateOnly(row.effective_from) || new Date().toISOString().slice(0, 10),
    validTo: row.effective_to ? toDateOnly(row.effective_to) : null,
    isActive: row.is_active !== false,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at || row.created_at),
  };
}

function mapCommissionRow(row: Record<string, unknown>): PgCommissionDto {
  return {
    id: String(row.id),
    commissionCode: String(row.commission_code || row.id),
    referrerId: String(row.referrer_id || ''),
    referrerCode: String(row.referrer_code || ''),
    referrerName: String(row.referrer_name || ''),
    patientId: String(row.patient_id),
    patientName: String(row.patient_name),
    patientCode: String(row.patient_code || ''),
    invoiceId: String(row.invoice_id),
    invoiceNumber: String(row.invoice_number || row.invoice_id),
    paymentId: row.payment_id ? String(row.payment_id) : null,
    ruleId: row.rule_id ? String(row.rule_id) : null,
    ruleName: String(row.rule_name || row.service_category || 'Referral Commission'),
    kind: (row.kind as 'accrual' | 'reversal') || 'accrual',
    status: (row.status as PgCommissionDto['status']) || 'pending',
    appliedCalculationType: (row.applied_calculation_type as 'percentage' | 'fixed') || 'percentage',
    appliedRate: toNumber(row.commission_percentage),
    appliedBasis: String(row.applied_basis || 'paid_amount'),
    baseAmount: toNumber(row.bill_amount_bdt),
    computedAmount: toNumber(row.commission_amount_bdt),
    withholdingPercent: toNumber(row.withholding_percent),
    withholdingAmount: toNumber(row.withholding_amount_bdt),
    netAmount: toNumber(row.net_amount_bdt),
    payoutId: row.payout_id ? String(row.payout_id) : null,
    payoutNumber: row.payout_number ? String(row.payout_number) : null,
    accrualKey: row.accrual_key ? String(row.accrual_key) : null,
    approvedBy: row.approved_by ? String(row.approved_by) : null,
    approvedAt: row.approved_at ? toIsoString(row.approved_at) : null,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at || row.created_at),
  };
}

function mapPayoutRow(
  row: Record<string, unknown>,
  commissions: PgCommissionDto[] = []
): PgCommissionPayoutDto {
  return {
    id: String(row.id),
    payoutNumber: String(row.payout_number),
    referrerId: String(row.referrer_id),
    referrerName: String(row.referrer_name || ''),
    referrerCode: String(row.referrer_code || ''),
    grossAmount: toNumber(row.gross_amount_bdt),
    withholdingAmount: toNumber(row.withholding_amount_bdt),
    netPayoutAmount: toNumber(row.net_payout_amount_bdt),
    payoutMethod: String(row.payout_method),
    paymentReference: String(row.transaction_ref || ''),
    paidDate: toDateOnly(row.paid_date || row.paid_at),
    authorizedBy: String(row.authorized_by || row.paid_by || ''),
    authorizedByName: String(row.authorized_by_name || row.paid_by || 'Authorized Staff'),
    commissionCount: toNumber(row.commission_count),
    commissions,
    notes: row.notes ? String(row.notes) : null,
    createdAt: toIsoString(row.created_at),
  };
}

const REFERRER_AGG_SELECT = `
  SELECT
    r.*,
    COALESCE((
      SELECT COUNT(*) FROM patient_referrals pr
      WHERE pr.referrer_id = r.id AND pr.is_current = TRUE
    ), 0)::int AS referred_patient_count,
    COALESCE((
      SELECT SUM(rc.net_amount_bdt) FROM referral_commissions rc
      WHERE rc.referrer_id = r.id AND rc.status IN ('pending', 'approved')
    ), 0)::numeric(12, 2) AS total_pending_amount,
    COALESCE((
      SELECT SUM(rc.net_amount_bdt) FROM referral_commissions rc
      WHERE rc.referrer_id = r.id AND rc.status = 'paid'
    ), 0)::numeric(12, 2) AS total_paid_amount
  FROM referrers r
`;

export const pgCallCenterReferralsRepo = {
  // ===========================================================================
  // CALL CENTER WORKBENCH
  // ===========================================================================
  async listTomorrowCalls(): Promise<CallCenterTask[]> {
    // Sync any newly booked upcoming appointments that don't have a call_center_task yet
    await pgQuery(`
      INSERT INTO call_center_tasks (
        id, appointment_id, patient_id, patient_name, patient_phone,
        appointment_date, appointment_time, doctor_name, service_name, branch_name,
        call_status, sms_status, call_attempts, followup_purpose
      )
      SELECT
        'call-' || a.id,
        a.id,
        a.patient_id,
        a.patient_name,
        a.patient_phone,
        a.appointment_date,
        a.appointment_time,
        a.doctor_name,
        a.service_name,
        a.branch_name,
        'pending',
        'pending',
        0,
        'New Booking Confirmation'
      FROM appointments a
      WHERE a.status IN ('booked', 'confirmed')
        AND a.appointment_date >= CURRENT_DATE
        AND a.appointment_date <= (CURRENT_DATE + INTERVAL '2 days')
        AND NOT EXISTS (
          SELECT 1 FROM call_center_tasks c WHERE c.appointment_id = a.id
        )
      ON CONFLICT (id) DO NOTHING
    `);

    const res = await pgQuery(
      `SELECT * FROM call_center_tasks ORDER BY appointment_date ASC, appointment_time ASC`
    );
    return res.rows.map((r) => mapCallTaskRow(r as Record<string, unknown>));
  },

  async updateCallTask(
    id: string,
    patch: {
      callStatus?: CallCenterTask['callStatus'];
      smsStatus?: CallCenterTask['smsStatus'];
      callNotes?: string;
      callOutcome?: string;
      patientIntent?: string;
      followupPurpose?: string;
      nextFollowupDate?: string;
      nextFollowupTime?: string;
    },
    actor: User,
    ipAddress: string
  ): Promise<CallCenterTask | null> {
    return withPgTransaction(async (client) => {
      const existingRes = await client.query('SELECT * FROM call_center_tasks WHERE id = $1 FOR UPDATE', [id]);
      if (existingRes.rowCount === 0) return null;

      const current = mapCallTaskRow(existingRes.rows[0] as Record<string, unknown>);
      const nextCallStatus = patch.callStatus ?? current.callStatus;
      const nextSmsStatus = patch.smsStatus ?? current.smsStatus;
      const nextAttempts = current.callAttempts + 1;

      const updRes = await client.query(
        `
        UPDATE call_center_tasks
        SET
          call_status = $2,
          sms_status = $3,
          call_notes = $4,
          call_outcome = $5,
          patient_intent = $6,
          followup_purpose = $7,
          next_followup_date = $8::date,
          next_followup_time = $9,
          call_attempts = $10,
          last_called_at = NOW(),
          agent_id = $11,
          agent_name = $12,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [
          id,
          nextCallStatus,
          nextSmsStatus,
          patch.callNotes !== undefined ? patch.callNotes : current.callNotes || null,
          patch.callOutcome ?? current.callOutcome ?? null,
          patch.patientIntent ?? current.patientIntent ?? null,
          patch.followupPurpose ?? current.followupPurpose ?? null,
          patch.nextFollowupDate || current.nextFollowupDate || null,
          patch.nextFollowupTime ?? current.nextFollowupTime ?? null,
          nextAttempts,
          actor.id,
          actor.name,
        ]
      );

      // Hard Rule 2: Call center confirms/cancels status ONLY — never overwrites doctor's appointment schedule
      if (current.appointmentId) {
        if (patch.callStatus === 'confirmed') {
          await client.query(
            `UPDATE appointments SET status = 'confirmed', updated_at = NOW() WHERE id = $1`,
            [current.appointmentId]
          );
        } else if (patch.callStatus === 'cancelled') {
          await client.query(
            `
            UPDATE appointments
            SET status = 'cancelled',
                status_reason = $2,
                updated_at = NOW()
            WHERE id = $1
            `,
            [
              current.appointmentId,
              `Cancelled during pre-session call: ${patch.callNotes || 'Patient requested'}`,
            ]
          );
        }
      }

      const updated = mapCallTaskRow(updRes.rows[0] as Record<string, unknown>);

      await pgLogAuditEvent(
        actor,
        'CALL_TASK_UPDATED',
        'call_center',
        updated.id,
        `Call task updated to ${updated.callStatus}. SMS Gateway Status: ${updated.smsStatus}. Attempts: ${updated.callAttempts}`,
        ipAddress,
        client
      );

      return updated;
    });
  },

  // ===========================================================================
  // REFERRERS CRUD
  // ===========================================================================
  async listReferrers(options: {
    search?: string;
    type?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: PgReferrerDto[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const offset = (page - 1) * limit;

    const clauses: string[] = [];
    const params: unknown[] = [];

    if (options.type && options.type !== 'all') {
      params.push(options.type);
      clauses.push(`r.referrer_type = $${params.length}`);
    }
    if (options.status && options.status !== 'all') {
      params.push(options.status);
      clauses.push(`r.status = $${params.length}`);
    }
    if (options.search && options.search.trim()) {
      params.push(`%${options.search.trim()}%`);
      const idx = params.length;
      clauses.push(
        `(r.code ILIKE $${idx} OR r.name ILIKE $${idx} OR COALESCE(r.name_bn, '') ILIKE $${idx} OR COALESCE(r.phone, '') ILIKE $${idx} OR COALESCE(r.organization, '') ILIKE $${idx})`
      );
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const countRes = await pgQuery<{ cnt: string }>(`SELECT COUNT(*)::text AS cnt FROM referrers r ${whereSql}`, params);
    const total = Number(countRes.rows[0]?.cnt || 0);

    const listParams = [...params, limit, offset];
    const res = await pgQuery(
      `${REFERRER_AGG_SELECT} ${whereSql} ORDER BY r.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams
    );

    return {
      data: res.rows.map((r) => mapReferrerRow(r as Record<string, unknown>)),
      total,
      page,
      limit,
    };
  },

  async getReferrerById(id: string, revealPayoutDetails = false): Promise<PgReferrerDto | null> {
    const res = await pgQuery(`${REFERRER_AGG_SELECT} WHERE r.id = $1`, [id]);
    if (res.rowCount === 0) return null;
    return mapReferrerRow(res.rows[0] as Record<string, unknown>, { revealPayoutDetails });
  },

  async createReferrer(
    input: {
      referrerType: PgReferrerDto['referrerType'];
      fullName: string;
      fullNameBn?: string | null;
      mobile: string;
      email?: string | null;
      organizationName?: string | null;
      payoutMethod: PgReferrerDto['payoutMethod'];
      payoutAccountDetails?: string | null;
      notes?: string | null;
    },
    actor: User,
    ipAddress: string
  ): Promise<PgReferrerDto> {
    return withPgTransaction(async (client) => {
      const cntRes = await client.query<{ cnt: string }>('SELECT COUNT(*)::text AS cnt FROM referrers');
      const seq = String(Number(cntRes.rows[0]?.cnt || 0) + 1).padStart(5, '0');
      const code = `REF-${seq}-${crypto.randomInt(10, 99)}`;
      const id = `ref-${crypto.randomUUID()}`;

      const rawDetails = input.payoutAccountDetails?.trim() || '';
      const hasPayout = rawDetails.length > 0;
      const encryptedPayload = hasPayout ? encryptPayoutDetails(rawDetails) : {};
      const masked = hasPayout ? maskPayoutDetails(rawDetails, input.payoutMethod) : null;

      await client.query(
        `
        INSERT INTO referrers (
          id, code, name, name_bn, referrer_type, phone, email, organization,
          default_payout_method, payout_account_details, payout_details_masked,
          has_payout_details, status, notes, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, 'active', $13, $14)
        `,
        [
          id,
          code,
          input.fullName.trim(),
          input.fullNameBn?.trim() || null,
          input.referrerType,
          input.mobile.trim(),
          input.email?.trim() || null,
          input.organizationName?.trim() || null,
          input.payoutMethod,
          JSON.stringify(encryptedPayload),
          masked,
          hasPayout,
          input.notes?.trim() || null,
          actor.id,
        ]
      );

      await pgLogAuditEvent(
        actor,
        'REFERRER_CREATED',
        'referrer',
        id,
        `Registered referrer ${input.fullName.trim()} (${code}, ${input.referrerType})`,
        ipAddress,
        client
      );

      const out = await client.query(`${REFERRER_AGG_SELECT} WHERE r.id = $1`, [id]);
      return mapReferrerRow(out.rows[0] as Record<string, unknown>);
    });
  },

  async updateReferrer(
    id: string,
    patch: Partial<{
      referrerType: PgReferrerDto['referrerType'];
      fullName: string;
      fullNameBn: string | null;
      mobile: string;
      email: string | null;
      organizationName: string | null;
      status: PgReferrerDto['status'];
      payoutMethod: PgReferrerDto['payoutMethod'];
      payoutAccountDetails: string | null;
      notes: string | null;
    }>,
    actor: User,
    ipAddress: string
  ): Promise<PgReferrerDto | null> {
    return withPgTransaction(async (client) => {
      const existingRes = await client.query('SELECT * FROM referrers WHERE id = $1 FOR UPDATE', [id]);
      if (existingRes.rowCount === 0) return null;

      const cur = existingRes.rows[0] as Record<string, unknown>;
      const nextMethod = patch.payoutMethod ?? (cur.default_payout_method as string) ?? 'bank_transfer';

      let nextEncrypted = cur.payout_account_details || {};
      let nextMasked = cur.payout_details_masked ? String(cur.payout_details_masked) : null;
      let nextHasPayout = Boolean(cur.has_payout_details);

      if (patch.payoutAccountDetails !== undefined) {
        const trimmed = patch.payoutAccountDetails?.trim() || '';
        if (trimmed.length > 0) {
          nextEncrypted = encryptPayoutDetails(trimmed);
          nextMasked = maskPayoutDetails(trimmed, nextMethod);
          nextHasPayout = true;
        } else {
          nextEncrypted = {};
          nextMasked = null;
          nextHasPayout = false;
        }
      }

      await client.query(
        `
        UPDATE referrers
        SET
          name = $2,
          name_bn = $3,
          referrer_type = $4,
          phone = $5,
          email = $6,
          organization = $7,
          status = $8,
          default_payout_method = $9,
          payout_account_details = $10::jsonb,
          payout_details_masked = $11,
          has_payout_details = $12,
          notes = $13,
          updated_at = NOW()
        WHERE id = $1
        `,
        [
          id,
          patch.fullName !== undefined ? patch.fullName.trim() : cur.name,
          patch.fullNameBn !== undefined ? patch.fullNameBn?.trim() || null : cur.name_bn,
          patch.referrerType ?? cur.referrer_type,
          patch.mobile !== undefined ? patch.mobile.trim() : cur.phone,
          patch.email !== undefined ? patch.email?.trim() || null : cur.email,
          patch.organizationName !== undefined ? patch.organizationName?.trim() || null : cur.organization,
          patch.status ?? cur.status,
          nextMethod,
          JSON.stringify(nextEncrypted),
          nextMasked,
          nextHasPayout,
          patch.notes !== undefined ? patch.notes?.trim() || null : cur.notes,
        ]
      );

      await pgLogAuditEvent(
        actor,
        'REFERRER_UPDATED',
        'referrer',
        id,
        `Updated referrer ${String(cur.code)}`,
        ipAddress,
        client
      );

      const out = await client.query(`${REFERRER_AGG_SELECT} WHERE r.id = $1`, [id]);
      return mapReferrerRow(out.rows[0] as Record<string, unknown>);
    });
  },

  async getReferrerDetail(id: string, revealPayoutDetails = false) {
    const referrer = await this.getReferrerById(id, revealPayoutDetails);
    if (!referrer) return null;

    const [attrRes, commRes, payoutRes] = await Promise.all([
      pgQuery(
        `
        SELECT pr.*, r.code AS referrer_code, r.name AS referrer_name, r.referrer_type
        FROM patient_referrals pr
        JOIN referrers r ON r.id = pr.referrer_id
        WHERE pr.referrer_id = $1
        ORDER BY pr.created_at DESC
        `,
        [id]
      ),
      pgQuery(
        `SELECT * FROM referral_commissions WHERE referrer_id = $1 ORDER BY created_at DESC`,
        [id]
      ),
      pgQuery(
        `SELECT * FROM commission_payouts WHERE referrer_id = $1 ORDER BY created_at DESC`,
        [id]
      ),
    ]);

    const attributions = attrRes.rows.map((r) => mapPatientReferralRow(r as Record<string, unknown>));
    const commissions = commRes.rows.map((r) => mapCommissionRow(r as Record<string, unknown>));
    const payouts = payoutRes.rows.map((r) => {
      const pid = String(r.id);
      return mapPayoutRow(
        r as Record<string, unknown>,
        commissions.filter((c) => c.payoutId === pid)
      );
    });

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
        patientCount: attributions.filter((a) => a.isCurrent).length,
      },
    };
  },

  // ===========================================================================
  // PATIENT ATTRIBUTION (Single-Current-Referrer Invariant)
  // ===========================================================================
  async assignPatientReferrer(
    patientId: string,
    input: { referrerId: string; attributionReason: string },
    actor: User,
    ipAddress: string
  ): Promise<PgPatientReferralDto> {
    return withPgTransaction(async (client) => {
      const patRes = await client.query('SELECT id, name FROM patients WHERE id = $1 FOR UPDATE', [patientId]);
      if (patRes.rowCount === 0) {
        const err = new Error(`Patient with ID '${patientId}' not found`) as Error & { statusCode?: number; code?: string };
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      const refRes = await client.query('SELECT * FROM referrers WHERE id = $1', [input.referrerId]);
      if (refRes.rowCount === 0) {
        const err = new Error(`Referrer with ID '${input.referrerId}' not found`) as Error & { statusCode?: number; code?: string };
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      const referrer = refRes.rows[0] as Record<string, unknown>;
      if (referrer.status !== 'active') {
        const err = new Error(`Cannot assign inactive or suspended referrer '${String(referrer.name)}'`) as Error & {
          statusCode?: number;
          code?: string;
        };
        err.statusCode = 409;
        err.code = 'CONFLICT';
        throw err;
      }

      // Close any existing current attribution for this patient
      await client.query(
        `
        UPDATE patient_referrals
        SET is_current = FALSE, effective_to = NOW()
        WHERE patient_id = $1 AND is_current = TRUE
        `,
        [patientId]
      );

      const attrId = `pref-${crypto.randomUUID()}`;
      const insRes = await client.query(
        `
        INSERT INTO patient_referrals (
          id, patient_id, referrer_id, attribution_reason,
          effective_from, effective_to, is_current, assigned_by, assigned_by_name
        )
        VALUES ($1, $2, $3, $4, NOW(), NULL, TRUE, $5, $6)
        RETURNING *
        `,
        [attrId, patientId, input.referrerId, input.attributionReason.trim(), actor.id, actor.name]
      );

      // Keep patients.referred_by & referrer_doctor_id synchronized
      await client.query(
        `
        UPDATE patients
        SET referred_by = $2, referrer_doctor_id = $3, updated_at = NOW()
        WHERE id = $1
        `,
        [patientId, String(referrer.name), String(referrer.id)]
      );

      await pgLogAuditEvent(
        actor,
        'PATIENT_REFERRER_ASSIGNED',
        'patient',
        patientId,
        `Assigned referrer ${String(referrer.name)} (${String(referrer.code)}). Reason: ${input.attributionReason.trim()}`,
        ipAddress,
        client
      );

      return mapPatientReferralRow({
        ...(insRes.rows[0] as Record<string, unknown>),
        referrer_code: referrer.code,
        referrer_name: referrer.name,
        referrer_type: referrer.referrer_type,
      });
    });
  },

  async getPatientReferralHistory(patientId: string): Promise<{
    current: PgPatientReferralDto | null;
    history: PgPatientReferralDto[];
  }> {
    const res = await pgQuery(
      `
      SELECT pr.*, r.code AS referrer_code, r.name AS referrer_name, r.referrer_type
      FROM patient_referrals pr
      JOIN referrers r ON r.id = pr.referrer_id
      WHERE pr.patient_id = $1
      ORDER BY pr.created_at DESC
      `,
      [patientId]
    );
    const history = res.rows.map((r) => mapPatientReferralRow(r as Record<string, unknown>));
    const current = history.find((h) => h.isCurrent) || null;
    return { current, history };
  },

  // ===========================================================================
  // COMMISSION RULES
  // ===========================================================================
  async listCommissionRules(filters: { isActive?: boolean; referrerType?: string }): Promise<PgCommissionRuleDto[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.isActive !== undefined) {
      params.push(filters.isActive);
      clauses.push(`is_active = $${params.length}`);
    }
    if (filters.referrerType && filters.referrerType !== 'all') {
      params.push(filters.referrerType);
      clauses.push(`(referrer_type = $${params.length} OR referrer_type = 'all')`);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const res = await pgQuery(`SELECT * FROM commission_rules ${whereSql} ORDER BY created_at DESC`, params);
    return res.rows.map((r) => mapCommissionRuleRow(r as Record<string, unknown>));
  },

  async createCommissionRule(
    input: {
      ruleName: string;
      description?: string | null;
      referrerType: string;
      calculationType: 'percentage' | 'fixed';
      rateValue: number;
      basis: string;
      appliesTo: string;
      serviceId?: string | null;
      packageId?: string | null;
      firstPurchaseOnly: boolean;
      minBaseAmount: number;
      maxCommissionAmount?: number | null;
      refundPolicy: string;
      withholdingTaxPercent: number;
      validFrom: string;
      validTo?: string | null;
      isActive: boolean;
    },
    actor: User,
    ipAddress: string
  ): Promise<PgCommissionRuleDto> {
    if (input.calculationType === 'percentage' && input.rateValue > 100) {
      const err = new Error('Percentage rate value cannot exceed 100%') as Error & { statusCode?: number; code?: string };
      err.statusCode = 400;
      err.code = 'BAD_REQUEST';
      throw err;
    }

    return withPgTransaction(async (client) => {
      const cntRes = await client.query<{ cnt: string }>('SELECT COUNT(*)::text AS cnt FROM commission_rules');
      const seq = String(Number(cntRes.rows[0]?.cnt || 0) + 1).padStart(5, '0');
      const ruleCode = `CR-${seq}-${crypto.randomInt(10, 99)}`;
      const id = `rule-${crypto.randomUUID()}`;

      const ins = await client.query(
        `
        INSERT INTO commission_rules (
          id, rule_code, name, description, referrer_type, calculation_type, rate_value,
          basis, applies_to, service_id, package_id, first_purchase_only, min_base_amount,
          max_commission_amount, refund_policy, withholding_tax_percent,
          effective_from, effective_to, is_active, created_by
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14, $15, $16,
          $17::date, $18::date, $19, $20
        )
        RETURNING *
        `,
        [
          id,
          ruleCode,
          input.ruleName.trim(),
          input.description?.trim() || null,
          input.referrerType || 'all',
          input.calculationType,
          input.rateValue,
          input.basis || 'paid_amount',
          input.appliesTo || 'all',
          input.serviceId || null,
          input.packageId || null,
          Boolean(input.firstPurchaseOnly),
          input.minBaseAmount || 0,
          input.maxCommissionAmount ?? null,
          input.refundPolicy || 'proportional',
          input.withholdingTaxPercent || 0,
          input.validFrom,
          input.validTo || null,
          input.isActive !== false,
          actor.id,
        ]
      );

      const created = mapCommissionRuleRow(ins.rows[0] as Record<string, unknown>);

      await pgLogAuditEvent(
        actor,
        'COMMISSION_RULE_CREATED',
        'commission_rule',
        created.id,
        `Created commission rule ${created.ruleCode} (${created.ruleName})`,
        ipAddress,
        client
      );

      return created;
    });
  },

  async updateCommissionRule(
    id: string,
    patch: Partial<{
      ruleName: string;
      description: string | null;
      referrerType: string;
      calculationType: 'percentage' | 'fixed';
      rateValue: number;
      basis: string;
      appliesTo: string;
      serviceId: string | null;
      packageId: string | null;
      firstPurchaseOnly: boolean;
      minBaseAmount: number;
      maxCommissionAmount: number | null;
      refundPolicy: string;
      withholdingTaxPercent: number;
      validFrom: string;
      validTo: string | null;
      isActive: boolean;
    }>,
    actor: User,
    ipAddress: string
  ): Promise<PgCommissionRuleDto | null> {
    return withPgTransaction(async (client) => {
      const existingRes = await client.query('SELECT * FROM commission_rules WHERE id = $1 FOR UPDATE', [id]);
      if (existingRes.rowCount === 0) return null;

      const cur = mapCommissionRuleRow(existingRes.rows[0] as Record<string, unknown>);
      const nextCalcType = patch.calculationType ?? cur.calculationType;
      const nextRate = patch.rateValue ?? cur.rateValue;
      if (nextCalcType === 'percentage' && nextRate > 100) {
        const err = new Error('Percentage rate value cannot exceed 100%') as Error & { statusCode?: number; code?: string };
        err.statusCode = 400;
        err.code = 'BAD_REQUEST';
        throw err;
      }

      const upd = await client.query(
        `
        UPDATE commission_rules
        SET
          name = $2,
          description = $3,
          referrer_type = $4,
          calculation_type = $5,
          rate_value = $6,
          basis = $7,
          applies_to = $8,
          service_id = $9,
          package_id = $10,
          first_purchase_only = $11,
          min_base_amount = $12,
          max_commission_amount = $13,
          refund_policy = $14,
          withholding_tax_percent = $15,
          effective_from = $16::date,
          effective_to = $17::date,
          is_active = $18,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [
          id,
          patch.ruleName !== undefined ? patch.ruleName.trim() : cur.ruleName,
          patch.description !== undefined ? patch.description?.trim() || null : cur.description,
          patch.referrerType ?? cur.referrerType,
          nextCalcType,
          nextRate,
          patch.basis ?? cur.basis,
          patch.appliesTo ?? cur.appliesTo,
          patch.serviceId !== undefined ? patch.serviceId : cur.serviceId,
          patch.packageId !== undefined ? patch.packageId : cur.packageId,
          patch.firstPurchaseOnly !== undefined ? patch.firstPurchaseOnly : cur.firstPurchaseOnly,
          patch.minBaseAmount ?? cur.minBaseAmount,
          patch.maxCommissionAmount !== undefined ? patch.maxCommissionAmount : cur.maxCommissionAmount,
          patch.refundPolicy ?? cur.refundPolicy,
          patch.withholdingTaxPercent ?? cur.withholdingTaxPercent,
          patch.validFrom ?? cur.validFrom,
          patch.validTo !== undefined ? patch.validTo : cur.validTo,
          patch.isActive !== undefined ? patch.isActive : cur.isActive,
        ]
      );

      const updated = mapCommissionRuleRow(upd.rows[0] as Record<string, unknown>);
      await pgLogAuditEvent(
        actor,
        'COMMISSION_RULE_UPDATED',
        'commission_rule',
        updated.id,
        `Updated commission rule ${updated.ruleCode} (${updated.ruleName})`,
        ipAddress,
        client
      );
      return updated;
    });
  },

  // ===========================================================================
  // COMMISSIONS LEDGER, APPROVAL & PAYOUTS
  // ===========================================================================
  async listCommissions(filters: {
    referrerId?: string;
    patientId?: string;
    status?: string;
    kind?: string;
  }): Promise<PgCommissionDto[]> {
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.referrerId) {
      params.push(filters.referrerId);
      clauses.push(`referrer_id = $${params.length}`);
    }
    if (filters.patientId) {
      params.push(filters.patientId);
      clauses.push(`patient_id = $${params.length}`);
    }
    if (filters.status && filters.status !== 'all') {
      params.push(filters.status);
      clauses.push(`status = $${params.length}`);
    }
    if (filters.kind && filters.kind !== 'all') {
      params.push(filters.kind);
      clauses.push(`kind = $${params.length}`);
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const res = await pgQuery(`SELECT * FROM referral_commissions ${whereSql} ORDER BY created_at DESC`, params);
    return res.rows.map((r) => mapCommissionRow(r as Record<string, unknown>));
  },

  async approveCommissions(
    commissionIds: string[],
    actor: User,
    ipAddress: string
  ): Promise<PgCommissionDto[]> {
    return withPgTransaction(async (client) => {
      const sel = await client.query(
        `SELECT * FROM referral_commissions WHERE id = ANY($1::text[]) FOR UPDATE`,
        [commissionIds]
      );

      const approved: PgCommissionDto[] = [];
      for (const row of sel.rows) {
        if (row.status !== 'pending') continue;
        const upd = await client.query(
          `
          UPDATE referral_commissions
          SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW()
          WHERE id = $1
          RETURNING *
          `,
          [row.id, actor.id]
        );
        approved.push(mapCommissionRow(upd.rows[0] as Record<string, unknown>));
      }

      if (approved.length > 0) {
        await pgLogAuditEvent(
          actor,
          'COMMISSIONS_APPROVED',
          'commission',
          approved.map((c) => c.id).join(','),
          `Approved ${approved.length} referral commission(s)`,
          ipAddress,
          client
        );
      }

      return approved;
    });
  },

  async listPayouts(filters: { referrerId?: string }): Promise<PgCommissionPayoutDto[]> {
    const params: unknown[] = [];
    const whereSql = filters.referrerId ? (params.push(filters.referrerId), 'WHERE referrer_id = $1') : '';

    const payoutRes = await pgQuery(`SELECT * FROM commission_payouts ${whereSql} ORDER BY created_at DESC`, params);
    if (payoutRes.rowCount === 0) return [];

    const payoutIds = payoutRes.rows.map((r) => String(r.id));
    const commRes = await pgQuery(
      'SELECT * FROM referral_commissions WHERE payout_id = ANY($1::text[]) ORDER BY created_at DESC',
      [payoutIds]
    );
    const commByPayout = new Map<string, PgCommissionDto[]>();
    for (const row of commRes.rows) {
      const mapped = mapCommissionRow(row as Record<string, unknown>);
      if (!mapped.payoutId) continue;
      const list = commByPayout.get(mapped.payoutId) || [];
      list.push(mapped);
      commByPayout.set(mapped.payoutId, list);
    }

    return payoutRes.rows.map((r) => mapPayoutRow(r as Record<string, unknown>, commByPayout.get(String(r.id)) || []));
  },

  async createPayout(
    input: {
      referrerId: string;
      commissionIds: string[];
      payoutMethod: string;
      paymentReference: string;
      paidDate?: string;
      notes?: string;
    },
    actor: User,
    ipAddress: string
  ): Promise<PgCommissionPayoutDto> {
    return withPgTransaction(async (client) => {
      const refRes = await client.query('SELECT * FROM referrers WHERE id = $1 FOR UPDATE', [input.referrerId]);
      if (refRes.rowCount === 0) {
        const err = new Error(`Referrer '${input.referrerId}' not found`) as Error & { statusCode?: number; code?: string };
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }
      const referrer = refRes.rows[0] as Record<string, unknown>;

      const commRes = await client.query(
        `
        SELECT * FROM referral_commissions
        WHERE id = ANY($1::text[])
        FOR UPDATE
        `,
        [input.commissionIds]
      );

      if (commRes.rows.length !== input.commissionIds.length) {
        const err = new Error('One or more commission records were not found') as Error & { statusCode?: number; code?: string };
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      const eligible: PgCommissionDto[] = [];
      let grossAmount = 0;
      let withholdingAmount = 0;
      let netPayoutAmount = 0;

      for (const row of commRes.rows) {
        if (String(row.referrer_id) !== input.referrerId) {
          const err = new Error(`Commission ${String(row.id)} does not belong to referrer ${input.referrerId}`) as Error & {
            statusCode?: number;
            code?: string;
          };
          err.statusCode = 422;
          err.code = 'UNPROCESSABLE_ENTITY';
          throw err;
        }
        if (row.status !== 'approved' || row.payout_id) {
          const err = new Error(
            `Commission ${String(row.commission_code || row.id)} must be approved and unpaid before settlement (current status: ${String(row.status)})`
          ) as Error & { statusCode?: number; code?: string };
          err.statusCode = 409;
          err.code = 'CONFLICT';
          throw err;
        }

        const mapped = mapCommissionRow(row as Record<string, unknown>);
        grossAmount += mapped.computedAmount;
        withholdingAmount += mapped.withholdingAmount;
        netPayoutAmount += mapped.netAmount;
        eligible.push(mapped);
      }

      const cntRes = await client.query<{ cnt: string }>('SELECT COUNT(*)::text AS cnt FROM commission_payouts');
      const seq = String(Number(cntRes.rows[0]?.cnt || 0) + 1).padStart(5, '0');
      const payoutNumber = `PAYOUT-${seq}-${crypto.randomInt(10, 99)}`;
      const payoutId = `payout-${crypto.randomUUID()}`;
      const paidDate = input.paidDate || new Date().toISOString().slice(0, 10);

      const insPayout = await client.query(
        `
        INSERT INTO commission_payouts (
          id, payout_number, referrer_id, referrer_name, referrer_code,
          payout_method, transaction_ref, gross_amount_bdt, withholding_amount_bdt,
          net_payout_amount_bdt, commission_count, notes, paid_by, paid_date,
          authorized_by, authorized_by_name, paid_at
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12, $13, $14::date,
          $15, $16, NOW()
        )
        RETURNING *
        `,
        [
          payoutId,
          payoutNumber,
          input.referrerId,
          String(referrer.name),
          String(referrer.code),
          input.payoutMethod,
          input.paymentReference.trim(),
          Number(grossAmount.toFixed(2)),
          Number(withholdingAmount.toFixed(2)),
          Number(netPayoutAmount.toFixed(2)),
          eligible.length,
          input.notes?.trim() || null,
          actor.name,
          paidDate,
          actor.id,
          actor.name,
        ]
      );

      const updComm = await client.query(
        `
        UPDATE referral_commissions
        SET
          status = 'paid',
          payout_id = $2,
          payout_number = $3,
          paid_at = NOW(),
          updated_at = NOW()
        WHERE id = ANY($1::text[])
        RETURNING *
        `,
        [input.commissionIds, payoutId, payoutNumber]
      );

      const paidCommissions = updComm.rows.map((r) => mapCommissionRow(r as Record<string, unknown>));

      await pgLogAuditEvent(
        actor,
        'COMMISSION_PAYOUT_CREATED',
        'commission_payout',
        payoutId,
        `Settled ${payoutNumber} to ${String(referrer.name)} via ${input.payoutMethod} for ৳ ${netPayoutAmount.toFixed(2)} (${paidCommissions.length} commissions)`,
        ipAddress,
        client
      );

      return mapPayoutRow(insPayout.rows[0] as Record<string, unknown>, paidCommissions);
    });
  },

  /**
   * Processes pending `domain_outbox_events` (`payment.recorded`, `payment.refunded`)
   * idempotently into `referral_commissions` using `accrual_key`.
   */
  async processCommissionOutbox(limit = 25): Promise<{ processed: number; accrued: number; reversed: number }> {
    let processed = 0;
    let accrued = 0;
    let reversed = 0;

    const eventsRes = await pgQuery<{
      id: string;
      event_type: string;
      payload: Record<string, unknown>;
    }>(
      `
      SELECT id, event_type, payload
      FROM domain_outbox_events
      WHERE status = 'pending' AND event_type IN ('payment.recorded', 'payment.refunded')
      ORDER BY created_at ASC
      LIMIT $1
      `,
      [limit]
    );

    for (const ev of eventsRes.rows) {
      await withPgTransaction(async (client) => {
        const lock = await client.query<{ status: string }>(
          'SELECT status FROM domain_outbox_events WHERE id = $1 FOR UPDATE',
          [ev.id]
        );
        if (lock.rows[0]?.status !== 'pending') return;

        const payload = ev.payload || {};
        const patientId = String(payload.patientId || '');
        const invoiceId = String(payload.invoiceId || '');
        const invoiceNumber = String(payload.invoiceNumber || invoiceId);
        const paymentId = payload.paymentId ? String(payload.paymentId) : null;
        const amountBDT = toNumber(payload.amountBDT, 0);

        if (patientId && invoiceId && amountBDT > 0) {
          const attrRes = await client.query<{
            referrer_id: string;
            referrer_code: string;
            referrer_name: string;
            referrer_type: string;
            referrer_phone: string;
            patient_name: string;
            patient_code: string;
          }>(
            `
            SELECT pr.referrer_id, r.code AS referrer_code, r.name AS referrer_name,
                   r.referrer_type, COALESCE(r.phone, '') AS referrer_phone,
                   p.name AS patient_name, p.patient_id_code AS patient_code
            FROM patient_referrals pr
            JOIN referrers r ON r.id = pr.referrer_id AND r.status = 'active'
            JOIN patients p ON p.id = pr.patient_id
            WHERE pr.patient_id = $1 AND pr.is_current = TRUE
            LIMIT 1
            `,
            [patientId]
          );

          if ((attrRes.rowCount || 0) > 0) {
            const attr = attrRes.rows[0];
            const ruleRes = await client.query<{
              id: string;
              name: string;
              calculation_type: string;
              rate_value: string;
              withholding_tax_percent: string;
              min_base_amount: string;
              max_commission_amount: string | null;
            }>(
              `
              SELECT id, name, calculation_type, rate_value, withholding_tax_percent,
                     COALESCE(min_base_amount, 0) AS min_base_amount, max_commission_amount
              FROM commission_rules
              WHERE is_active = TRUE
                AND (referrer_type = $1 OR referrer_type = 'all' OR referrer_type IS NULL)
              ORDER BY CASE WHEN referrer_type = $1 THEN 0 ELSE 1 END, created_at DESC
              LIMIT 1
              `,
              [attr.referrer_type]
            );

            if ((ruleRes.rowCount || 0) > 0) {
              const rule = ruleRes.rows[0];
              const rateVal = toNumber(rule.rate_value, 0);
              const whtPct = toNumber(rule.withholding_tax_percent, 0);
              const minBase = toNumber(rule.min_base_amount, 0);
              const maxComm = rule.max_commission_amount !== null ? toNumber(rule.max_commission_amount) : null;

              if (amountBDT >= minBase && rateVal > 0) {
                let computed =
                  rule.calculation_type === 'fixed'
                    ? rateVal
                    : Number(((amountBDT * rateVal) / 100).toFixed(2));
                if (maxComm !== null && computed > maxComm) computed = maxComm;
                const wht = Number(((computed * whtPct) / 100).toFixed(2));
                const net = Number((computed - wht).toFixed(2));

                const isReversal = ev.event_type === 'payment.refunded';
                const sign = isReversal ? -1 : 1;
                const accrualKey = `${ev.event_type}:${paymentId || invoiceId}:${ev.id}`;
                const commId = `comm-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
                const commCode = `COM-${crypto.randomInt(10000, 99999)}`;

                const ins = await client.query(
                  `
                  INSERT INTO referral_commissions (
                    id, commission_code, referrer_id, referrer_code, referrer_name, referrer_type, phone,
                    patient_id, patient_name, patient_code, invoice_id, invoice_number, payment_id,
                    rule_id, rule_name, service_category, kind, status,
                    applied_calculation_type, commission_percentage, applied_basis,
                    bill_amount_bdt, commission_amount_bdt, withholding_percent,
                    withholding_amount_bdt, net_amount_bdt, accrual_key
                  )
                  VALUES (
                    $1, $2, $3, $4, $5, $6, $7,
                    $8, $9, $10, $11, $12, $13,
                    $14, $15, 'Billing', $16, $17,
                    $18, $19, 'paid_amount',
                    $20, $21, $22, $23, $24, $25
                  )
                  ON CONFLICT (accrual_key) WHERE accrual_key IS NOT NULL DO NOTHING
                  RETURNING id
                  `,
                  [
                    commId,
                    commCode,
                    attr.referrer_id,
                    attr.referrer_code,
                    attr.referrer_name,
                    attr.referrer_type,
                    attr.referrer_phone,
                    patientId,
                    attr.patient_name,
                    attr.patient_code,
                    invoiceId,
                    invoiceNumber,
                    paymentId,
                    rule.id,
                    rule.name,
                    isReversal ? 'reversal' : 'accrual',
                    isReversal ? 'reversed' : 'pending',
                    rule.calculation_type,
                    rateVal,
                    Number((amountBDT * sign).toFixed(2)),
                    Number((computed * sign).toFixed(2)),
                    whtPct,
                    Number((wht * sign).toFixed(2)),
                    Number((net * sign).toFixed(2)),
                    accrualKey,
                  ]
                );
                if ((ins.rowCount || 0) > 0) {
                  if (isReversal) reversed++;
                  else accrued++;
                }
              }
            }
          }
        }

        await client.query(
          `UPDATE domain_outbox_events SET status = 'processed', processed_at = NOW(), updated_at = NOW() WHERE id = $1`,
          [ev.id]
        );
        processed++;
      });
    }

    return { processed, accrued, reversed };
  },
};
