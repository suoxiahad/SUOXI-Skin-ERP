import { createApiApp } from '../app.js';
import type { Server } from 'node:http';
import crypto from 'node:crypto';
import {
  CSRF_HEADER_NAME,
  CSRF_COOKIE_NAME,
  ANON_COOKIE_NAME,
  parseCookies,
} from '../auth/csrf.js';
import { SESSION_COOKIE_NAME } from '../auth/session.js';
import { seedSuperadmin } from '../scripts/seedSuperadmin.js';
import { userRegistry } from '../routes/auth.js';
import { hashPassword } from '../auth/password.js';
import { getRbacRepository } from '../services/permissionResolver.js';
import { appointmentService } from '../services/appointmentService.js';
import { patientRepository } from '../services/patientService.js';
import type { AppointmentDto, AppointmentDetailDto } from '@suoxi/shared-types';

export async function runAppointmentFlowTests(): Promise<void> {
  console.log('[TEST-SUITE] Running Appointments Concurrency, Status Lifecycle, Clinical Protection & Timeline Tests...');

  const app = createApiApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${(address as any).port}`;
  const standardOrigin = 'http://localhost:3000';

  try {
    // 1. Authenticate as Superadmin
    const { username, oneTimePassword } = await seedSuperadmin({ silent: true });

    const csrfRes = await fetch(`${baseUrl}/auth/csrf`);
    const csrfJson = (await csrfRes.json()) as { data: { csrfToken: string } };
    let csrfToken = csrfJson.data.csrfToken;
    const cookiesA = parseCookies(
      csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie().join('; ') : csrfRes.headers.get('set-cookie') || ''
    );
    let cookieHeader = `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}; ${ANON_COOKIE_NAME}=${cookiesA[ANON_COOKIE_NAME]}`;

    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({ username, password: oneTimePassword }),
    });

    if (loginRes.status !== 200) {
      throw new Error(`Superadmin login failed: ${loginRes.status}`);
    }

    const loginCookies = parseCookies(
      loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie().join('; ') : loginRes.headers.get('set-cookie') || ''
    );
    const sessionCookieVal = loginCookies[SESSION_COOKIE_NAME];
    csrfToken = loginCookies[CSRF_COOKIE_NAME];
    cookieHeader = `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}; ${SESSION_COOKIE_NAME}=${sessionCookieVal}`;

    console.log('  ✓ Superadmin authenticated with active session and CSRF tokens');

    // 2. Query seed appointment APT-000412
    const listRes = await fetch(`${baseUrl}/api/v1/appointments`, {
      headers: { Cookie: cookieHeader },
    });
    if (listRes.status !== 200) {
      throw new Error(`GET /appointments failed: ${listRes.status}`);
    }
    const listJson = await listRes.json();
    if (!Array.isArray(listJson.data)) {
      throw new Error('GET /appointments did not return data array');
    }
    const seedApt = listJson.data.find((a: any) => a.appointment_code === 'APT-000412');
    if (!seedApt) {
      throw new Error('DEV seed appointment APT-000412 not found');
    }
    console.log(`  ✓ DEV sample APT-000412 verified: ${seedApt.patient_name}, ${seedApt.service_name}, ${seedApt.status}`);

    // 3. Test Availability endpoint
    const availRes = await fetch(`${baseUrl}/api/v1/appointments/availability?providerId=usr-101&date=2026-10-21&duration=45`, {
      headers: { Cookie: cookieHeader },
    });
    if (availRes.status !== 200) {
      throw new Error(`GET /appointments/availability failed: ${availRes.status}`);
    }
    const availJson = await availRes.json();
    const busySlot = availJson.data.slots.find((s: any) => s.start_time === '16:30');
    if (!busySlot || busySlot.is_available) {
      throw new Error('Expected slot 16:30 to be marked unavailable due to APT-000412');
    }
    console.log('  ✓ Slot availability calculation correctly detected existing booking at 16:30');

    // 4. Concurrency Test: Two parallel POSTs for the identical provider and time slot
    // In block mode, exactly one must return 201 and one must return 409
    const testDate = '2026-11-15';
    const testSlot = '14:00';
    const bookingPayloadA = {
      patient_id: 'pat-1',
      branch_id: 'br-dhanmondi',
      provider_id: 'usr-102', // Dr. Farhana Khan
      source_id: 'src-1',
      service_name: 'Laser Carbon Peel',
      appointment_date: testDate,
      start_time: testSlot,
      duration_minutes: 30,
      appointment_type: 'treatment_session',
    };
    const bookingPayloadB = {
      patient_id: 'pat-2',
      branch_id: 'br-dhanmondi',
      provider_id: 'usr-102', // Same doctor, same slot!
      source_id: 'src-2',
      service_name: 'Consultation',
      appointment_date: testDate,
      start_time: testSlot,
      duration_minutes: 30,
      appointment_type: 'consultation',
    };

    const [postARes, postBRes] = await Promise.all([
      fetch(`${baseUrl}/api/v1/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: standardOrigin,
          [CSRF_HEADER_NAME]: csrfToken,
          'Idempotency-Key': crypto.randomUUID(),
          Cookie: cookieHeader,
        },
        body: JSON.stringify(bookingPayloadA),
      }),
      fetch(`${baseUrl}/api/v1/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: standardOrigin,
          [CSRF_HEADER_NAME]: csrfToken,
          'Idempotency-Key': crypto.randomUUID(),
          Cookie: cookieHeader,
        },
        body: JSON.stringify(bookingPayloadB),
      }),
    ]);

    const statuses = [postARes.status, postBRes.status].sort();
    if (statuses[0] !== 201 || statuses[1] !== 409) {
      throw new Error(`Concurrency test failed! Expected [201, 409], received: [${postARes.status}, ${postBRes.status}]`);
    }

    const winningRes = postARes.status === 201 ? postARes : postBRes;
    const winningJson = await winningRes.json();
    const winningId = winningJson.data.id;
    console.log(`  ✓ Concurrency lock verified: exactly one 201 Created and one 409 Conflict (${winningJson.data.appointment_code})`);

    // 5. Test Status Transitions & Terminal States (PRD-VERIFY)
    // Booked -> Confirmed: OK
    const confirmRes = await fetch(`${baseUrl}/api/v1/appointments/${winningId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({ status: 'confirmed', reason: 'Patient confirmed attendance' }),
    });
    if (confirmRes.status !== 200) {
      throw new Error(`Failed to confirm appointment: ${confirmRes.status}`);
    }
    console.log('  ✓ Transition Booked -> Confirmed succeeded');

    // Confirmed -> Visited (Check-in): OK
    const visitRes = await fetch(`${baseUrl}/api/v1/appointments/${winningId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({ status: 'visited', reason: 'Patient checked in at reception' }),
    });
    if (visitRes.status !== 200) {
      throw new Error(`Failed to check-in appointment: ${visitRes.status}`);
    }
    const visitedJson = await visitRes.json();
    if (!visitedJson.data.checked_in_at) {
      throw new Error('checked_in_at timestamp was not recorded on visited status');
    }
    console.log(`  ✓ Check-in recorded checked_in_at: ${visitedJson.data.checked_in_at}`);

    // Visited is Terminal! Attempting to transition from Visited -> Booked or Visited -> Confirmed must fail with 409
    const invalidTransRes = await fetch(`${baseUrl}/api/v1/appointments/${winningId}/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({ status: 'confirmed' }),
    });
    if (invalidTransRes.status !== 409) {
      throw new Error(`Expected 409 for transition from terminal visited state, got ${invalidTransRes.status}`);
    }
    console.log('  ✓ Terminal state protection verified: Visited status rejected further modification with HTTP 409 Conflict');

    // 6. Test Atomic Reschedule
    // Create an appointment to reschedule
    const aptToRescheduleRes = await fetch(`${baseUrl}/api/v1/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        'Idempotency-Key': crypto.randomUUID(),
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        patient_id: 'pat-1',
        branch_id: 'br-dhanmondi',
        provider_id: 'usr-101',
        source_id: 'src-1',
        service_name: 'Follow-up Consultation',
        appointment_date: '2026-11-20',
        start_time: '15:00',
        duration_minutes: 30,
        appointment_type: 'follow_up',
      }),
    });
    const aptToRescheduleJson = await aptToRescheduleRes.json();
    const oldAptId = aptToRescheduleJson.data.id;

    // Reschedule to a new slot
    const rescheduleRes = await fetch(`${baseUrl}/api/v1/appointments/${oldAptId}/reschedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        'Idempotency-Key': crypto.randomUUID(),
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        appointment_date: '2026-11-22',
        start_time: '16:00',
        reason: 'Patient requested weekend afternoon time slot',
      }),
    });
    if (rescheduleRes.status !== 200) {
      throw new Error(`Reschedule failed: ${rescheduleRes.status}`);
    }
    const rescheduleJson = await rescheduleRes.json();
    const { oldAppointment, newAppointment } = rescheduleJson.data;

    if (oldAppointment.status !== 'rescheduled' || oldAppointment.rescheduled_to_appointment_id !== newAppointment.id) {
      throw new Error('Old appointment not properly linked to new appointment on reschedule');
    }
    if (newAppointment.rescheduled_from_appointment_id !== oldAppointment.id || newAppointment.status !== 'booked') {
      throw new Error('New appointment not properly linked from old appointment on reschedule');
    }
    console.log(`  ✓ Atomic reschedule verified: ${oldAppointment.appointment_code} marked rescheduled -> linked to ${newAppointment.appointment_code}`);

    // Verify appointment status history was written for both
    const oldDetailRes = await fetch(`${baseUrl}/api/v1/appointments/${oldAptId}`, {
      headers: { Cookie: cookieHeader },
    });
    const oldDetailJson = (await oldDetailRes.json()) as { data: AppointmentDetailDto };
    if (!oldDetailJson.data.status_history || oldDetailJson.data.status_history.length < 2) {
      throw new Error('Status history missing on rescheduled appointment');
    }
    console.log(`  ✓ Status audit history rows verified: ${oldDetailJson.data.status_history.length} audit entries recorded`);

    // 7. Clinical Protection: Call Center role cannot alter date/time on set_by_clinician appointments
    // Create an appointment with set_by_clinician = true
    const docAptRes = await fetch(`${baseUrl}/api/v1/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        'Idempotency-Key': crypto.randomUUID(),
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        patient_id: 'pat-1',
        branch_id: 'br-dhanmondi',
        provider_id: 'usr-101',
        source_id: 'src-5', // Doctor-defined follow-up
        service_name: 'Doctor Next Session',
        appointment_date: '2026-11-25',
        start_time: '11:00',
        duration_minutes: 30,
        appointment_type: 'follow_up',
        set_by_clinician: true,
      }),
    });
    const docAptJson = await docAptRes.json();
    const docAptId = docAptJson.data.id;

    // Create a call center agent user in userRegistry
    const ccPassword = 'AgentSecure#2026';
    const ccPasswordHash = await hashPassword(ccPassword);
    const ccUserId = 'usr-agent-01';

    userRegistry.addUser({
      id: ccUserId,
      username: 'agent_suoxi',
      email: 'agent@suoxi.com',
      phone: '+8801799887766',
      passwordHash: ccPasswordHash,
      fullName: 'Agent Rina',
      fullNameBn: 'এজেন্ট রিনা',
      status: 'active',
      allBranches: false,
      mustChangePassword: false,
      primaryBranchId: 'br-dhanmondi',
    });

    const rbacRepo = getRbacRepository();
    if ('setUser' in rbacRepo) {
      (rbacRepo as any).setUser({
        userId: ccUserId,
        username: 'agent_suoxi',
        primaryBranchId: 'br-dhanmondi',
        allBranches: false,
        allowedBranchIds: ['br-dhanmondi'],
        mustChangePassword: false,
        roles: ['call_center'],
        rolePermissions: [
          'patient.view',
          'appointment.create',
        ],
        permissionOverrides: [],
      });
    }

    // Login as call center agent
    const ccCsrfRes = await fetch(`${baseUrl}/auth/csrf`);
    const ccCsrfJson = await ccCsrfRes.json();
    const ccCsrfToken = ccCsrfJson.data.csrfToken;
    const ccCookiesA = parseCookies(
      ccCsrfRes.headers.getSetCookie ? ccCsrfRes.headers.getSetCookie().join('; ') : ccCsrfRes.headers.get('set-cookie') || ''
    );
    let ccCookieHeader = `${CSRF_COOKIE_NAME}=${encodeURIComponent(ccCsrfToken)}; ${ANON_COOKIE_NAME}=${ccCookiesA[ANON_COOKIE_NAME]}`;

    const ccLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: ccCsrfToken,
        Cookie: ccCookieHeader,
      },
      body: JSON.stringify({ username: 'agent_suoxi', password: 'AgentSecure#2026' }),
    });

    const ccLoginCookies = parseCookies(
      ccLoginRes.headers.getSetCookie ? ccLoginRes.headers.getSetCookie().join('; ') : ccLoginRes.headers.get('set-cookie') || ''
    );
    const ccSessionCookie = ccLoginCookies[SESSION_COOKIE_NAME];
    const ccAuthCsrf = ccLoginCookies[CSRF_COOKIE_NAME];
    const ccFullCookie = `${CSRF_COOKIE_NAME}=${encodeURIComponent(ccAuthCsrf)}; ${SESSION_COOKIE_NAME}=${ccSessionCookie}`;

    // Call center user attempts to change appointment_date on clinician-set appointment -> MUST RETURN 403
    const ccPatchRes = await fetch(`${baseUrl}/api/v1/appointments/${docAptId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: ccAuthCsrf,
        Cookie: ccFullCookie,
      },
      body: JSON.stringify({ appointment_date: '2026-11-26' }),
    });

    if (ccPatchRes.status !== 403) {
      throw new Error(`Expected HTTP 403 Forbidden for call-center modification of clinician appointment, received ${ccPatchRes.status}`);
    }
    console.log('  ✓ Hard Rule 2 & Clinical Protection verified: call-center user cannot alter clinician-set schedule (HTTP 403 Forbidden)');

    // 8. Out-of-branch Resource Check
    const outOfBranchRes = await fetch(`${baseUrl}/api/v1/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        'Idempotency-Key': crypto.randomUUID(),
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        patient_id: 'pat-1',
        branch_id: 'br-uttara', // different branch
        provider_id: 'usr-101',
        resource_id: 'res-1', // belongs to br-dhanmondi
        source_id: 'src-1',
        service_name: 'Consultation',
        appointment_date: '2026-11-28',
        start_time: '10:00',
        duration_minutes: 30,
        appointment_type: 'consultation',
      }),
    });
    if (outOfBranchRes.status !== 400 && outOfBranchRes.status !== 404) {
      throw new Error(`Expected 400 or 404 for out-of-branch resource allocation, got ${outOfBranchRes.status}`);
    }
    console.log('  ✓ Out-of-branch resource protection verified: cross-branch resource allocation rejected');

    // 9. Verify Patient Timeline includes appointments
    const timelineRes = await fetch(`${baseUrl}/api/v1/patients/pat-1/timeline`, {
      headers: { Cookie: cookieHeader },
    });
    if (timelineRes.status !== 200) {
      throw new Error(`GET /patients/pat-1/timeline failed: ${timelineRes.status}`);
    }
    const timelineJson = await timelineRes.json();
    const aptTimelineItems = timelineJson.data.filter((item: any) => item.refType === 'appointments');
    if (aptTimelineItems.length === 0) {
      throw new Error('v_patient_timeline did not contain appointment events for pat-1');
    }
    console.log(`  ✓ Unified patient timeline verified: contains ${aptTimelineItems.length} appointment lifecycle events`);

    console.log('[PASS] Appointments Concurrency, Status Lifecycle, Clinical Protection & Timeline');
  } finally {
    server.close();
  }
}
