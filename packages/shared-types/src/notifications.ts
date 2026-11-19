import type { NotificationChannel } from './integrations.js';

export type NotificationStatus = 
  | 'queued' 
  | 'sending' 
  | 'sent' 
  | 'delivered' 
  | 'failed' 
  | 'cancelled' 
  | 'skipped';

export type NotificationSkipReason = 
  | 'no_consent' 
  | 'outside_send_window' 
  | 'appointment_cancelled' 
  | 'invalid_recipient';

export interface NotificationDto {
  id: string;
  branch_id: string;
  patient_id?: string;
  patient_name?: string;
  appointment_id?: string;
  session_id?: string;
  template_id?: string;
  event_rule_id?: string;
  channel: NotificationChannel;
  recipient: string;
  subject?: string;
  body: string;
  status: NotificationStatus;
  skip_reason?: string;
  idempotency_key: string;
  scheduled_at: string;
  sent_at?: string;
  delivered_at?: string;
  failed_at?: string;
  retry_count: number;
  max_retries: number;
  next_retry_at?: string;
  provider_message_id?: string;
  correlation_id: string;
  failure_reason?: string;
  created_at: string;
  updated_at: string;
}

export type StaffAlertType = 
  | 'upcoming_session' 
  | 'overdue_task' 
  | 'failed_reminder' 
  | 'low_stock' 
  | 'clinical_alert';

export interface StaffAlertDto {
  id: string;
  user_id?: string;
  branch_id: string;
  alert_type: StaffAlertType;
  title: string;
  message: string;
  link_path?: string;
  is_read: boolean;
  read_at?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface WebhookEventDto {
  id: string;
  provider: string;
  provider_event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  received_at: string;
  processed_at?: string;
}

export interface NotificationReportSummaryDto {
  total: number;
  queued: number;
  sending: number;
  sent: number;
  delivered: number;
  failed: number;
  cancelled: number;
  skipped: number;
  delivery_rate_percent: number;
  failure_breakdown: Record<string, number>;
}

export interface NotificationFilterParams {
  status?: NotificationStatus;
  channel?: NotificationChannel;
  date_from?: string;
  date_to?: string;
  search?: string;
  branch_id?: string;
  page?: number;
  limit?: number;
}

export interface RetryNotificationRequest {
  notification_ids?: string[];
}

export interface CancelNotificationRequest {
  notification_ids?: string[];
  reason?: string;
}
