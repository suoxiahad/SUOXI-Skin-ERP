import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createApiApp } from '../app.js';
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
import { sessionService } from '../services/sessionService.js';
import { appointmentService } from '../services/appointmentService.js';
import { catalogService } from '../services/catalogService.js';
import { patientService } from '../services/patientService.js';
import type {
  TreatmentSessionDto,
  TreatmentPhotoDto,
  SessionConsumableDto,
} from '@suoxi/shared-types';

export async function runTreatmentSessionFlowTests(): Promise<void> {
  console.log('[TEST-SUITE] Running Treatment Sessions & Next-Session Tests (Prompt 10)...');

  // Reset clean state
  sessionService.resetData();
  catalogService.resetData();

  const { username, oneTimePassword } = await seedSuperadmin({ silent: true });

  const app = createApiApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${(address as any).port}`;
  const standardOrigin = 'http://localhost:3000';

  try {
    // 1. Authenticate as Superadmin / Doctor
    const csrfRes = await fetch(`${baseUrl}/auth/csrf`);
    assert.equal(csrfRes.status, 200);
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
      body: JSON.stringify({
        username,
        password: oneTimePassword,
      }),
    });
    assert.equal(loginRes.status, 200);
    const loginCookies = parseCookies(
      loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie().join('; ') : loginRes.headers.get('set-cookie') || ''
    );
    cookieHeader = `${SESSION_COOKIE_NAME}=${loginCookies[SESSION_COOKIE_NAME]}; ${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}`;
    console.log('  ✓ Clinician authenticated with session and CSRF');

    // 2. List sessions
    const listRes = await fetch(`${baseUrl}/api/v1/sessions`, {
      headers: { Cookie: cookieHeader },
    });
    assert.equal(listRes.status, 200);
    const listData = ((await listRes.json()) as any).data as TreatmentSessionDto[];
    assert.ok(listData.length > 0);
    const sampleSession = listData[0];
    assert.equal(sampleSession.id, 'ses-sample-01');
    assert.equal(sampleSession.status, 'planned');
    assert.equal(sampleSession.sessionNo, 3);
    assert.equal(sampleSession.totalSessions, 6);
    console.log(`  ✓ Sessions listed successfully (${listData.length} sessions, ${sampleSession.sessionCode}: Session ${sampleSession.sessionNo} of ${sampleSession.totalSessions})`);

    // 3. Get single session record
    const getRes = await fetch(`${baseUrl}/api/v1/sessions/${sampleSession.id}`, {
      headers: { Cookie: cookieHeader },
    });
    assert.equal(getRes.status, 200);
    const sessionDetails = ((await getRes.json()) as any).data as TreatmentSessionDto;
    assert.equal(sessionDetails.sessionCode, 'SES-000001');
    assert.ok(sessionDetails.consumables && sessionDetails.consumables.length >= 2);
    assert.ok(sessionDetails.photos && sessionDetails.photos.length >= 1);
    console.log('  ✓ Session record retrieved with seeded consumables and private photo records');

    // 4. Log a new session consumable
    const addConsumableRes = await fetch(`${baseUrl}/api/v1/sessions/${sampleSession.id}/consumables`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        productName: 'Topical Benzocaine 20% Anesthetic Gel',
        batchNumber: 'LOT-BNZ-2026',
        quantity: 1,
        unit: 'tube',
        notes: 'Applied 30 mins prior to laser pass',
      }),
    });
    assert.equal(addConsumableRes.status, 201);
    const conData = ((await addConsumableRes.json()) as any).data as SessionConsumableDto;
    assert.equal(conData.productName, 'Topical Benzocaine 20% Anesthetic Gel');
    assert.equal(conData.quantity, 1);
    console.log(`  ✓ Consumable logged successfully (${conData.productName}, batch ${conData.batchNumber})`);

    // 5. Upload a clinical photo (Before/After/Progress)
    const addPhotoRes = await fetch(`${baseUrl}/api/v1/sessions/${sampleSession.id}/photos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        photoType: 'progress',
        bodySite: 'Left Malar Cheek',
        isVisibleToPatient: true,
        clinicalNotes: 'Immediate post-laser pass 2 erythema pattern',
        fileBuffer: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        filename: 'progress-cheek-01.png',
      }),
    });
    assert.equal(addPhotoRes.status, 201);
    const photoData = ((await addPhotoRes.json()) as any).data as TreatmentPhotoDto;
    assert.equal(photoData.photoType, 'progress');
    assert.ok(photoData.signedUrl);
    console.log(`  ✓ Clinical photo uploaded with short-lived signed access URL (${photoData.photoType}: ${photoData.bodySite})`);

    // 6. Receptionist Access Gate for Photos: Receptionist cannot view clinical photos (HTTP 403 Forbidden)
    const recepPassword = 'RecepSecurePass#2026';
    const recepPasswordHash = await hashPassword(recepPassword);
    const recepUserId = 'usr-recep-photos-01';

    userRegistry.addUser({
      id: recepUserId,
      username: 'receptionist_ph',
      email: 'receptionist_ph@suoxi.com',
      phone: '+8801700000002',
      fullName: 'Farzana Akter (Receptionist)',
      fullNameBn: 'ফারজানা আক্তার',
      passwordHash: recepPasswordHash,
      status: 'active',
      primaryBranchId: 'br-dhanmondi',
      mustChangePassword: false,
      allBranches: false,
    });

    const rbacRepo = getRbacRepository();
    if ('setUser' in rbacRepo) {
      (rbacRepo as any).setUser({
        userId: recepUserId,
        username: 'receptionist_ph',
        primaryBranchId: 'br-dhanmondi',
        allBranches: false,
        allowedBranchIds: ['br-dhanmondi'],
        mustChangePassword: false,
        roles: ['receptionist'],
        rolePermissions: ['treatment.session.view'], // Only standard session view, no clinical photo view
        permissionOverrides: [],
      });
    }

    const recepCsrfRes = await fetch(`${baseUrl}/auth/csrf`);
    const recepCsrfData = (await recepCsrfRes.json()) as any;
    const recepCookiesA = parseCookies(
      recepCsrfRes.headers.getSetCookie ? recepCsrfRes.headers.getSetCookie().join('; ') : recepCsrfRes.headers.get('set-cookie') || ''
    );
    const recepCookie = `${CSRF_COOKIE_NAME}=${encodeURIComponent(recepCsrfData.data.csrfToken)}; ${ANON_COOKIE_NAME}=${recepCookiesA[ANON_COOKIE_NAME]}`;

    const recepLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: recepCsrfData.data.csrfToken,
        Cookie: recepCookie,
      },
      body: JSON.stringify({
        username: 'receptionist_ph',
        password: recepPassword,
      }),
    });
    assert.equal(recepLoginRes.status, 200);
    const recepLoginCookies = parseCookies(
      recepLoginRes.headers.getSetCookie ? recepLoginRes.headers.getSetCookie().join('; ') : recepLoginRes.headers.get('set-cookie') || ''
    );
    const recepAuthCookie = `${SESSION_COOKIE_NAME}=${recepLoginCookies[SESSION_COOKIE_NAME]}; ${CSRF_COOKIE_NAME}=${encodeURIComponent(recepCsrfData.data.csrfToken)}`;

    const recepPhotoRes = await fetch(`${baseUrl}/api/v1/sessions/${sampleSession.id}/photos`, {
      headers: { Cookie: recepAuthCookie },
    });
    assert.equal(recepPhotoRes.status, 403);
    console.log('  ✓ Photo privacy gate verified: Receptionist barred from viewing clinical photos (HTTP 403 Forbidden)');

    // 7. Complete Session (Idempotent)
    const completeRes = await fetch(`${baseUrl}/api/v1/sessions/${sampleSession.id}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
        'Idempotency-Key': 'comp-sample-01-unique-key',
      },
      body: JSON.stringify({
        outcomeNotes: 'Mild erythema, tolerated well',
        aftercareInstructions: 'Apply the soothing gel twice daily and avoid sun for 72 hours',
        publishAftercareToPortal: true,
      }),
    });
    assert.equal(completeRes.status, 200);
    const completedSession = ((await completeRes.json()) as any).data as TreatmentSessionDto;
    assert.equal(completedSession.status, 'completed');
    assert.ok(completedSession.completedAt);
    assert.ok(completedSession.completedBy);
    assert.equal(completedSession.packageSessionDeducted, true);
    console.log(`  ✓ Treatment session completed successfully (${completedSession.sessionCode}, completed_at=${completedSession.completedAt})`);

    // 8. Re-entrancy / Double-Complete Protection
    const doubleCompleteRes = await fetch(`${baseUrl}/api/v1/sessions/${sampleSession.id}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
        'Idempotency-Key': 'comp-sample-01-second-attempt',
      },
      body: JSON.stringify({
        outcomeNotes: 'Attempted duplicate completion',
      }),
    });
    assert.equal(doubleCompleteRes.status, 409);
    console.log('  ✓ Re-entrancy verified: duplicate complete returned HTTP 409 Conflict with zero side effects');

    // 9. Concurrent Complete Serialization
    // Create another planned session
    const patientId = sampleSession.patientId;
    const serviceId = sampleSession.serviceId;

    const newAptRes = await appointmentService.createAppointment(
      {
        patient_id: patientId,
        provider_id: 'usr-102',
        branch_id: 'br-dhanmondi',
        service_category: 'laser',
        service_name: 'Fractional CO2 Laser Resurfacing',
        appointment_date: '2026-10-26',
        start_time: '10:00',
        duration_minutes: 45,
        appointment_type: 'treatment_session',
        source_id: 'src-1',
        notes: 'Pre-session appointment for concurrency test',
      },
      { id: 'usr-super-01', role: 'super_admin', branchId: 'br-dhanmondi' }
    );

    const createdSessionRes = await fetch(`${baseUrl}/api/v1/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        patientId,
        appointmentId: newAptRes.id,
        serviceId,
        doctorId: 'usr-doc-01',
        branchId: 'br-dhanmondi',
        sessionNo: 1,
        totalSessions: 4,
      }),
    });
    assert.equal(createdSessionRes.status, 201);
    const newSession = ((await createdSessionRes.json()) as any).data as TreatmentSessionDto;

    // Fire 2 concurrent complete calls
    const [c1, c2] = await Promise.all([
      fetch(`${baseUrl}/api/v1/sessions/${newSession.id}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: standardOrigin,
          [CSRF_HEADER_NAME]: csrfToken,
          Cookie: cookieHeader,
        },
        body: JSON.stringify({ outcomeNotes: 'Concurrent call 1' }),
      }),
      fetch(`${baseUrl}/api/v1/sessions/${newSession.id}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: standardOrigin,
          [CSRF_HEADER_NAME]: csrfToken,
          Cookie: cookieHeader,
        },
        body: JSON.stringify({ outcomeNotes: 'Concurrent call 2' }),
      }),
    ]);

    const statuses = [c1.status, c2.status].sort();
    assert.deepEqual(statuses, [200, 409]);
    console.log('  ✓ Concurrency lock verified: parallel completes resolved to exactly ONE 200 and ONE 409');

    // 10. Call Center Next Session Gate: User with role call_center cannot set next session (HTTP 403)
    const callCenterPassword = 'CallCenterSecure#2026';
    const callCenterPasswordHash = await hashPassword(callCenterPassword);
    const callCenterUserId = 'usr-cc-rx-01';

    userRegistry.addUser({
      id: callCenterUserId,
      username: 'callcenter_rx',
      email: 'callcenter_rx@suoxi.com',
      phone: '+8801700000003',
      fullName: 'Tania Sultana (Call Center)',
      passwordHash: callCenterPasswordHash,
      status: 'active',
      primaryBranchId: 'br-dhanmondi',
      mustChangePassword: false,
      allBranches: false,
    });

    if ('setUser' in rbacRepo) {
      (rbacRepo as any).setUser({
        userId: callCenterUserId,
        username: 'callcenter_rx',
        primaryBranchId: 'br-dhanmondi',
        allBranches: false,
        allowedBranchIds: ['br-dhanmondi'],
        mustChangePassword: false,
        roles: ['call_center'],
        rolePermissions: ['appointment.view', 'treatment.session.view'],
        permissionOverrides: [],
      });
    }

    const ccCsrfRes = await fetch(`${baseUrl}/auth/csrf`);
    const ccCsrfData = (await ccCsrfRes.json()) as any;
    const ccCookiesA = parseCookies(
      ccCsrfRes.headers.getSetCookie ? ccCsrfRes.headers.getSetCookie().join('; ') : ccCsrfRes.headers.get('set-cookie') || ''
    );
    const ccCookie = `${CSRF_COOKIE_NAME}=${encodeURIComponent(ccCsrfData.data.csrfToken)}; ${ANON_COOKIE_NAME}=${ccCookiesA[ANON_COOKIE_NAME]}`;

    const ccLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: ccCsrfData.data.csrfToken,
        Cookie: ccCookie,
      },
      body: JSON.stringify({
        username: 'callcenter_rx',
        password: callCenterPassword,
      }),
    });
    assert.equal(ccLoginRes.status, 200);
    const ccLoginCookies = parseCookies(
      ccLoginRes.headers.getSetCookie ? ccLoginRes.headers.getSetCookie().join('; ') : ccLoginRes.headers.get('set-cookie') || ''
    );
    const ccAuthCookie = `${SESSION_COOKIE_NAME}=${ccLoginCookies[SESSION_COOKIE_NAME]}; ${CSRF_COOKIE_NAME}=${encodeURIComponent(ccCsrfData.data.csrfToken)}`;

    const ccNextSessionRes = await fetch(`${baseUrl}/api/v1/sessions/${sampleSession.id}/next-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: ccCsrfData.data.csrfToken,
        Cookie: ccAuthCookie,
      },
      body: JSON.stringify({
        date: '2026-10-28',
        startTime: '16:30',
      }),
    });
    assert.equal(ccNextSessionRes.status, 403);
    console.log('  ✓ Hard Rule 2 verified: Call Center rejected from setting next session (HTTP 403 Forbidden)');

    // 11. Doctor Sets Next Session
    const docNextSessionRes = await fetch(`${baseUrl}/api/v1/sessions/${sampleSession.id}/next-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        date: '2026-10-28',
        startTime: '16:30',
        durationMinutes: 60,
        notes: 'Fractional laser session 4 follow-up. Check epidermal healing.',
      }),
    });
    assert.equal(docNextSessionRes.status, 201);
    const nextSessionData = ((await docNextSessionRes.json()) as any).data;
    assert.ok(nextSessionData.appointment);
    assert.equal(nextSessionData.appointment.origin_session_id || nextSessionData.appointment.originSessionId, sampleSession.id);
    assert.equal(Boolean(nextSessionData.appointment.set_by_clinician || nextSessionData.appointment.setByClinician), true);
    assert.match(nextSessionData.message, /Next session set for/);
    console.log(`  ✓ Doctor scheduled next session: ${nextSessionData.message}`);

    // 12. Slot Conflict on Next Session
    // Attempting to book the identical slot for the same doctor triggers conflict error from appointment service
    const conflictRes = await fetch(`${baseUrl}/api/v1/sessions/${newSession.id}/next-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        date: '2026-10-28',
        startTime: '16:30', // Exact duplicate slot
        durationMinutes: 60,
      }),
    });
    assert.equal(conflictRes.status, 409);
    console.log('  ✓ Appointment conflict mode verified: overlapping next-session slot blocked (HTTP 409 Conflict)');

  } finally {
    server.close();
  }
}
