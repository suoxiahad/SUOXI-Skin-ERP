import { api } from './client.js';
import type {
  PatientDto,
  RestrictedCallCenterPatientDto,
  CreatePatientRequest,
  UpdatePatientRequest,
  PatientDuplicateCheckResult,
  PatientDuplicateCandidateDto,
  PatientMedicalHistoryDto,
} from '@suoxi/shared-types';

export interface PatientsQueryParams {
  q?: string;
  status?: string;
  hasDue?: boolean;
  page?: number;
  limit?: number;
}

export const patientsApi = {
  list: (params: PatientsQueryParams = {}) => {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.status) query.set('status', params.status);
    if (params.hasDue !== undefined) query.set('hasDue', String(params.hasDue));
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));

    const queryString = query.toString();
    const endpoint = queryString ? `/patients?${queryString}` : '/patients';
    return api.get<Array<PatientDto | RestrictedCallCenterPatientDto>>(endpoint);
  },

  get: (id: string) => api.get<PatientDto | RestrictedCallCenterPatientDto>(`/patients/${id}`),

  create: (data: CreatePatientRequest, idempotencyKey?: string) =>
    api.post<{ patient: PatientDto; duplicateCandidateId?: string }>('/patients', data, {
      idempotencyKey,
    }),

  update: (id: string, data: UpdatePatientRequest) =>
    api.patch<PatientDto>(`/patients/${id}`, data),

  checkDuplicateMobile: (mobile: string) => {
    const encoded = encodeURIComponent(mobile);
    return api.get<PatientDuplicateCheckResult>(`/patients/duplicate-check?mobile=${encoded}`);
  },

  getDuplicateCandidates: () =>
    api.get<PatientDuplicateCandidateDto[]>('/patients/duplicates'),

  resolveDuplicate: (
    candidateId: string,
    action: 'not_duplicate' | 'confirm' | 'merge',
    resolutionNotes?: string
  ) =>
    api.post<{ success: boolean; candidate: PatientDuplicateCandidateDto }>(
      `/patients/duplicates/${candidateId}/resolve`,
      { action, resolutionNotes }
    ),

  getMedicalHistory: (patientId: string) =>
    api.get<PatientMedicalHistoryDto>(`/patients/${patientId}/medical-history`),

  updateMedicalHistory: (
    patientId: string,
    data: {
      allergies?: string;
      skinType?: string;
      currentMedications?: string;
      chronicConditions?: string;
      pastAestheticProcedures?: string;
      contraindications?: string;
    }
  ) =>
    api.post<PatientMedicalHistoryDto>(`/patients/${patientId}/medical-history`, data),
};
