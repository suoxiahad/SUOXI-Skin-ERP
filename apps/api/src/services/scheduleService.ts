import type {
  ProviderScheduleDto,
  ProviderTimeOffDto,
  TimeSlotDto,
  SlotAvailabilityDto,
} from '@suoxi/shared-types';

export interface ProviderScheduleRecord {
  id: string;
  provider_id: string;
  branch_id: string;
  day_of_week: number; // 0=Sun, 1=Mon, ..., 6=Sat
  start_time: string; // HH:mm
  end_time: string; // HH:mm
  slot_duration_minutes: number;
  is_active: boolean;
}

export interface ProviderTimeOffRecord {
  id: string;
  provider_id: string;
  start_datetime: string; // YYYY-MM-DDTHH:mm:ss
  end_datetime: string; // YYYY-MM-DDTHH:mm:ss
  reason?: string | null;
}

class ScheduleRepository {
  private schedules: ProviderScheduleRecord[] = [
    // Dr. Nusrat Jahan (usr-101) - Dermatologist & Aesthetic Consultant
    // Works Sat (6), Sun (0), Mon (1), Tue (2), Wed (3) from 10:00 to 18:00
    { id: 'sch-101-0', provider_id: 'usr-101', branch_id: 'br-dhanmondi', day_of_week: 0, start_time: '10:00', end_time: '18:00', slot_duration_minutes: 30, is_active: true },
    { id: 'sch-101-1', provider_id: 'usr-101', branch_id: 'br-dhanmondi', day_of_week: 1, start_time: '10:00', end_time: '18:00', slot_duration_minutes: 30, is_active: true },
    { id: 'sch-101-2', provider_id: 'usr-101', branch_id: 'br-dhanmondi', day_of_week: 2, start_time: '10:00', end_time: '18:00', slot_duration_minutes: 30, is_active: true },
    { id: 'sch-101-3', provider_id: 'usr-101', branch_id: 'br-dhanmondi', day_of_week: 3, start_time: '10:00', end_time: '18:00', slot_duration_minutes: 30, is_active: true },
    { id: 'sch-101-6', provider_id: 'usr-101', branch_id: 'br-dhanmondi', day_of_week: 6, start_time: '10:00', end_time: '18:00', slot_duration_minutes: 30, is_active: true },

    // Dr. Farhana Khan (usr-102) - Laser Specialist
    // Works Sun (0), Mon (1), Tue (2), Wed (3), Thu (4) from 11:00 to 19:00
    { id: 'sch-102-0', provider_id: 'usr-102', branch_id: 'br-dhanmondi', day_of_week: 0, start_time: '11:00', end_time: '19:00', slot_duration_minutes: 30, is_active: true },
    { id: 'sch-102-1', provider_id: 'usr-102', branch_id: 'br-dhanmondi', day_of_week: 1, start_time: '11:00', end_time: '19:00', slot_duration_minutes: 30, is_active: true },
    { id: 'sch-102-2', provider_id: 'usr-102', branch_id: 'br-dhanmondi', day_of_week: 2, start_time: '11:00', end_time: '19:00', slot_duration_minutes: 30, is_active: true },
    { id: 'sch-102-3', provider_id: 'usr-102', branch_id: 'br-dhanmondi', day_of_week: 3, start_time: '11:00', end_time: '19:00', slot_duration_minutes: 30, is_active: true },
    { id: 'sch-102-4', provider_id: 'usr-102', branch_id: 'br-dhanmondi', day_of_week: 4, start_time: '11:00', end_time: '19:00', slot_duration_minutes: 30, is_active: true },

    // Default catch-all schedule for any doctor (Sun-Thu 10:00-18:00)
  ];

  private timeOffs: ProviderTimeOffRecord[] = [
    {
      id: 'pto-102-1',
      provider_id: 'usr-102',
      start_datetime: '2026-10-21T14:00:00',
      end_datetime: '2026-10-21T16:00:00',
      reason: 'Clinical Workshop',
    },
    {
      id: 'pto-102-2',
      provider_id: 'usr-102',
      start_datetime: '2026-10-22T00:00:00',
      end_datetime: '2026-10-22T23:59:59',
      reason: 'Aesthetic Dermatology Conference',
    },
  ];

  public getAllSchedules(branchId?: string, providerId?: string): ProviderScheduleRecord[] {
    return this.schedules.filter((s) => {
      if (!s.is_active) return false;
      if (branchId && branchId !== 'all') {
        const normReq = branchId === 'SKC-01' || branchId === '1' ? 'br-dhanmondi' : branchId;
        const normSchedule = s.branch_id === 'SKC-01' || s.branch_id === '1' ? 'br-dhanmondi' : s.branch_id;
        if (normReq !== normSchedule) return false;
      }
      if (providerId && providerId !== 'all' && s.provider_id !== providerId) return false;
      return true;
    });
  }

  public getAllTimeOffs(from?: string, to?: string, providerId?: string): ProviderTimeOffRecord[] {
    return this.timeOffs.filter((toItem) => {
      if (providerId && toItem.provider_id !== providerId) return false;
      const startDate = toItem.start_datetime.substring(0, 10);
      const endDate = toItem.end_datetime.substring(0, 10);
      if (from && endDate < from) return false;
      if (to && startDate > to) return false;
      return true;
    });
  }

  public getSchedulesByProvider(providerId: string): ProviderScheduleRecord[] {
    const list = this.schedules.filter((s) => s.provider_id === providerId && s.is_active);
    if (list.length > 0) return list;

    // Fallback schedule for test providers
    return [0, 1, 2, 3, 4, 6].map((day) => ({
      id: `default-${providerId}-${day}`,
      provider_id: providerId,
      branch_id: 'br-dhanmondi',
      day_of_week: day,
      start_time: '10:00',
      end_time: '18:00',
      slot_duration_minutes: 30,
      is_active: true,
    }));
  }

  public getTimeOffsByProvider(providerId: string, date: string): ProviderTimeOffRecord[] {
    return this.timeOffs.filter((to) => {
      if (to.provider_id !== providerId) return false;
      const startDate = to.start_datetime.substring(0, 10);
      const endDate = to.end_datetime.substring(0, 10);
      return date >= startDate && date <= endDate;
    });
  }

  public addTimeOff(record: ProviderTimeOffRecord): void {
    this.timeOffs.push(record);
  }
}

export const scheduleRepository = new ScheduleRepository();

/**
 * Parses "HH:mm" into minutes from midnight.
 */
export function timeToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Converts minutes from midnight into "HH:mm".
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Computes available slots for a provider on a specific date.
 */
export function computeAvailability(
  providerId: string,
  providerName: string,
  dateStr: string,
  bookedRanges: Array<{ start_time: string; end_time: string; patient_name?: string }>,
  customDurationMinutes = 30
): SlotAvailabilityDto {
  const dateObj = new Date(`${dateStr}T12:00:00Z`);
  const dayOfWeek = dateObj.getUTCDay(); // 0 = Sun, 1 = Mon ... 6 = Sat

  const schedules = scheduleRepository.getSchedulesByProvider(providerId);
  const daySchedule = schedules.find((s) => s.day_of_week === dayOfWeek && s.is_active);

  if (!daySchedule) {
    return {
      provider_id: providerId,
      provider_name: providerName,
      date: dateStr,
      day_of_week: dayOfWeek,
      is_working_day: false,
      slots: [],
    };
  }

  const timeOffs = scheduleRepository.getTimeOffsByProvider(providerId, dateStr);
  const stepMinutes = daySchedule.slot_duration_minutes || 30;
  const slotDuration = customDurationMinutes > 0 ? customDurationMinutes : stepMinutes;
  const startMins = timeToMinutes(daySchedule.start_time);
  const endMins = timeToMinutes(daySchedule.end_time);

  const slots: TimeSlotDto[] = [];

  for (let current = startMins; current + stepMinutes <= endMins; current += stepMinutes) {
    const slotStartStr = minutesToTime(current);
    const slotEndStr = minutesToTime(current + slotDuration);

    // Check collision with time-offs
    const inTimeOff = timeOffs.some((to) => {
      const toStartMins = timeToMinutes(to.start_datetime.substring(11, 16) || '00:00');
      const toEndMins = timeToMinutes(to.end_datetime.substring(11, 16) || '23:59');
      return current < toEndMins && current + slotDuration > toStartMins;
    });

    if (inTimeOff) {
      slots.push({
        start_time: slotStartStr,
        end_time: slotEndStr,
        is_available: false,
        conflict_reason: 'Provider is on approved leave during this time slot',
      });
      continue;
    }

    // Check collision with existing booked appointments
    const conflictingBooking = bookedRanges.find((b) => {
      const bStartMins = timeToMinutes(b.start_time);
      const bEndMins = timeToMinutes(b.end_time);
      return current < bEndMins && current + slotDuration > bStartMins;
    });

    if (conflictingBooking) {
      slots.push({
        start_time: slotStartStr,
        end_time: slotEndStr,
        is_available: false,
        conflict_reason: `Booked for ${conflictingBooking.patient_name || 'Patient'}`,
      });
    } else {
      slots.push({
        start_time: slotStartStr,
        end_time: slotEndStr,
        is_available: true,
      });
    }
  }

  return {
    provider_id: providerId,
    provider_name: providerName,
    date: dateStr,
    day_of_week: dayOfWeek,
    is_working_day: true,
    slots,
  };
}
