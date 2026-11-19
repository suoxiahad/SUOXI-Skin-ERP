import type { DbId } from './api.js';

export type PackageStatus = 'active' | 'completed' | 'expired' | 'cancelled' | 'renewed';

export type LedgerEntryType = 'deduction' | 'reversal' | 'adjustment';

export type RemainingHandling = 'forfeited' | 'refunded' | 'credited' | 'transferred';

export interface PackageItemDto {
  id: string;
  packageId: string;
  serviceId: string;
  serviceName?: string;
  serviceCode?: string;
  sessionCount: number;
  sortOrder: number;
}

export interface PackageDto {
  id: string;
  packageCode: string;
  name: string;
  nameBn?: string | null;
  description?: string | null;
  price: string;
  validityDays: number;
  isActive: boolean;
  items: PackageItemDto[];
  createdAt: string;
  updatedAt: string;
}

export interface PatientPackageItemDto {
  id: string;
  patientPackageId: string;
  serviceId: string;
  serviceName: string;
  serviceCode: string;
  initialSessions: number;
  completedSessions: number;
  remainingSessions: number;
}

export interface PackageSessionLedgerEntryDto {
  id: string;
  patientPackageId: string;
  patientPackageItemId: string;
  treatmentSessionId?: string | null;
  treatmentSessionCode?: string | null;
  entryType: LedgerEntryType;
  changeQuantity: number;
  cycleNo: number;
  originalLedgerId?: string | null;
  reason: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

export interface PackageCancellationDto {
  id: string;
  patientPackageId: string;
  cancelledAt: string;
  cancelledBy: string;
  cancelledByName?: string;
  approvedBy: string;
  approvedByName?: string;
  reason: string;
  remainingHandling: RemainingHandling;
  refundReference?: string | null;
  notes?: string | null;
}

export interface PatientPackageDto {
  id: string;
  patientId: string;
  patientName?: string;
  patientCode?: string;
  branchId: string;
  branchName?: string;
  packageId: string;
  packageCode: string;
  packageName: string;
  packageNameBn?: string | null;
  purchaseDate: string;
  startDate: string;
  expiryDate: string;
  validityDays: number;
  daysToExpiry: number;
  priceSold: string;
  saleTerms?: string | null;
  status: PackageStatus;
  assignedBy: string;
  assignedByName?: string;
  renewedFromId?: string | null;
  invoiceItemId?: string | null;
  items: PatientPackageItemDto[];
  ledger?: PackageSessionLedgerEntryDto[];
  cancellation?: PackageCancellationDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePackageInput {
  name: string;
  nameBn?: string | null;
  description?: string | null;
  price: string | number;
  validityDays: number;
  items: {
    serviceId: DbId;
    sessionCount: number;
    sortOrder?: number;
  }[];
}

export interface UpdatePackageInput {
  name?: string;
  nameBn?: string | null;
  description?: string | null;
  price?: string | number;
  validityDays?: number;
  isActive?: boolean;
}

export interface AssignPackageInput {
  patientId: DbId;
  packageId: DbId;
  branchId?: DbId;
  purchaseDate: string;
  startDate: string;
  priceSold?: string | number;
  saleTerms?: string | null;
}

export interface CancelPackageInput {
  reason: string;
  remainingHandling: RemainingHandling;
  refundReference?: string | null;
  notes?: string | null;
}

export interface RenewPackageInput {
  purchaseDate: string;
  startDate: string;
  priceSold?: string | number;
  saleTerms?: string | null;
}

export interface ReverseDeductionInput {
  reason: string;
}
