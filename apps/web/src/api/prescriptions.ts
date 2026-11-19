import { api } from './client.js';
import type {
  PrescriptionDto,
  CreatePrescriptionRequest,
  PatchPrescriptionRequest,
} from '@suoxi/shared-types';

export const prescriptionsApi = {
  getPrescription: (id: string) => api.get<PrescriptionDto>(`/prescriptions/${id}`),

  createPrescription: (data: CreatePrescriptionRequest) =>
    api.post<PrescriptionDto>('/prescriptions', data),

  patchPrescription: (id: string, data: PatchPrescriptionRequest) =>
    api.patch<PrescriptionDto>(`/prescriptions/${id}`, data),

  finalizePrescription: (id: string) =>
    api.post<PrescriptionDto>(`/prescriptions/${id}/finalize`, {}),

  correctPrescription: (id: string, reason: string) =>
    api.post<PrescriptionDto>(`/prescriptions/${id}/correct`, { reason }),

  voidPrescription: (id: string, reason: string) =>
    api.post<PrescriptionDto>(`/prescriptions/${id}/void`, { reason }),

  publishPrescription: (id: string, publish: boolean) =>
    api.post<PrescriptionDto>(`/prescriptions/${id}/publish`, { publish }),

  getPrescriptionHistory: (id: string) =>
    api.get<PrescriptionDto[]>(`/prescriptions/${id}/history`),

  getPdfBlob: async (id: string): Promise<Blob> => {
    const res = await fetch(`/api/v1/prescriptions/${id}/pdf`, {
      credentials: 'include',
    });
    if (!res.ok) {
      throw new Error(`Failed to load prescription PDF (${res.status})`);
    }
    return res.blob();
  },
};
