import { api } from './client.js';
import type {
  CallCenterAppointmentDto,
  CallCenterDashboardSummaryDto,
  FollowUpTaskDto,
  CallContactLogDto,
  LogCallRequest,
  FollowUpRuleDto,
  UpdateFollowUpRuleRequest,
  FollowUpTasksFilterParams,
} from '@suoxi/shared-types';

export const callCenterApi = {
  // 1. Tomorrow's call list
  getTomorrowSessions: (branchId?: string) =>
    api.get<CallCenterAppointmentDto[]>(
      branchId ? `/call-center/tomorrow-sessions?branchId=${branchId}` : '/call-center/tomorrow-sessions'
    ),

  // 2. Dashboard summary counters
  getSummary: (branchId?: string) =>
    api.get<CallCenterDashboardSummaryDto>(
      branchId ? `/call-center/summary?branchId=${branchId}` : '/call-center/summary'
    ),

  // 3. Log call outcome (Hard Rule 1: typed manually, Hard Rule 2: reschedule requests create alert, no direct appointment change)
  logCall: (data: LogCallRequest) =>
    api.post<CallContactLogDto>('/call-center/log-call', data),

  // 4. Follow-up tasks queue
  listFollowUpTasks: (params?: FollowUpTasksFilterParams) => {
    const q = new URLSearchParams();
    if (params?.status && params.status !== ('all' as any)) q.set('status', params.status);
    if (params?.task_type && params.task_type !== ('all' as any)) q.set('task_type', params.task_type);
    if (params?.priority && params.priority !== ('all' as any)) q.set('priority', params.priority);
    if (params?.assigned_to) q.set('assigned_to', params.assigned_to);
    if (params?.due_date) q.set('due_date', params.due_date);
    if (params?.branch_id) q.set('branch_id', params.branch_id);
    if (params?.search) q.set('search', params.search);
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return api.get<FollowUpTaskDto[]>(qs ? `/follow-ups/tasks?${qs}` : '/follow-ups/tasks');
  },

  // 5. Trigger task generation
  generateFollowUpTasks: (branchId?: string) =>
    api.post<{ generated: number; skippedDuplicates: number; tasks: FollowUpTaskDto[] }>(
      '/follow-ups/tasks/generate',
      branchId ? { branch_id: branchId } : {}
    ),

  // 6. Assign task
  assignTask: (id: string, assignedTo: string | null) =>
    api.post<FollowUpTaskDto>(`/follow-ups/tasks/${id}/assign`, { assigned_to: assignedTo }),

  // 7. Complete task
  completeTask: (id: string, notes: string) =>
    api.post<FollowUpTaskDto>(`/follow-ups/tasks/${id}/complete`, { notes }),

  // 8. Follow-up automation rules
  listRules: (branchId?: string) =>
    api.get<FollowUpRuleDto[]>(
      branchId ? `/follow-ups/rules?branchId=${branchId}` : '/follow-ups/rules'
    ),

  // 9. Update rule configuration
  updateRule: (id: string, data: UpdateFollowUpRuleRequest) =>
    api.put<FollowUpRuleDto>(`/follow-ups/rules/${id}`, data),
};
