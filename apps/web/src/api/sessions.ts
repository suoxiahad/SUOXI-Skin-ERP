import { api } from './client.js';
import type {
  TreatmentSessionDto,
  TreatmentPhotoDto,
  SessionConsumableDto,
  TreatmentSessionStatus,
  CreateTreatmentSessionInput,
  UpdateTreatmentSessionInput,
  CompleteSessionInput,
  AddSessionPhotoInput,
  AddSessionConsumableInput,
  SetNextSessionInput,
  UpdateNextSessionInput,
} from '@suoxi/shared-types';

export const sessionsApi = {
  async listSessions(filters?: {
    status?: TreatmentSessionStatus;
    doctorId?: string;
    therapistId?: string;
    date?: string;
    patientId?: string;
  }): Promise<TreatmentSessionDto[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.doctorId) params.append('doctorId', filters.doctorId);
    if (filters?.therapistId) params.append('therapistId', filters.therapistId);
    if (filters?.date) params.append('date', filters.date);
    if (filters?.patientId) params.append('patientId', filters.patientId);

    const query = params.toString() ? `?${params.toString()}` : '';
    return api.get<TreatmentSessionDto[]>(`/sessions${query}`);
  },

  async getSession(id: string): Promise<TreatmentSessionDto> {
    return api.get<TreatmentSessionDto>(`/sessions/${id}`);
  },

  async createSession(input: CreateTreatmentSessionInput): Promise<TreatmentSessionDto> {
    return api.post<TreatmentSessionDto>('/sessions', input);
  },

  async updateSession(
    id: string,
    input: UpdateTreatmentSessionInput
  ): Promise<TreatmentSessionDto> {
    return api.patch<TreatmentSessionDto>(`/sessions/${id}`, input);
  },

  async completeSession(
    id: string,
    input?: CompleteSessionInput,
    idempotencyKey?: string
  ): Promise<TreatmentSessionDto> {
    const key = idempotencyKey || `comp-${id}-${Date.now()}`;
    return api.post<TreatmentSessionDto>(
      `/sessions/${id}/complete`,
      input || {},
      {
        headers: {
          'Idempotency-Key': key,
        },
      }
    );
  },

  async addPhoto(
    sessionId: string,
    input: AddSessionPhotoInput
  ): Promise<TreatmentPhotoDto> {
    return api.post<TreatmentPhotoDto>(
      `/sessions/${sessionId}/photos`,
      input
    );
  },

  async getPhotos(sessionId: string): Promise<TreatmentPhotoDto[]> {
    return api.get<TreatmentPhotoDto[]>(
      `/sessions/${sessionId}/photos`
    );
  },

  async addConsumable(
    sessionId: string,
    input: AddSessionConsumableInput
  ): Promise<SessionConsumableDto> {
    return api.post<SessionConsumableDto>(
      `/sessions/${sessionId}/consumables`,
      input
    );
  },

  async setNextSession(
    sessionId: string,
    input: SetNextSessionInput
  ): Promise<{ appointment: any; message: string }> {
    return api.post<{ appointment: any; message: string }>(
      `/sessions/${sessionId}/next-session`,
      input
    );
  },

  async updateNextSession(
    sessionId: string,
    input: UpdateNextSessionInput
  ): Promise<{ appointment: any; message: string }> {
    return api.patch<{ appointment: any; message: string }>(
      `/sessions/${sessionId}/next-session`,
      input
    );
  },
};
