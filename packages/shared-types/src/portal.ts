/**
 * Patient Portal Types and DTOs (Prompt 18)
 * Dedicated schema for patient self-service portal
 */

export type PatientAccountStatus = 'pending_setup' | 'active' | 'suspended' | 'deactivated';

export interface PatientAccountDto {
  id: string;
  patientId: string;
  loginIdentifier: string;
  status: PatientAccountStatus;
  failedLoginAttempts: number;
  lockedUntil?: string | null;
  lastLoginAt?: string | null;
  createdAt: string;
}

export interface PortalMeDto {
  accountId: string;
  patientId: string;
  patientCode: string;
  fullName: string;
  fullNameBangla?: string;
  primaryMobile: string;
  email?: string;
  preferredLanguage: 'bn' | 'en';
}

export interface PortalAuthResponse {
  account: PortalMeDto;
  csrfToken: string;
}

export interface PortalHomeDto {
  patientName: string;
  patientNameBangla?: string;
  patientCode: string;
  nextSession?: {
    id: string;
    appointmentId?: string;
    date: string;
    time: string;
    serviceName: string;
    doctorName: string;
    branchName: string;
    room?: string;
    status: string;
  } | null;
  packageProgress?: {
    packageName: string;
    totalSessions: number;
    completedSessions: number;
    remainingSessions: number;
    expiryDate: string;
    isExpiringSoon: boolean;
  } | null;
  billingSummary: {
    outstandingDue: number;
    totalInvoiced: number;
    totalPaid: number;
    hasOutstandingDue: boolean;
  };
}

export interface PortalSessionItemDto {
  id: string;
  sessionNumber: string;
  date: string;
  time: string;
  serviceName: string;
  serviceNameBangla?: string;
  doctorName: string;
  branchName: string;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  aftercareInstructions?: string | null;
  aftercarePublished: boolean;
}

export interface PortalPrescriptionDto {
  id: string;
  prescriptionNumber: string;
  date: string;
  doctorName: string;
  doctorDesignation?: string;
  diagnosisSummary?: string;
  medications: Array<{
    name: string;
    dosage: string;
    instructions: string;
    duration: string;
  }>;
  advice?: string;
  lifestyleGuidance?: {
    title: string;
    guidelines: string[];
    foodsToEat?: string[];
    foodsToAvoid?: string[];
  } | null;
  hasPdf: boolean;
  pdfDownloadUrl?: string;
}

export interface PortalBillingSummaryDto {
  totalInvoiced: number;
  totalPaid: number;
  outstandingDue: number;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    date: string;
    totalAmount: number;
    paidAmount: number;
    dueAmount: number;
    status: 'paid' | 'partial' | 'due' | 'void';
  }>;
  payments: Array<{
    id: string;
    receiptNumber: string;
    date: string;
    amount: number;
    paymentMethod: string;
  }>;
  packages: Array<{
    id: string;
    packageName: string;
    totalSessions: number;
    consumedSessions: number;
    remainingSessions: number;
    validityEnd: string;
    isExpired: boolean;
  }>;
}

export interface PortalDocumentDto {
  id: string;
  fileName: string;
  fileCategory: string;
  captureDate?: string;
  mimeType: string;
  fileSize: number;
  downloadUrl: string;
}

export interface PortalProfileDto {
  id: string;
  patientCode: string;
  fullName: string;
  fullNameBangla?: string;
  primaryMobile: string;
  email?: string;
  address?: string;
  emergencyContactName?: string;
  emergencyContactRelation?: string;
  emergencyContactMobile?: string;
  preferredLanguage: 'bn' | 'en';
}

export interface PortalProfileUpdateDto {
  address?: string;
  emergencyContactName?: string;
  emergencyContactRelation?: string;
  emergencyContactMobile?: string;
  preferredLanguage?: 'bn' | 'en';
}

export interface PortalContactOtpRequestDto {
  changeType: 'mobile' | 'email';
  targetValue: string;
}

export interface PortalContactOtpConfirmDto {
  changeType: 'mobile' | 'email';
  targetValue: string;
  otp: string;
}
