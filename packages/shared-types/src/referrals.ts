// Packages: Shared Types — Referrals & Commissions
// SUOXI Skin Care & Aesthetic Center CRM (Dhaka, Bangladesh)
import type { DbId } from './api.js';

export type ReferrerType = 'doctor' | 'patient' | 'staff' | 'agent' | 'organization';
export type ReferrerStatus = 'active' | 'inactive' | 'suspended';
export type PayoutMethod = 'bank_transfer' | 'bKash' | 'Nagad' | 'cash' | 'cheque';

export interface ReferrerDto {
  id: string;
  referrerCode: string;
  referrerType: ReferrerType;
  fullName: string;
  fullNameBn?: string | null;
  mobile: string;
  email?: string | null;
  organizationName?: string | null;
  status: ReferrerStatus;
  payoutMethod: PayoutMethod;
  payoutDetailsMasked?: string | null;
  hasPayoutDetails: boolean;
  totalPendingAmount: number;
  totalPaidAmount: number;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  referredPatientCount?: number;
}

export interface CreateReferrerRequest {
  referrerType: ReferrerType;
  fullName: string;
  fullNameBn?: string;
  mobile: string;
  email?: string;
  organizationName?: string;
  payoutMethod: PayoutMethod;
  payoutAccountDetails?: string;
  notes?: string;
}

export interface UpdateReferrerRequest {
  referrerType?: ReferrerType;
  fullName?: string;
  fullNameBn?: string;
  mobile?: string;
  email?: string;
  organizationName?: string;
  status?: ReferrerStatus;
  payoutMethod?: PayoutMethod;
  payoutAccountDetails?: string;
  notes?: string;
}

export interface PatientReferralDto {
  id: string;
  patientId: string;
  referrerId: string;
  referrerCode: string;
  referrerName: string;
  referrerType: ReferrerType;
  isCurrent: boolean;
  effectiveFrom: string;
  effectiveTo?: string | null;
  attributionReason: string;
  assignedBy: string;
  assignedByName?: string;
  createdAt: string;
}

export interface AssignPatientReferrerRequest {
  referrerId: DbId;
  attributionReason: string;
}

export type CommissionRuleCalculationType = 'percentage' | 'fixed';
export type CommissionRuleBasis = 'paid_amount' | 'invoice_total' | 'service_price' | 'package_price';
export type CommissionRuleAppliesTo = 'all' | 'service' | 'package';
export type CommissionRuleRefundPolicy = 'none' | 'full_reversal' | 'proportional';

export interface CommissionRuleDto {
  id: string;
  ruleCode: string;
  ruleName: string;
  description?: string | null;
  referrerType: ReferrerType | 'all';
  calculationType: CommissionRuleCalculationType;
  rateValue: number;
  basis: CommissionRuleBasis;
  appliesTo: CommissionRuleAppliesTo;
  serviceId?: string | null;
  serviceName?: string | null;
  packageId?: string | null;
  packageName?: string | null;
  firstPurchaseOnly: boolean;
  minBaseAmount: number;
  maxCommissionAmount?: number | null;
  refundPolicy: CommissionRuleRefundPolicy;
  withholdingTaxPercent: number;
  validFrom: string;
  validTo?: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCommissionRuleRequest {
  ruleName: string;
  description?: string;
  referrerType: ReferrerType | 'all';
  calculationType: CommissionRuleCalculationType;
  rateValue: number;
  basis: CommissionRuleBasis;
  appliesTo: CommissionRuleAppliesTo;
  serviceId?: DbId;
  packageId?: DbId;
  firstPurchaseOnly?: boolean;
  minBaseAmount?: number;
  maxCommissionAmount?: number | null;
  refundPolicy?: CommissionRuleRefundPolicy;
  withholdingTaxPercent?: number;
  validFrom: string;
  validTo?: string | null;
  isActive?: boolean;
}

export type CommissionKind = 'accrual' | 'adjustment' | 'reversal';
export type CommissionStatus = 'pending' | 'approved' | 'paid' | 'adjusted' | 'reversed';

export interface CommissionDto {
  id: string;
  commissionCode: string;
  referrerId: string;
  referrerName: string;
  referrerCode: string;
  patientId: string;
  patientName: string;
  patientCode: string;
  invoiceId: string;
  invoiceNumber: string;
  paymentId?: string | null;
  refundId?: string | null;
  ruleId: string;
  ruleName: string;
  parentCommissionId?: string | null;
  kind: CommissionKind;
  status: CommissionStatus;
  appliedCalculationType: CommissionRuleCalculationType;
  appliedRate: number;
  appliedBasis: CommissionRuleBasis;
  baseAmount: number;
  computedAmount: number;
  withholdingPercent: number;
  withholdingAmount: number;
  netAmount: number;
  payoutId?: string | null;
  payoutNumber?: string | null;
  accrualKey: string;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface CommissionPayoutDto {
  id: string;
  payoutNumber: string;
  referrerId: string;
  referrerName: string;
  referrerCode: string;
  grossAmount: number;
  withholdingAmount: number;
  netPayoutAmount: number;
  payoutMethod: PayoutMethod;
  paymentReference: string;
  paidDate: string;
  authorizedBy: string;
  authorizedByName: string;
  commissionCount: number;
  commissions?: CommissionDto[];
  notes?: string | null;
  createdAt: string;
}

export interface CreatePayoutRequest {
  referrerId: DbId;
  commissionIds: DbId[];
  payoutMethod: PayoutMethod;
  paymentReference: string;
  paidDate?: string;
  notes?: string | null;
}

export interface ReferrerDetailSummaryDto {
  referrer: ReferrerDto;
  attributions: PatientReferralDto[];
  commissions: CommissionDto[];
  payouts: CommissionPayoutDto[];
  summary: {
    totalPending: number;
    totalApproved: number;
    totalPaid: number;
    totalReversed: number;
    patientCount: number;
  };
}
