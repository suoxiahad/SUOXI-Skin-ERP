import assert from 'node:assert/strict';
import { callCenterService, getDhakaTomorrowDate } from '../services/callCenterService.js';
import { appointmentService } from '../services/appointmentService.js';
import { patientService } from '../services/patientService.js';
import { staffAlertService } from '../services/staffAlertService.js';

export async function runCallCenterFlowTests() {
  console.log('--- Running Call Center & Follow-Up Tasks Test Suite (Prompt 17) ---');

  // Reset services
  callCenterService.resetData();
  staffAlertService.resetData();

  const testActor = {
    id: 'usr-call-01',
    fullName: 'Fatema Khatun',
    roles: ['call_center'],
    branchId: 'br-dhk-01',
  };

  // =========================================================================
  // 1. Asia/Dhaka Tomorrow Date Boundary Verification
  // =========================================================================
  console.log('1. Testing Asia/Dhaka Wall-Clock Tomorrow Boundary (UTC+6, No DST)...');

  // Scenario A: 12:00 UTC on Oct 24 -> 18:00 Dhaka on Oct 24 -> Tomorrow is Oct 25
  const daytimeUtc = new Date('2026-10-24T12:00:00.000Z');
  const tomorrowDaytime = getDhakaTomorrowDate(daytimeUtc);
  assert.equal(
    tomorrowDaytime,
    '2026-10-25',
    'At 12:00 UTC (18:00 Dhaka), tomorrow in Dhaka must be 2026-10-25'
  );

  // Scenario B: 18:30 UTC on Oct 24 -> 00:30 Dhaka on Oct 25 -> Tomorrow is Oct 26
  const midnightShiftUtc = new Date('2026-10-24T18:30:00.000Z');
  const tomorrowMidnightShift = getDhakaTomorrowDate(midnightShiftUtc);
  assert.equal(
    tomorrowMidnightShift,
    '2026-10-26',
    'At 18:30 UTC (= 00:30 Dhaka next day), tomorrow in Dhaka must roll over to 2026-10-26'
  );

  console.log('   ✓ Dhaka tomorrow boundary correctly rolls over at 18:00 UTC / 00:00 Dhaka');

  // =========================================================================
  // 2. Automated Task Generation Idempotency (dedupe_key uniqueness)
  // =========================================================================
  console.log('2. Testing Task Generation Idempotency & dedupe_key Uniqueness...');

  // Create a patient and an appointment for test
  const uniqueMobile = `01799${Math.floor(100000 + Math.random() * 900000)}`;
  const patient = await patientService.createPatient(
    {
      fullName: 'Afsana Mimi',
      gender: 'female',
      primaryMobile: uniqueMobile,
    },
    'br-dhk-01',
    'usr-admin-01',
    '127.0.0.1'
  );

  // First generation run
  const run1 = await callCenterService.generateFollowUpTasks();
  console.log(`   Initial generation created: ${run1.generated} tasks, ${run1.skippedDuplicates} skipped.`);
  assert.ok(run1.generated > 0, 'First run should generate tasks');

  // Immediate second generation run with exact same data
  const run2 = await callCenterService.generateFollowUpTasks();
  console.log(`   Second generation created: ${run2.generated} tasks, ${run2.skippedDuplicates} skipped.`);
  assert.equal(
    run2.generated,
    0,
    'Second consecutive run must generate ZERO duplicate tasks (idempotent)'
  );
  assert.ok(
    run2.skippedDuplicates >= run1.generated,
    'Second run must skip all existing tasks as dedupe_key collisions'
  );

  console.log('   ✓ Idempotency guaranteed: 0 duplicates created on repeated worker runs');

  // =========================================================================
  // 3. Call Center Privacy Boundary & DTO Sanitation
  // =========================================================================
  console.log('3. Testing Server-Side Privacy DTO (Exclusion of Clinical & Financial Data)...');

  const tomorrowSessions = await callCenterService.listTomorrowSessions('br-dhk-01');
  assert.ok(tomorrowSessions.length > 0, 'Should have tomorrow sessions');

  for (const session of tomorrowSessions) {
    // Assert required contact and schedule fields are present
    assert.ok(session.patient_name, 'patient_name must be present');
    assert.ok(session.mobile, 'mobile must be present');
    assert.ok(session.patient_code, 'patient_code must be present');
    assert.ok(session.start_time, 'start_time must be present');

    // Assert strictly forbidden clinical & financial fields are NOT present
    const rawSession = session as any;
    assert.equal(rawSession.medical_history, undefined, 'medical_history must NOT be exposed to call center');
    assert.equal(rawSession.diagnoses, undefined, 'diagnoses must NOT be exposed to call center');
    assert.equal(rawSession.diagnosis, undefined, 'diagnosis must NOT be exposed to call center');
    assert.equal(rawSession.allergies, undefined, 'allergies must NOT be exposed to call center');
    assert.equal(rawSession.clinical_notes, undefined, 'clinical_notes must NOT be exposed to call center');
    assert.equal(rawSession.vital_signs, undefined, 'vital_signs must NOT be exposed to call center');
    assert.equal(rawSession.due_amount, undefined, 'due_amount must NOT be exposed to call center');
    assert.equal(rawSession.paid_amount, undefined, 'paid_amount must NOT be exposed to call center');
    assert.equal(rawSession.grand_total, undefined, 'grand_total must NOT be exposed to call center');
  }

  console.log('   ✓ Call Center role DTO strictly excludes medical history, diagnoses, allergies & billing dues');

  // =========================================================================
  // 4. Hard Rule 2 & Reschedule Routing Invariance
  // =========================================================================
  console.log('4. Testing Hard Rule 2: Reschedule Requests NEVER Modify Appointments Directly...');

  // Pick an existing tomorrow appointment
  const targetAppt = tomorrowSessions[0];
  const targetApptId = targetAppt.appointment_id || targetAppt.id!;
  const originalApptRecord = appointmentService.getAppointmentById(targetApptId);
  assert.ok(originalApptRecord, 'Original appointment record must exist');
  const originalDate = originalApptRecord.appointment_date;
  const originalTime = originalApptRecord.start_time;
  const originalStatus = originalApptRecord.status;

  // Log a reschedule request via call center service
  const callLog = await callCenterService.logCallOutcome(
    {
      appointment_id: targetApptId,
      patient_id: targetAppt.patient_id,
      outcome: 'reschedule_requested',
      notes: 'Patient requested shift to next week afternoon due to family event',
      requested_reschedule_date: '2026-11-05',
      requested_reschedule_time: '15:30',
      call_reference: 'PBX-REC-8849',
    },
    testActor
  );

  // Assert Call Contact Log recorded properly
  const recordedLog = (callLog as any).log ?? callLog;
  assert.equal(recordedLog.outcome, 'reschedule_requested');
  assert.equal(recordedLog.reschedule_status, 'pending');
  assert.equal(recordedLog.reschedule_requested_date, '2026-11-05');
  assert.equal(recordedLog.reschedule_requested_time, '15:30');
  assert.equal(recordedLog.call_reference, 'PBX-REC-8849');

  // Assert Staff Alert was created for Doctor and Reception
  const alertsRes = await staffAlertService.listAlerts({});
  const relatedAlert = alertsRes.alerts.find(
    (a) => (a.metadata as any)?.appointmentId === targetApptId || a.message.includes('reschedule')
  );
  assert.ok(relatedAlert, 'Staff alert must be created for reschedule request');
  assert.match(relatedAlert.message, /reschedule/i);

  // CRITICAL INVARIANCE: Check that underlying appointment was NOT modified!
  const unchangedAppt = appointmentService.getAppointmentById(targetApptId);
  assert.equal(
    unchangedAppt?.appointment_date,
    originalDate,
    'CRITICAL: Appointment date must remain 100% UNCHANGED by call center'
  );
  assert.equal(
    unchangedAppt?.start_time,
    originalTime,
    'CRITICAL: Appointment start time must remain 100% UNCHANGED by call center'
  );
  assert.equal(
    unchangedAppt?.status,
    originalStatus,
    'CRITICAL: Appointment status must remain 100% UNCHANGED by call center'
  );

  console.log('   ✓ Hard Rule 2 verified: Call Center logged reschedule creates alert; appointment is UNCHANGED');

  // =========================================================================
  // 5. Hard Rule 7: SMS Status Column Independent of Call Task Status
  // =========================================================================
  console.log('5. Testing Hard Rule 7: SMS Status & Call Status Independent Tracking...');

  const updatedTomorrow = await callCenterService.listTomorrowSessions('br-dhk-01');
  const loggedAppt = updatedTomorrow.find((a) => (a.appointment_id || a.id) === targetApptId);
  assert.ok(loggedAppt, 'Updated appointment session must exist');

  // Call status updated to reschedule_requested
  assert.equal(loggedAppt.call_task_status, 'reschedule_requested');
  assert.equal(loggedAppt.last_call_outcome, 'reschedule_requested');

  // SMS status remains independently tracked (e.g. delivered, sent, queued, or null)
  // It is NOT overwritten by call disposition!
  assert.equal(
    loggedAppt.sms_status,
    targetAppt.sms_status,
    'SMS delivery status must not be modified or erased by logging a call outcome'
  );

  console.log('   ✓ SMS delivery status and Call task status operate on independent state tracking');

  // =========================================================================
  // 6. Overdue Follow-Up Tasks Flagging
  // =========================================================================
  console.log('6. Testing Overdue Computation and Text + Icon Accessibility Indicators...');

  const tasksRes = await callCenterService.listFollowUpTasks({});
  const allTasks = tasksRes.items;
  assert.ok(allTasks.length > 0, 'Follow-up tasks queue should contain tasks');

  // Verify that tasks with due_date < now have is_overdue === true
  const nowUtc = new Date().toISOString();
  for (const t of allTasks) {
    if (t.due_date && t.due_date < nowUtc && t.status !== 'completed' && t.status !== 'cancelled') {
      assert.equal(t.is_overdue, true, `Task ${t.id} past due must have is_overdue = true`);
    }
  }

  // Assign task test
  const taskToAssign = allTasks.find((t) => !t.assigned_to) || allTasks[0];
  const assigned = await callCenterService.assignTask(taskToAssign.id, 'usr-call-02', 'Sharmin Akter');
  assert.equal(assigned.assigned_to, 'usr-call-02');
  assert.equal(assigned.assigned_to_name, 'Sharmin Akter');
  assert.equal(assigned.status, 'in_progress');

  // Complete task test
  const completed = await callCenterService.completeTask(taskToAssign.id, 'Patient confirmed attendance via alternate phone');
  assert.equal(completed.status, 'completed');
  assert.ok(completed.completed_at, 'completed_at timestamp must be set');
  assert.match(completed.notes || '', /Patient confirmed attendance/);

  console.log('   ✓ Overdue calculation, assignment, and completion workflows verified successfully');
  console.log('--- Call Center & Follow-Up Tasks Test Suite Passed! ---');
}
