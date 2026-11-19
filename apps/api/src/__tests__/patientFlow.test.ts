import { createApiApp } from '../app.js';
import type { Server } from 'node:http';
import {
  CSRF_HEADER_NAME,
  CSRF_COOKIE_NAME,
  ANON_COOKIE_NAME,
  parseCookies,
} from '../auth/csrf.js';
import { SESSION_COOKIE_NAME } from '../auth/session.js';
import { seedSuperadmin } from '../scripts/seedSuperadmin.js';
import { userRegistry } from '../routes/auth.js';
import { patientRepository } from '../services/patientService.js';

export async function runPatientFlowTests(): Promise<void> {
  console.log('[TEST-SUITE] Running Patient Registration, Search, Duplicate Prevention & Clinical Privacy Tests...');

  const app = createApiApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${(address as any).port}`;
  const standardOrigin = 'http://localhost:3000';

  try {
    // 1. Seed superadmin and authenticate to obtain CSRF and Session Cookie
    const { username, oneTimePassword } = await seedSuperadmin({ silent: true });

    const csrfRes = await fetch(`${baseUrl}/auth/csrf`);
    const csrfJson = (await csrfRes.json()) as { data: { csrfToken: string } };
    let csrfToken = csrfJson.data.csrfToken;
    const cookiesA = parseCookies(
      csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie().join('; ') : csrfRes.headers.get('set-cookie') || ''
    );
    let cookieHeader = `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}; ${ANON_COOKIE_NAME}=${cookiesA[ANON_COOKIE_NAME]}`;

    // Perform Login
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
      throw new Error(`Login failed with status ${loginRes.status}`);
    }

    const loginCookies = parseCookies(
      loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie().join('; ') : loginRes.headers.get('set-cookie') || ''
    );
    const sessionCookieVal = loginCookies[SESSION_COOKIE_NAME];
    csrfToken = loginCookies[CSRF_COOKIE_NAME];
    cookieHeader = `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}; ${SESSION_COOKIE_NAME}=${sessionCookieVal}`;

    console.log('  ✓ Superadmin authenticated with session and CSRF credentials');

    // 2. GET /api/v1/patients: List with pagination and default branch scoping
    const listRes = await fetch(`${baseUrl}/api/v1/patients?page=1&limit=10`, {
      headers: {
        Cookie: cookieHeader,
        Origin: standardOrigin,
      },
    });

    if (listRes.status !== 200) {
      throw new Error(`GET /api/v1/patients failed with status ${listRes.status}`);
    }
    const listJson = (await listRes.json()) as any;
    if (!Array.isArray(listJson.data) || listJson.data.length === 0) {
      throw new Error('Expected patient list with seeded records');
    }
    if (!listJson.meta.pagination || typeof listJson.meta.pagination.total !== 'number') {
      throw new Error('Expected API-CONV pagination envelope in list response');
    }
    console.log(`  ✓ GET /api/v1/patients returned ${listJson.data.length} records with API-CONV pagination`);

    // 3. GET /api/v1/patients/duplicate-check: Real-time duplicate check
    // Test match on existing mobile +8801712345678 (Sumaiya Rahman)
    const dupCheck1 = await fetch(`${baseUrl}/api/v1/patients/duplicate-check?mobile=%2B8801712345678`, {
      headers: {
        Cookie: cookieHeader,
        Origin: standardOrigin,
      },
    });
    const dupJson1 = (await dupCheck1.json()) as any;
    if (!dupJson1.data.hasDuplicate || !dupJson1.data.match) {
      throw new Error('Expected duplicate detection for +8801712345678');
    }
    if (dupJson1.data.match.fullName !== 'Sumaiya Rahman') {
      throw new Error(`Expected match to Sumaiya Rahman, got ${dupJson1.data.match.fullName}`);
    }
    console.log('  ✓ Real-time duplicate check detects existing Bangladesh mobile (+8801712345678)');

    // Test non-match on fresh number
    const dupCheck2 = await fetch(`${baseUrl}/api/v1/patients/duplicate-check?mobile=%2B8801399887766`, {
      headers: {
        Cookie: cookieHeader,
        Origin: standardOrigin,
      },
    });
    const dupJson2 = (await dupCheck2.json()) as any;
    if (dupJson2.data.hasDuplicate) {
      throw new Error('Did not expect duplicate for fresh mobile');
    }
    console.log('  ✓ Real-time duplicate check returns clean hasDuplicate: false for unmapped number');

    // 4. POST /api/v1/patients: Rejection of invalid mobile numbers (Check constraint / Zod)
    const invalidMobileRes = await fetch(`${baseUrl}/api/v1/patients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        'Idempotency-Key': crypto.randomUUID(),
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        fullName: 'Test Patient',
        gender: 'female',
        primaryMobile: '0123456789', // Invalid operator code (012 doesn't exist in BD)
        city: 'Dhaka',
      }),
    });

    if (invalidMobileRes.status !== 400 && invalidMobileRes.status !== 422) {
      throw new Error(`Expected 400 or 422 on invalid BD mobile, got ${invalidMobileRes.status}`);
    }
    console.log('  ✓ Bangladesh mobile regex validation enforces +8801[3-9] operator codes');

    // 5. POST /api/v1/patients: Successful registration of new patient
    const newPatientRes = await fetch(`${baseUrl}/api/v1/patients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        'Idempotency-Key': crypto.randomUUID(),
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        fullName: 'Dr. Sharmin Akter',
        fullNameBn: 'ডা. শারমিন আক্তার',
        gender: 'female',
        approximateAge: 32,
        bloodGroup: 'B+',
        primaryMobile: '+8801312345678',
        email: 'dr.sharmin@example.com',
        address: 'House 12, Road 4, Sector 3',
        area: 'Uttara',
        city: 'Dhaka',
        district: 'Dhaka',
        preferredLanguage: 'bn',
        acquisitionSource: 'walk_in',
      }),
    });

    if (newPatientRes.status !== 201) {
      const errText = await newPatientRes.text();
      throw new Error(`Patient registration failed with status ${newPatientRes.status}: ${errText}`);
    }

    const newPatientJson = (await newPatientRes.json()) as any;
    const createdPatient = newPatientJson.data.patient;
    if (!createdPatient.id || !createdPatient.patientCode) {
      throw new Error('Created patient missing ID or patientCode');
    }
    if (createdPatient.fullName !== 'Dr. Sharmin Akter' || createdPatient.fullNameBn !== 'ডা. শারমিন আক্তার') {
      throw new Error('Created patient demographic fields mismatch');
    }
    console.log(`  ✓ POST /api/v1/patients registered patient with atomic code: ${createdPatient.patientCode}`);

    // 6. POST /api/v1/patients: Duplicate candidate flow with human review logging (Hard Rule 9)
    // Attempt to register another patient with the same mobile number (+8801312345678)
    const dupAttempt1 = await fetch(`${baseUrl}/api/v1/patients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        'Idempotency-Key': crypto.randomUUID(),
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        fullName: 'Sharmin A. Duplicate',
        gender: 'female',
        primaryMobile: '+8801312345678',
        proceedWithDuplicate: false, // User has not confirmed override
      }),
    });

    if (dupAttempt1.status !== 409) {
      throw new Error(`Expected HTTP 409 Conflict when duplicate mobile not acknowledged, got ${dupAttempt1.status}`);
    }
    console.log('  ✓ Duplicate mobile without explicit acknowledgement returns HTTP 409 Conflict');

    // Register with proceedWithDuplicate: true
    const dupAttempt2 = await fetch(`${baseUrl}/api/v1/patients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        'Idempotency-Key': crypto.randomUUID(),
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        fullName: 'Sharmin A. Duplicate',
        gender: 'female',
        primaryMobile: '+8801312345678',
        proceedWithDuplicate: true, // User confirms duplicate candidate logging
      }),
    });

    if (dupAttempt2.status !== 201) {
      throw new Error(`Expected HTTP 201 when proceedWithDuplicate is true, got ${dupAttempt2.status}`);
    }
    const dupAttemptJson = (await dupAttempt2.json()) as any;
    const duplicatePatient = dupAttemptJson.data.patient;
    if (!dupAttemptJson.data.duplicateCandidateId) {
      throw new Error('Expected duplicateCandidateId logged in patient_duplicate_candidates table');
    }
    console.log(`  ✓ Duplicate profile created with candidate review log ID: ${dupAttemptJson.data.duplicateCandidateId}`);

    // 7. GET /api/v1/patients/duplicates: Verify candidate in review queue
    const queueRes = await fetch(`${baseUrl}/api/v1/patients/duplicates`, {
      headers: {
        Cookie: cookieHeader,
        Origin: standardOrigin,
      },
    });
    const queueJson = (await queueRes.json()) as any;
    const candidateItem = queueJson.data.find(
      (c: any) => c.id === dupAttemptJson.data.duplicateCandidateId
    );
    if (!candidateItem) {
      throw new Error('Logged duplicate candidate not found in review queue');
    }
    if (candidateItem.status !== 'pending' || candidateItem.matchConfidence !== 'high') {
      throw new Error('Expected pending status and high confidence match in duplicate candidate');
    }
    console.log('  ✓ Duplicate review queue correctly tracks candidate pair with confidence rating');

    // 8. POST /api/v1/patients/duplicates/:id/resolve: Non-destructive merge (Hard Rule 9)
    const mergeRes = await fetch(`${baseUrl}/api/v1/patients/duplicates/${candidateItem.id}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        'Idempotency-Key': crypto.randomUUID(),
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        action: 'merge',
        resolutionNotes: 'Verified duplicate registration during front-desk rush. Merged into primary profile.',
      }),
    });

    if (mergeRes.status !== 200) {
      const err = await mergeRes.text();
      throw new Error(`Failed to resolve duplicate with status ${mergeRes.status}: ${err}`);
    }

    // Verify duplicate patient status updated to 'merged' and references primary
    const checkMerged = await fetch(`${baseUrl}/api/v1/patients/${duplicatePatient.id}`, {
      headers: {
        Cookie: cookieHeader,
        Origin: standardOrigin,
      },
    });
    const mergedJson = (await checkMerged.json()) as any;
    if (mergedJson.data.status !== 'merged') {
      throw new Error(`Expected merged patient status to be 'merged', got ${mergedJson.data.status}`);
    }
    if (mergedJson.data.mergedIntoPatientId !== createdPatient.id) {
      throw new Error(`Expected mergedIntoPatientId to be ${createdPatient.id}, got ${mergedJson.data.mergedIntoPatientId}`);
    }
    console.log('  ✓ Non-destructive merge verified: status set to merged, primary reference set, zero data deleted');

    // 9. Sensitive Clinical Medical History: GET & POST
    const medHistoryUpdate = await fetch(`${baseUrl}/api/v1/patients/${createdPatient.id}/medical-history`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        'Idempotency-Key': crypto.randomUUID(),
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        allergies: 'Lidocaine topical ointment, Penicillin',
        skinType: 'Sensitive',
        chronicConditions: 'Mild eczema on cheeks',
        contraindications: 'Avoid high-concentration glycolic acid peels',
      }),
    });

    if (medHistoryUpdate.status !== 200) {
      throw new Error(`Medical history update failed with status ${medHistoryUpdate.status}`);
    }

    const medHistoryGet = await fetch(`${baseUrl}/api/v1/patients/${createdPatient.id}/medical-history`, {
      headers: {
        Cookie: cookieHeader,
        Origin: standardOrigin,
      },
    });
    const medHistoryJson = (await medHistoryGet.json()) as any;
    if (medHistoryJson.data.allergies !== 'Lidocaine topical ointment, Penicillin') {
      throw new Error('Allergies mismatch in clinical history response');
    }
    if (medHistoryJson.data.contraindications !== 'Avoid high-concentration glycolic acid peels') {
      throw new Error('Contraindications mismatch in clinical history response');
    }
    console.log('  ✓ Sensitive clinical medical history stored and retrieved with contraindications');

    // 10. Role-Aware DTO Isolation: Call Center privacy enforcement
    // Setup temporary user with 'call_center' role only
    const callCenterUser: import('../routes/auth.js').AuthUser = {
      id: 'usr_callcenter_1',
      username: 'callcenter_tester',
      email: 'callcenter@suoxi.com',
      phone: '+8801700000000',
      fullName: 'Call Center Agent',
      status: 'active',
      passwordHash: 'dummy-hash',
      primaryBranchId: 'SKC-01',
      allBranches: false,
      mustChangePassword: false,
    };
    userRegistry.addUser(callCenterUser);

    // Directly test formatPatientDto for call_center vs receptionist
    const { formatPatientDto } = await import('../services/patientService.js');
    const fullPatientRecord = await patientRepository.findById(createdPatient.id);
    if (!fullPatientRecord) {
      throw new Error('Full patient record missing');
    }

    const callCenterDto = formatPatientDto(fullPatientRecord, ['call_center']);
    if ('address' in callCenterDto || 'emergencyContactName' in callCenterDto || 'dueAmount' in callCenterDto) {
      throw new Error('Call Center DTO leaked private address, emergency contacts, or billing dues');
    }
    if (!callCenterDto.patientCode || !callCenterDto.primaryMobile) {
      throw new Error('Call Center DTO must include patientCode and primaryMobile for scheduling');
    }

    const clinicalDto = formatPatientDto(fullPatientRecord, ['doctor', 'receptionist']);
    if (!('address' in clinicalDto) || !('district' in clinicalDto)) {
      throw new Error('Clinical and front desk staff must receive full demographic and address fields');
    }
    console.log('  ✓ Role-aware DTO serialization verified: Call Center receives privacy-restricted DTO, Staff receive full DTO');

  } finally {
    server.close();
  }
}
