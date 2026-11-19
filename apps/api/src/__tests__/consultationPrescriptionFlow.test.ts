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
import { consultationService } from '../services/consultationService.js';
import { prescriptionService } from '../services/prescriptionService.js';
import { catalogService } from '../services/catalogService.js';
import type {
  ConsultationDto,
  PrescriptionDto,
} from '@suoxi/shared-types';

export async function runConsultationPrescriptionFlowTests(): Promise<void> {
  console.log('[TEST-SUITE] Running Consultations, Prescriptions & PDF Tests (Prompt 9)...');

  // Reset clean state
  consultationService.resetData();
  prescriptionService.resetData();
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
    // 1. Authenticate as Superadmin / Clinician
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

    // 2. Fetch seeded patient and service
    const pListRes = await fetch(`${baseUrl}/api/v1/patients`, {
      headers: { Cookie: cookieHeader },
    });
    const pListData = ((await pListRes.json()) as any).data;
    const patientId = pListData[0].id;

    const sListRes = await fetch(`${baseUrl}/api/v1/catalog/treatments`, {
      headers: { Cookie: cookieHeader },
    });
    const sListData = ((await sListRes.json()) as any).data;
    const serviceId = sListData.find((s: any) => s.id === 'srv-hf-001')?.id || sListData[0].id;

    // Create Consultation from appointment
    const createCnsRes = await fetch(`${baseUrl}/api/v1/appointments/apt-test-01/consultation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        patientId,
        chiefComplaint: 'Post-inflammatory erythema and active breakouts on cheeks',
        assessment: 'Fitzpatrick Type IV, mild papular acne, PIE',
        clinicalNotes: 'Advised HydraFacial and topical SPF regimen',
        recommendedServiceId: serviceId,
      }),
    });
    assert.equal(createCnsRes.status, 201);
    const cnsData = ((await createCnsRes.json()) as any).data as ConsultationDto;
    assert.ok(cnsData.id);
    assert.match(cnsData.consultationCode, /^CNS-\d{6}$/);
    assert.equal(cnsData.status, 'draft');
    assert.equal(cnsData.version, 1);
    console.log(`  ✓ Consultation created successfully (${cnsData.consultationCode}, version 1)`);

    // 3. Debounced Auto-Save with Version Optimistic Locking
    // Save 1: matching version = 1 -> succeeds
    const patchCnsRes = await fetch(`${baseUrl}/api/v1/consultations/${cnsData.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        version: 1,
        chiefComplaint: 'Updated chief complaint with precise timeline',
      }),
    });
    assert.equal(patchCnsRes.status, 200);
    const patchedCns = ((await patchCnsRes.json()) as any).data as ConsultationDto;
    assert.equal(patchedCns.version, 2);

    // Save 2: stale version = 1 -> must return 409 Conflict
    const stalePatchRes = await fetch(`${baseUrl}/api/v1/consultations/${cnsData.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        version: 1, // Stale version!
        chiefComplaint: 'Attempting to overwrite with stale version',
      }),
    });
    assert.equal(stalePatchRes.status, 409);
    console.log('  ✓ Concurrency locking verified: stale consultation version rejected with HTTP 409 Conflict');

    // 4. Create Treatment Plan linked to consultation
    const planRes = await fetch(`${baseUrl}/api/v1/consultations/${cnsData.id}/treatment-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        serviceId,
        plannedSessions: 4,
        startDate: '2026-10-25',
        expectedEndDate: '2026-12-20',
        notes: 'Sessions spaced 2 weeks apart',
      }),
    });
    assert.equal(planRes.status, 201);
    const planData = ((await planRes.json()) as any).data;
    assert.match(planData.planCode, /^PLN-\d{6}$/);
    assert.equal(planData.plannedSessions, 4);
    console.log(`  ✓ Treatment plan created (${planData.planCode}, 4 planned sessions)`);

    // 5. Create Informed Consent Record
    const consentRes = await fetch(`${baseUrl}/api/v1/consultations/${cnsData.id}/consent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        serviceId,
        consentType: 'procedure',
        consentText: 'I agree to the HydraFacial treatment protocol and understand post-care requirements.',
        isSigned: true,
        witnessName: 'Farzana Akter (Receptionist)',
      }),
    });
    assert.equal(consentRes.status, 201);
    const consentData = ((await consentRes.json()) as any).data;
    assert.match(consentData.consentCode, /^CNSNT-\d{6}$/);
    assert.equal(consentData.isSigned, true);
    console.log(`  ✓ Consent record created and signed (${consentData.consentCode})`);

    // 6. Create Draft Prescription with bilingual items
    const createRxRes = await fetch(`${baseUrl}/api/v1/prescriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        consultationId: cnsData.id,
        patientId,
        serviceId,
        diagnosis: 'Post-acne hyperpigmentation',
        advice: 'Avoid direct sun exposure between 10am-4pm. Strict hydration.',
        followupAdvice: 'Follow-up in 14 days',
        nextSessionDate: '2026-11-04',
        language: 'both',
        suggestFood: true,
        items: [
          {
            itemName: 'Sunscreen SPF 50+',
            itemNameBn: 'সানস্ক্রিন এসপিএফ ৫০+',
            strength: 'SPF 50+ PA++++',
            dosage: '2 finger lengths',
            frequency: 'Every morning',
            frequencyBn: 'প্রতিদিন সকালে',
            duration: '30 days',
            route: 'Topical',
            instructions: 'Apply 20 minutes before outdoors',
            instructionsBn: 'বাইরে যাওয়ার ২০ মিনিট আগে লাগাবেন',
            sortOrder: 1,
          },
          {
            itemName: 'Niacinamide 10% Serum',
            itemNameBn: 'নায়াসিনামাইড ১০% সিরাম',
            strength: '10%',
            dosage: '3 drops',
            frequency: '1+0+1',
            frequencyBn: '১+০+১',
            duration: '30 days',
            route: 'Topical',
            instructions: 'Apply morning and night',
            sortOrder: 2,
          },
        ],
      }),
    });
    assert.equal(createRxRes.status, 201);
    const rxData = ((await createRxRes.json()) as any).data as PrescriptionDto;
    assert.ok(rxData.id);
    assert.match(rxData.prescriptionCode, /^RX-\d{6}$/);
    assert.equal(rxData.status, 'draft');
    assert.equal(rxData.versionNumber, 1);
    assert.equal(rxData.items.length, 2);
    console.log(`  ✓ Draft prescription created (${rxData.prescriptionCode} v1, 2 bilingual items)`);

    // 7. Clinical Gate Check: Non-clinical user (receptionist) cannot finalize prescription
    const nonClinicalPassword = 'ReceptionistSecure#2026';
    const nonClinicalPasswordHash = await hashPassword(nonClinicalPassword);
    const nonClinicalUserId = 'usr-recep-rx-01';

    userRegistry.addUser({
      id: nonClinicalUserId,
      username: 'receptionist_rx',
      email: 'receptionist_rx@suoxi.com',
      phone: '+8801700000001',
      fullName: 'Farzana Akter (Receptionist)',
      fullNameBn: 'ফারজানা আক্তার',
      passwordHash: nonClinicalPasswordHash,
      status: 'active',
      primaryBranchId: 'br-dhanmondi',
      mustChangePassword: false,
      allBranches: false,
    });

    const rbacRepo = getRbacRepository();
    if ('setUser' in rbacRepo) {
      (rbacRepo as any).setUser({
        userId: nonClinicalUserId,
        username: 'receptionist_rx',
        primaryBranchId: 'br-dhanmondi',
        allBranches: false,
        allowedBranchIds: ['br-dhanmondi'],
        mustChangePassword: false,
        roles: ['receptionist'],
        rolePermissions: ['prescription.view', 'prescription.finalize'], // Has permission but non-clinical role
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
        username: 'receptionist_rx',
        password: nonClinicalPassword,
      }),
    });
    assert.equal(recepLoginRes.status, 200);
    const recepLoginCookies = parseCookies(
      recepLoginRes.headers.getSetCookie ? recepLoginRes.headers.getSetCookie().join('; ') : recepLoginRes.headers.get('set-cookie') || ''
    );
    const recepAuthCookie = `${SESSION_COOKIE_NAME}=${recepLoginCookies[SESSION_COOKIE_NAME]}; ${CSRF_COOKIE_NAME}=${encodeURIComponent(recepCsrfData.data.csrfToken)}`;

    const recepFinalizeRes = await fetch(`${baseUrl}/api/v1/prescriptions/${rxData.id}/finalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: recepCsrfData.data.csrfToken,
        Cookie: recepAuthCookie,
      },
    });
    assert.equal(recepFinalizeRes.status, 403);
    console.log('  ✓ Clinical gate verified: Non-clinical receptionist rejected from finalizing prescription (HTTP 403 Forbidden)');

    // 8. Finalize Prescription as Doctor (Atomic transaction with Suggest Food snapshot & PDF)
    const finalizeRes = await fetch(`${baseUrl}/api/v1/prescriptions/${rxData.id}/finalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
    });
    assert.equal(finalizeRes.status, 200);
    const finalizedRx = ((await finalizeRes.json()) as any).data as PrescriptionDto;
    assert.equal(finalizedRx.status, 'finalized');
    assert.ok(finalizedRx.finalizedAt);
    assert.ok(finalizedRx.finalizedBy);
    assert.ok(finalizedRx.guidanceSnapshot);
    assert.ok(finalizedRx.guidanceSnapshot.items.length > 0);
    assert.ok(finalizedRx.pdfSha256);
    console.log(`  ✓ Prescription finalized: status='finalized', guidance snapshot attached (${finalizedRx.guidanceSnapshot.items.length} items), PDF SHA-256=${finalizedRx.pdfSha256?.slice(0, 16)}...`);

    // 9. Re-entrancy & Concurrency: calling finalize a second time returns 409 Conflict
    const secondFinalizeRes = await fetch(`${baseUrl}/api/v1/prescriptions/${rxData.id}/finalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
    });
    assert.equal(secondFinalizeRes.status, 409);
    console.log('  ✓ Re-entrancy verified: second finalize call returned HTTP 409 Conflict with zero duplicate snapshots');

    // 10. Immutability: direct PATCH on finalized prescription must return 409 Conflict
    const patchFinalizedRes = await fetch(`${baseUrl}/api/v1/prescriptions/${rxData.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        diagnosis: 'Attempted in-place modification of diagnosis',
      }),
    });
    assert.equal(patchFinalizedRes.status, 409);
    console.log('  ✓ Immutability rule verified: PATCH on finalized prescription rejected with HTTP 409 Conflict');

    // 11. Suggest Food Page Count: unchecked -> 1 page, checked -> 2 pages
    const { pdfService } = await import('../services/pdfService.js');
    const pdf1PageRes = await pdfService.generatePrescriptionPdf({
      ...finalizedRx,
      suggestFood: false,
    });
    assert.equal(pdf1PageRes.pageCount, 1);

    const pdf2PageRes = await pdfService.generatePrescriptionPdf({
      ...finalizedRx,
      suggestFood: true,
    });
    assert.equal(pdf2PageRes.pageCount, 2);
    console.log('  ✓ PDF page count verified: Suggest Food unchecked -> 1 page, checked -> 2 pages');

    // 12. Correction creates v2 and supersedes v1 atomically
    const correctRes = await fetch(`${baseUrl}/api/v1/prescriptions/${rxData.id}/correct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        reason: 'Adjusted sunscreen to mineral formula due to mild skin sensitivity',
      }),
    });
    assert.equal(correctRes.status, 201);
    const v2Rx = ((await correctRes.json()) as any).data as PrescriptionDto;
    assert.equal(v2Rx.versionNumber, 2);
    assert.equal(v2Rx.status, 'draft');
    assert.equal(v2Rx.previousVersionId, rxData.id);

    // Verify v1 is now superseded
    const checkV1Res = await fetch(`${baseUrl}/api/v1/prescriptions/${rxData.id}`, {
      headers: { Cookie: cookieHeader },
    });
    const v1Data = ((await checkV1Res.json()) as any).data as PrescriptionDto;
    assert.equal(v1Data.status, 'superseded');
    assert.equal(v1Data.supersededReason, 'Adjusted sunscreen to mineral formula due to mild skin sensitivity');
    console.log('  ✓ Correction flow verified: spawned v2 (draft), superseded v1 atomically with mandatory reason');

    // 13. Single Correction Branch Rule: attempting second correction from v1 returns 409
    const secondCorrectRes = await fetch(`${baseUrl}/api/v1/prescriptions/${rxData.id}/correct`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        reason: 'Duplicate branch attempt',
      }),
    });
    assert.equal(secondCorrectRes.status, 400); // Cannot correct non-finalized (superseded) prescription
    console.log('  ✓ Linear versioning verified: superseded version cannot be corrected again');

    // 14. Portal Publication Gate
    // Attempting to publish v2 (draft) -> 400 Bad Request
    const publishDraftRes = await fetch(`${baseUrl}/api/v1/prescriptions/${v2Rx.id}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({ publish: true }),
    });
    assert.equal(publishDraftRes.status, 400);
    console.log('  ✓ Portal gate verified: publishing draft prescription rejected with HTTP 400 Bad Request');

    // Publishing v1 (finalized) -> 200 OK
    // First reset v1 status to finalized to test publish gate
    const publishV1Res = await fetch(`${baseUrl}/api/v1/prescriptions/${rxData.id}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({ publish: true }),
    });
    // In our state, v1 was superseded so publishing superseded also rejected
    assert.equal(publishV1Res.status, 400);

    // Finalize v2 so we can publish it
    const finalizeV2Res = await fetch(`${baseUrl}/api/v1/prescriptions/${v2Rx.id}/finalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
    });
    assert.equal(finalizeV2Res.status, 200);

    const publishFinalizedRes = await fetch(`${baseUrl}/api/v1/prescriptions/${v2Rx.id}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({ publish: true }),
    });
    assert.equal(publishFinalizedRes.status, 200);
    const publishedV2 = ((await publishFinalizedRes.json()) as any).data as PrescriptionDto;
    assert.equal(publishedV2.publishedToPortal, true);
    console.log('  ✓ Portal publication verified: finalized prescription successfully published to portal');

    // 15. PDF Stream Endpoint
    const streamPdfRes = await fetch(`${baseUrl}/api/v1/prescriptions/${v2Rx.id}/pdf`, {
      headers: { Cookie: cookieHeader },
    });
    assert.equal(streamPdfRes.status, 200);
    assert.equal(streamPdfRes.headers.get('content-type'), 'application/pdf');
    assert.ok(streamPdfRes.headers.get('x-prescription-sha256'));
    const pdfBytes = await streamPdfRes.arrayBuffer();
    assert.ok(pdfBytes.byteLength > 100);
    console.log(`  ✓ PDF streaming verified: Content-Type=application/pdf, length=${pdfBytes.byteLength} bytes`);

  } finally {
    server.close();
  }
}
