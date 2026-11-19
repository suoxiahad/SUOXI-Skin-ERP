import { api } from './client.js';
import type {
  NotificationDto,
  NotificationFilterParams,
  NotificationReportSummaryDto,
  StaffAlertDto,
} from '@suoxi/shared-types';

export const notificationsApi = {
  // Report summary
  getSummary: (branchId?: string) =>
    api.get<NotificationReportSummaryDto>(
      branchId ? `/notifications/summary?branchId=${branchId}` : '/notifications/summary'
    ),

  // List notifications
  list: (params: NotificationFilterParams) => {
    const q = new URLSearchParams();
    if (params.status && params.status !== ('all' as any)) q.set('status', params.status);
    if (params.channel && params.channel !== ('all' as any)) q.set('channel', params.channel);
    if (params.search) q.set('search', params.search);
    if (params.date_from) q.set('date_from', params.date_from);
    if (params.date_to) q.set('date_to', params.date_to);
    if (params.branch_id) q.set('branch_id', params.branch_id);
    if (params.page) q.set('page', String(params.page));
    if (params.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return api.get<NotificationDto[]>(qs ? `/notifications?${qs}` : '/notifications');
  },

  // Automated reminder generation
  generateReminders: (targetDate?: string) =>
    api.post<{ generated: number; skipped: number; items: NotificationDto[] }>(
      '/notifications/generate-reminders',
      targetDate ? { target_date: targetDate } : {}
    ),

  // Retry failed notification
  retry: (id: string) => api.post<NotificationDto>(`/notifications/${id}/retry`, {}),

  // Cancel queued notification
  cancel: (id: string, reason?: string) =>
    api.post<NotificationDto>(`/notifications/${id}/cancel`, { reason }),

  // Staff alerts bell
  listStaffAlerts: (isRead?: boolean, limit?: number) => {
    const q = new URLSearchParams();
    if (isRead !== undefined) q.set('is_read', String(isRead));
    if (limit) q.set('limit', String(limit));
    const qs = q.toString();
    return api.get<StaffAlertDto[]>(qs ? `/staff-alerts?${qs}` : '/staff-alerts');
  },

  markStaffAlertRead: (id: string) => api.post<StaffAlertDto>(`/staff-alerts/${id}/read`, {}),

  markAllStaffAlertsRead: () => api.post<{ markedReadCount: number }>('/staff-alerts/read-all', {}),
};
