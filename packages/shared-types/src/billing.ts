import type { DbId } from './api.js';

export type PaymentMethodCode = 'CASH' | 'BKASH' | 'NAGAD' | 'CARD' | 'BANK_TRANSFER';

export interface PaymentMethodDto {
  id: DbId;
  code: string;
  name: string;
  nameBn?: string | null;
  requiresReference: boolean;
  isActive: boolean;
  sortOrder: number;
}

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'partially_paid' | 'unpaid' | 'void';

export type InvoiceItemType = 'treatment' | 'package' | 'product' | 'other';

export interface InvoiceItemDto {
  id: string;
  invoiceId: string;
  itemType: InvoiceItemType;
  serviceId?: string | null;
  packageId?: string | null;
  productId?: string | null;
  description: string;
  quantity: number;
  unitPrice: string;
  discountAmount: string;
  lineTotal: string;
  sortOrder: number;
  createdAt: string;
}

export interface InvoiceDto {
  id: string;
  invoiceNo: string;
  patientId: string;
  patientName?: string;
  patientCode?: string;
  branchId: string;
  branchName?: string;
  appointmentId?: string | null;
  consultationId?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
  status: InvoiceStatus;
  subtotal: string;
  discountAmount: string;
  discountPercent: string;
  discountReason?: string | null;
  discountAuthorizedBy?: string | null;
  discountAuthorizedByName?: string | null;
  taxAmount: string;
  taxPercent: string;
  totalAmount: string;
  paidAmount: string;
  dueAmount: string;
  voidReason?: string | null;
  voidedAt?: string | null;
  voidedBy?: string | null;
  voidedByName?: string | null;
  issuedAt?: string | null;
  issuedBy?: string | null;
  issuedByName?: string | null;
  createdBy: string;
  createdByName?: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  items?: InvoiceItemDto[];
}

export interface CreateInvoiceItemInput {
  itemType: InvoiceItemType;
  serviceId?: DbId;
  packageId?: DbId;
  productId?: DbId;
  description: string;
  quantity: number;
  unitPrice: string;
  discountAmount?: string;
}

export interface CreateInvoiceInput {
  patientId: DbId;
  branchId: DbId;
  appointmentId?: DbId;
  consultationId?: DbId;
  invoiceDate: string;
  dueDate?: string;
  discountPercent?: string;
  discountAmount?: string;
  discountReason?: string;
  discountAuthorizedBy?: DbId;
  taxPercent?: string;
  taxAmount?: string;
  notes?: string;
  items: CreateInvoiceItemInput[];
  issueImmediately?: boolean;
}

export interface VoidInvoiceInput {
  voidReason: string;
}

export type PaymentStatus = 'completed' | 'partially_refunded' | 'fully_refunded' | 'reversed';

export interface PaymentAllocationDto {
  id: string;
  paymentId: string;
  invoiceId: string;
  invoiceNo?: string;
  amount: string;
  allocatedAt: string;
  allocatedBy: string;
}

export interface PaymentDto {
  id: string;
  paymentNo: string;
  patientId: string;
  patientName?: string;
  patientCode?: string;
  branchId: string;
  branchName?: string;
  paymentMethodId: DbId;
  paymentMethodCode?: string;
  paymentMethodName?: string;
  amount: string;
  paymentDate: string;
  transactionReference?: string | null;
  notes?: string | null;
  isAdvance: boolean;
  status: PaymentStatus;
  recordedBy: string;
  recordedByName?: string;
  unallocatedAmount?: string;
  allocations?: PaymentAllocationDto[];
  createdAt: string;
  updatedAt: string;
}

export interface RecordPaymentInput {
  patientId: DbId;
  branchId: DbId;
  paymentMethodId?: DbId;
  paymentMethodCode?: PaymentMethodCode | string;
  amount: string;
  paymentDate?: string;
  transactionReference?: string;
  notes?: string;
  isAdvance?: boolean;
  allocations?: {
    invoiceId: DbId;
    amount: string;
  }[];
}

export interface AllocatePaymentInput {
  allocations: {
    invoiceId: DbId;
    amount: string;
  }[];
}

export type RefundStatus = 'requested' | 'approved' | 'paid' | 'rejected';

export interface RefundDto {
  id: string;
  refundNo: string;
  sourcePaymentId: string;
  sourcePaymentNo?: string;
  invoiceId?: string | null;
  invoiceNo?: string | null;
  patientId: string;
  patientName?: string;
  branchId: string;
  branchName?: string;
  amount: string;
  reason: string;
  status: RefundStatus;
  refundMethodId?: DbId | null;
  refundMethodName?: string | null;
  transactionReference?: string | null;
  requestedBy: string;
  requestedByName?: string;
  requestedAt: string;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | null;
  paidBy?: string | null;
  paidByName?: string | null;
  paidAt?: string | null;
  rejectionReason?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequestRefundInput {
  sourcePaymentId: DbId;
  invoiceId?: DbId;
  amount: string;
  reason: string;
  refundMethodId?: DbId;
  refundMethodCode?: PaymentMethodCode | string;
  notes?: string;
}

export interface ApproveRefundInput {
  notes?: string;
}

export interface MarkRefundPaidInput {
  refundMethodId?: DbId;
  refundMethodCode?: PaymentMethodCode | string;
  transactionReference?: string;
  notes?: string;
}

export interface PatientDuesDto {
  patientId: string;
  totalInvoiced: string;
  totalPaid: string;
  totalDue: string;
  totalUnallocatedAdvance: string;
  netPatientDue: string;
}

export interface DailyCollectionItemDto {
  collectionDate: string;
  branchId: string;
  branchName: string;
  paymentMethodId: DbId;
  paymentMethodName: string;
  paymentMethodCode: string;
  totalReceived: string;
  totalRefunded: string;
  netCollected: string;
  paymentCount: number;
}

export interface DailyCollectionReportDto {
  date: string;
  branchId?: string;
  items: DailyCollectionItemDto[];
  grandTotalReceived: string;
  grandTotalRefunded: string;
  grandNetCollected: string;
}

export interface ReceiptDto {
  paymentId: string;
  receiptNo: string;
  paymentDate: string;
  patientId: string;
  patientName: string;
  patientCode: string;
  branchName: string;
  amount: string;
  amountInWords: string;
  paymentMethodName: string;
  paymentMethodCode: string;
  transactionReference?: string | null;
  isAdvance: boolean;
  allocations: {
    invoiceNo: string;
    invoiceDate: string;
    invoiceTotal: string;
    allocatedAmount: string;
    remainingDue: string;
  }[];
  recordedByName: string;
  staffRecordedBadge: boolean;
}

export interface DomainEventDto {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, any>;
  createdAt: string;
  processedAt?: string | null;
}
