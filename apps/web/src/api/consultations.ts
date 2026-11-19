import { api } from './client.js';
import type {
  ConsultationDto,
  TreatmentPlanDto,
  ConsentRecordDto,
  CreateConsultationRequest,
  PatchConsultationRequest,
  CreateTreatmentPlanRequest,
  CreateConsentRequest,
} from '@suoxi/shared-types';

export const consultationsApi = {
  getConsultation: (id: string) => api.get<ConsultationDto>(`/consultations/${id}`),

  createFromAppointment: (appointmentId: string, data: CreateConsultationRequest) =>
    api.post<ConsultationDto>(`/appointments/${appointmentId}/consultation`, data),

  patchConsultation: (id: string, data: PatchConsultationRequest) =>
    api.patch<ConsultationDto>(`/consultations/${id}`, data),

  createTreatmentPlan: (consultationId: string, data: CreateTreatmentPlanRequest) =>
    api.post<TreatmentPlanDto>(`/consultations/${consultationId}/treatment-plan`, data),

  createConsent: (consultationId: string, data: CreateConsentRequest) =>
    api.post<ConsentRecordDto>(`/consultations/${consultationId}/consent`, data),
};
