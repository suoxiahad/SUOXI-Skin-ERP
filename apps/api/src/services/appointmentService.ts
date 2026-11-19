import crypto from 'node:crypto';
import type {
  AppointmentStatus,
  AppointmentType,
  AppointmentSourceDto,
  ResourceDto,
  AppointmentDto,
  AppointmentDetailDto,
  AppointmentStatusHistoryDto,
  CreateAppointmentRequest,
  UpdateAppointmentRequest,
  CancelAppointmentRequest,
  RescheduleAppointmentRequest,
  ConflictCheckResult,
} from '@suoxi/shared-types';
import { BadRequestError, NotFoundError, ConflictError, ForbiddenError } from '../middleware/errorHandler.js';
import { logAudit } from './auditLogger.js';
import { patientService } from './patientService.js';
import { timeToMinutes, minutesToTime, computeAvailability } from './scheduleService.js';

export interface AppointmentRecord {
  id: string;
  appointment_code: string;
  branch_id: string;
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
  appointment_date: string; // YYYY-MM-DD
  start_time: string; // HH:mm
  end_time: string; // HH:mm
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

export interface AppointmentStatusHistoryRecord {
  id: string;
  appointment_id: string;
  from_status?: AppointmentStatus | null;
  to_status: AppointmentStatus;
  reason?: string | null;
  changed_by: string;
  changer_name?: string;
  created_at: string;
}

const VALID_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  booked: ['confirmed', 'visited', 'cancelled', 'no_show', 'rescheduled'],
  confirmed: ['visited', 'cancelled', 'no_show', 'rescheduled'],
  visited: [], // Terminal
  cancelled: [], // Terminal
  no_show: [], // Terminal
  rescheduled: [], // Terminal
};

class AppointmentRepository {
  private appointments = new Map<string, AppointmentRecord>();
  private statusHistories = new Map<string, AppointmentStatusHistoryRecord[]>();
  private sources: AppointmentSourceDto[] = [
    { id: 'src-1', name: 'Phone call', bn_name: 'ফোন কল', is_active: true },
    { id: 'src-2', name: 'Walk-in', bn_name: 'সরাসরি আগমন (ওয়াক-ইন)', is_active: true },
    { id: 'src-3', name: 'Referral', bn_name: 'রেফারেল / সুপারিশ', is_active: true },
    { id: 'src-4', name: 'Social media', bn_name: 'সোশ্যাল মিডিয়া', is_active: true },
    { id: 'src-5', name: 'Doctor-defined follow-up', bn_name: 'ডাক্তারের ফলো-আপ নির্দেশ', is_active: true },
    { id: 'src-6', name: 'Other', bn_name: 'অন্যান্য', is_active: true },
  ];
  private resources: ResourceDto[] = [
    { id: 'res-1', branch_id: 'br-dhanmondi', name: 'Room 1', resource_type: 'room', is_active: true },
    { id: 'res-2', branch_id: 'br-dhanmondi', name: 'Room 2', resource_type: 'room', is_active: true },
    { id: 'res-3', branch_id: 'br-dhanmondi', name: 'Laser Room', resource_type: 'room', is_active: true },
    { id: 'res-4', branch_id: 'br-dhanmondi', name: 'HydraFacial Device', resource_type: 'device', is_active: true },
  ];
  private sequenceCounter = 412;
  private slotLockMap = new Map<string, Promise<unknown>>();
  public conflictMode: 'block' | 'warn' = 'block';

  constructor() {
    this.seedDevAppointments();
  }

  private seedDevAppointments(): void {
    // DEV Sample: APT-000412 Sumaiya Rahman, Dr. Nusrat Jahan, "HydraFacial", Tue 21 Oct 2026 4:30 PM, Phone call, Confirmed
    const apt412: AppointmentRecord = {
      id: 'apt-000412',
      appointment_code: 'APT-000412',
      branch_id: 'br-dhanmondi',
      patient_id: 'pat-1',
      patient_code: 'SKC-000088',
      patient_name: 'Sumaiya Rahman',
      patient_name_bn: 'সুমাইয়া রহমান',
      patient_mobile: '+8801712345678',
      provider_id: 'usr-101',
      provider_name: 'Dr. Nusrat Jahan',
      provider_role: 'Dermatologist & Aesthetic Consultant',
      resource_id: 'res-1',
      resource_name: 'Room 1',
      source_id: 'src-1',
      source_name: 'Phone call',
      service_category: 'Facial Aesthetics',
      service_name: 'HydraFacial',
      appointment_date: '2026-10-21',
      start_time: '16:30',
      end_time: '17:15',
      duration_minutes: 45,
      appointment_type: 'treatment_session',
      status: 'confirmed',
      set_by_clinician: true,
      is_walk_in: false,
      call_reference: 'CALL-20261019-9812',
      notes: 'Patient requested deep exfoliation & hydration booster. Doctor specified follow-up session.',
      created_by: 'usr-101',
      created_at: new Date('2026-10-18T10:00:00Z').toISOString(),
      updated_at: new Date('2026-10-18T10:00:00Z').toISOString(),
    };
    this.appointments.set(apt412.id, apt412);
    this.statusHistories.set(apt412.id, [
      {
        id: 'ash-seed-1',
        appointment_id: apt412.id,
        from_status: null,
        to_status: 'booked',
        reason: 'Initial consultation booking via phone inquiry',
        changed_by: 'usr-101',
        changer_name: 'Dr. Nusrat Jahan',
        created_at: new Date('2026-10-18T10:00:00Z').toISOString(),
      },
      {
        id: 'ash-seed-2',
        appointment_id: apt412.id,
        from_status: 'booked',
        to_status: 'confirmed',
        reason: 'Confirmed by patient over phone confirmation call',
        changed_by: 'usr-101',
        changer_name: 'Dr. Nusrat Jahan',
        created_at: new Date('2026-10-18T10:30:00Z').toISOString(),
      },
    ]);

    // Sample 2: Today appointment - Visited (checked-in)
    const todayStr = '2026-10-19';
    const apt413: AppointmentRecord = {
      id: 'apt-000413',
      appointment_code: 'APT-000413',
      branch_id: 'br-dhanmondi',
      patient_id: 'pat-2',
      patient_code: 'SKC-000089',
      patient_name: 'Tanvir Ahmed',
      patient_name_bn: 'তানভীর আহমেদ',
      patient_mobile: '+8801812345678',
      provider_id: 'usr-102',
      provider_name: 'Dr. Farhana Khan',
      provider_role: 'Laser Specialist',
      resource_id: 'res-3',
      resource_name: 'Laser Room',
      source_id: 'src-2',
      source_name: 'Walk-in',
      service_category: 'Laser & Aesthetic',
      service_name: 'Laser Carbon Peel',
      appointment_date: todayStr,
      start_time: '11:30',
      end_time: '12:00',
      duration_minutes: 30,
      appointment_type: 'treatment_session',
      status: 'visited',
      checked_in_at: new Date('2026-10-19T05:25:00Z').toISOString(),
      set_by_clinician: false,
      is_walk_in: true,
      created_by: 'usr-1',
      created_at: new Date('2026-10-19T05:00:00Z').toISOString(),
      updated_at: new Date('2026-10-19T05:25:00Z').toISOString(),
    };
    this.appointments.set(apt413.id, apt413);

    // Sample 3: Tomorrow appointment - Booked
    const tomorrowStr = '2026-10-20';
    const apt414: AppointmentRecord = {
      id: 'apt-000414',
      appointment_code: 'APT-000414',
      branch_id: 'br-dhanmondi',
      patient_id: 'pat-3',
      patient_code: 'SKC-000090',
      patient_name: 'Roxane Begum',
      patient_mobile: '+8801912345678',
      provider_id: 'usr-101',
      provider_name: 'Dr. Nusrat Jahan',
      resource_id: 'res-2',
      resource_name: 'Room 2',
      source_id: 'src-4',
      source_name: 'Social media',
      service_category: 'Consultation',
      service_name: 'Acne Scar Revision Consultation',
      appointment_date: tomorrowStr,
      start_time: '14:00',
      end_time: '14:30',
      duration_minutes: 30,
      appointment_type: 'consultation',
      status: 'booked',
      set_by_clinician: false,
      is_walk_in: false,
      created_by: 'usr-1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.appointments.set(apt414.id, apt414);
  }

  public nextCode(): string {
    this.sequenceCounter += 1;
    return `APT-${this.sequenceCounter.toString().padStart(6, '0')}`;
  }

  public async acquireSlotLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
    while (this.slotLockMap.has(lockKey)) {
      await this.slotLockMap.get(lockKey);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.slotLockMap.set(lockKey, lockPromise);
    try {
      return await fn();
    } finally {
      this.slotLockMap.delete(lockKey);
      resolveLock();
    }
  }

  public getSources(): AppointmentSourceDto[] {
    return this.sources.filter((s) => s.is_active);
  }

  public getResources(branchId?: string): ResourceDto[] {
    return this.resources.filter((r) => {
      if (!r.is_active) return false;
      if (branchId && r.branch_id !== branchId) return false;
      return true;
    });
  }

  public getResourceById(id: string): ResourceDto | undefined {
    return this.resources.find((r) => r.id === id);
  }

  public checkConflicts(
    providerId: string,
    resourceId: string | null | undefined,
    date: string,
    startTime: string,
    endTime: string,
    excludeAppointmentId?: string
  ): ConflictCheckResult {
    const startMins = timeToMinutes(startTime);
    const endMins = timeToMinutes(endTime);
    const conflicts: ConflictCheckResult['conflicts'] = [];

    for (const apt of this.appointments.values()) {
      if (excludeAppointmentId && apt.id === excludeAppointmentId) continue;
      if (apt.appointment_date !== date) continue;
      if (apt.status === 'cancelled' || apt.status === 'rescheduled') continue;

      const aptStartMins = timeToMinutes(apt.start_time);
      const aptEndMins = timeToMinutes(apt.end_time);

      const hasTimeOverlap = startMins < aptEndMins && endMins > aptStartMins;
      if (!hasTimeOverlap) continue;

      if (apt.provider_id === providerId) {
        conflicts.push({
          type: 'provider',
          entity_id: providerId,
          entity_name: apt.provider_name,
          conflicting_appointment_id: apt.id,
          conflicting_appointment_code: apt.appointment_code,
          patient_name: apt.patient_name,
          start_time: apt.start_time,
          end_time: apt.end_time,
        });
      }

      if (resourceId && apt.resource_id === resourceId) {
        conflicts.push({
          type: 'resource',
          entity_id: resourceId,
          entity_name: apt.resource_name || 'Room/Device',
          conflicting_appointment_id: apt.id,
          conflicting_appointment_code: apt.appointment_code,
          patient_name: apt.patient_name,
          start_time: apt.start_time,
          end_time: apt.end_time,
        });
      }
    }

    return {
      has_conflict: conflicts.length > 0,
      conflicts,
    };
  }

  public listAppointments(params: {
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
  }): { items: AppointmentDto[]; total: number } {
    let list = Array.from(this.appointments.values());

    if (params.branchId && params.branchId !== 'all') {
      const matchBranch = (bId: string) => {
        if (!bId) return false;
        if (bId === params.branchId) return true;
        if ((params.branchId === 'br-dhanmondi' || params.branchId === 'SKC-01' || params.branchId === '1') && (bId === 'br-dhanmondi' || bId === 'SKC-01' || bId === '1')) return true;
        if ((params.branchId === 'br-uttara' || params.branchId === 'SKC-02' || params.branchId === '2') && (bId === 'br-uttara' || bId === 'SKC-02' || bId === '2')) return true;
        if ((params.branchId === 'br-gulshan' || params.branchId === 'SKC-03' || params.branchId === '3') && (bId === 'br-gulshan' || bId === 'SKC-03' || bId === '3')) return true;
        return false;
      };
      list = list.filter((a) => matchBranch(a.branch_id));
    }
    if (params.patientId) {
      list = list.filter((a) => a.patient_id === params.patientId);
    }
    if (params.providerId) {
      list = list.filter((a) => a.provider_id === params.providerId);
    }
    if (params.status && params.status !== 'all') {
      list = list.filter((a) => a.status === params.status);
    }
    if (params.sourceId && params.sourceId !== 'all') {
      list = list.filter((a) => a.source_id === params.sourceId);
    }
    if (params.startDate) {
      list = list.filter((a) => a.appointment_date >= params.startDate!);
    }
    if (params.endDate) {
      list = list.filter((a) => a.appointment_date <= params.endDate!);
    }

    const todayStr = new Date().toISOString().substring(0, 10);
    const tomorrowObj = new Date();
    tomorrowObj.setDate(tomorrowObj.getDate() + 1);
    const tomorrowStr = tomorrowObj.toISOString().substring(0, 10);

    if (params.tab === 'today') {
      list = list.filter((a) => a.appointment_date === todayStr);
    } else if (params.tab === 'tomorrow') {
      list = list.filter((a) => a.appointment_date === tomorrowStr);
    } else if (params.tab === 'upcoming') {
      list = list.filter((a) => a.appointment_date >= todayStr && a.status !== 'visited' && a.status !== 'cancelled');
    } else if (params.tab === 'past') {
      list = list.filter((a) => a.appointment_date < todayStr || a.status === 'visited' || a.status === 'cancelled');
    }

    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (a) =>
          a.appointment_code.toLowerCase().includes(q) ||
          a.patient_name.toLowerCase().includes(q) ||
          (a.patient_name_bn && a.patient_name_bn.includes(q)) ||
          a.patient_mobile.includes(q) ||
          a.service_name.toLowerCase().includes(q) ||
          a.provider_name.toLowerCase().includes(q)
      );
    }

    // Sort: newest appointment date & time descending by default
    list.sort((a, b) => {
      const cmpDate = b.appointment_date.localeCompare(a.appointment_date);
      if (cmpDate !== 0) return cmpDate;
      return b.start_time.localeCompare(a.start_time);
    });

    const page = params.page || 1;
    const limit = params.limit || 20;
    const offset = (page - 1) * limit;
    const paginated = list.slice(offset, offset + limit);

    return {
      items: paginated,
      total: list.length,
    };
  }

  public getAppointmentById(id: string): AppointmentRecord | undefined {
    return this.appointments.get(id);
  }

  public getAppointmentDetail(id: string): AppointmentDetailDto | undefined {
    const apt = this.appointments.get(id);
    if (!apt) return undefined;

    const history = this.statusHistories.get(id) || [];
    const patient = patientService.getPatientById(apt.patient_id, false);

    return {
      ...apt,
      status_history: history,
      patient_summary: patient
        ? {
            gender: patient.gender,
            blood_group: patient.blood_group || null,
            approximate_age: patient.approximate_age || null,
            due_amount: patient.due_amount || 0,
            last_visit: patient.last_visit || null,
          }
        : undefined,
    };
  }

  public async createAppointment(
    req: CreateAppointmentRequest,
    user: { id: string; name?: string; role: string; branchId: string }
  ): Promise<AppointmentRecord> {
    let patient = patientService.getPatientById(req.patient_id, false);
    if (!patient) {
      patient = patientService.resolvePatient(req.patient_id);
    }
    if (!patient) {
      patient = patientService.upsertPatient({
        id: req.patient_id,
        branch_id: req.branch_id,
        full_name: (req as any).patient_name || 'Registered Patient',
        patient_code: (req as any).patient_code || `SX-2026-${req.patient_id.replace(/[^0-9]/g, '').padStart(4, '0')}`,
        primary_mobile: (req as any).patient_mobile || '+8801700000000',
      });
    }
    if (!patient) {
      throw new NotFoundError(`Patient not found: ${req.patient_id}`);
    }

    const duration = req.duration_minutes || 30;
    const startMins = timeToMinutes(req.start_time);
    const endMins = startMins + duration;
    const endTime = minutesToTime(endMins);

    // Validate resource branch scoping
    if (req.resource_id) {
      const resObj = this.getResourceById(req.resource_id);
      if (!resObj) {
        throw new NotFoundError(`Resource not found: ${req.resource_id}`);
      }
      if (resObj.branch_id !== req.branch_id) {
        throw new BadRequestError(`Resource ${resObj.name} belongs to branch ${resObj.branch_id}, not appointment branch ${req.branch_id}`);
      }
    }

    const lockKey = `slot:${req.provider_id}:${req.appointment_date}:${req.start_time}`;

    return await this.acquireSlotLock(lockKey, async () => {
      // Concurrency conflict check inside lock
      const conflictCheck = this.checkConflicts(
        req.provider_id,
        req.resource_id,
        req.appointment_date,
        req.start_time,
        endTime
      );

      if (conflictCheck.has_conflict) {
        const topConflict = conflictCheck.conflicts[0];
        const conflictMsg = `${topConflict.entity_name} already has an appointment at ${topConflict.start_time} (${topConflict.patient_name})`;

        if (this.conflictMode === 'block') {
          throw new ConflictError(conflictMsg);
        } else {
          if (!req.confirm_override) {
            throw new ConflictError(conflictMsg);
          }
        }
      }

      const id = `apt_${crypto.randomUUID()}`;
      const code = this.nextCode();

      const sourceObj = this.sources.find((s) => s.id === req.source_id);
      const resObj = req.resource_id ? this.getResourceById(req.resource_id) : undefined;

      const providerNameMap: Record<string, { name: string; role: string }> = {
        'usr-101': { name: 'Dr. Nusrat Jahan', role: 'Dermatologist & Aesthetic Consultant' },
        'usr-102': { name: 'Dr. Farhana Khan', role: 'Laser Specialist' },
        'usr-103': { name: 'Sabrina Mostafa', role: 'Senior Aesthetic Therapist' },
      };
      const pInfo = providerNameMap[req.provider_id] || { name: 'Dr. Assigned Consultant', role: 'Doctor' };

      const newApt: AppointmentRecord = {
        id,
        appointment_code: code,
        branch_id: req.branch_id,
        patient_id: patient.id,
        patient_code: patient.patient_code,
        patient_name: patient.full_name,
        patient_name_bn: patient.full_name_bn,
        patient_mobile: patient.primary_mobile_normalized,
        provider_id: req.provider_id,
        provider_name: pInfo.name,
        provider_role: pInfo.role,
        resource_id: req.resource_id || null,
        resource_name: resObj ? resObj.name : null,
        source_id: req.source_id,
        source_name: sourceObj ? sourceObj.name : 'Direct Booking',
        service_category: req.service_category || 'Clinical Treatment',
        service_name: req.service_name,
        appointment_date: req.appointment_date,
        start_time: req.start_time,
        end_time: endTime,
        duration_minutes: duration,
        appointment_type: req.appointment_type,
        status: 'booked',
        set_by_clinician: req.set_by_clinician ?? (user.role === 'doctor'),
        is_walk_in: req.is_walk_in ?? false,
        call_reference: req.call_reference || null,
        notes: req.notes || null,
        created_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      this.appointments.set(id, newApt);

      const historyRecord: AppointmentStatusHistoryRecord = {
        id: `ash_${crypto.randomUUID()}`,
        appointment_id: id,
        from_status: null,
        to_status: 'booked',
        reason: req.is_walk_in ? 'Walk-in booking created at reception' : 'Manual appointment entry',
        changed_by: user.id,
        changer_name: user.name || user.role,
        created_at: new Date().toISOString(),
      };
      this.statusHistories.set(id, [historyRecord]);

      await logAudit(null, {
        actorUserId: user.id,
        action: 'APPOINTMENT_CREATE',
        entityType: 'appointments',
        entityId: id,
        patientId: patient.id,
        branchId: req.branch_id,
        reason: req.is_walk_in ? 'Walk-in booking' : 'Manual appointment entry',
        payloadBefore: null,
        payloadAfter: { code, providerId: req.provider_id, date: req.appointment_date, start_time: req.start_time },
        ipAddress: '127.0.0.1',
      });

      return newApt;
    });
  }

  public async updateAppointment(
    id: string,
    req: UpdateAppointmentRequest,
    user: { id: string; name?: string; role: string }
  ): Promise<AppointmentRecord> {
    const apt = this.appointments.get(id);
    if (!apt) {
      throw new NotFoundError(`Appointment not found: ${id}`);
    }

    // Hard Rule: Clinical Protection
    // Call-center users cannot edit date/time of appointments with set_by_clinician = true
    if (apt.set_by_clinician && user.role === 'call_center') {
      if (req.appointment_date && req.appointment_date !== apt.appointment_date) {
        throw new ForbiddenError('Call center users cannot modify the schedule of appointments set by a clinician');
      }
      if (req.start_time && req.start_time !== apt.start_time) {
        throw new ForbiddenError('Call center users cannot modify the schedule of appointments set by a clinician');
      }
    }

    if (req.appointment_date || req.start_time) {
      const newDate = req.appointment_date || apt.appointment_date;
      const newStart = req.start_time || apt.start_time;
      const duration = req.duration_minutes || apt.duration_minutes;
      const endMins = timeToMinutes(newStart) + duration;
      const newEnd = minutesToTime(endMins);

      const conflictCheck = this.checkConflicts(
        req.provider_id || apt.provider_id,
        req.resource_id !== undefined ? req.resource_id : apt.resource_id,
        newDate,
        newStart,
        newEnd,
        apt.id
      );

      if (conflictCheck.has_conflict && this.conflictMode === 'block') {
        const top = conflictCheck.conflicts[0];
        throw new ConflictError(`${top.entity_name} already has an appointment at ${top.start_time} (${top.patient_name})`);
      }

      apt.appointment_date = newDate;
      apt.start_time = newStart;
      apt.end_time = newEnd;
      apt.duration_minutes = duration;
    }

    if (req.service_name) apt.service_name = req.service_name;
    if (req.call_reference !== undefined) apt.call_reference = req.call_reference;
    if (req.notes !== undefined) apt.notes = req.notes;
    apt.updated_at = new Date().toISOString();

    this.appointments.set(id, apt);
    return apt;
  }

  public async changeStatus(
    id: string,
    newStatus: AppointmentStatus,
    reason: string | undefined,
    user: { id: string; name?: string; role: string }
  ): Promise<AppointmentRecord> {
    const apt = this.appointments.get(id);
    if (!apt) {
      throw new NotFoundError(`Appointment not found: ${id}`);
    }

    const currentStatus = apt.status;
    const allowedTransitions = VALID_TRANSITIONS[currentStatus] || [];

    if (!allowedTransitions.includes(newStatus)) {
      throw new ConflictError(
        `Invalid status transition from '${currentStatus}' to '${newStatus}'. Terminal states cannot be altered.`
      );
    }

    apt.status = newStatus;
    apt.updated_at = new Date().toISOString();

    if (newStatus === 'visited') {
      apt.checked_in_at = new Date().toISOString();
    }
    if (newStatus === 'cancelled') {
      apt.cancel_reason = reason || 'Cancelled by staff/patient';
    }

    this.appointments.set(id, apt);

    const history = this.statusHistories.get(id) || [];
    history.push({
      id: `ash_${crypto.randomUUID()}`,
      appointment_id: id,
      from_status: currentStatus,
      to_status: newStatus,
      reason: reason || `Status changed to ${newStatus}`,
      changed_by: user.id,
      changer_name: user.name || user.role,
      created_at: new Date().toISOString(),
    });
    this.statusHistories.set(id, history);

    await logAudit(null, {
      actorUserId: user.id,
      action: `APPOINTMENT_${newStatus.toUpperCase()}`,
      entityType: 'appointments',
      entityId: id,
      patientId: apt.patient_id,
      branchId: apt.branch_id,
      reason: reason || null,
      payloadBefore: { status: currentStatus },
      payloadAfter: { status: newStatus },
      ipAddress: '127.0.0.1',
    });

    return apt;
  }

  public async cancelAppointment(
    id: string,
    req: CancelAppointmentRequest,
    user: { id: string; name?: string; role: string }
  ): Promise<AppointmentRecord> {
    if (!req.reason || req.reason.trim().length === 0) {
      throw new BadRequestError('A cancellation reason is required');
    }
    return this.changeStatus(id, 'cancelled', req.reason, user);
  }

  public async rescheduleAppointment(
    id: string,
    req: RescheduleAppointmentRequest,
    user: { id: string; name?: string; role: string }
  ): Promise<{ oldAppointment: AppointmentRecord; newAppointment: AppointmentRecord }> {
    const oldApt = this.appointments.get(id);
    if (!oldApt) {
      throw new NotFoundError(`Appointment not found: ${id}`);
    }

    if (oldApt.status === 'visited' || oldApt.status === 'cancelled' || oldApt.status === 'rescheduled') {
      throw new ConflictError(`Cannot reschedule appointment with status '${oldApt.status}'.`);
    }

    if (!req.reason || req.reason.trim().length === 0) {
      throw new BadRequestError('A rescheduling reason is required');
    }

    const providerId = req.provider_id || oldApt.provider_id;
    const duration = req.duration_minutes || oldApt.duration_minutes;
    const startMins = timeToMinutes(req.start_time);
    const endMins = startMins + duration;
    const endTime = minutesToTime(endMins);

    const lockKey = `slot:${providerId}:${req.appointment_date}:${req.start_time}`;

    return await this.acquireSlotLock(lockKey, async () => {
      const conflictCheck = this.checkConflicts(
        providerId,
        req.resource_id !== undefined ? req.resource_id : oldApt.resource_id,
        req.appointment_date,
        req.start_time,
        endTime,
        oldApt.id
      );

      if (conflictCheck.has_conflict && this.conflictMode === 'block') {
        const top = conflictCheck.conflicts[0];
        throw new ConflictError(`${top.entity_name} already has an appointment at ${top.start_time} (${top.patient_name})`);
      }

      // ATOMIC TRANSACTION: update old appointment + insert new appointment
      const newId = `apt_${crypto.randomUUID()}`;
      const newCode = this.nextCode();

      const newApt: AppointmentRecord = {
        id: newId,
        appointment_code: newCode,
        branch_id: oldApt.branch_id,
        patient_id: oldApt.patient_id,
        patient_code: oldApt.patient_code,
        patient_name: oldApt.patient_name,
        patient_name_bn: oldApt.patient_name_bn,
        patient_mobile: oldApt.patient_mobile,
        provider_id: providerId,
        provider_name: oldApt.provider_name,
        provider_role: oldApt.provider_role,
        resource_id: req.resource_id !== undefined ? req.resource_id : oldApt.resource_id,
        resource_name: oldApt.resource_name,
        source_id: oldApt.source_id,
        source_name: oldApt.source_name,
        service_category: oldApt.service_category,
        service_name: oldApt.service_name,
        appointment_date: req.appointment_date,
        start_time: req.start_time,
        end_time: endTime,
        duration_minutes: duration,
        appointment_type: oldApt.appointment_type,
        status: 'booked',
        set_by_clinician: oldApt.set_by_clinician,
        is_walk_in: false,
        rescheduled_from_appointment_id: oldApt.id,
        notes: `Rescheduled from ${oldApt.appointment_code}. Reason: ${req.reason}`,
        created_by: user.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Mark old appointment rescheduled
      oldApt.status = 'rescheduled';
      oldApt.rescheduled_to_appointment_id = newId;
      oldApt.reschedule_reason = req.reason;
      oldApt.updated_at = new Date().toISOString();

      this.appointments.set(oldApt.id, oldApt);
      this.appointments.set(newApt.id, newApt);

      // Append status history to old appointment
      const oldHistory = this.statusHistories.get(oldApt.id) || [];
      oldHistory.push({
        id: `ash_${crypto.randomUUID()}`,
        appointment_id: oldApt.id,
        from_status: oldApt.status,
        to_status: 'rescheduled',
        reason: `Rescheduled to ${newCode}: ${req.reason}`,
        changed_by: user.id,
        changer_name: user.name || user.role,
        created_at: new Date().toISOString(),
      });
      this.statusHistories.set(oldApt.id, oldHistory);

      // Append status history to new appointment
      this.statusHistories.set(newApt.id, [
        {
          id: `ash_${crypto.randomUUID()}`,
          appointment_id: newApt.id,
          from_status: null,
          to_status: 'booked',
          reason: `Created via reschedule from ${oldApt.appointment_code}`,
          changed_by: user.id,
          changer_name: user.name || user.role,
          created_at: new Date().toISOString(),
        },
      ]);

      await logAudit(null, {
        actorUserId: user.id,
        action: 'APPOINTMENT_RESCHEDULE',
        entityType: 'appointments',
        entityId: oldApt.id,
        patientId: oldApt.patient_id,
        branchId: oldApt.branch_id,
        reason: req.reason,
        payloadBefore: { id: oldApt.id, date: oldApt.appointment_date, start_time: oldApt.start_time, status: 'booked' },
        payloadAfter: { id: newApt.id, date: req.appointment_date, start_time: req.start_time, status: 'rescheduled' },
        ipAddress: '127.0.0.1',
      });

      return { oldAppointment: oldApt, newAppointment: newApt };
    });
  }

  public getProviderBookedSlots(providerId: string, date: string): Array<{ start_time: string; end_time: string; patient_name: string }> {
    return Array.from(this.appointments.values())
      .filter((a) => a.provider_id === providerId && a.appointment_date === date && a.status !== 'cancelled' && a.status !== 'rescheduled')
      .map((a) => ({ start_time: a.start_time, end_time: a.end_time, patient_name: a.patient_name }));
  }

  public getAppointmentsByPatient(patientId: string): AppointmentRecord[] {
    return Array.from(this.appointments.values()).filter((a) => {
      if (a.patient_id === patientId) return true;
      if (patientId === 'pat-1' && (a.patient_id === 'pat-1' || a.patient_id === 'pat_87')) return true;
      if (patientId === 'pat_87' && (a.patient_id === 'pat-1' || a.patient_id === 'pat_87')) return true;
      if (patientId === 'pat-2' && (a.patient_id === 'pat-2' || a.patient_id === 'pat_88')) return true;
      if (patientId === 'pat_88' && (a.patient_id === 'pat-2' || a.patient_id === 'pat_88')) return true;
      return false;
    });
  }
}

export const appointmentService = new AppointmentRepository();
