import crypto from 'node:crypto';
import type {
  CallCenterAppointmentDto,
  CallCenterDashboardSummaryDto,
  FollowUpTaskDto,
  CallContactLogDto,
  LogCallRequest,
  FollowUpRuleDto,
  UpdateFollowUpRuleRequest,
  FollowUpTasksFilterParams,
  FollowUpTaskType,
  FollowUpTaskStatus,
  FollowUpTaskPriority,
  CallOutcome,
} from '@suoxi/shared-types';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from '../middleware/errorHandler.js';
import { patientService } from './patientService.js';
import { appointmentService } from './appointmentService.js';
import { staffAlertService } from './staffAlertService.js';
import { notificationService } from './notificationService.js';
import { logAudit } from './auditLogger.js';

/**
 * Computes tomorrow's calendar date in Asia/Dhaka wall-clock time (UTC+6, no DST).
 * At 18:30 UTC on day D, it is 00:30 Dhaka time on day D+1, so tomorrow in Dhaka is D+2.
 */
export function getDhakaTomorrowDate(currentUtcDate: Date = new Date()): string {
  const dhakaMillis = currentUtcDate.getTime() + 6 * 3600 * 1000;
  const dhakaDate = new Date(dhakaMillis);
  dhakaDate.setUTCDate(dhakaDate.getUTCDate() + 1);
  return dhakaDate.toISOString().slice(0, 10);
}

export class CallCenterService {
  private tasks = new Map<string, FollowUpTaskDto>();
  private taskDedupeIndex = new Map<string, string>(); // dedupeKey -> taskId
  private contactLogs: CallContactLogDto[] = [];
  private rules = new Map<string, FollowUpRuleDto>();
  private taskSeq = 1;
  private logSeq = 1;
  private ruleSeq = 1;

  constructor() {
    this.seedRules();
    this.seedSampleTasks();
  }

  public resetData() {
    this.tasks.clear();
    this.taskDedupeIndex.clear();
    this.contactLogs = [];
    this.rules.clear();
    this.taskSeq = 1;
    this.logSeq = 1;
    this.ruleSeq = 1;
    this.seedRules();
    this.seedSampleTasks();
  }

  private seedRules() {
    const defaultRules: Array<{
      type: FollowUpTaskType;
      name: string;
      description: string;
      days: number;
      hours?: number;
      priority: FollowUpTaskPriority;
    }> = [
      {
        type: 'next_day_call',
        name: "Tomorrow's Session Confirmation",
        description: 'Auto-generates reminder calls for patients scheduled tomorrow (Asia/Dhaka wall-clock).',
        days: 1,
        hours: 24,
        priority: 'high',
      },
      {
        type: 'missed_appointment',
        name: 'Missed Session Recovery Call',
        description: 'Triggers priority check-in call within 2-4 hours of a no-show appointment.',
        days: 1,
        hours: 2,
        priority: 'critical',
      },
      {
        type: 'cancelled_appointment',
        name: 'Cancelled Appointment Re-engagement',
        description: 'Flags cancelled bookings for follow-up reschedule assistance.',
        days: 2,
        hours: 4,
        priority: 'medium',
      },
      {
        type: 'inactive_patient',
        name: 'Inactive Patient Care Check-in',
        description: 'Outreach queue for clients with no visits for over 60 days.',
        days: 60,
        priority: 'low',
      },
      {
        type: 'package_expiry',
        name: 'Package Expiry Reminder Call',
        description: 'Alerts patients with sessions remaining 14 days before package validity terminates.',
        days: 14,
        priority: 'high',
      },
      {
        type: 'pending_payment',
        name: 'Outstanding Invoice Due Call',
        description: 'Contact queue for invoices with unpaid or partial balances older than 7 days.',
        days: 7,
        priority: 'medium',
      },
    ];

    const now = new Date().toISOString();
    for (const r of defaultRules) {
      const id = `rule-${this.ruleSeq++}`;
      this.rules.set(id, {
        id,
        branch_id: 'br-dhk-01',
        rule_type: r.type,
        rule_name: r.name,
        task_type: r.type,
        description: r.description,
        is_enabled: true,
        is_active: true,
        trigger_days: r.days,
        trigger_window_days: r.days,
        trigger_window_hours: r.hours,
        priority: r.priority,
        default_priority: r.priority,
        created_at: now,
        updated_at: now,
      });
    }
  }

  private seedSampleTasks() {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();

    const t1: FollowUpTaskDto = {
      id: 'task-1',
      branch_id: 'br-dhk-01',
      patient_id: 'pat_87',
      patient_name: 'Sumaiya Rahman',
      patient_mobile: '+8801712345678',
      patient_code: 'SKC-000087',
      appointment_id: 'apt-1',
      task_type: 'next_day_call',
      title: "Tomorrow's Session Confirmation",
      notes: 'Confirm attendance for Carbon Laser Facial tomorrow 11:30 AM',
      priority: 'high',
      status: 'open',
      due_date: new Date(now.getTime() + 12 * 3600 * 1000).toISOString(),
      is_overdue: false,
      dedupe_key: 'seed:task:next_day:apt-1',
      created_at: yesterday,
      updated_at: yesterday,
    };

    const t2: FollowUpTaskDto = {
      id: 'task-2',
      branch_id: 'br-dhk-01',
      patient_id: 'pat_88',
      patient_name: 'Tasnim Akter',
      patient_mobile: '+8801811223344',
      patient_code: 'SKC-000088',
      task_type: 'missed_appointment',
      title: 'Missed Appointment Recovery',
      notes: 'No-show for chemical peel consultation; inquire on rescheduling',
      priority: 'critical',
      status: 'open',
      due_date: new Date(now.getTime() - 2 * 3600 * 1000).toISOString(), // 2 hours ago -> overdue!
      is_overdue: true,
      dedupe_key: 'seed:task:missed:pat_88',
      created_at: yesterday,
      updated_at: yesterday,
    };

    this.tasks.set(t1.id, t1);
    this.tasks.set(t2.id, t2);
    this.taskDedupeIndex.set(t1.dedupe_key, t1.id);
    this.taskDedupeIndex.set(t2.dedupe_key, t2.id);
    this.taskSeq = 3;
  }

  // --- 1. Call Center Dashboard & Tomorrow Sessions (Restricted DTO) ---

  public async listTomorrowSessions(branchId?: string): Promise<CallCenterAppointmentDto[]> {
    const tomorrowStr = getDhakaTomorrowDate();
    const aptRes = await appointmentService.listAppointments({
      startDate: tomorrowStr,
      endDate: tomorrowStr,
      branchId,
    });

    const appointments = (aptRes?.items || []).filter(
      (a) => a.status !== 'cancelled' && a.status !== 'visited'
    );

    const result: CallCenterAppointmentDto[] = [];

    // Retrieve notifications for SMS status mapping
    const notifs = (await notificationService.listNotifications({ limit: 100 })).items;

    for (const apt of appointments) {
      const patient = await patientService.findById(apt.patient_id);
      const patientName = patient ? patient.full_name : apt.patient_name || 'Patient';
      const patientCode = patient ? patient.patient_code : apt.patient_code || 'SKC-000000';
      const patientMobile = patient ? patient.primary_mobile : apt.patient_mobile || '';

      // Find call task if created
      const dedupeKey = `task:next_day:${apt.id}`;
      const taskId = this.taskDedupeIndex.get(dedupeKey);
      const task = taskId ? this.tasks.get(taskId) : undefined;

      let callTaskStatus: 'pending' | 'called' | 'unreachable' | 'reschedule_requested' | 'completed' = 'pending';
      if (task) {
        if (task.status === 'completed') callTaskStatus = 'completed';
        else if (task.status === 'in_progress') callTaskStatus = 'called';
      }

      // Check contact logs for specific outcomes
      const logs = this.contactLogs.filter((l) => l.appointment_id === apt.id);
      if (logs.length > 0) {
        const latest = logs[logs.length - 1];
        if (latest.outcome === 'reschedule_requested') callTaskStatus = 'reschedule_requested';
        else if (['no_answer', 'busy', 'switched_off', 'wrong_number'].includes(latest.outcome)) {
          callTaskStatus = 'unreachable';
        } else if (latest.outcome === 'reached' || latest.outcome === 'completed') {
          callTaskStatus = 'called';
        }
      }

      // Find SMS status from Prompt 16 notifications
      const notif = notifs.find(
        (n) => n.appointment_id === apt.id && n.channel === 'sms'
      );
      const smsStatus = (notif ? notif.status : 'none') as any;

      const latestLog = logs.length > 0 ? logs[logs.length - 1] : undefined;

      // Strict Privacy DTO (Hard Rule 8):
      // Excludes medical history, prescriptions, diagnoses, billing amounts and dues!
      result.push({
        id: apt.id,
        appointment_id: apt.id,
        appointment_code: apt.appointment_code,
        branch_id: apt.branch_id,
        patient_id: apt.patient_id,
        patient_code: patientCode,
        patient_name: patientName,
        patient_mobile: patientMobile,
        mobile: patientMobile,
        provider_id: apt.provider_id,
        doctor_name: apt.provider_name || 'Dr. Consultant',
        service_name: apt.service_name,
        appointment_date: apt.appointment_date,
        start_time: apt.start_time,
        duration_minutes: apt.duration_minutes,
        appointment_status: apt.status,
        call_reference: apt.call_reference || undefined,
        call_task_status: callTaskStatus,
        last_call_outcome: latestLog?.outcome,
        follow_up_task_id: task?.id,
        assigned_to: task?.assigned_to,
        sms_status: smsStatus,
        sms_delivery_status: smsStatus !== 'none' ? smsStatus : undefined,
        sms_sent_at: notif?.sent_at,
        sms_delivered_at: notif?.delivered_at,
      });
    }

    return result;
  }

  public async getDashboardSummary(branchId?: string): Promise<CallCenterDashboardSummaryDto> {
    const list = await this.listTomorrowSessions(branchId);
    let called = 0;
    let pending = 0;
    let unreachable = 0;

    for (const item of list) {
      if (item.call_task_status === 'called' || item.call_task_status === 'completed') {
        called++;
      } else if (item.call_task_status === 'unreachable') {
        unreachable++;
      } else {
        pending++;
      }
    }

    const tomorrowStr = getDhakaTomorrowDate();

    return {
      total: list.length,
      called,
      pending,
      unreachable,
      tomorrow_date: tomorrowStr,
      tomorrow_total_sessions: list.length,
      tomorrow_called_count: called,
      tomorrow_pending_count: pending,
      tomorrow_unreachable_count: unreachable,
    };
  }

  // --- 2. Log Call Drawer & Reschedule Routing (Hard Rule 1 & 2) ---

  public async logCallOutcome(
    req: LogCallRequest,
    callerUser: any
  ): Promise<{ log: CallContactLogDto; task?: FollowUpTaskDto }> {
    if (!req.patient_id) {
      throw new BadRequestError('Patient ID is required to log a call');
    }
    if (!req.outcome) {
      throw new BadRequestError('Call outcome is required');
    }

    const patient = await patientService.findById(req.patient_id);
    if (!patient) {
      throw new NotFoundError(`Patient '${req.patient_id}' not found`);
    }

    const id = `ccl-${this.logSeq++}`;
    const now = new Date().toISOString();
    const callerId = callerUser.id || 'usr-call-01';
    const callerName = callerUser.fullName || callerUser.name || 'Call Center Agent';

    const targetTaskId = req.task_id || req.follow_up_task_id;
    const targetRescheduleDate = req.reschedule_requested_date || req.requested_reschedule_date;
    const targetRescheduleTime = req.reschedule_requested_time || req.requested_reschedule_time;

    let rescheduleStatus: 'none' | 'pending' | 'approved' | 'rejected' = 'none';

    // If reschedule requested, validate requested date/time
    if (req.outcome === 'reschedule_requested') {
      if (!targetRescheduleDate) {
        throw new BadRequestError('Requested reschedule date is required when outcome is reschedule_requested');
      }
      rescheduleStatus = 'pending';
    }

    const logRecord: CallContactLogDto = {
      id,
      task_id: targetTaskId,
      patient_id: req.patient_id,
      appointment_id: req.appointment_id,
      caller_user_id: callerId,
      caller_name: callerName,
      outcome: req.outcome,
      notes: req.notes,
      call_reference: req.call_reference,
      duration_seconds: req.duration_seconds,
      next_action: req.next_action,
      next_action_due: req.next_action_due,
      reschedule_requested_date: targetRescheduleDate,
      reschedule_requested_time: targetRescheduleTime,
      reschedule_reason: req.reschedule_reason,
      reschedule_status: rescheduleStatus,
      created_at: now,
    };

    this.contactLogs.push(logRecord);

    // Update associated follow-up task if present
    let task: FollowUpTaskDto | undefined;
    if (targetTaskId && this.tasks.has(targetTaskId)) {
      task = this.tasks.get(targetTaskId)!;
      if (req.outcome === 'reached' || req.outcome === 'completed') {
        task.status = 'completed';
        task.completed_at = now;
        task.completed_by = callerId;
        task.resolution_notes = req.notes || `Call outcome: ${req.outcome}`;
      } else if (['no_answer', 'busy', 'switched_off', 'wrong_number'].includes(req.outcome)) {
        task.status = 'in_progress';
      } else if (req.outcome === 'reschedule_requested') {
        task.status = 'in_progress';
      }
      task.updated_at = now;
    }

    // Hard Rule 2 & Reschedule Workflow:
    // If reschedule requested, create a Staff Alert for the Doctor & Reception team.
    // The underlying appointment is NEVER altered directly!
    if (req.outcome === 'reschedule_requested') {
      const branchId = callerUser.branchId || 'br-dhk-01';
      let aptCode = req.appointment_id || 'scheduled appointment';
      if (req.appointment_id) {
        const apt = appointmentService.getAppointmentById(req.appointment_id);
        if (apt) aptCode = apt.appointment_code;
      }

      await staffAlertService.createAlert({
        branchId,
        alertType: 'clinical_alert',
        title: 'Patient Reschedule Request',
        message: `${patient.full_name} (${patient.patient_code}) requested to reschedule ${aptCode} to ${targetRescheduleDate} ${targetRescheduleTime || ''}. Reason: ${req.reschedule_reason || 'Patient preference'}.`,
        linkPath: '/appointments',
        metadata: {
          appointmentId: req.appointment_id,
          patientId: req.patient_id,
          requestedDate: targetRescheduleDate,
          requestedTime: targetRescheduleTime,
          reason: req.reschedule_reason,
          logId: id,
        },
      });
    }

    // Audit log
    await logAudit(null, {
      actorUserId: callerId,
      action: 'call_center.log_call',
      entityType: 'call_contact_logs',
      entityId: id,
      branchId: callerUser.branchId || 'br-dhk-01',
      payloadAfter: {
        id,
        patientId: req.patient_id,
        outcome: req.outcome,
        rescheduleStatus,
        callReference: req.call_reference,
      },
      ipAddress: '127.0.0.1',
    });

    return Object.assign(logRecord, { log: logRecord, task });
  }

  // --- 3. Follow-up Tasks Listing & Management ---

  public async listFollowUpTasks(params: FollowUpTasksFilterParams): Promise<{
    items: FollowUpTaskDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    const now = new Date();
    let list = Array.from(this.tasks.values());

    // Update overdue flags
    for (const t of list) {
      t.is_overdue = t.status !== 'completed' && t.status !== 'cancelled' && new Date(t.due_date) < now;
    }

    if (params.branch_id) {
      list = list.filter((t) => t.branch_id === params.branch_id);
    }
    if (params.status && params.status !== 'all') {
      list = list.filter((t) => t.status === params.status);
    }
    if (params.task_type && params.task_type !== 'all') {
      list = list.filter((t) => t.task_type === params.task_type);
    }
    if (params.priority && params.priority !== 'all') {
      list = list.filter((t) => t.priority === params.priority);
    }
    if (params.owner) {
      if (params.owner === 'unassigned') {
        list = list.filter((t) => !t.assigned_to);
      } else {
        list = list.filter((t) => t.assigned_to === params.owner);
      }
    }
    if (params.due_date) {
      list = list.filter((t) => t.due_date.slice(0, 10) === params.due_date);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (t) =>
          t.patient_name.toLowerCase().includes(q) ||
          t.patient_mobile.toLowerCase().includes(q) ||
          t.task_type.toLowerCase().includes(q) ||
          (t.resolution_notes && t.resolution_notes.toLowerCase().includes(q))
      );
    }

    // Sort: Overdue critical first, then due date ascending
    list.sort((a, b) => {
      if (a.is_overdue && !b.is_overdue) return -1;
      if (!a.is_overdue && b.is_overdue) return 1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });

    const total = list.length;
    const page = params.page || 1;
    const limit = params.limit || 20;
    const startIndex = (page - 1) * limit;
    const items = list.slice(startIndex, startIndex + limit);

    return { items, total, page, limit };
  }

  public async assignTask(
    taskId: string,
    assignToUserId: string | null,
    actorUser?: any
  ): Promise<FollowUpTaskDto> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new NotFoundError(`Task '${taskId}' not found`);
    }

    const actorName = typeof actorUser === 'string'
      ? actorUser
      : (actorUser?.fullName || actorUser?.name || 'Call Center Agent');

    task.assigned_to = assignToUserId || undefined;
    task.assigned_name = assignToUserId ? actorName : undefined;
    task.assigned_to_name = task.assigned_name;
    if (assignToUserId && (task.status === 'open' || (task.status as any) === 'pending')) {
      task.status = 'in_progress';
    }
    task.updated_at = new Date().toISOString();

    const actorId = typeof actorUser === 'string' ? 'usr-call-01' : (actorUser?.id || 'usr-call-01');
    await logAudit(null, {
      actorUserId: actorId,
      action: 'follow_up_task.assign',
      entityType: 'follow_up_tasks',
      entityId: taskId,
      branchId: task.branch_id,
      payloadAfter: { taskId, assignedTo: assignToUserId, assignedName: task.assigned_name },
      ipAddress: '127.0.0.1',
    });

    return task;
  }

  public async completeTask(
    taskId: string,
    resolutionNotes: string,
    actorUser?: any
  ): Promise<FollowUpTaskDto> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new NotFoundError(`Task '${taskId}' not found`);
    }

    const actorId = typeof actorUser === 'string' ? actorUser : (actorUser?.id || 'usr-call-01');
    const now = new Date().toISOString();
    task.status = 'completed';
    task.completed_at = now;
    task.completed_by = actorId;
    task.resolution_notes = resolutionNotes;
    task.notes = resolutionNotes;
    task.is_overdue = false;
    task.updated_at = now;

    await logAudit(null, {
      actorUserId: actorId,
      action: 'follow_up_task.complete',
      entityType: 'follow_up_tasks',
      entityId: taskId,
      branchId: task.branch_id,
      payloadAfter: { taskId, status: 'completed', resolutionNotes },
      ipAddress: '127.0.0.1',
    });

    return task;
  }

  // --- 4. Task Auto-Generator (Idempotent via dedupe_key) ---

  public async generateFollowUpTasks(): Promise<{
    generated: number;
    skippedExisting: number;
    skippedDuplicates: number;
    total: number;
    tasks: FollowUpTaskDto[];
  }> {
    let generated = 0;
    let skippedExisting = 0;
    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Next-Day Session Calls
    const tomorrowStr = getDhakaTomorrowDate(now);
    const aptRes = await appointmentService.listAppointments({
      startDate: tomorrowStr,
      endDate: tomorrowStr,
    });
    const tomorrowApts = (aptRes?.items || []).filter((a) => a.status !== 'cancelled' && a.status !== 'visited');

    for (const apt of tomorrowApts) {
      const dedupeKey = `task:next_day:${apt.id}`;
      if (this.taskDedupeIndex.has(dedupeKey)) {
        skippedExisting++;
        continue;
      }

      const patient = await patientService.findById(apt.patient_id);
      const id = `task-${this.taskSeq++}`;
      const dueTime = new Date(now.getTime() + 14 * 3600 * 1000).toISOString();

      const newTask: FollowUpTaskDto = {
        id,
        branch_id: apt.branch_id,
        patient_id: apt.patient_id,
        patient_name: patient ? patient.full_name : apt.patient_name || 'Patient',
        patient_mobile: patient ? patient.primary_mobile : apt.patient_mobile || '',
        appointment_id: apt.id,
        task_type: 'next_day_call',
        priority: 'high',
        status: 'open',
        due_date: dueTime,
        is_overdue: false,
        dedupe_key: dedupeKey,
        created_at: nowIso,
        updated_at: nowIso,
      };

      this.tasks.set(id, newTask);
      this.taskDedupeIndex.set(dedupeKey, id);
      generated++;
    }

    // 2. Missed Appointments (status: no_show)
    const missedApts = (await appointmentService.listAppointments({ status: 'no_show' })).items || [];
    for (const apt of missedApts) {
      const dedupeKey = `task:missed:${apt.id}`;
      if (this.taskDedupeIndex.has(dedupeKey)) {
        skippedExisting++;
        continue;
      }

      const patient = await patientService.findById(apt.patient_id);
      const id = `task-${this.taskSeq++}`;
      const dueTime = new Date(now.getTime() + 4 * 3600 * 1000).toISOString();

      const newTask: FollowUpTaskDto = {
        id,
        branch_id: apt.branch_id,
        patient_id: apt.patient_id,
        patient_name: patient ? patient.full_name : apt.patient_name || 'Patient',
        patient_mobile: patient ? patient.primary_mobile : apt.patient_mobile || '',
        appointment_id: apt.id,
        task_type: 'missed_appointment',
        priority: 'critical',
        status: 'open',
        due_date: dueTime,
        is_overdue: false,
        dedupe_key: dedupeKey,
        created_at: nowIso,
        updated_at: nowIso,
      };

      this.tasks.set(id, newTask);
      this.taskDedupeIndex.set(dedupeKey, id);
      generated++;
    }

    // 3. Cancelled Appointments (Patient Recovery)
    const cancelledApts = (await appointmentService.listAppointments({ status: 'cancelled' })).items || [];
    for (const apt of cancelledApts) {
      const dedupeKey = `task:cancelled:${apt.id}`;
      if (this.taskDedupeIndex.has(dedupeKey)) {
        skippedExisting++;
        continue;
      }

      const patient = await patientService.findById(apt.patient_id);
      const id = `task-${this.taskSeq++}`;
      const dueTime = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();

      const newTask: FollowUpTaskDto = {
        id,
        branch_id: apt.branch_id,
        patient_id: apt.patient_id,
        patient_name: patient ? patient.full_name : apt.patient_name || 'Patient',
        patient_mobile: patient ? patient.primary_mobile : apt.patient_mobile || '',
        appointment_id: apt.id,
        task_type: 'cancelled_appointment',
        priority: 'medium',
        status: 'open',
        due_date: dueTime,
        is_overdue: false,
        dedupe_key: dedupeKey,
        created_at: nowIso,
        updated_at: nowIso,
      };

      this.tasks.set(id, newTask);
      this.taskDedupeIndex.set(dedupeKey, id);
      generated++;
    }

    return {
      generated,
      skippedExisting,
      skippedDuplicates: skippedExisting,
      total: this.tasks.size,
      tasks: Array.from(this.tasks.values()),
    };
  }

  // --- 5. Follow-Up Rules Configuration ---

  public async getRules(branchId?: string): Promise<FollowUpRuleDto[]> {
    let list = Array.from(this.rules.values());
    if (branchId) {
      list = list.filter((r) => r.branch_id === branchId);
    }
    return list;
  }

  public async updateRule(
    ruleId: string,
    req: UpdateFollowUpRuleRequest,
    actorUser: any
  ): Promise<FollowUpRuleDto> {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new NotFoundError(`Follow-up rule '${ruleId}' not found`);
    }

    if (req.is_enabled !== undefined) {
      rule.is_enabled = req.is_enabled;
      rule.is_active = req.is_enabled;
    }
    if (req.is_active !== undefined) {
      rule.is_active = req.is_active;
      rule.is_enabled = req.is_active;
    }
    if (req.trigger_days !== undefined) {
      if (req.trigger_days < 1) throw new BadRequestError('Trigger days must be at least 1');
      rule.trigger_days = req.trigger_days;
      rule.trigger_window_days = req.trigger_days;
    }
    if (req.trigger_window_days !== undefined) {
      if (req.trigger_window_days < 1) throw new BadRequestError('Trigger window days must be at least 1');
      rule.trigger_window_days = req.trigger_window_days;
      rule.trigger_days = req.trigger_window_days;
    }
    if (req.trigger_window_hours !== undefined) {
      if (req.trigger_window_hours < 1) throw new BadRequestError('Trigger window hours must be at least 1');
      rule.trigger_window_hours = req.trigger_window_hours;
    }
    if (req.priority !== undefined) {
      rule.priority = req.priority;
      rule.default_priority = req.priority;
    }
    if (req.default_priority !== undefined) {
      rule.default_priority = req.default_priority;
      rule.priority = req.default_priority;
    }
    rule.updated_at = new Date().toISOString();

    await logAudit(null, {
      actorUserId: actorUser.id,
      action: 'follow_up_rule.update',
      entityType: 'follow_up_rules',
      entityId: ruleId,
      branchId: rule.branch_id,
      payloadAfter: rule,
      ipAddress: '127.0.0.1',
    });

    return rule;
  }
}

export const callCenterService = new CallCenterService();
