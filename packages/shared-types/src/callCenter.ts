export type CallOutcome =
  | 'reached'
  | 'no_answer'
  | 'busy'
  | 'switched_off'
  | 'wrong_number'
  | 'reschedule_requested'
  | 'cancel_requested'
  | 'completed'
  | 'declined'
  | 'other';

export type FollowUpTaskType =
  | 'next_day_call'
  | 'missed_appointment'
  | 'cancelled_appointment'
  | 'inactive_patient'
  | 'package_expiry'
  | 'pending_payment';

export type FollowUpTaskStatus = 'open' | 'in_progress' | 'completed' | 'cancelled' | 'pending';

export type FollowUpTaskPriority = 'low' | 'medium' | 'high' | 'critical' | 'urgent';

export interface CallCenterAppointmentDto {
  appointment_id: string;
  id?: string; // row key convenience
  appointment_code: string;
  branch_id: string;
  patient_id: string;
  patient_code: string;
  patient_name: string;
  patient_mobile: string;
  mobile?: string;
  provider_id: string;
  doctor_name: string;
  service_name: string;
  appointment_date: string; // YYYY-MM-DD
  start_time: string; // HH:mm
  duration_minutes: number;
  appointment_status: string;
  call_reference?: string;
  call_task_status: 'pending' | 'called' | 'unreachable' | 'reschedule_requested' | 'completed' | 'in_progress' | 'overdue';
  last_call_outcome?: string;
  follow_up_task_id?: string;
  assigned_to?: string;
  sms_status: 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'none';
  sms_delivery_status?: string;
  sms_sent_at?: string;
  sms_delivered_at?: string;
}

export interface CallCenterDashboardSummaryDto {
  total: number;
  called: number;
  pending: number;
  unreachable: number;
  tomorrow_date?: string;
  tomorrow_total_sessions?: number;
  tomorrow_called_count?: number;
  tomorrow_pending_count?: number;
  tomorrow_unreachable_count?: number;
}

export interface FollowUpTaskDto {
  id: string;
  branch_id: string;
  patient_id: string;
  patient_name: string;
  patient_mobile: string;
  patient_code?: string;
  appointment_id?: string;
  task_type: FollowUpTaskType;
  priority: FollowUpTaskPriority;
  status: FollowUpTaskStatus;
  title?: string;
  notes?: string;
  assigned_to?: string;
  assigned_name?: string;
  assigned_to_name?: string;
  due_date: string;
  is_overdue: boolean;
  dedupe_key: string;
  resolution_notes?: string;
  completed_at?: string;
  completed_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CallContactLogDto {
  id: string;
  task_id?: string;
  patient_id: string;
  appointment_id?: string;
  caller_user_id: string;
  caller_name: string;
  outcome: CallOutcome;
  notes?: string;
  call_reference?: string;
  duration_seconds?: number;
  next_action?: string;
  next_action_due?: string;
  reschedule_requested_date?: string;
  reschedule_requested_time?: string;
  reschedule_reason?: string;
  reschedule_status: 'none' | 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface LogCallRequest {
  appointment_id?: string;
  task_id?: string;
  follow_up_task_id?: string;
  patient_id: string;
  outcome: CallOutcome;
  notes?: string;
  call_reference?: string;
  duration_seconds?: number;
  next_action?: string;
  next_action_due?: string;
  requested_reschedule_date?: string;
  requested_reschedule_time?: string;
  reschedule_requested_date?: string;
  reschedule_requested_time?: string;
  reschedule_reason?: string;
}

export interface FollowUpRuleDto {
  id: string;
  branch_id: string;
  rule_type: FollowUpTaskType;
  rule_name?: string;
  task_type?: FollowUpTaskType;
  description?: string;
  is_enabled: boolean;
  is_active?: boolean;
  trigger_days: number;
  trigger_window_days?: number;
  trigger_window_hours?: number;
  priority: FollowUpTaskPriority;
  default_priority?: FollowUpTaskPriority;
  created_at: string;
  updated_at: string;
}

export interface UpdateFollowUpRuleRequest {
  is_enabled?: boolean;
  is_active?: boolean;
  trigger_days?: number;
  trigger_window_days?: number;
  trigger_window_hours?: number;
  priority?: FollowUpTaskPriority;
  default_priority?: FollowUpTaskPriority;
}

export interface FollowUpTasksFilterParams {
  due_date?: string;
  owner?: string;
  assigned_to?: string;
  status?: FollowUpTaskStatus | 'all';
  task_type?: FollowUpTaskType | 'all';
  priority?: FollowUpTaskPriority | 'all';
  branch_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}
