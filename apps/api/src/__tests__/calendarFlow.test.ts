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
import type { CalendarResponseDto } from '@suoxi/shared-types';

export async function runCalendarFlowTests(): Promise<void> {
  console.log('[TEST-SUITE] Running Calendar Views, 42-Day Range Capping, Shaded Schedules & Reschedule Tests...');

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

    const loginCookies = parseCookies(
      loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie().join('; ') : loginRes.headers.get('set-cookie') || ''
    );
    const sessionCookie = loginCookies[SESSION_COOKIE_NAME];
    csrfToken = (await loginRes.json()).data.csrfToken || csrfToken;
    cookieHeader = `${SESSION_COOKIE_NAME}=${sessionCookie}; ${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}`;
    console.log('  ✓ Superadmin authenticated with session and CSRF tokens');

    // 2. Test Range Capping: Window > 42 days must return HTTP 400 Bad Request
    const largeRangeRes = await fetch(
      `${baseUrl}/api/v1/calendar?from=2026-10-01&to=2026-11-20`, // 50 days
      {
        headers: {
          Cookie: cookieHeader,
          Origin: standardOrigin,
        },
      }
    );
    if (largeRangeRes.status !== 400) {
      throw new Error(`Expected HTTP 400 for range > 42 days, got ${largeRangeRes.status}`);
    }
    const largeRangeJson = await largeRangeRes.json();
    if (!largeRangeJson.error?.message?.includes('42 days')) {
      throw new Error(`Expected error message mentioning 42 days, got: ${largeRangeJson.error?.message}`);
    }
    console.log('  ✓ Range capping verified: requests exceeding 42-day window return HTTP 400 Bad Request');

    // 3. Test Invalid Range: from > to must return HTTP 400 Bad Request
    const invertedRangeRes = await fetch(
      `${baseUrl}/api/v1/calendar?from=2026-10-25&to=2026-10-10`,
      {
        headers: {
          Cookie: cookieHeader,
          Origin: standardOrigin,
        },
      }
    );
    if (invertedRangeRes.status !== 400) {
      throw new Error(`Expected HTTP 400 for from > to, got ${invertedRangeRes.status}`);
    }
    console.log('  ✓ Inverted date range protection verified: "from" > "to" returns HTTP 400 Bad Request');

    // 4. Test Normal Calendar Retrieval with Doctor Time-Off Hatched Blocks
    const validRangeRes = await fetch(
      `${baseUrl}/api/v1/calendar?from=2026-10-18&to=2026-10-25`,
      {
        headers: {
          Cookie: cookieHeader,
          Origin: standardOrigin,
        },
      }
    );
    if (validRangeRes.status !== 200) {
      throw new Error(`Expected HTTP 200 for valid calendar range, got ${validRangeRes.status}`);
    }
    const calendarJson = (await validRangeRes.json()) as { data: CalendarResponseDto };
    const { appointments: calApts, schedules, timeOffs } = calendarJson.data;

    if (!Array.isArray(calApts) || !Array.isArray(schedules) || !Array.isArray(timeOffs)) {
      throw new Error('Malformed calendar response payload structure');
    }

    // Verify time-off item exists for Dr. Farhana Khan (usr-102)
    const farhanaTimeOff = timeOffs.find((t) => t.provider_id === 'usr-102');
    if (!farhanaTimeOff) {
      throw new Error('Expected time-off block for Dr. Farhana Khan (usr-102)');
    }
    console.log(`  ✓ Doctor time-off verified: ${farhanaTimeOff.reason} (${farhanaTimeOff.start_datetime} to ${farhanaTimeOff.end_datetime}) for hatched rendering`);

    // Verify provider schedules are provided for shading working hours
    if (schedules.length === 0) {
      throw new Error('Expected provider schedules for working hours shading');
    }
    console.log(`  ✓ Provider schedules verified: ${schedules.length} active schedule rules returned for slot shading`);

    // 5. Test Month Count Match: calendar appointments count matches /appointments list count
    const listAptsRes = await fetch(
      `${baseUrl}/api/v1/appointments?startDate=2026-10-18&endDate=2026-10-25&limit=1000`,
      {
        headers: {
          Cookie: cookieHeader,
          Origin: standardOrigin,
        },
      }
    );
    const listAptsJson = await listAptsRes.json();
    const listCount = listAptsJson.data.length;

    if (calApts.length !== listCount) {
      throw new Error(`Calendar count (${calApts.length}) does not match appointment list count (${listCount})`);
    }
    console.log(`  ✓ Month appointment count match verified: Calendar (${calApts.length}) matches Appointment List (${listCount})`);

    // 6. Test Call Center Privacy Protection on Calendar DTO (Sensitive clinical notes omitted)
    const ccPassword = 'AgentSecure#2026';
    const ccPasswordHash = await hashPassword(ccPassword);
    const ccUserId = 'usr-agent-cal-01';

    userRegistry.addUser({
      id: ccUserId,
      username: 'agent_cal',
      email: 'agent_cal@suoxi.com',
      phone: '+8801799887755',
      passwordHash: ccPasswordHash,
      fullName: 'Agent Rafiq',
      fullNameBn: 'এজেন্ট রফিক',
      status: 'active',
      allBranches: false,
      mustChangePassword: false,
      primaryBranchId: 'br-dhanmondi',
    });

    const rbacRepo = getRbacRepository();
    if ('setUser' in rbacRepo) {
      (rbacRepo as any).setUser({
        userId: ccUserId,
        username: 'agent_cal',
        primaryBranchId: 'br-dhanmondi',
        allBranches: false,
        allowedBranchIds: ['br-dhanmondi'],
        mustChangePassword: false,
        roles: ['call_center'],
        rolePermissions: ['appointment.view', 'patient.view'],
        permissionOverrides: [],
      });
    }

    const ccCsrfRes = await fetch(`${baseUrl}/auth/csrf`);
    const ccCsrfToken = (await ccCsrfRes.json()).data.csrfToken;
    const ccCookiesA = parseCookies(
      ccCsrfRes.headers.getSetCookie ? ccCsrfRes.headers.getSetCookie().join('; ') : ccCsrfRes.headers.get('set-cookie') || ''
    );
    const ccCookieHeaderA = `${CSRF_COOKIE_NAME}=${encodeURIComponent(ccCsrfToken)}; ${ANON_COOKIE_NAME}=${ccCookiesA[ANON_COOKIE_NAME]}`;

    const ccLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: ccCsrfToken,
        Cookie: ccCookieHeaderA,
      },
      body: JSON.stringify({ username: 'agent_cal', password: ccPassword }),
    });

    const ccLoginCookies = parseCookies(
      ccLoginRes.headers.getSetCookie ? ccLoginRes.headers.getSetCookie().join('; ') : ccLoginRes.headers.get('set-cookie') || ''
    );
    const ccSessionCookie = ccLoginCookies[SESSION_COOKIE_NAME];
    const ccCsrfTokenFinal = (await ccLoginRes.json()).data.csrfToken || ccCsrfToken;
    const ccAuthCookie = `${SESSION_COOKIE_NAME}=${ccSessionCookie}; ${CSRF_COOKIE_NAME}=${encodeURIComponent(ccCsrfTokenFinal)}`;

    const ccCalRes = await fetch(
      `${baseUrl}/api/v1/calendar?from=2026-10-18&to=2026-10-25`,
      {
        headers: {
          Cookie: ccAuthCookie,
          Origin: standardOrigin,
        },
      }
    );
    if (ccCalRes.status !== 200) {
      throw new Error(`Expected HTTP 200 for call-center calendar view, got ${ccCalRes.status}`);
    }
    const ccCalJson = await ccCalRes.json();
    const ccApts = ccCalJson.data.appointments;
    for (const apt of ccApts) {
      if (apt.notes !== null && apt.notes !== undefined) {
        throw new Error('Call center role received sensitive clinical notes in calendar DTO');
      }
    }
    console.log('  ✓ Role-aware serialization verified: Call center calendar DTO strips sensitive clinical notes');

    // 7. Test Drag-to-Reschedule Conflict Verification
    // Create an existing appointment at 2026-10-28 15:00 for Dr. Farhana Khan
    const existingAptRes = await fetch(`${baseUrl}/api/v1/appointments`, {
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
        provider_id: 'usr-102',
        source_id: 'src-1',
        service_name: 'Laser Toning',
        appointment_date: '2026-10-28',
        start_time: '15:00',
        duration_minutes: 30,
        appointment_type: 'consultation',
      }),
    });
    if (existingAptRes.status !== 201) {
      throw new Error(`Failed to create baseline appointment for reschedule conflict test: ${existingAptRes.status}`);
    }

    // Create a second appointment to drag
    const movingAptRes = await fetch(`${baseUrl}/api/v1/appointments`, {
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
        provider_id: 'usr-102',
        source_id: 'src-1',
        service_name: 'Consultation',
        appointment_date: '2026-10-28',
        start_time: '11:00',
        duration_minutes: 30,
        appointment_type: 'consultation',
      }),
    });
    const movingAptJson = await movingAptRes.json();
    const movingAptId = movingAptJson.data.id;

    // Simulate drag reschedule into occupied slot (15:00) -> Must return HTTP 409 Conflict
    const dragRescheduleRes = await fetch(`${baseUrl}/api/v1/appointments/${movingAptId}/reschedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        'Idempotency-Key': crypto.randomUUID(),
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        appointment_date: '2026-10-28',
        start_time: '15:00',
        duration_minutes: 30,
        reason: 'Moved via calendar drag and drop',
      }),
    });

    if (dragRescheduleRes.status !== 409) {
      throw new Error(`Expected HTTP 409 Conflict when dragging onto occupied slot, got ${dragRescheduleRes.status}`);
    }
    const conflictJson = await dragRescheduleRes.json();
    if (!conflictJson.error?.message?.includes('already has an appointment')) {
      throw new Error(`Expected conflict message from server, got: ${conflictJson.error?.message}`);
    }
    console.log(`  ✓ Drag-to-reschedule conflict verified: server rejected move into occupied slot with HTTP 409 Conflict (${conflictJson.error.message})`);

    console.log('[PASS] Calendar Views, 42-Day Range Capping, Shaded Schedules & Reschedule');
  } finally {
    server.close();
  }
}
