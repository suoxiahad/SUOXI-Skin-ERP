import { api } from './client.js';
import type {
  AppointmentDto,
  AppointmentDetailDto,
  AppointmentSourceDto,
  ResourceDto,
  SlotAvailabilityDto,
  CreateAppointmentRequest,
  UpdateAppointmentRequest,
  RescheduleAppointmentRequest,
  AppointmentStatus,
} from '@suoxi/shared-types';

export interface AppointmentsQueryParams {
  branchId?: string;
  patientId?: string;
  providerId?: string;
  status?: string;
  sourceId?: string;
  startDate?: string;
  endDate?: string;
  tab?: 'today' | 'tomorrow' | 'upcoming' | 'past' | 'all';
  search?: string;
  page?: number;
  limit?: number;
}

export const appointmentsApi = {
  list: (params: AppointmentsQueryParams = {}) => {
    const query = new URLSearchParams();
    if (params.branchId) query.set('branchId', params.branchId);
    if (params.patientId) query.set('patientId', params.patientId);
    if (params.providerId) query.set('providerId', params.providerId);
    if (params.status) query.set('status', params.status);
    if (params.sourceId) query.set('sourceId', params.sourceId);
    if (params.startDate) query.set('startDate', params.startDate);
    if (params.endDate) query.set('endDate', params.endDate);
    if (params.tab) query.set('tab', params.tab);
    if (params.search) query.set('search', params.search);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));

    const queryString = query.toString();
    const endpoint = queryString ? `/appointments?${queryString}` : '/appointments';
    return api.get<AppointmentDto[]>(endpoint);
  },

  get: (id: string) => api.get<AppointmentDetailDto>(`/appointments/${id}`),

  create: (data: CreateAppointmentRequest, idempotencyKey?: string) =>
    api.post<AppointmentDto>('/appointments', data, {
      idempotencyKey,
    }),

  update: (id: string, data: UpdateAppointmentRequest) =>
    api.patch<AppointmentDto>(`/appointments/${id}`, data),

  changeStatus: (id: string, status: AppointmentStatus, reason?: string) =>
    api.post<AppointmentDto>(`/appointments/${id}/status`, { status, reason }),

  cancel: (id: string, reason: string) =>
    api.post<AppointmentDto>(`/appointments/${id}/cancel`, { reason }),

  reschedule: (id: string, data: RescheduleAppointmentRequest, idempotencyKey?: string) =>
    api.post<{ oldAppointment: AppointmentDto; newAppointment: AppointmentDto }>(
      `/appointments/${id}/reschedule`,
      data,
      { idempotencyKey }
    ),

  getAvailability: (providerId: string, date: string, duration?: number) => {
    const query = new URLSearchParams();
    query.set('providerId', providerId);
    query.set('date', date);
    if (duration) query.set('duration', String(duration));
    return api.get<SlotAvailabilityDto>(`/appointments/availability?${query.toString()}`);
  },

  getSources: () => api.get<AppointmentSourceDto[]>('/appointment-sources'),

  getResources: (branchId?: string) => {
    const endpoint = branchId ? `/resources?branchId=${encodeURIComponent(branchId)}` : '/resources';
    return api.get<ResourceDto[]>(endpoint);
  },
};
