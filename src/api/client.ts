/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * Typed API Client for /api/v1/*
 * Follows Rule 1 (all data through /api/v1), Rule 2 (CSRF), Rule 5 (Idempotency-Key), Rule 8 (API-CONV)
 */

import type {
  User,
  Branch,
  Patient,
  Appointment,
  CallCenterTask,
  Consultation,
  Prescription,
  TreatmentPackage,
  MasterPackage,
  PackageDeduction,
  Invoice,
  PaymentRecord,
  InventoryItem,
  StockAdjustment,
  Supplier,
  PurchaseOrder,
  GoodsReceivedNote,
  ReferralCommission,
  AuditEvent,
  UserRole,
  ApiResponse,
  ApiError,
  MedicalAttachment,
  SmsGatewayConfig,
  SmsLogRecord,
  SmsTemplate,
  EmailGatewayConfig,
  EmailLogRecord,
  EmailTemplate,
  ClinicRoleDefinition,
  StaffDutyRoster,
  UserSecurityLog,
  ClinicGeneralSettings,
  ClinicSchedulingSettings,
  ClinicSecuritySettings,
  BackupRecord,
  ActiveSessionRecord,
  RxProtocol,
} from '../types/index.ts';
import type {
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
} from '@suoxi/shared-types';

let cachedCsrfToken: string | null = null;
const API_ORIGIN = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_API_ORIGIN?.replace(/\/+$/, '') || '';

function resolveEndpoint(endpoint: string): string {
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  return `${API_ORIGIN}${endpoint}`;
}

async function getCsrfToken(forceRefresh = false): Promise<string> {
  if (cachedCsrfToken && !forceRefresh) return cachedCsrfToken;
  const res = await fetch(resolveEndpoint('/api/v1/csrf-token'), { credentials: 'include' });
  if (!res.ok) {
    throw new ApiClientError(res.status, {
      code: 'CSRF_FETCH_FAILED',
      message: 'Failed to retrieve CSRF security token from server.',
      requestId: 'unknown',
    });
  }
  const json = (await res.json()) as ApiResponse<{ csrfToken: string }>;
  cachedCsrfToken = json.data.csrfToken;
  return cachedCsrfToken;
}

export class ApiClientError extends Error {
  code: string;
  details?: unknown;
  requestId?: string;
  status: number;

  constructor(status: number, errorData: ApiError['error']) {
    super(errorData.message || 'API request failed');
    this.name = 'ApiClientError';
    this.code = errorData.code || 'UNKNOWN_ERROR';
    this.details = errorData.details;
    this.requestId = errorData.requestId;
    this.status = status;
  }
}

interface RequestOptions extends RequestInit {
  idempotent?: boolean;
  _csrfRetried?: boolean;
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');

  const isMutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  if (isMutating) {
    const csrf = await getCsrfToken(Boolean(options._csrfRetried));
    headers.set('x-csrf-token', csrf);

    if (options.idempotent && !headers.has('idempotency-key')) {
      const rand =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      headers.set('idempotency-key', `idem-${rand}`);
    }
  }

  const response = await fetch(resolveEndpoint(endpoint), {
    credentials: 'include',
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') || '';
  let body: any;

  if (contentType.includes('application/json')) {
    try {
      body = await response.json();
    } catch {
      throw new ApiClientError(response.status, {
        code: 'INVALID_JSON',
        message: 'Malformed JSON received from server',
        requestId: 'unknown',
      });
    }
  } else {
    // Non-JSON response (e.g. 502/503 proxy gateway error or 404 HTML fallback)
    await response.text();
    if (!response.ok) {
      throw new ApiClientError(response.status, {
        code: `HTTP_${response.status}`,
        message:
          response.status === 502 || response.status === 503
            ? 'সার্ভার রিস্টার্ট হচ্ছে বা সাময়িকভাবে প্রস্তুত হচ্ছে। কয়েক সেকেন্ড পর রিফ্রেশ করুন।'
            : `Server returned HTTP ${response.status}`,
        requestId: 'unknown',
      });
    }
    throw new ApiClientError(500, {
      code: 'API_HTML_FALLBACK',
      message: 'API endpoint returned HTML instead of JSON. Server is initializing or route is missing.',
      requestId: 'unknown',
    });
  }

  if (!response.ok) {
    const errorBody = body as ApiError;
    if (
      response.status === 403 &&
      errorBody?.error?.code === 'CSRF_INVALID' &&
      isMutating &&
      !options._csrfRetried
    ) {
      cachedCsrfToken = null;
      return request<T>(endpoint, { ...options, headers, _csrfRetried: true });
    }
    throw new ApiClientError(response.status, errorBody.error || {
      code: 'REQUEST_FAILED',
      message: `HTTP error ${response.status}`,
      requestId: 'unknown',
    });
  }

  return body as ApiResponse<T>;
}

function normalizeAppointment(raw: any): Appointment {
  const branchId = raw.branchId || raw.branch_id || 'br-dhanmondi';
  const branchName = raw.branchName || raw.branch_name || (branchId === 'br-uttara' ? 'Uttara Branch' : 'Dhanmondi Branch');
  return {
    id: raw.id || raw.appointment_id || raw.appointment_code || `apt-${Math.random().toString(36).substring(2, 9)}`,
    patientId: raw.patientId || raw.patient_id || '',
    patientName: raw.patientName || raw.patient_name || 'Patient',
    patientPhone: raw.patientPhone || raw.patient_mobile || '',
    patientAge: raw.patientAge || raw.age || undefined,
    patientGender: raw.patientGender || raw.gender || undefined,
    patientAddress: raw.patientAddress || raw.address || undefined,
    patientBloodGroup: raw.patientBloodGroup || raw.bloodGroup || undefined,
    branchId,
    branchName,
    doctorId: raw.doctorId || raw.provider_id || '',
    doctorName: raw.doctorName || raw.provider_name || 'Assigned Consultant',
    diseaseName: raw.diseaseName || raw.disease_name || raw.disease || (raw.service_name?.includes(':') ? raw.service_name.split(':')[1]?.trim() : raw.serviceName || undefined),
    bookingMethod: raw.bookingMethod || raw.booking_method || raw.call_reference || undefined,
    serviceCategory: raw.serviceCategory || raw.service_category || 'Skin Care',
    serviceName: raw.serviceName || raw.service_name || 'Consultation',
    appointmentDate: raw.appointmentDate || raw.appointment_date || '',
    appointmentTime: raw.appointmentTime || raw.start_time || '',
    durationMinutes: raw.durationMinutes || raw.duration_minutes || 30,
    status: raw.status || 'booked',
    statusReason: raw.statusReason || raw.reason || raw.cancel_reason,
    callReference: raw.callReference || raw.call_reference,
    notes: raw.notes,
    createdBy: raw.createdBy || raw.created_by || 'usr-101',
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.updated_at || new Date().toISOString(),
  };
}

export const api = {
  auth: {
    me: async (): Promise<User> => {
      const res = await request<{ user: User }>('/api/v1/auth/me');
      return res.data.user;
    },
    meWithMeta: async (): Promise<{
      user: User;
      authMode?: 'production_session' | 'preview_demo';
    }> => {
      const res = await request<{
        user: User;
        authMode?: 'production_session' | 'preview_demo';
      }>('/api/v1/auth/me');
      return res.data;
    },
    login: async (
      identifier: string,
      password: string
    ): Promise<{
      user: User;
      mustChangePassword?: boolean;
    }> => {
      const res = await request<{
        user: User;
        mustChangePassword?: boolean;
      }>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });
      return res.data;
    },
    logout: async (): Promise<void> => {
      await request<{ loggedOut: boolean }>('/api/v1/auth/logout', {
        method: 'POST',
      });
    },
    changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
      await request<{ updated: boolean }>('/api/v1/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    },
  },

  files: {
    uploadMultipart: async (
      file: File,
      category = 'general'
    ): Promise<{
      storagePath: string;
      fileUrl: string;
      fileFormat: 'PNG' | 'JPG' | 'PDF';
      fileSize: string;
    }> => {
      const csrf = await getCsrfToken();
      const form = new FormData();
      form.append('file', file);
      form.append('category', category);
      const res = await fetch('/api/v1/files/upload', {
        method: 'POST',
        credentials: 'include',
        headers: { 'x-csrf-token': csrf },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new ApiClientError(res.status, json.error || { code: 'UPLOAD_FAILED', message: 'Upload failed', requestId: 'unknown' });
      }
      return json.data;
    },
  },

  branches: {
    list: async (): Promise<Branch[]> => {
      const res = await request<Branch[]>('/api/v1/branches');
      return res.data;
    },
    create: async (data: Partial<Branch>): Promise<Branch> => {
      const res = await request<Branch>('/api/v1/branches', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    update: async (id: string, data: Partial<Branch>): Promise<Branch> => {
      const res = await request<Branch>(`/api/v1/branches/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    toggleStatus: async (id: string): Promise<Branch> => {
      const res = await request<Branch>(`/api/v1/branches/${id}/toggle-status`, {
        method: 'POST',
      });
      return res.data;
    },
  },

  patients: {
    list: async (searchQuery?: string): Promise<Patient[]> => {
      const url = searchQuery ? `/api/v1/patients?q=${encodeURIComponent(searchQuery)}` : '/api/v1/patients';
      const res = await request<Patient[]>(url);
      return res.data;
    },
    getById: async (id: string): Promise<{
      patient: Patient;
      appointments: Appointment[];
      consultations: Consultation[];
      prescriptions: Prescription[];
      packages: TreatmentPackage[];
      invoices: Invoice[];
    }> => {
      const res = await request<{
        patient: Patient;
        appointments: Appointment[];
        consultations: Consultation[];
        prescriptions: Prescription[];
        packages: TreatmentPackage[];
        invoices: Invoice[];
      }>(`/api/v1/patients/${id}`);
      return res.data;
    },
    create: async (data: Partial<Patient>): Promise<Patient> => {
      const res = await request<Patient>('/api/v1/patients', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    update: async (id: string, data: Partial<Patient>): Promise<Patient> => {
      const res = await request<Patient>(`/api/v1/patients/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    getPortalAccount: async (patientId: string): Promise<any> => {
      const res = await request<any>(`/api/v1/patients/${patientId}/portal-account`);
      return res.data;
    },
    createPortalAccount: async (patientId: string, loginIdentifier?: string): Promise<any> => {
      const res = await request<any>(`/api/v1/patients/${patientId}/portal-account`, {
        method: 'POST',
        body: JSON.stringify({ loginIdentifier }),
      });
      return res.data;
    },
    sendPortalLink: async (patientId: string, tokenType = 'setup', channel = 'sms'): Promise<any> => {
      const res = await request<any>(`/api/v1/patients/${patientId}/portal-account/send-link`, {
        method: 'POST',
        body: JSON.stringify({ tokenType, channel }),
      });
      return res.data;
    },
    deactivatePortalAccount: async (patientId: string): Promise<any> => {
      const res = await request<any>(`/api/v1/patients/${patientId}/portal-account/deactivate`, {
        method: 'POST',
      });
      return res.data;
    },
  },

  appointments: {
    list: async (params?: { branchId?: string; date?: string; status?: string; doctorId?: string }): Promise<Appointment[]> => {
      const query = new URLSearchParams();
      if (params?.branchId) query.set('branchId', params.branchId);
      if (params?.date) query.set('date', params.date);
      if (params?.status) query.set('status', params.status);
      if (params?.doctorId) query.set('doctorId', params.doctorId);
      const url = `/api/v1/appointments${query.toString() ? `?${query.toString()}` : ''}`;
      const res = await request<any>(url);
      const list = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
      return list.map(normalizeAppointment);
    },
    create: async (data: {
      patientId: string;
      patientName?: string;
      patientPhone?: string;
      patientCode?: string;
      doctorId?: string;
      doctorName?: string;
      branchId?: string;
      diseaseName?: string;
      bookingMethod?: string;
      serviceCategory?: string;
      serviceName?: string;
      appointmentDate: string;
      appointmentTime: string;
      durationMinutes?: number;
      notes?: string;
      callReference?: string;
    }): Promise<Appointment> => {
      const payload = {
        patient_id: data.patientId,
        patient_name: data.patientName || null,
        patient_mobile: data.patientPhone || null,
        patient_code: data.patientCode || null,
        provider_id: data.doctorId || 'usr-101',
        branch_id: data.branchId || 'br-dhanmondi',
        disease_name: data.diseaseName || null,
        booking_method: data.bookingMethod || null,
        service_name: data.serviceName || (data.diseaseName ? `Consultation: ${data.diseaseName}` : 'General Consultation'),
        service_category: data.serviceCategory || 'Consultation',
        appointment_date: data.appointmentDate,
        start_time: data.appointmentTime,
        duration_minutes: data.durationMinutes || 30,
        appointment_type: 'consultation',
        notes: data.notes || null,
        call_reference: data.callReference || data.bookingMethod || null,
      };
      const res = await request<any>('/api/v1/appointments', {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify(payload),
      });
      return normalizeAppointment(res.data || res);
    },
    updateStatus: async (id: string, status: string, reason?: string): Promise<Appointment> => {
      const res = await request<any>(`/api/v1/appointments/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, reason }),
      });
      return normalizeAppointment(res.data || res);
    },
  },

  callCenter: {
    listTomorrowCalls: async (): Promise<CallCenterTask[]> => {
      const res = await request<CallCenterTask[]>('/api/v1/call-center/tomorrow-calls');
      return res.data;
    },
    updateCall: async (
      id: string,
      data: {
        callStatus?: string;
        smsStatus?: string;
        callNotes?: string;
        callOutcome?: string;
        patientIntent?: string;
        followupPurpose?: string;
        nextFollowupDate?: string;
        nextFollowupTime?: string;
      }
    ): Promise<CallCenterTask> => {
      const res = await request<CallCenterTask>(`/api/v1/call-center/calls/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return res.data;
    },
  },

  consultations: {
    list: async (patientId?: string): Promise<Consultation[]> => {
      const url = patientId ? `/api/v1/consultations?patientId=${patientId}` : '/api/v1/consultations';
      const res = await request<Consultation[]>(url);
      return res.data;
    },
    create: async (data: {
      patientId: string;
      appointmentId?: string;
      chiefComplaints: string;
      examinationNotes: string;
      clinicalDiagnosis: string;
      skinAnalysis?: {
        hydration: string;
        pigmentation: string;
        elasticity: string;
        sebum: string;
      };
      recommendedProcedures: string[];
      nextSessionDate?: string;
      nextSessionNotes?: string;
    }): Promise<Consultation> => {
      const res = await request<Consultation>('/api/v1/consultations', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.data;
    },
  },

  prescriptions: {
    list: async (patientId?: string): Promise<Prescription[]> => {
      const url = patientId ? `/api/v1/prescriptions?patientId=${patientId}` : '/api/v1/prescriptions';
      const res = await request<Prescription[]>(url);
      return res.data;
    },
    create: async (data: {
      patientId: string;
      consultationId: string;
      diagnosis: string;
      chiefComplaints?: string;
      pastHistory?: string;
      operationHistory?: string;
      investigations?: string;
      recommendedProcedures?: string[];
      adviceList?: string[];
      planNotes?: string;
      skinAnalysis?: {
        hydration?: string;
        pigmentation?: string;
        elasticity?: string;
        sebum?: string;
        skinType?: string;
      };
      language?: 'en' | 'bn' | 'both';
      nextSessionDate?: string;
      medicines: Array<{
        name: string;
        genericName?: string;
        form: string;
        dosage: string;
        duration: string;
        instructions: string;
        instructionsBn?: string;
      }>;
      lifestyleGuidance: {
        waterIntakeLiters: number;
        sunProtectionInstructions: string;
        sunProtectionInstructionsBn: string;
        recommendedFoods: string[];
        recommendedFoodsBn: string[];
        prohibitedFoods: string[];
        prohibitedFoodsBn: string[];
        lifestylePrecautions: string[];
        lifestylePrecautionsBn: string[];
        skincareRoutineMorning: string[];
        skincareRoutineEvening: string[];
      };
    }): Promise<Prescription> => {
      const res = await request<Prescription>('/api/v1/prescriptions', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.data;
    },
  },

  rxProtocols: {
    list: async (activeOnly = false): Promise<RxProtocol[]> => {
      const url = activeOnly ? '/api/v1/rx-protocols?activeOnly=true' : '/api/v1/rx-protocols';
      const res = await request<RxProtocol[]>(url);
      return res.data;
    },
    create: async (
      data: Omit<RxProtocol, 'id' | 'updatedAt' | 'createdBy'>
    ): Promise<RxProtocol> => {
      const res = await request<RxProtocol>('/api/v1/rx-protocols', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    update: async (id: string, data: Partial<RxProtocol>): Promise<RxProtocol> => {
      const res = await request<RxProtocol>(`/api/v1/rx-protocols/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    remove: async (id: string): Promise<{ deleted: boolean; id: string }> => {
      const res = await request<{ deleted: boolean; id: string }>(
        `/api/v1/rx-protocols/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        }
      );
      return res.data;
    },
  },

  medicalDocuments: {
    list: async (params?: { patientId?: string; type?: string }): Promise<MedicalAttachment[]> => {
      const query = new URLSearchParams();
      if (params?.patientId) query.set('patientId', params.patientId);
      if (params?.type) query.set('type', params.type);
      const url = `/api/v1/medical-documents${query.toString() ? `?${query.toString()}` : ''}`;
      const res = await request<MedicalAttachment[]>(url);
      return res.data;
    },
    create: async (data: Partial<MedicalAttachment>): Promise<MedicalAttachment> => {
      const res = await request<MedicalAttachment>('/api/v1/medical-documents', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.data;
    },
  },

  packages: {
    list: async (patientId?: string): Promise<TreatmentPackage[]> => {
      const url = patientId ? `/api/v1/packages?patientId=${patientId}` : '/api/v1/packages';
      const res = await request<TreatmentPackage[]>(url);
      return res.data;
    },
    listMaster: async (): Promise<MasterPackage[]> => {
      const res = await request<MasterPackage[]>('/api/v1/packages/master');
      return res.data;
    },
    createMaster: async (data: Partial<MasterPackage>): Promise<MasterPackage> => {
      const res = await request<MasterPackage>('/api/v1/packages/master', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    assignToPatient: async (data: Partial<TreatmentPackage>): Promise<TreatmentPackage> => {
      const res = await request<TreatmentPackage>('/api/v1/packages', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    getDeductions: async (packageId?: string): Promise<PackageDeduction[]> => {
      const url = packageId ? `/api/v1/packages/deductions?packageId=${packageId}` : '/api/v1/packages/deductions';
      const res = await request<PackageDeduction[]>(url);
      return res.data;
    },
    deductSession: async (data: {
      packageId: string;
      treatmentNotes: string;
      machineSettings?: string;
      therapistName?: string;
    }): Promise<{ package: TreatmentPackage; deduction: PackageDeduction }> => {
      const res = await request<{ package: TreatmentPackage; deduction: PackageDeduction }>('/api/v1/packages/deduct-session', {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify(data),
      });
      return res.data;
    },
    recordInstallment: async (
      packageId: string,
      data: {
        amountBDT: number;
        method: 'cash' | 'card' | 'bkash' | 'nagad' | 'bank_transfer';
        transactionRef?: string;
      }
    ): Promise<{ package: TreatmentPackage; invoice: Invoice; payment: PaymentRecord }> => {
      const res = await request<{ package: TreatmentPackage; invoice: Invoice; payment: PaymentRecord }>(
        `/api/v1/packages/${packageId}/payments`,
        {
          method: 'POST',
          idempotent: true,
          body: JSON.stringify(data),
        }
      );
      return res.data;
    },
  },

  invoices: {
    list: async (params?: { patientId?: string; status?: string }): Promise<Invoice[]> => {
      const query = new URLSearchParams();
      if (params?.patientId) query.set('patientId', params.patientId);
      if (params?.status) query.set('status', params.status);
      const url = `/api/v1/invoices${query.toString() ? `?${query.toString()}` : ''}`;
      const res = await request<Invoice[]>(url);
      return res.data;
    },
    create: async (data: {
      patientId: string;
      branchId?: string;
      items: Array<{
        description: string;
        quantity: number;
        unitPriceBDT: number;
        discountBDT?: number;
      }>;
      discountBDT?: number;
      vatPercent?: number;
    }): Promise<Invoice> => {
      const res = await request<Invoice>('/api/v1/invoices', {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify(data),
      });
      return res.data;
    },
    recordPayment: async (
      invoiceId: string,
      data: {
        amountBDT: number;
        method: 'cash' | 'card' | 'bkash' | 'nagad' | 'bank_transfer';
        transactionRef?: string;
      }
    ): Promise<{ invoice: Invoice; payment: PaymentRecord }> => {
      const res = await request<{ invoice: Invoice; payment: PaymentRecord }>(
        `/api/v1/invoices/${invoiceId}/payments`,
        {
          method: 'POST',
          idempotent: true,
          body: JSON.stringify(data),
        }
      );
      return res.data;
    },
    voidInvoice: async (invoiceId: string, reason: string): Promise<Invoice> => {
      const res = await request<Invoice>(`/api/v1/invoices/${invoiceId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      return res.data;
    },
  },

  inventory: {
    list: async (params?: { branchId?: string; category?: string; productType?: string; status?: string; search?: string }): Promise<InventoryItem[]> => {
      const query = new URLSearchParams();
      if (params?.branchId) query.set('branchId', params.branchId);
      if (params?.category) query.set('category', params.category);
      if (params?.productType) query.set('productType', params.productType);
      if (params?.status) query.set('status', params.status);
      if (params?.search) query.set('search', params.search);
      const url = `/api/v1/inventory${query.toString() ? `?${query.toString()}` : ''}`;
      const res = await request<InventoryItem[]>(url);
      return res.data;
    },
    create: async (data: Partial<InventoryItem>): Promise<InventoryItem> => {
      const res = await request<InventoryItem>('/api/v1/inventory', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    update: async (id: string, data: Partial<InventoryItem>): Promise<InventoryItem> => {
      const res = await request<InventoryItem>(`/api/v1/inventory/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    adjust: async (data: {
      itemId: string;
      adjustmentType: 'damaged' | 'expired' | 'clinic_use' | 'restock' | 'tester' | 'audit_correction';
      quantityDelta: number;
      reason: string;
      batchNumber?: string;
    }): Promise<{ item: InventoryItem; adjustment: StockAdjustment }> => {
      const res = await request<{ item: InventoryItem; adjustment: StockAdjustment }>('/api/v1/inventory/adjust', {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify(data),
      });
      return res.data;
    },
    listAdjustments: async (): Promise<StockAdjustment[]> => {
      const res = await request<StockAdjustment[]>('/api/v1/inventory/adjustments');
      return res.data;
    },
    listSuppliers: async (): Promise<Supplier[]> => {
      const res = await request<Supplier[]>('/api/v1/inventory/suppliers');
      return res.data;
    },
    createSupplier: async (data: Partial<Supplier>): Promise<Supplier> => {
      const res = await request<Supplier>('/api/v1/inventory/suppliers', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    listPurchases: async (): Promise<PurchaseOrder[]> => {
      const res = await request<PurchaseOrder[]>('/api/v1/inventory/purchases');
      return res.data;
    },
    createPurchase: async (data: {
      supplierId: string;
      expectedDeliveryDate: string;
      items: Array<{ itemId: string; orderedQty: number; unitCostBDT: number }>;
      notes?: string;
    }): Promise<PurchaseOrder> => {
      const res = await request<PurchaseOrder>('/api/v1/inventory/purchases', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    receiveGRN: async (
      poId: string,
      data: {
        invoiceRefNumber?: string;
        notes?: string;
        items: Array<{
          itemId: string;
          batchNumber: string;
          expiryDate: string;
          receivedQty: number;
          condition?: 'good' | 'damaged';
        }>;
      }
    ): Promise<{ po: PurchaseOrder; grn: GoodsReceivedNote }> => {
      const res = await request<{ po: PurchaseOrder; grn: GoodsReceivedNote }>(`/api/v1/inventory/purchases/${poId}/receive`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.data;
    },
  },

  referrals: {
    list: async (params?: {
      search?: string;
      type?: string;
      status?: string;
      page?: number;
      limit?: number;
    }): Promise<{ data: ReferrerDto[]; total: number; page: number; limit: number }> => {
      const query = new URLSearchParams();
      if (params?.search) query.set('search', params.search);
      if (params?.type) query.set('type', params.type);
      if (params?.status) query.set('status', params.status);
      if (params?.page) query.set('page', String(params.page));
      if (params?.limit) query.set('limit', String(params.limit));
      const url = `/api/v1/referrals${query.toString() ? `?${query.toString()}` : ''}`;
      const res = await request<ReferrerDto[]>(url);
      return {
        data: res.data,
        total: (res.meta as any)?.total || res.data.length,
        page: (res.meta as any)?.page || 1,
        limit: (res.meta as any)?.limit || 20,
      };
    },
    get: async (id: string): Promise<ReferrerDto> => {
      const res = await request<ReferrerDto>(`/api/v1/referrals/${id}`);
      return res.data;
    },
    getDetail: async (id: string): Promise<ReferrerDetailSummaryDto> => {
      const res = await request<ReferrerDetailSummaryDto>(`/api/v1/referrals/${id}/detail`);
      return res.data;
    },
    create: async (data: CreateReferrerRequest): Promise<ReferrerDto> => {
      const res = await request<ReferrerDto>('/api/v1/referrals', {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify(data),
      });
      return res.data;
    },
    update: async (id: string, data: UpdateReferrerRequest): Promise<ReferrerDto> => {
      const res = await request<ReferrerDto>(`/api/v1/referrals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    assignPatientReferrer: async (
      patientId: string,
      data: AssignPatientReferrerRequest
    ): Promise<PatientReferralDto> => {
      const res = await request<PatientReferralDto>(`/api/v1/referrals/patients/${patientId}/assign`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    getPatientReferralHistory: async (
      patientId: string
    ): Promise<{ current: PatientReferralDto | null; history: PatientReferralDto[] }> => {
      const res = await request<{ current: PatientReferralDto | null; history: PatientReferralDto[] }>(
        `/api/v1/referrals/patients/${patientId}/history`
      );
      return res.data;
    },
  },

  commissions: {
    list: async (params?: {
      referrerId?: string;
      patientId?: string;
      status?: string;
      kind?: string;
    }): Promise<CommissionDto[]> => {
      const query = new URLSearchParams();
      if (params?.referrerId) query.set('referrerId', params.referrerId);
      if (params?.patientId) query.set('patientId', params.patientId);
      if (params?.status) query.set('status', params.status);
      if (params?.kind) query.set('kind', params.kind);
      const url = `/api/v1/commissions${query.toString() ? `?${query.toString()}` : ''}`;
      const res = await request<CommissionDto[]>(url);
      return res.data;
    },
    approve: async (commissionIds: string[]): Promise<CommissionDto[]> => {
      const res = await request<CommissionDto[]>('/api/v1/commissions/approve', {
        method: 'POST',
        body: JSON.stringify({ commissionIds }),
      });
      return res.data;
    },
    listRules: async (params?: { isActive?: boolean; referrerType?: string }): Promise<CommissionRuleDto[]> => {
      const query = new URLSearchParams();
      if (params?.isActive !== undefined) query.set('isActive', String(params.isActive));
      if (params?.referrerType) query.set('referrerType', params.referrerType);
      const url = `/api/v1/commissions/rules${query.toString() ? `?${query.toString()}` : ''}`;
      const res = await request<CommissionRuleDto[]>(url);
      return res.data;
    },
    createRule: async (data: CreateCommissionRuleRequest): Promise<CommissionRuleDto> => {
      const res = await request<CommissionRuleDto>('/api/v1/commissions/rules', {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify(data),
      });
      return res.data;
    },
    updateRule: async (
      id: string,
      data: Partial<CreateCommissionRuleRequest>
    ): Promise<CommissionRuleDto> => {
      const res = await request<CommissionRuleDto>(`/api/v1/commissions/rules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    listPayouts: async (params?: { referrerId?: string }): Promise<CommissionPayoutDto[]> => {
      const query = new URLSearchParams();
      if (params?.referrerId) query.set('referrerId', params.referrerId);
      const url = `/api/v1/commissions/payouts${query.toString() ? `?${query.toString()}` : ''}`;
      const res = await request<CommissionPayoutDto[]>(url);
      return res.data;
    },
    createPayout: async (data: CreatePayoutRequest): Promise<CommissionPayoutDto> => {
      const res = await request<CommissionPayoutDto>('/api/v1/commissions/payouts', {
        method: 'POST',
        idempotent: true,
        body: JSON.stringify(data),
      });
      return res.data;
    },
    processOutbox: async (): Promise<{ processed: number; commissionsCreated: number; reversalsCreated: number }> => {
      const res = await request<{ processed: number; commissionsCreated: number; reversalsCreated: number }>(
        '/api/v1/commissions/process-outbox',
        { method: 'POST' }
      );
      return res.data;
    },
  },

  auditEvents: {
    list: async (): Promise<AuditEvent[]> => {
      const res = await request<AuditEvent[]>('/api/v1/audit-events');
      return res.data;
    },
  },

  patientPortal: {
    getPortalData: async (
      patientId: string
    ): Promise<{
      patient: Patient;
      nextAppointment: Appointment | null;
      allAppointments: Appointment[];
      latestPrescription: Prescription | null;
      allPrescriptions: Prescription[];
      activePackages: TreatmentPackage[];
      invoices: Invoice[];
    }> => {
      const res = await request<{
        patient: Patient;
        nextAppointment: Appointment | null;
        allAppointments: Appointment[];
        latestPrescription: Prescription | null;
        allPrescriptions: Prescription[];
        activePackages: TreatmentPackage[];
        invoices: Invoice[];
      }>(`/api/v1/patient-portal/${patientId}`);
      return res.data;
    },
  },

  integration: {
    sms: {
      getConfig: async (): Promise<SmsGatewayConfig> => {
        const res = await request<SmsGatewayConfig>('/api/v1/integration/sms/config');
        return res.data;
      },
      updateConfig: async (data: Partial<SmsGatewayConfig>): Promise<SmsGatewayConfig> => {
        const res = await request<SmsGatewayConfig>('/api/v1/integration/sms/config', {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        return res.data;
      },
      checkBalance: async (): Promise<{ balanceBDT: number; balanceCredits: number; lastCheckedAt: string }> => {
        const res = await request<{ balanceBDT: number; balanceCredits: number; lastCheckedAt: string }>('/api/v1/integration/sms/balance');
        return res.data;
      },
      getServerIp: async (): Promise<{ serverIp: string }> => {
        const res = await request<{ serverIp: string }>('/api/v1/integration/sms/server-ip');
        return res.data;
      },
      send: async (data: {
        recipientPhone: string;
        messageContent: string;
        messageType?: 'text' | 'unicode';
        label?: 'transactional' | 'promotional';
        senderId?: string;
        recipientName?: string;
      }): Promise<{
        success: boolean;
        shootId: string;
        smsCount: number;
        charsCount: number;
        costBDT: number;
        remainingCredits: number;
        remainingBDT: number;
        gatewayResponse: string;
        errorCode?: string;
        errorTitle?: string;
        errorMessage?: string;
        fixInstruction?: string;
        serverIp?: string;
        log: SmsLogRecord;
      }> => {
        const res = await request<any>('/api/v1/integration/sms/send', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return res.data;
      },
      getLogs: async (): Promise<SmsLogRecord[]> => {
        const res = await request<SmsLogRecord[]>('/api/v1/integration/sms/logs');
        return res.data;
      },
      getTemplates: async (): Promise<SmsTemplate[]> => {
        const res = await request<SmsTemplate[]>('/api/v1/integration/sms/templates');
        return res.data;
      },
      updateTemplate: async (id: string, data: Partial<SmsTemplate>): Promise<SmsTemplate> => {
        const res = await request<SmsTemplate>(`/api/v1/integration/sms/templates/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        return res.data;
      },
      createTemplate: async (data: Partial<SmsTemplate>): Promise<SmsTemplate> => {
        const res = await request<SmsTemplate>('/api/v1/integration/sms/templates', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return res.data;
      },
    },
    email: {
      getConfig: async (): Promise<EmailGatewayConfig> => {
        const res = await request<EmailGatewayConfig>('/api/v1/integration/email/config');
        return res.data;
      },
      updateConfig: async (data: Partial<EmailGatewayConfig>): Promise<EmailGatewayConfig> => {
        const res = await request<EmailGatewayConfig>('/api/v1/integration/email/config', {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        return res.data;
      },
      sendTest: async (data: { recipientEmail: string; subject?: string; content?: string }): Promise<{ success: boolean; message: string; diagnosticSteps: string[]; log: EmailLogRecord }> => {
        const res = await request<any>('/api/v1/integration/email/send-test', {
          method: 'POST',
          body: JSON.stringify(data),
        });
        return res.data;
      },
      getLogs: async (): Promise<EmailLogRecord[]> => {
        const res = await request<EmailLogRecord[]>('/api/v1/integration/email/logs');
        return res.data;
      },
      getTemplates: async (): Promise<EmailTemplate[]> => {
        const res = await request<EmailTemplate[]>('/api/v1/integration/email/templates');
        return res.data;
      },
      updateTemplate: async (id: string, data: Partial<EmailTemplate>): Promise<EmailTemplate> => {
        const res = await request<EmailTemplate>(`/api/v1/integration/email/templates/${id}`, {
          method: 'PUT',
          body: JSON.stringify(data),
        });
        return res.data;
      },
    },
  },
  users: {
    list: async (params?: { branchId?: string; role?: string; status?: string; search?: string }): Promise<User[]> => {
      const searchParams = new URLSearchParams();
      if (params?.branchId) searchParams.set('branchId', params.branchId);
      if (params?.role) searchParams.set('role', params.role);
      if (params?.status) searchParams.set('status', params.status);
      if (params?.search) searchParams.set('search', params.search);
      const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
      const res = await request<User[]>(`/api/v1/users${query}`);
      return res.data;
    },
    get: async (id: string): Promise<User> => {
      const res = await request<User>(`/api/v1/users/${id}`);
      return res.data;
    },
    create: async (data: Partial<User>): Promise<User> => {
      const res = await request<User>('/api/v1/users', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    update: async (id: string, data: Partial<User>): Promise<User> => {
      const res = await request<User>(`/api/v1/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    toggleStatus: async (id: string, status: 'active' | 'inactive' | 'suspended', reason?: string): Promise<User> => {
      const res = await request<User>(`/api/v1/users/${id}/toggle-status`, {
        method: 'POST',
        body: JSON.stringify({ status, reason }),
      });
      return res.data;
    },
    resetPassword: async (id: string, tempPassword?: string): Promise<{ success: boolean; message: string; tempPassword: string; expiresInHours: number }> => {
      const res = await request<any>(`/api/v1/users/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ tempPassword }),
      });
      return res.data;
    },
    listRoles: async (): Promise<ClinicRoleDefinition[]> => {
      const res = await request<ClinicRoleDefinition[]>('/api/v1/users-roles');
      return res.data;
    },
    updateRole: async (id: string, data: Partial<ClinicRoleDefinition>): Promise<ClinicRoleDefinition> => {
      const res = await request<ClinicRoleDefinition>(`/api/v1/users-roles/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    listRosters: async (params?: { branchId?: string; date?: string; role?: string }): Promise<StaffDutyRoster[]> => {
      const searchParams = new URLSearchParams();
      if (params?.branchId) searchParams.set('branchId', params.branchId);
      if (params?.date) searchParams.set('date', params.date);
      if (params?.role) searchParams.set('role', params.role);
      const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
      const res = await request<StaffDutyRoster[]>(`/api/v1/users-rosters${query}`);
      return res.data;
    },
    saveRoster: async (data: Partial<StaffDutyRoster>): Promise<StaffDutyRoster> => {
      const res = await request<StaffDutyRoster>('/api/v1/users-rosters', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    listSecurityLogs: async (params?: { action?: string; status?: string; search?: string }): Promise<UserSecurityLog[]> => {
      const searchParams = new URLSearchParams();
      if (params?.action) searchParams.set('action', params.action);
      if (params?.status) searchParams.set('status', params.status);
      if (params?.search) searchParams.set('search', params.search);
      const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
      const res = await request<UserSecurityLog[]>(`/api/v1/users-security-logs${query}`);
      return res.data;
    },
  },

  settings: {
    getGeneral: async (): Promise<ClinicGeneralSettings> => {
      const res = await request<ClinicGeneralSettings>('/api/v1/settings/general');
      return res.data;
    },
    updateGeneral: async (data: Partial<ClinicGeneralSettings>): Promise<ClinicGeneralSettings> => {
      const res = await request<ClinicGeneralSettings>('/api/v1/settings/general', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    getScheduling: async (): Promise<ClinicSchedulingSettings> => {
      const res = await request<ClinicSchedulingSettings>('/api/v1/settings/scheduling');
      return res.data;
    },
    updateScheduling: async (data: Partial<ClinicSchedulingSettings>): Promise<ClinicSchedulingSettings> => {
      const res = await request<ClinicSchedulingSettings>('/api/v1/settings/scheduling', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    getSecurity: async (): Promise<ClinicSecuritySettings> => {
      const res = await request<ClinicSecuritySettings>('/api/v1/settings/security');
      return res.data;
    },
    updateSecurity: async (data: Partial<ClinicSecuritySettings>): Promise<ClinicSecuritySettings> => {
      const res = await request<ClinicSecuritySettings>('/api/v1/settings/security', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      return res.data;
    },
    listBackups: async (): Promise<BackupRecord[]> => {
      const res = await request<BackupRecord[]>('/api/v1/settings/backups');
      return res.data;
    },
    createBackup: async (backupType: 'manual' | 'auto_daily' = 'manual'): Promise<BackupRecord> => {
      const res = await request<BackupRecord>('/api/v1/settings/backups/create', {
        method: 'POST',
        body: JSON.stringify({ backupType }),
      });
      return res.data;
    },
    restoreBackup: async (id: string): Promise<{ success: boolean; message: string; recordsRestored: number; restoredAt: string }> => {
      const res = await request<any>(`/api/v1/settings/backups/restore/${id}`, {
        method: 'POST',
      });
      return res.data;
    },
    listSessions: async (): Promise<ActiveSessionRecord[]> => {
      const res = await request<ActiveSessionRecord[]>('/api/v1/settings/sessions');
      return res.data;
    },
    revokeSession: async (id: string): Promise<{ success: boolean; message: string }> => {
      const res = await request<any>(`/api/v1/settings/sessions/revoke/${id}`, {
        method: 'POST',
      });
      return res.data;
    },
    revokeAllSessions: async (): Promise<{ success: boolean; message: string }> => {
      const res = await request<any>('/api/v1/settings/sessions/revoke-all', {
        method: 'POST',
      });
      return res.data;
    },
  },
};
