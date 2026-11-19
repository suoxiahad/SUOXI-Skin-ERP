export type IntegrationType = 'email_smtp' | 'sms_gateway';
export type SmsProviderType = 'elitbuzz' | 'generic' | 'mock';
export type SmsAuthMethod = 'query_param' | 'header_bearer' | 'header_api_key' | 'basic_auth';
export type EncryptionType = 'none' | 'ssl' | 'tls';

export interface SmtpConfig {
  host: string;
  port: number;
  encryption: EncryptionType;
  username: string;
  sender_email: string;
  sender_name: string;
}

export interface SmsGatewayConfig {
  provider: SmsProviderType;
  api_url: string;
  auth_method: SmsAuthMethod;
  sender_id: string;
  rate_limit_per_minute: number;
  max_retries: number;
  retry_backoff_sec: number;
  extra_params?: Record<string, string>;
}

export interface IntegrationConfigDto {
  id: string;
  integration_type: IntegrationType;
  name: string;
  is_default: boolean;
  is_active: boolean;
  has_credential: boolean;
  credential_masked: string;
  config: SmtpConfig | SmsGatewayConfig;
  last_test_status: 'never_tested' | 'passed' | 'failed';
  last_tested_at?: string;
  last_test_error?: string;
  created_at: string;
  updated_at: string;
}

export interface SaveIntegrationConfigRequest {
  integration_type: IntegrationType;
  name: string;
  is_default?: boolean;
  is_active?: boolean;
  config: SmtpConfig | SmsGatewayConfig;
  credential?: string; // If omitted, keeps existing credential
}

export interface TestIntegrationRequest {
  recipient: string; // phone number or email address
  sample_message?: string;
}

export interface TestIntegrationResultDto {
  success: boolean;
  message: string;
  provider_message_id?: string;
  error?: string;
}

export type NotificationChannel = 'sms' | 'email' | 'in_app';
export type NotificationLanguage = 'bn' | 'en';
export type NotificationTemplateStatus = 'draft' | 'approved' | 'archived';

export interface NotificationTemplateDto {
  id: string;
  template_code: string;
  channel: NotificationChannel;
  language: NotificationLanguage;
  name: string;
  subject?: string;
  body: string;
  allowed_variables: string[];
  status: NotificationTemplateStatus;
  approved_by?: string;
  approved_by_name?: string;
  approved_at?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SaveTemplateRequest {
  template_code: string;
  channel: NotificationChannel;
  language: NotificationLanguage;
  name: string;
  subject?: string;
  body: string;
  allowed_variables?: string[];
}

export interface TemplatePreviewRequest {
  body: string;
  subject?: string;
  language: NotificationLanguage;
  sample_data?: Record<string, string>;
}

export interface TemplatePreviewResultDto {
  rendered_body: string;
  rendered_subject?: string;
  char_count: number;
  segment_count: number;
  is_unicode: boolean;
}

export type NotificationEventType =
  | 'appointment_confirmed'
  | 'appointment_upcoming'
  | 'appointment_rescheduled'
  | 'appointment_cancelled'
  | 'session_reminder'
  | 'package_expiry'
  | 'payment_due'
  | 'followup_reminder'
  | 'portal_credentials';

export interface NotificationEventRuleDto {
  id: string;
  event_type: NotificationEventType;
  channel: NotificationChannel;
  template_id: string;
  template_name?: string;
  template_code?: string;
  offset_minutes: number;
  quiet_hours_start?: string; // e.g. "21:00:00"
  quiet_hours_end?: string; // e.g. "08:00:00"
  requires_patient_consent: boolean;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SaveEventRuleRequest {
  event_type: NotificationEventType;
  channel: NotificationChannel;
  template_id: string;
  offset_minutes: number;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
  requires_patient_consent?: boolean;
  is_enabled?: boolean;
}

export interface IntegrationLogDto {
  id: string;
  integration_type: IntegrationType;
  status: 'success' | 'failed';
  http_status?: number;
  provider_message_id?: string;
  recipient: string;
  error_text?: string;
  correlation_id: string;
  request_redacted?: Record<string, any>;
  response_redacted?: Record<string, any>;
  created_at: string;
}
