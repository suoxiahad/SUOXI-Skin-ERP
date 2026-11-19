import assert from 'node:assert/strict';
import { notificationService, adjustForDhakaQuietHours } from '../services/notificationService.js';
import { staffAlertService } from '../services/staffAlertService.js';
import { patientService } from '../services/patientService.js';
import { appointmentService } from '../services/appointmentService.js';

export async function runNotificationQueueFlowTests() {
  console.log('--- Running Notification Queue, Reminders & Staff Alerts Tests (Prompt 16) ---');

  // Reset states
  notificationService.resetData();
  staffAlertService.resetData();

  const testActor = {
    id: 'usr-admin-01',
    fullName: 'Test Administrator',
    roles: ['super_admin'],
    branchId: 'br-dhk-01',
  };

  // =========================================================================
  // 1. Dhaka Quiet Hours Calculation (Decision A-04.2)
  // =========================================================================
  console.log('1. Testing Dhaka Quiet Hours Policy (21:00 to 08:00 Asia/Dhaka)...');

  // Test 1a: 10:00 AM Dhaka (04:00 UTC) -> Daytime, NOT shifted
  const daytimeUtc = new Date('2026-10-25T04:00:00.000Z'); // 10:00 AM Dhaka
  const { adjustedDate: adj1, wasShifted: s1 } = adjustForDhakaQuietHours(daytimeUtc);
  assert.equal(s1, false, 'Daytime 10:00 AM Dhaka should not be shifted');
  assert.equal(adj1.toISOString(), daytimeUtc.toISOString());

  // Test 1b: 22:30 Dhaka (16:30 UTC) -> Quiet hours! Must shift to next morning 08:00 Dhaka (02:00 UTC)
  const nightUtc = new Date('2026-10-25T16:30:00.000Z'); // 22:30 Dhaka
  const { adjustedDate: adj2, wasShifted: s2 } = adjustForDhakaQuietHours(nightUtc);
  assert.equal(s2, true, '22:30 Dhaka should be shifted');
  // Next day 08:00 Dhaka is 2026-10-26T02:00:00.000Z
  assert.equal(adj2.toISOString(), '2026-10-26T02:00:00.000Z', 'Must shift to 08:00 Dhaka (02:00 UTC) next morning');

  // Test 1c: 03:00 Dhaka (2026-10-25T21:00:00.000Z) -> Early morning quiet hours! Must shift to 08:00 Dhaka same morning
  const earlyMorningUtc = new Date('2026-10-25T21:00:00.000Z'); // 03:00 Dhaka on Oct 26
  const { adjustedDate: adj3, wasShifted: s3 } = adjustForDhakaQuietHours(earlyMorningUtc);
  assert.equal(s3, true, '03:00 Dhaka should be shifted');
  assert.equal(adj3.toISOString(), '2026-10-26T02:00:00.000Z', 'Must shift to 08:00 Dhaka on same morning');

  console.log('   ✓ Quiet hours correctly preserves daytime dispatches and shifts night messages to 08:00 Asia/Dhaka');

  // =========================================================================
  // 2. Automated Reminder Generator & Consent Checks (Decision A-04.1)
  // =========================================================================
  console.log('2. Testing 24h Reminder Generator, Idempotency & Patient Consent...');

  // Create a patient with SMS consent = false
  const noConsentPatient = await patientService.createPatient(
    {
      fullName: 'No Consent Patient',
      gender: 'female',
      primaryMobile: '01711998877',
      consentSmsNotifications: false,
    },
    'usr-admin-01',
    'br-dhk-01',
    '127.0.0.1'
  );

  // Create a patient with invalid phone
  const badPhonePatient = await patientService.createPatient(
    {
      fullName: 'Bad Phone Patient',
      gender: 'male',
      primaryMobile: '01711223344',
      consentSmsNotifications: true,
    },
    'usr-admin-01',
    'br-dhk-01',
    '127.0.0.1'
  );
  // Intentionally corrupt mobile to non-standard
  badPhonePatient.patient.primary_mobile = '12345';

  // Create appointments for tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const aptConsent = await appointmentService.createAppointment(
    {
      branch_id: 'br-dhk-01',
      patient_id: 'pat_87', // Consents to SMS
      provider_id: 'usr-doc-01',
      source_id: 'src-call',
      service_name: 'Laser Resurfacing',
      appointment_date: tomorrowStr,
      start_time: '11:00',
      duration_minutes: 30,
      appointment_type: 'procedure',
    },
    testActor,
    '127.0.0.1'
  );

  const aptNoConsent = await appointmentService.createAppointment(
    {
      branch_id: 'br-dhk-01',
      patient_id: noConsentPatient.patient.id,
      provider_id: 'usr-doc-01',
      source_id: 'src-call',
      service_name: 'Consultation',
      appointment_date: tomorrowStr,
      start_time: '12:00',
      duration_minutes: 30,
      appointment_type: 'consultation',
    },
    testActor,
    '127.0.0.1'
  );

  const aptCancelled = await appointmentService.createAppointment(
    {
      branch_id: 'br-dhk-01',
      patient_id: 'pat_88',
      provider_id: 'usr-doc-01',
      source_id: 'src-call',
      service_name: 'Chemical Peel',
      appointment_date: tomorrowStr,
      start_time: '14:00',
      duration_minutes: 30,
      appointment_type: 'procedure',
    },
    testActor,
    '127.0.0.1'
  );
  await appointmentService.cancelAppointment(
    aptCancelled.id,
    { reason: 'Patient requested cancellation' },
    { id: testActor.id, role: 'super_admin' }
  );

  // Run generator
  const genResult = await notificationService.generateSessionReminders(tomorrowStr);
  assert.ok(genResult.generated >= 1, 'Should have generated at least 1 reminder');
  assert.ok(genResult.skipped >= 2, 'Should have skipped at least 2 reminders (cancelled and no-consent)');

  // Verify no-consent skip
  const noConsentNotif = genResult.items.find((it) => it.appointment_id === aptNoConsent.id);
  assert.ok(noConsentNotif, 'No consent notification record must exist');
  assert.equal(noConsentNotif.status, 'skipped');
  assert.equal(noConsentNotif.skip_reason, 'no_consent');

  // Verify cancelled appointment skip
  const cancelledNotif = genResult.items.find((it) => it.appointment_id === aptCancelled.id);
  assert.ok(cancelledNotif, 'Cancelled notification record must exist');
  assert.equal(cancelledNotif.status, 'skipped');
  assert.equal(cancelledNotif.skip_reason, 'appointment_cancelled');

  // Verify valid appointment queued
  const validNotif = genResult.items.find((it) => it.appointment_id === aptConsent.id);
  assert.ok(validNotif, 'Valid appointment reminder must be queued');
  assert.equal(validNotif.status, 'queued');
  assert.equal(validNotif.idempotency_key, `session_reminder:apt:${aptConsent.id}:sms`);

  // Idempotency: re-running generator must not create duplicates
  const secondGen = await notificationService.generateSessionReminders(tomorrowStr);
  assert.equal(secondGen.generated, 0, 'Re-running generator must be completely idempotent (0 new items)');

  console.log('   ✓ Automated reminder generator enforces consent, appointment status, and strict idempotency');

  // =========================================================================
  // 3. Worker Dispatcher, Hard Rule 7 & Crash Recovery
  // =========================================================================
  console.log('3. Testing Dispatcher, Hard Rule 7 (Sent = Accepted), and Visibility Timeout...');

  // Set validNotif scheduled_at to past so worker claims it
  const pastIso = new Date(Date.now() - 60000).toISOString();
  (validNotif as any).scheduled_at = pastIso;

  // Run dispatch cycle
  const dispatchRes = await notificationService.claimAndDispatchBatch({
    workerId: 'test-worker-01',
    batchSize: 5,
    visibilityTimeoutSec: 10,
  });

  assert.ok(dispatchRes.claimed >= 1, 'Worker should claim at least 1 notification');
  assert.ok(dispatchRes.sent >= 1, 'Worker should have successfully sent claimed notification');

  // Check validNotif state: MUST BE 'sent' and sent_at populated, NOT 'delivered' (Hard Rule 7)
  const updatedValid = (await notificationService.listNotifications({})).items.find((it) => it.id === validNotif.id)!;
  assert.ok(updatedValid, 'updatedValid must be found in ledger');
  assert.equal(updatedValid.status, 'sent', 'Hard Rule 7: status must be sent (NOT delivered)');
  assert.ok(updatedValid.sent_at, 'sent_at must be populated');
  assert.equal(updatedValid.delivered_at, undefined, 'delivered_at must NOT be set upon gateway acceptance');
  assert.ok(updatedValid.provider_message_id, 'provider_message_id must be assigned by gateway');

  console.log('   ✓ Hard Rule 7 verified: Gateway acceptance transitions status to "sent" only');

  // Test Crash Recovery / Visibility Timeout
  // Simulate worker crash: notification left in 'sending' status with expired locked_until
  const crashNotif = await notificationService.enqueueNotification({
    branchId: 'br-dhk-01',
    recipient: '+8801711223344',
    body: 'Test crash recovery message',
    channel: 'sms',
    idempotencyKey: 'test:crash:recovery:01',
    scheduledAt: pastIso,
  });

  // Manually lock it with past timestamp
  (crashNotif as any).status = 'sending';
  (crashNotif as any).locked_by = 'crashed-worker-99';
  (crashNotif as any).locked_until = new Date(Date.now() - 5000).toISOString(); // Expired 5 sec ago

  // Next worker claims it and dispatches
  const recoveryRes = await notificationService.claimAndDispatchBatch({
    workerId: 'active-worker-02',
    batchSize: 10,
  });

  assert.ok(recoveryRes.claimed >= 1, 'Active worker must reclaim crashed in-flight notification');
  assert.equal((crashNotif as any).status, 'sent', 'Reclaimed notification must now be sent');

  console.log('   ✓ Crash recovery verified: Expired visibility timeouts are successfully reclaimed');

  // =========================================================================
  // 4. Retry Backoff & Staff Alerts on Terminal Failure
  // =========================================================================
  console.log('4. Testing Exponential Backoff and Staff Alerts Bell upon Terminal Failure...');

  const initialAlerts = await staffAlertService.listAlerts({});
  const initialAlertsCount = initialAlerts.alerts.length;

  // Enqueue notification with invalid number (+8801999999999) to force gateway rejection
  const failingNotif = await notificationService.enqueueNotification({
    branchId: 'br-dhk-01',
    patientId: 'pat_87',
    recipient: '+8801999999999', // Triggers mock gateway failure
    body: 'Will fail delivery',
    channel: 'sms',
    idempotencyKey: 'test:fail:backoff:01',
    scheduledAt: pastIso,
    maxRetries: 2, // 2 retries to speed up test
  });

  // 1st dispatch attempt -> should fail and queue with next_retry_at
  await notificationService.claimAndDispatchBatch({ workerId: 'worker-1' });
  assert.equal(failingNotif.status, 'queued', 'Should re-queue on 1st failure');
  assert.equal(failingNotif.retry_count, 1, 'retry_count should be 1');
  assert.ok(failingNotif.next_retry_at, 'next_retry_at should be computed');

  // Set next_retry_at to past for 2nd attempt
  (failingNotif as any).next_retry_at = pastIso;

  // 2nd dispatch attempt -> terminal failure!
  await notificationService.claimAndDispatchBatch({ workerId: 'worker-1' });
  assert.equal(failingNotif.status, 'failed', 'Should transition to failed after maxRetries');
  assert.equal(failingNotif.retry_count, 2);
  assert.ok(failingNotif.failed_at, 'failed_at must be populated');
  assert.ok(failingNotif.failure_reason, 'failure_reason must be populated');

  // Verify Staff Alert Bell item created
  const postFailAlerts = await staffAlertService.listAlerts({});
  assert.ok(postFailAlerts.alerts.length > initialAlertsCount, 'Staff alert must be created for terminal failure');
  const terminalAlert = postFailAlerts.alerts.find(
    (a) => a.alert_type === 'failed_reminder' && (a.metadata as any)?.notificationId === failingNotif.id
  );
  assert.ok(terminalAlert, 'Alert metadata must link to failing notification');
  assert.equal(terminalAlert.link_path, '/reports/notifications');

  console.log('   ✓ Exponential retry backoff and Staff Alert Bell notification verified on terminal failure');

  // =========================================================================
  // 5. Delivery Webhook: CSRF-Exempt, Replay Protection, Carrier Delivered & Non-Regression
  // =========================================================================
  console.log('5. Testing Webhook Ingestion, Replay Protection & Status Non-Regression...');

  const providerMsgId = updatedValid.provider_message_id!;
  const eventId = `wh-evt-${Date.now()}`;

  // 5a: Valid delivery callback
  const whRes = await notificationService.processDeliveryWebhook({
    provider: 'elitbuzz',
    payload: {
      provider_message_id: providerMsgId,
      status: 'DELIVERED',
      event_id: eventId,
    },
    timestampHeader: String(Math.floor(Date.now() / 1000)),
  });

  assert.equal(whRes.processed, true);
  assert.equal(whRes.newStatus, 'delivered');
  assert.equal(updatedValid.status, 'delivered', 'Status must now be delivered');
  assert.ok(updatedValid.delivered_at, 'delivered_at must be populated');

  // 5b: Replay Protection: identical eventId sent again
  const replayRes = await notificationService.processDeliveryWebhook({
    provider: 'elitbuzz',
    payload: {
      provider_message_id: providerMsgId,
      status: 'DELIVERED',
      event_id: eventId,
    },
  });
  assert.equal(replayRes.processed, false, 'Replay event must not be processed');
  assert.equal(replayRes.reason, 'duplicate_event_ignored');

  // 5c: Non-Regression: late callback with "failed" or "sent" status MUST NOT regress "delivered" status!
  const lateRes = await notificationService.processDeliveryWebhook({
    provider: 'elitbuzz',
    payload: {
      provider_message_id: providerMsgId,
      status: 'FAILED',
      event_id: `wh-late-${Date.now()}`,
    },
  });
  assert.equal(lateRes.reason, 'already_delivered_no_regression');
  assert.equal(updatedValid.status, 'delivered', 'Status must NOT regress from delivered');

  // 5d: Timestamp tolerance check (> 5 minutes rejected)
  const staleTimestamp = String(Math.floor(Date.now() / 1000) - 400); // 400 seconds ago
  await assert.rejects(
    async () => {
      await notificationService.processDeliveryWebhook({
        provider: 'elitbuzz',
        payload: { event_id: 'evt-stale' },
        timestampHeader: staleTimestamp,
      });
    },
    /tolerance window/,
    'Timestamp out of +/- 5 min window must be rejected'
  );

  console.log('   ✓ Delivery receipt webhook processed, replay protected, and status non-regression confirmed');

  // =========================================================================
  // 6. Manual Operations: Retry, Cancel & Reporting Metrics
  // =========================================================================
  console.log('6. Testing Manual Retry, Manual Cancel, and Report Summary Metrics...');

  // Manual Retry for failed notification
  const retried = await notificationService.retryNotification(failingNotif.id, testActor);
  assert.equal(retried.status, 'queued', 'Retried notification must return to queued status');
  assert.equal(retried.retry_count, 0, 'Retry count must be reset to 0');
  assert.equal(retried.failure_reason, undefined);

  // Manual Cancel for queued notification
  const cancelled = await notificationService.cancelNotification(retried.id, 'Cancelled by clinic manager', testActor);
  assert.equal(cancelled.status, 'cancelled', 'Queued notification must transition to cancelled');
  assert.equal(cancelled.skip_reason, 'Cancelled by clinic manager');

  // Report Summary
  const summary = await notificationService.getReportSummary('br-dhk-01');
  assert.ok(summary.total > 0, 'Report summary total must be > 0');
  assert.ok(summary.delivery_rate_percent >= 0 && summary.delivery_rate_percent <= 100);
  assert.ok(typeof summary.queued === 'number');
  assert.ok(typeof summary.sent === 'number');
  assert.ok(typeof summary.delivered === 'number');

  // Staff alerts mark read
  const unreadBefore = (await staffAlertService.listAlerts({ isRead: false })).unreadCount;
  const markedCount = await staffAlertService.markAllAsRead('usr-admin-01', 'br-dhk-01');
  assert.ok(markedCount >= 1, 'Mark all as read must mark at least 1 alert');
  const unreadAfter = (await staffAlertService.listAlerts({ isRead: false })).unreadCount;
  assert.equal(unreadAfter, 0, 'All alerts should now be read');

  console.log('   ✓ Manual retry, cancellation, summary metrics, and staff alerts operations validated');
  console.log('--- Notification Queue Flow Tests Passed Successfully ---\n');
}
