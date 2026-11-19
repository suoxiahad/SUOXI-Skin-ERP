export type AppointmentStatus =
  | 'booked'
  | 'confirmed'
  | 'visited'
  | 'cancelled'
  | 'no_show'
  | 'rescheduled';

export type AppointmentType =
  | 'consultation'
  | 'treatment_session'
  | 'follow_up'
  | 'other';

export interface AppointmentSourceDto {
  id: string;
  name: string;
  bn_name?: string | null;
  is_active: boolean;
}

export interface ResourceDto {
  id: string;
  branch_id: string;
  name: string;
  resource_type: 'room' | 'device';
  is_active: boolean;
}

export interface ProviderScheduleDto {
  id: string;
  provider_id: string;
  branch_id: string;
  day_of_week: number; // 0=Sun, 1=Mon, ..., 6=Sat
  start_time: string; // HH:mm
  end_time: string; // HH:mm
  slot_duration_minutes: number;
  is_active: boolean;
}

export interface ProviderTimeOffDto {
  id: string;
  provider_id: string;
  start_datetime: string;
  end_datetime: string;
  reason?: string | null;
}

export interface AppointmentStatusHistoryDto {
  id: string;
  appointment_id: string;
  from_status?: AppointmentStatus | null;
  to_status: AppointmentStatus;
  reason?: string | null;
  changed_by: string;
  changer_name?: string;
  created_at: string;
}

export interface AppointmentDto {
  id: string;
  appointment_code: string;
  branch_id: string;
  branch_name?: string;
  patient_id: string;
  patient_code: string;
  patient_name: string;
  patient_name_bn?: string | null;
  patient_mobile: string;
  provider_id: string;
  provider_name: string;
  provider_role?: string;
  resource_id?: string | null;
  resource_name?: string | null;
  source_id: string;
  source_name: string;
  service_category?: string | null;
  service_name: string;
  appointment_date: string; // YYYY-MM-DD (Asia/Dhaka wall-clock)
  start_time: string; // HH:mm (Asia/Dhaka wall-clock)
  end_time: string; // HH:mm (Asia/Dhaka wall-clock)
  duration_minutes: number;
  appointment_type: AppointmentType;
  status: AppointmentStatus;
  set_by_clinician: boolean;
  is_walk_in: boolean;
  call_reference?: string | null;
  rescheduled_to_appointment_id?: string | null;
  rescheduled_from_appointment_id?: string | null;
  cancel_reason?: string | null;
  reschedule_reason?: string | null;
  checked_in_at?: string | null;
  origin_session_id?: string | null;
  notes?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AppointmentDetailDto extends AppointmentDto {
  status_history: AppointmentStatusHistoryDto[];
  patient_summary?: {
    gender: string;
    blood_group?: string | null;
    approximate_age?: number | null;
    due_amount: number;
    last_visit?: string | null;
  };
}

export interface CreateAppointmentRequest {
  patient_id: string;
  branch_id: string;
  provider_id: string;
  resource_id?: string | null;
  source_id: string;
  service_category?: string | null;
  service_name: string;
  appointment_date: string; // YYYY-MM-DD
  start_time: string; // HH:mm
  duration_minutes?: number;
  appointment_type: AppointmentType;
  set_by_clinician?: boolean;
  is_walk_in?: boolean;
  call_reference?: string | null;
  notes?: string | null;
  confirm_override?: boolean;
  override_reason?: string | null;
}

export interface UpdateAppointmentRequest {
  provider_id?: string;
  resource_id?: string | null;
  appointment_date?: string;
  start_time?: string;
  duration_minutes?: number;
  service_name?: string;
  call_reference?: string | null;
  notes?: string | null;
}

export interface ChangeAppointmentStatusRequest {
  status: AppointmentStatus;
  reason?: string;
}

export interface CancelAppointmentRequest {
  reason: string;
}

export interface RescheduleAppointmentRequest {
  appointment_date: string; // YYYY-MM-DD
  start_time: string; // HH:mm
  duration_minutes?: number;
  resource_id?: string | null;
  provider_id?: string;
  reason: string;
  confirm_override?: boolean;
  override_reason?: string | null;
}

export interface TimeSlotDto {
  start_time: string; // HH:mm
  end_time: string; // HH:mm
  is_available: boolean;
  conflict_reason?: string;
}

export interface SlotAvailabilityDto {
  provider_id: string;
  provider_name: string;
  date: string;
  day_of_week: number;
  is_working_day: boolean;
  slots: TimeSlotDto[];
}

export interface ConflictCheckResult {
  has_conflict: boolean;
  conflicts: Array<{
    type: 'provider' | 'resource';
    entity_id: string;
    entity_name: string;
    conflicting_appointment_id: string;
    conflicting_appointment_code: string;
    patient_name: string;
    start_time: string;
    end_time: string;
  }>;
}
