import { api } from './client.js';
import type {
  PaymentMethodDto,
  InvoiceDto,
  CreateInvoiceInput,
  VoidInvoiceInput,
  PaymentDto,
  RecordPaymentInput,
  AllocatePaymentInput,
  RefundDto,
  RequestRefundInput,
  ApproveRefundInput,
  MarkRefundPaidInput,
  PatientDuesDto,
  DailyCollectionReportDto,
  ReceiptDto,
} from '@suoxi/shared-types';

export const billingApi = {
  // Payment Methods
  async getPaymentMethods(): Promise<PaymentMethodDto[]> {
    return api.get<PaymentMethodDto[]>('/billing/payment-methods');
  },

  // Invoices
  async listInvoices(params?: {
    patientId?: string;
    branchId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<InvoiceDto[]> {
    const searchParams = new URLSearchParams();
    if (params?.patientId) searchParams.append('patientId', params.patientId);
    if (params?.branchId) searchParams.append('branchId', params.branchId);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.startDate) searchParams.append('startDate', params.startDate);
    if (params?.endDate) searchParams.append('endDate', params.endDate);

    const query = searchParams.toString();
    const url = query ? `/invoices?${query}` : '/invoices';
    return api.get<InvoiceDto[]>(url);
  },

  async getInvoice(id: string): Promise<InvoiceDto> {
    return api.get<InvoiceDto>(`/invoices/${id}`);
  },

  async createInvoice(input: CreateInvoiceInput): Promise<InvoiceDto> {
    return api.post<InvoiceDto>('/invoices', input);
  },

  async issueInvoice(id: string): Promise<InvoiceDto> {
    return api.post<InvoiceDto>(`/invoices/${id}/issue`, {});
  },

  async voidInvoice(id: string, input: VoidInvoiceInput): Promise<InvoiceDto> {
    return api.post<InvoiceDto>(`/invoices/${id}/void`, input);
  },

  // Payments
  async listPayments(params?: {
    patientId?: string;
    branchId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<PaymentDto[]> {
    const searchParams = new URLSearchParams();
    if (params?.patientId) searchParams.append('patientId', params.patientId);
    if (params?.branchId) searchParams.append('branchId', params.branchId);
    if (params?.startDate) searchParams.append('startDate', params.startDate);
    if (params?.endDate) searchParams.append('endDate', params.endDate);

    const query = searchParams.toString();
    const url = query ? `/payments?${query}` : '/payments';
    return api.get<PaymentDto[]>(url);
  },

  async getPayment(id: string): Promise<PaymentDto> {
    return api.get<PaymentDto>(`/payments/${id}`);
  },

  async recordPayment(input: RecordPaymentInput, idempotencyKey?: string): Promise<PaymentDto> {
    const key = idempotencyKey || `pay-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    return api.post<PaymentDto>('/payments', input, { idempotencyKey: key });
  },

  async allocatePayment(paymentId: string, input: AllocatePaymentInput): Promise<PaymentDto> {
    return api.post<PaymentDto>(`/payments/${paymentId}/allocate`, input);
  },

  // Receipts
  async getReceipt(paymentId: string): Promise<ReceiptDto> {
    return api.get<ReceiptDto>(`/receipts/${paymentId}`);
  },

  // Refunds
  async listRefunds(params?: {
    patientId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<RefundDto[]> {
    const searchParams = new URLSearchParams();
    if (params?.patientId) searchParams.append('patientId', params.patientId);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.startDate) searchParams.append('startDate', params.startDate);
    if (params?.endDate) searchParams.append('endDate', params.endDate);

    const query = searchParams.toString();
    const url = query ? `/refunds?${query}` : '/refunds';
    return api.get<RefundDto[]>(url);
  },

  async requestRefund(input: RequestRefundInput): Promise<RefundDto> {
    return api.post<RefundDto>('/refunds', input);
  },

  async approveRefund(id: string, input: ApproveRefundInput): Promise<RefundDto> {
    return api.post<RefundDto>(`/refunds/${id}/approve`, input);
  },

  async markRefundPaid(id: string, input: MarkRefundPaidInput): Promise<RefundDto> {
    return api.post<RefundDto>(`/refunds/${id}/mark-paid`, input);
  },

  // Daily Collections & Patient Dues
  async getDailyCollections(date: string, branchId?: string): Promise<DailyCollectionReportDto> {
    const searchParams = new URLSearchParams();
    searchParams.append('date', date);
    if (branchId) searchParams.append('branchId', branchId);
    return api.get<DailyCollectionReportDto>(`/billing/collections?${searchParams.toString()}`);
  },

  async getPatientDues(patientId: string): Promise<PatientDuesDto> {
    return api.get<PatientDuesDto>(`/patients/${patientId}/dues`);
  },
};
