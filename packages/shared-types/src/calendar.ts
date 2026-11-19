import type { AppointmentStatus } from './appointments.js';

export interface CalendarAppointmentItemDto {
  id: string;
  appointment_code: string;
  branch_id: string;
  patient_id: string;
  patient_name: string;
  patient_mobile?: string;
  provider_id: string;
  provider_name: string;
  provider_role?: string;
  resource_id?: string | null;
  resource_name?: string | null;
  service_name: string;
  service_category?: string | null;
  appointment_date: string; // YYYY-MM-DD (Asia/Dhaka wall-clock)
  start_time: string; // HH:mm
  end_time: string; // HH:mm
  duration_minutes: number;
  status: AppointmentStatus;
  set_by_clinician: boolean;
  is_walk_in: boolean;
  notes?: string | null;
}

export interface CalendarTimeOffItemDto {
  id: string;
  provider_id: string;
  start_datetime: string;
  end_datetime: string;
  reason?: string | null;
}

export interface CalendarScheduleItemDto {
  id: string;
  provider_id: string;
  branch_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  slot_duration_minutes: number;
}

export interface CalendarSettingsDto {
  drag_reschedule_enabled: boolean;
  operating_start_time: string;
  operating_end_time: string;
}

export interface CalendarResponseDto {
  from: string;
  to: string;
  appointments: CalendarAppointmentItemDto[];
  schedules: CalendarScheduleItemDto[];
  timeOffs: CalendarTimeOffItemDto[];
  settings: CalendarSettingsDto;
}
