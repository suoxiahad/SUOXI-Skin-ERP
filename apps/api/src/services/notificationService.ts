import crypto from 'node:crypto';
import type {
  NotificationDto,
  NotificationStatus,
  NotificationChannel,
  NotificationSkipReason,
  NotificationFilterParams,
  NotificationReportSummaryDto,
  WebhookEventDto,
} from '@suoxi/shared-types';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  UnprocessableEntityError,
} from '../middleware/errorHandler.js';
import { patientService, normalizeMobile, isValidBangladeshMobile } from './patientService.js';
import { appointmentService } from './appointmentService.js';
import { integrationService } from './integrationService.js';
import { staffAlertService } from './staffAlertService.js';
import { logAudit } from './auditLogger.js';

export interface InternalNotificationRecord extends NotificationDto {
  locked_by?: string;
  locked_until?: string;
}

/**
 * Calculates Dhaka wall-clock time (UTC+6, no DST).
 * Quiet hours: 21:00 (9 PM) to 08:00 (8 AM) Dhaka time.
 * If in quiet hours, shifts forward to 08:00:00 Dhaka time (02:00:00 UTC).
 */
export function adjustForDhakaQuietHours(date: Date): { adjustedDate: Date; wasShifted: boolean } {
  // Dhaka is UTC+6
  const utcMillis = date.getTime();
  const dhakaMillis = utcMillis + 6 * 3600 * 1000;
  const dhakaDate = new Date(dhakaMillis);

  const dhakaHour = dhakaDate.getUTCHours();
  const dhakaMinute = dhakaDate.getUTCMinutes();
  const dhakaSecond = dhakaDate.getUTCSeconds();

  // Quiet hours check: 21:00 <= time < 24:00 OR 00:00 <= time < 08:00
  const isQuietHours = dhakaHour >= 21 || dhakaHour < 8;

  if (!isQuietHours) {
    return { adjustedDate: new Date(date), wasShifted: false };
  }

  // Calculate target 08:00:00 Dhaka time
  const targetDhaka = new Date(dhakaMillis);
  if (dhakaHour >= 21) {
    // Shift to next day 08:00:00 Dhaka
    targetDhaka.setUTCDate(targetDhaka.getUTCDate() + 1);
  }
  targetDhaka.setUTCHours(8, 0, 0, 0);

  // Convert back to UTC (subtract 6 hours)
  const targetUtcMillis = targetDhaka.getTime() - 6 * 3600 * 1000;
  return { adjustedDate: new Date(targetUtcMillis), wasShifted: true };
}

export class NotificationService {
  private notifications = new Map<string, InternalNotificationRecord>();
  private idempotencyIndex = new Map<string, string>(); // idempotencyKey -> notificationId
  private providerMsgIndex = new Map<string, string>(); // providerMessageId -> notificationId
  private webhookEvents = new Map<string, WebhookEventDto>();
  private notifSeq = 1;
  private webhookSeq = 1;

  constructor() {
    this.seedSampleNotifications();
  }

  public resetData() {
    this.notifications.clear();
    this.idempotencyIndex.clear();
    this.providerMsgIndex.clear();
    this.webhookEvents.clear();
    this.notifSeq = 1;
    this.webhookSeq = 1;
    this.seedSampleNotifications();
  }

  private seedSampleNotifications() {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000).toISOString();
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    const inTwoHours = new Date(now.getTime() + 2 * 3600 * 1000).toISOString();

    const n1: InternalNotificationRecord = {
      id: 'notif-1',
      branch_id: 'br-dhk-01',
      patient_id: 'pat_87',
      patient_name: 'Sumaiya Rahman',
      appointment_id: 'apt-1',
      channel: 'sms',
      recipient: '+8801712345678',
      body: 'Dear Sumaiya Rahman, reminder for your appointment at SUOXI Skin Care tomorrow at 10:30 AM. Call +8809612345678 for assistance.',
      status: 'delivered',
      idempotency_key: 'seed:session_reminder:apt:1:sms',
      scheduled_at: yesterday,
      sent_at: yesterday,
      delivered_at: yesterday,
      retry_count: 0,
      max_retries: 3,
      provider_message_id: 'EB-MSG-77490123',
      correlation_id: 'corr-seed-01',
      created_at: yesterday,
      updated_at: yesterday,
    };

    const n2: InternalNotificationRecord = {
      id: 'notif-2',
      branch_id: 'br-dhk-01',
      patient_id: 'pat_88',
      patient_name: 'Tasnim Akter',
      appointment_id: 'apt-2',
      channel: 'sms',
      recipient: '+8801811223344',
      body: 'Dear Tasnim Akter, your PRP Aesthetics session is confirmed for today at 3:00 PM. Please arrive 10 min early.',
      status: 'sent',
      idempotency_key: 'seed:session_reminder:apt:2:sms',
      scheduled_at: twoHoursAgo,
      sent_at: twoHoursAgo,
      retry_count: 0,
      max_retries: 3,
      provider_message_id: 'EB-MSG-88123001',
      correlation_id: 'corr-seed-02',
      created_at: twoHoursAgo,
      updated_at: twoHoursAgo,
    };

    const n3: InternalNotificationRecord = {
      id: 'notif-3',
      branch_id: 'br-dhk-01',
      patient_id: 'pat_89',
      patient_name: 'Mahmudul Hasan',
      channel: 'sms',
      recipient: '+8801999999999',
      body: 'Dear Mahmudul Hasan, reminder for consultation at SUOXI.',
      status: 'failed',
      idempotency_key: 'seed:session_reminder:apt:3:sms',
      scheduled_at: thirtyMinAgo,
      failed_at: thirtyMinAgo,
      retry_count: 3,
      max_retries: 3,
      failure_reason: 'Elitbuzz gateway rejected: Invalid mobile number prefix or unreachable recipient',
      correlation_id: 'corr-seed-03',
      created_at: thirtyMinAgo,
      updated_at: thirtyMinAgo,
    };

    const n4: InternalNotificationRecord = {
      id: 'notif-4',
      branch_id: 'br-dhk-01',
      patient_id: 'pat_87',
      patient_name: 'Sumaiya Rahman',
      channel: 'sms',
      recipient: '+8801712345678',
      body: 'Dear Sumaiya Rahman, reminder for upcoming post-procedure follow-up.',
      status: 'queued',
      idempotency_key: 'seed:session_reminder:apt:4:sms',
      scheduled_at: inTwoHours,
      retry_count: 0,
      max_retries: 3,
      correlation_id: 'corr-seed-04',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    this.notifications.set(n1.id, n1);
    this.notifications.set(n2.id, n2);
    this.notifications.set(n3.id, n3);
    this.notifications.set(n4.id, n4);

    this.idempotencyIndex.set(n1.idempotency_key, n1.id);
    this.idempotencyIndex.set(n2.idempotency_key, n2.id);
    this.idempotencyIndex.set(n3.idempotency_key, n3.id);
    this.idempotencyIndex.set(n4.idempotency_key, n4.id);

    if (n1.provider_message_id) this.providerMsgIndex.set(n1.provider_message_id, n1.id);
    if (n2.provider_message_id) this.providerMsgIndex.set(n2.provider_message_id, n2.id);

    this.notifSeq = 5;
  }

  // --- 1. Notification Queue Management ---

  public async enqueueNotification(params: {
    branchId: string;
    patientId?: string;
    appointmentId?: string;
    sessionId?: string;
    templateId?: string;
    eventRuleId?: string;
    channel: NotificationChannel;
    recipient: string;
    subject?: string;
    body: string;
    idempotencyKey: string;
    scheduledAt?: string;
    correlationId?: string;
    maxRetries?: number;
  }): Promise<NotificationDto> {
    // Check idempotency
    const existingId = this.idempotencyIndex.get(params.idempotencyKey);
    if (existingId) {
      const existing = this.notifications.get(existingId);
      if (existing) return existing;
    }

    const id = `notif-${this.notifSeq++}`;
    const now = new Date().toISOString();
    let scheduledDate = params.scheduledAt ? new Date(params.scheduledAt) : new Date();

    // Apply Dhaka Quiet Hours policy (Open Decision A-04.2)
    const { adjustedDate } = adjustForDhakaQuietHours(scheduledDate);
    const scheduledAtStr = adjustedDate.toISOString();

    let patientName: string | undefined;
    if (params.patientId) {
      const p = await patientService.findById(params.patientId);
      if (p) patientName = p.full_name;
    }

    const record: InternalNotificationRecord = {
      id,
      branch_id: params.branchId,
      patient_id: params.patientId,
      patient_name: patientName,
      appointment_id: params.appointmentId,
      session_id: params.sessionId,
      template_id: params.templateId,
      event_rule_id: params.eventRuleId,
      channel: params.channel,
      recipient: params.recipient,
      subject: params.subject,
      body: params.body,
      status: 'queued',
      idempotency_key: params.idempotencyKey,
      scheduled_at: scheduledAtStr,
      retry_count: 0,
      max_retries: params.maxRetries ?? 3,
      correlation_id: params.correlationId || `corr-${crypto.randomUUID()}`,
      created_at: now,
      updated_at: now,
    };

    this.notifications.set(id, record);
    this.idempotencyIndex.set(params.idempotencyKey, id);
    return record;
  }

  // --- 2. Automated Reminder Generator ---

  public async generateSessionReminders(targetDateStr?: string): Promise<{
    generated: number;
    skipped: number;
    items: NotificationDto[];
  }> {
    // Determine target date (default tomorrow)
    let targetDate: Date;
    if (targetDateStr) {
      targetDate = new Date(targetDateStr);
    } else {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      targetDate = tomorrow;
    }
    const targetDateFormatted = targetDate.toISOString().slice(0, 10);

    // List appointments for target date
    const aptRes = await appointmentService.listAppointments({
      startDate: targetDateFormatted,
      endDate: targetDateFormatted,
    });
    const appointments = aptRes?.items || [];

    let generatedCount = 0;
    let skippedCount = 0;
    const results: NotificationDto[] = [];

    for (const apt of appointments) {
      const idempotencyKey = `session_reminder:apt:${apt.id}:sms`;

      // Check if already queued or generated
      if (this.idempotencyIndex.has(idempotencyKey)) {
        continue;
      }

      const patient = await patientService.findById(apt.patient_id);
      const id = `notif-${this.notifSeq++}`;
      const now = new Date().toISOString();
      const correlationId = `corr-rem-${crypto.randomUUID().slice(0, 8)}`;

      // 1. Check Appointment Cancelled
      if (apt.status === 'cancelled') {
        const skippedNotif: InternalNotificationRecord = {
          id,
          branch_id: apt.branch_id,
          patient_id: apt.patient_id,
          patient_name: apt.patient_name,
          appointment_id: apt.id,
          channel: 'sms',
          recipient: apt.patient_mobile || '',
          body: '',
          status: 'skipped',
          skip_reason: 'appointment_cancelled',
          idempotency_key: idempotencyKey,
          scheduled_at: now,
          retry_count: 0,
          max_retries: 3,
          correlation_id: correlationId,
          created_at: now,
          updated_at: now,
        };
        this.notifications.set(id, skippedNotif);
        this.idempotencyIndex.set(idempotencyKey, id);
        skippedCount++;
        results.push(skippedNotif);
        continue;
      }

      // 2. Check Patient Consent (A-04.1)
      const hasSmsConsent = patient ? (patient.consent_sms_notifications ?? true) : true;
      if (!hasSmsConsent) {
        const skippedNotif: InternalNotificationRecord = {
          id,
          branch_id: apt.branch_id,
          patient_id: apt.patient_id,
          patient_name: apt.patient_name,
          appointment_id: apt.id,
          channel: 'sms',
          recipient: apt.patient_mobile || '',
          body: '',
          status: 'skipped',
          skip_reason: 'no_consent',
          idempotency_key: idempotencyKey,
          scheduled_at: now,
          retry_count: 0,
          max_retries: 3,
          correlation_id: correlationId,
          created_at: now,
          updated_at: now,
        };
        this.notifications.set(id, skippedNotif);
        this.idempotencyIndex.set(idempotencyKey, id);
        skippedCount++;
        results.push(skippedNotif);
        continue;
      }

      // 3. Check Phone Valid
      const normalizedPhone = normalizeMobile(apt.patient_mobile);
      if (!isValidBangladeshMobile(normalizedPhone)) {
        const skippedNotif: InternalNotificationRecord = {
          id,
          branch_id: apt.branch_id,
          patient_id: apt.patient_id,
          patient_name: apt.patient_name,
          appointment_id: apt.id,
          channel: 'sms',
          recipient: apt.patient_mobile || '',
          body: '',
          status: 'skipped',
          skip_reason: 'invalid_recipient',
          idempotency_key: idempotencyKey,
          scheduled_at: now,
          retry_count: 0,
          max_retries: 3,
          correlation_id: correlationId,
          created_at: now,
          updated_at: now,
        };
        this.notifications.set(id, skippedNotif);
        this.idempotencyIndex.set(idempotencyKey, id);
        skippedCount++;
        results.push(skippedNotif);
        continue;
      }

      // 4. Construct Message Body
      const body = `Dear ${apt.patient_name}, this is a reminder for your ${apt.service_name} appointment at SUOXI Skin Care tomorrow (${apt.appointment_date}) at ${apt.start_time}. For queries, call +8809612345678.`;

      // 5. Calculate scheduled_at respecting quiet hours
      // Scheduled 24h before appointment, but shifted if within quiet hours
      const aptDateTimeStr = `${apt.appointment_date}T${apt.start_time}:00+06:00`;
      const aptTime = new Date(aptDateTimeStr);
      const reminderIdealTime = new Date(aptTime.getTime() - 24 * 3600 * 1000);
      const { adjustedDate } = adjustForDhakaQuietHours(reminderIdealTime);

      const newNotif: InternalNotificationRecord = {
        id,
        branch_id: apt.branch_id,
        patient_id: apt.patient_id,
        patient_name: apt.patient_name,
        appointment_id: apt.id,
        channel: 'sms',
        recipient: normalizedPhone,
        body,
        status: 'queued',
        idempotency_key: idempotencyKey,
        scheduled_at: adjustedDate.toISOString(),
        retry_count: 0,
        max_retries: 3,
        correlation_id: correlationId,
        created_at: now,
        updated_at: now,
      };

      this.notifications.set(id, newNotif);
      this.idempotencyIndex.set(idempotencyKey, id);
      generatedCount++;
      results.push(newNotif);
    }

    return { generated: generatedCount, skipped: skippedCount, items: results };
  }

  // --- 3. Worker Dispatcher (Claim & Send with SKIP LOCKED and Visibility Timeout) ---

  public async claimAndDispatchBatch(options: {
    workerId: string;
    batchSize?: number;
    visibilityTimeoutSec?: number;
  }): Promise<{
    claimed: number;
    sent: number;
    failed: number;
  }> {
    const batchSize = options.batchSize || 10;
    const visibilityTimeoutSec = options.visibilityTimeoutSec || 60;
    const now = new Date();
    const nowIso = now.toISOString();

    // 1. Claim eligible items (status === 'queued' and scheduled_at <= now, OR status === 'sending' and locked_until < now [crash recovery])
    const eligibleToClaim: InternalNotificationRecord[] = [];

    for (const n of this.notifications.values()) {
      if (n.status === 'queued') {
        const sched = new Date(n.scheduled_at);
        if (sched <= now) {
          if (!n.next_retry_at || new Date(n.next_retry_at) <= now) {
            eligibleToClaim.push(n);
          }
        }
      } else if (n.status === 'sending') {
        // Crash recovery: check visibility timeout
        if (n.locked_until && new Date(n.locked_until) < now) {
          eligibleToClaim.push(n);
        }
      }

      if (eligibleToClaim.length >= batchSize) break;
    }

    if (eligibleToClaim.length === 0) {
      return { claimed: 0, sent: 0, failed: 0 };
    }

    // 2. Lock claimed items
    const lockedUntil = new Date(now.getTime() + visibilityTimeoutSec * 1000).toISOString();
    for (const item of eligibleToClaim) {
      item.status = 'sending';
      item.locked_by = options.workerId;
      item.locked_until = lockedUntil;
      item.updated_at = nowIso;
    }

    let sentCount = 0;
    let failedCount = 0;

    // 3. Dispatch each claimed item
    for (const item of eligibleToClaim) {
      try {
        let dispatchResult: { success: boolean; provider_message_id?: string; error?: string };

        if (item.channel === 'sms') {
          // Send via integration service
          dispatchResult = await this.dispatchSmsViaGateway(item.recipient, item.body, item.correlation_id);
        } else {
          // In-app or mock email
          dispatchResult = {
            success: true,
            provider_message_id: `MSG-${crypto.randomUUID().slice(0, 8)}`,
          };
        }

        const dispatchNow = new Date().toISOString();

        if (dispatchResult.success) {
          // Hard Rule 7: status is SENT upon gateway acceptance (NOT delivered)
          item.status = 'sent';
          item.sent_at = dispatchNow;
          item.provider_message_id = dispatchResult.provider_message_id;
          item.locked_by = undefined;
          item.locked_until = undefined;
          item.updated_at = dispatchNow;

          if (dispatchResult.provider_message_id) {
            this.providerMsgIndex.set(dispatchResult.provider_message_id, item.id);
          }
          sentCount++;
        } else {
          // Failure handling with retry backoff
          item.retry_count += 1;
          const errMsg = dispatchResult.error || 'Gateway dispatch rejected';

          if (item.retry_count >= item.max_retries) {
            // Terminal failure
            item.status = 'failed';
            item.failed_at = dispatchNow;
            item.failure_reason = errMsg;
            item.locked_by = undefined;
            item.locked_until = undefined;
            item.updated_at = dispatchNow;
            failedCount++;

            // Create Staff Alert Bell item for failed reminder
            await staffAlertService.createAlert({
              branchId: item.branch_id,
              alertType: 'failed_reminder',
              title: 'SMS Reminder Delivery Failed',
              message: `Failed to deliver SMS to ${item.patient_name || item.recipient}: ${errMsg}`,
              linkPath: '/reports/notifications',
              metadata: { notificationId: item.id, recipient: item.recipient, error: errMsg },
            });
          } else {
            // Re-queue with exponential backoff (e.g. 5m * retry_count)
            item.status = 'queued';
            const backoffMinutes = 5 * Math.pow(2, item.retry_count - 1); // 5m, 10m, 20m
            const nextRetry = new Date(Date.now() + backoffMinutes * 60 * 1000);
            item.next_retry_at = nextRetry.toISOString();
            item.failure_reason = errMsg;
            item.locked_by = undefined;
            item.locked_until = undefined;
            item.updated_at = dispatchNow;
          }
        }
      } catch (err: any) {
        // Unexpected exception during dispatch
        const dispatchNow = new Date().toISOString();
        item.retry_count += 1;
        const errMsg = err?.message || 'Unexpected dispatch error';

        if (item.retry_count >= item.max_retries) {
          item.status = 'failed';
          item.failed_at = dispatchNow;
          item.failure_reason = errMsg;
          item.locked_by = undefined;
          item.locked_until = undefined;
          item.updated_at = dispatchNow;
          failedCount++;

          await staffAlertService.createAlert({
            branchId: item.branch_id,
            alertType: 'failed_reminder',
            title: 'SMS Reminder Delivery Failed',
            message: `Failed to deliver SMS to ${item.patient_name || item.recipient}: ${errMsg}`,
            linkPath: '/reports/notifications',
            metadata: { notificationId: item.id, recipient: item.recipient, error: errMsg },
          });
        } else {
          item.status = 'queued';
          item.next_retry_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();
          item.failure_reason = errMsg;
          item.locked_by = undefined;
          item.locked_until = undefined;
          item.updated_at = dispatchNow;
        }
      }
    }

    return { claimed: eligibleToClaim.length, sent: sentCount, failed: failedCount };
  }

  private async dispatchSmsViaGateway(
    recipient: string,
    message: string,
    correlationId: string
  ): Promise<{ success: boolean; provider_message_id?: string; error?: string }> {
    // Fail immediately if recipient starts with test invalid prefix "+88019999" or "invalid"
    if (recipient.includes('invalid') || recipient === '+8801999999999') {
      return { success: false, error: 'Gateway returned HTTP 422: Invalid mobile MSISDN or inactive SIM' };
    }

    const providerMsgId = `EB-MSG-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    // Record integration log
    integrationService.recordLog({
      integration_type: 'sms_gateway',
      status: 'success',
      http_status: 200,
      provider_message_id: providerMsgId,
      recipient,
      correlation_id: correlationId,
      request_redacted: {
        contacts: recipient,
        msg: message,
      },
      response_redacted: {
        status: 'ACCEPTED',
        message_id: providerMsgId,
      },
    });

    return {
      success: true,
      provider_message_id: providerMsgId,
    };
  }

  // --- 4. Delivery-Receipt Webhook (Carrier Confirmation) ---

  public async processDeliveryWebhook(options: {
    provider: string;
    payload: Record<string, any>;
    signatureHeader?: string;
    timestampHeader?: string;
  }): Promise<{
    processed: boolean;
    reason?: string;
    notificationId?: string;
    previousStatus?: string;
    newStatus?: string;
  }> {
    const { provider, payload, signatureHeader, timestampHeader } = options;

    // 0. Webhook HMAC Signature Verification (if signature header provided)
    if (signatureHeader) {
      const envSecret = (process.env.SMS_WEBHOOK_SECRET || '').trim();
      if (!envSecret && process.env.NODE_ENV === 'production') {
        throw new BadRequestError('SMS_WEBHOOK_SECRET is not configured in production');
      }
      const secret = envSecret || 'suoxi_webhook_signing_secret_dev';
      const rawPayload = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const computedHex = crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');
      const computedWithTs = timestampHeader
        ? crypto.createHmac('sha256', secret).update(`${timestampHeader}.${rawPayload}`).digest('hex')
        : '';
      
      const cleanSig = signatureHeader.replace(/^sha256=/, '');
      const valid =
        (cleanSig.length === computedHex.length && crypto.timingSafeEqual(Buffer.from(cleanSig), Buffer.from(computedHex))) ||
        (Boolean(computedWithTs) && cleanSig.length === computedWithTs.length && crypto.timingSafeEqual(Buffer.from(cleanSig), Buffer.from(computedWithTs)));

      if (!valid) {
        throw new BadRequestError('Invalid webhook HMAC signature');
      }
    }

    // 1. Timestamp Freshness Check (tolerance +/- 5 minutes = 300 seconds)
    if (timestampHeader) {
      const ts = parseInt(timestampHeader, 10);
      if (!isNaN(ts)) {
        const nowSec = Math.floor(Date.now() / 1000);
        // Header could be in seconds or milliseconds
        const tsSec = ts > 10000000000 ? Math.floor(ts / 1000) : ts;
        if (Math.abs(nowSec - tsSec) > 300) {
          throw new BadRequestError('Webhook timestamp out of tolerance window (+/- 5 minutes)');
        }
      }
    }

    // 2. Extract provider event ID for Replay Protection
    const eventId =
      payload.event_id ||
      payload.message_id ||
      payload.provider_message_id ||
      payload.id ||
      `evt-${crypto.randomUUID()}`;

    if (this.webhookEvents.has(eventId)) {
      // Replay detected: return 200 duplicate ignored
      return { processed: false, reason: 'duplicate_event_ignored' };
    }

    // Record webhook event in ledger
    const webhookEvent: WebhookEventDto = {
      id: `wh-${this.webhookSeq++}`,
      provider,
      provider_event_id: eventId,
      event_type: payload.status || 'delivery_receipt',
      payload,
      received_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
    };
    this.webhookEvents.set(eventId, webhookEvent);

    // 3. Locate notification by provider_message_id or notification_id
    const providerMsgId = payload.provider_message_id || payload.message_id;
    let notif: InternalNotificationRecord | undefined;

    if (providerMsgId && this.providerMsgIndex.has(providerMsgId)) {
      const nid = this.providerMsgIndex.get(providerMsgId)!;
      notif = this.notifications.get(nid);
    }

    if (!notif && payload.notification_id) {
      notif = this.notifications.get(payload.notification_id);
    }

    if (!notif) {
      return { processed: true, reason: 'unmatched_notification' };
    }

    const prevStatus = notif.status;
    const rawStatus = String(payload.status || payload.delivery_status || '').toLowerCase();
    const isDelivered = rawStatus === 'delivered' || rawStatus === 'delivrd' || rawStatus === 'success';
    const isFailed = rawStatus === 'undelivered' || rawStatus === 'failed' || rawStatus === 'rejected';

    // Hard Rule 7 Non-Regression: If already delivered, never regress to failed or sent!
    if (notif.status === 'delivered') {
      return {
        processed: true,
        reason: 'already_delivered_no_regression',
        notificationId: notif.id,
        previousStatus: prevStatus,
        newStatus: 'delivered',
      };
    }

    const now = new Date().toISOString();

    if (isDelivered) {
      notif.status = 'delivered';
      notif.delivered_at = now;
      notif.updated_at = now;
      return {
        processed: true,
        notificationId: notif.id,
        previousStatus: prevStatus,
        newStatus: 'delivered',
      };
    } else if (isFailed) {
      notif.status = 'failed';
      notif.failed_at = now;
      notif.failure_reason = payload.error_message || payload.reason || 'Carrier delivery failed';
      notif.updated_at = now;
      return {
        processed: true,
        notificationId: notif.id,
        previousStatus: prevStatus,
        newStatus: 'failed',
      };
    }

    return {
      processed: true,
      notificationId: notif.id,
      previousStatus: prevStatus,
      newStatus: notif.status,
    };
  }

  // --- 5. Reporting & Management Operations ---

  public async getReportSummary(branchId?: string): Promise<NotificationReportSummaryDto> {
    let list = Array.from(this.notifications.values());
    if (branchId) {
      list = list.filter((n) => n.branch_id === branchId);
    }

    const summary: NotificationReportSummaryDto = {
      total: list.length,
      queued: 0,
      sending: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      cancelled: 0,
      skipped: 0,
      delivery_rate_percent: 0,
      failure_breakdown: {},
    };

    for (const n of list) {
      if (summary[n.status] !== undefined) {
        summary[n.status]++;
      }
      if (n.status === 'failed' && n.failure_reason) {
        const cat = n.failure_reason.slice(0, 40);
        summary.failure_breakdown[cat] = (summary.failure_breakdown[cat] || 0) + 1;
      }
      if (n.status === 'skipped' && n.skip_reason) {
        const cat = `Skipped: ${n.skip_reason}`;
        summary.failure_breakdown[cat] = (summary.failure_breakdown[cat] || 0) + 1;
      }
    }

    // Delivery rate percent = (delivered) / (sent + delivered + failed) * 100
    const resolvedAttempts = summary.sent + summary.delivered + summary.failed;
    summary.delivery_rate_percent =
      resolvedAttempts > 0 ? Math.round((summary.delivered / resolvedAttempts) * 1000) / 10 : 0;

    return summary;
  }

  public async listNotifications(params: NotificationFilterParams): Promise<{
    items: NotificationDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    let list = Array.from(this.notifications.values());

    if (params.branch_id) {
      list = list.filter((n) => n.branch_id === params.branch_id);
    }
    if (params.status) {
      list = list.filter((n) => n.status === params.status);
    }
    if (params.channel) {
      list = list.filter((n) => n.channel === params.channel);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      list = list.filter(
        (n) =>
          n.id.toLowerCase().includes(q) ||
          n.recipient.toLowerCase().includes(q) ||
          (n.patient_name && n.patient_name.toLowerCase().includes(q)) ||
          (n.appointment_id && n.appointment_id.toLowerCase().includes(q)) ||
          n.body.toLowerCase().includes(q) ||
          (n.provider_message_id && n.provider_message_id.toLowerCase().includes(q))
      );
    }
    if (params.date_from) {
      const from = new Date(params.date_from);
      list = list.filter((n) => new Date(n.scheduled_at) >= from);
    }
    if (params.date_to) {
      const to = new Date(params.date_to);
      list = list.filter((n) => new Date(n.scheduled_at) <= to);
    }

    // Sort newest scheduled first
    list.sort((a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime());

    const total = list.length;
    const page = params.page || 1;
    const limit = params.limit || 20;
    const startIndex = (page - 1) * limit;
    const items = list.slice(startIndex, startIndex + limit);

    return { items, total, page, limit };
  }

  public async retryNotification(id: string, actorUser: any): Promise<NotificationDto> {
    const notif = this.notifications.get(id);
    if (!notif) {
      throw new NotFoundError(`Notification '${id}' not found`);
    }

    if (notif.status !== 'failed') {
      throw new ConflictError(`Only notifications in 'failed' status can be retried (current: '${notif.status}')`);
    }

    const now = new Date().toISOString();
    notif.status = 'queued';
    notif.retry_count = 0;
    notif.next_retry_at = undefined;
    notif.failure_reason = undefined;
    notif.failed_at = undefined;
    notif.scheduled_at = now;
    notif.updated_at = now;

    await logAudit(null, {
      actorUserId: actorUser.id,
      action: 'notification.manual_retry',
      entityType: 'notifications',
      entityId: id,
      branchId: notif.branch_id,
      payloadAfter: { id, recipient: notif.recipient, status: 'queued' },
      ipAddress: '127.0.0.1',
    });

    return notif;
  }

  public async cancelNotification(id: string, reason: string | undefined, actorUser: any): Promise<NotificationDto> {
    const notif = this.notifications.get(id);
    if (!notif) {
      throw new NotFoundError(`Notification '${id}' not found`);
    }

    if (notif.status !== 'queued') {
      throw new ConflictError(`Only notifications in 'queued' status can be cancelled (current: '${notif.status}')`);
    }

    const now = new Date().toISOString();
    notif.status = 'cancelled';
    notif.skip_reason = reason || 'manually_cancelled';
    notif.updated_at = now;

    await logAudit(null, {
      actorUserId: actorUser.id,
      action: 'notification.manual_cancel',
      entityType: 'notifications',
      entityId: id,
      branchId: notif.branch_id,
      payloadAfter: { id, recipient: notif.recipient, status: 'cancelled', reason },
      ipAddress: '127.0.0.1',
    });

    return notif;
  }
}

export const notificationService = new NotificationService();
