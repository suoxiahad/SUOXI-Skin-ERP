import { api } from './client.js';
import type { CalendarResponseDto } from '@suoxi/shared-types';

export interface CalendarQueryParams {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  providerId?: string;
  resourceId?: string;
  branchId?: string;
}

export const calendarApi = {
  get: (params: CalendarQueryParams) => {
    const query = new URLSearchParams();
    query.set('from', params.from);
    query.set('to', params.to);
    if (params.providerId && params.providerId !== 'all') query.set('providerId', params.providerId);
    if (params.resourceId && params.resourceId !== 'all') query.set('resourceId', params.resourceId);
    if (params.branchId) query.set('branchId', params.branchId);

    return api.get<CalendarResponseDto>(`/calendar?${query.toString()}`);
  },
};
