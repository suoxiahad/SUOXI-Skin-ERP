import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApiApp } from '../app.js';
import {
  PackageDto,
  PatientPackageDto,
  PackageSessionLedgerEntryDto,
  TreatmentSessionDto,
} from '@suoxi/shared-types';
import {
  CSRF_HEADER_NAME,
  CSRF_COOKIE_NAME,
  ANON_COOKIE_NAME,
  parseCookies,
} from '../auth/csrf.js';
import { SESSION_COOKIE_NAME } from '../auth/session.js';
import { seedSuperadmin } from '../scripts/seedSuperadmin.js';
import { packageService } from '../services/packageService.js';
import { sessionService } from '../services/sessionService.js';
import { appointmentService } from '../services/appointmentService.js';

export async function runPackageLedgerFlowTests(): Promise<void> {
  console.log('[TEST-SUITE] Running Treatment Packages & Append-Only Ledger Tests (Prompt 11)...');

  packageService.resetData();
  sessionService.resetData();

  const { username, oneTimePassword } = await seedSuperadmin({ silent: true });

  const app = createApiApp();
  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const standardOrigin = 'http://localhost:3000';

  try {
    // 1. Authenticate as Superadmin
    const csrfRes = await fetch(`${baseUrl}/auth/csrf`);
    assert.equal(csrfRes.status, 200);
    const csrfJson = (await csrfRes.json()) as { data: { csrfToken: string } };
    let csrfToken = csrfJson.data.csrfToken;
    const cookiesA = parseCookies(
      csrfRes.headers.getSetCookie ? csrfRes.headers.getSetCookie().join('; ') : csrfRes.headers.get('set-cookie') || ''
    );
    const anonCookieHeader = `${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}; ${ANON_COOKIE_NAME}=${cookiesA[ANON_COOKIE_NAME]}`;

    const loginRes = await fetch(`${baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: anonCookieHeader,
      },
      body: JSON.stringify({
        username,
        password: oneTimePassword,
      }),
    });
    assert.equal(loginRes.status, 200);
    const loginJson = (await loginRes.json()) as { data: { csrfToken: string } };
    csrfToken = loginJson.data.csrfToken;
    const loginCookies = parseCookies(
      loginRes.headers.getSetCookie ? loginRes.headers.getSetCookie().join('; ') : loginRes.headers.get('set-cookie') || ''
    );
    const authCookieHeader = `${SESSION_COOKIE_NAME}=${loginCookies[SESSION_COOKIE_NAME]}; ${CSRF_COOKIE_NAME}=${encodeURIComponent(csrfToken)}`;
    console.log('  ✓ Clinician authenticated with session and CSRF');

    // 2. Package Catalog: Create "Glow Boost Package"
    // 10 sessions of HydraFacial, ৳ 38,000, valid 180 days
    const createPkgRes = await fetch(`${baseUrl}/api/v1/packages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        name: 'Glow Boost Package Deluxe',
        nameBn: 'গ্লো বুস্ট প্যাকেজ ডিলাক্স',
        description: '10 sessions of clinical HydraFacial with deep peptide infusion and barrier repair',
        price: '38000.00',
        validityDays: 180,
        items: [
          {
            serviceId: 'srv-hf-001',
            sessionCount: 10,
          },
        ],
      }),
    });
    assert.equal(createPkgRes.status, 201);
    const newPkg = ((await createPkgRes.json()) as any).data as PackageDto;
    assert.ok(newPkg.id);
    assert.match(newPkg.packageCode, /^PKG-\d{6}$/);
    assert.equal(newPkg.price, '38000.00');
    assert.equal(newPkg.validityDays, 180);
    console.log(`  ✓ Package created in catalog: ${newPkg.name} (${newPkg.packageCode}, ৳ ${newPkg.price}, 180 days)`);

    // 3. Assign Package to Patient (Sumaiya Rahman) -> Entitlement Snapshot
    const assignRes = await fetch(`${baseUrl}/api/v1/packages/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        patientId: 'pt-sumaiya-01',
        packageId: newPkg.id,
        purchaseDate: '2026-10-01',
        startDate: '2026-10-01',
        priceSold: '36000.00', // Discounted campaign price sold
        saleTerms: 'Promo rate — non-refundable, non-transferable',
      }),
    });
    assert.equal(assignRes.status, 201);
    const assignedPkg = ((await assignRes.json()) as any).data as PatientPackageDto;
    assert.ok(assignedPkg.id);
    assert.equal(assignedPkg.priceSold, '36000.00');
    assert.equal(assignedPkg.expiryDate, '2027-03-30'); // 180 days from 2026-10-01
    assert.equal(assignedPkg.items[0].initialSessions, 10);
    assert.equal(assignedPkg.items[0].remainingSessions, 10);
    console.log(`  ✓ Package assigned to patient: ${assignedPkg.packageName} (Price sold: ৳ ${assignedPkg.priceSold}, valid to ${assignedPkg.expiryDate})`);

    // 4. Test Snapshot Invariance: Edit Catalog Package Price and verify assigned snapshot is untouched
    const editCatalogRes = await fetch(`${baseUrl}/api/v1/packages/${newPkg.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        price: '45000.00', // Increased catalog price
      }),
    });
    assert.equal(editCatalogRes.status, 200);

    const checkSnapshotRes = await fetch(`${baseUrl}/api/v1/packages/patient-packages/${assignedPkg.id}`, {
      headers: { Cookie: authCookieHeader },
    });
    assert.equal(checkSnapshotRes.status, 200);
    const snapshotData = ((await checkSnapshotRes.json()) as any).data as PatientPackageDto;
    assert.equal(snapshotData.priceSold, '36000.00'); // Remains 36,000!
    assert.equal(snapshotData.items[0].initialSessions, 10);
    console.log('  ✓ Entitlement snapshot verified: catalog price change did NOT alter assigned package price or sessions');

    // 5. Create a Treatment Session linked to this patient and service
    const testApt = await appointmentService.createAppointment(
      {
        patient_id: 'pt-sumaiya-01',
        provider_id: 'usr-102',
        branch_id: 'br-dhk-01',
        service_category: 'facial',
        service_name: 'HydraFacial Treatment',
        appointment_date: '2026-10-25',
        start_time: '11:00',
        duration_minutes: 60,
        appointment_type: 'treatment_session',
        source_id: 'src-1',
        notes: 'Session 1 under Glow Boost Package',
      },
      { id: 'usr-super-01', role: 'super_admin', branchId: 'br-dhk-01' }
    );

    const createSessionRes = await fetch(`${baseUrl}/api/v1/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        patientId: 'pt-sumaiya-01',
        appointmentId: testApt.id,
        serviceId: 'srv-hf-001',
        doctorId: 'usr-doctor-01',
        branchId: 'br-dhk-01',
        packageId: assignedPkg.id,
        sessionNo: 1,
        totalSessions: 10,
        treatmentNotes: 'Starting HydraFacial package session 1',
      }),
    });
    assert.equal(createSessionRes.status, 201);
    const sessionData = ((await createSessionRes.json()) as any).data as TreatmentSessionDto;

    // 6. Concurrency & Idempotency: Complete session with 10 parallel complete calls
    // Hard Rule 5: A package session can never be deducted twice
    const parallelCalls = Array.from({ length: 10 }).map(() =>
      fetch(`${baseUrl}/api/v1/sessions/${sessionData.id}/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: standardOrigin,
          [CSRF_HEADER_NAME]: csrfToken,
          Cookie: authCookieHeader,
        },
        body: JSON.stringify({
          outcomeNotes: 'First session completed smoothly with excellent glow',
        }),
      })
    );

    const results = await Promise.all(parallelCalls);
    const statusCodes = results.map((r) => r.status);
    const count200 = statusCodes.filter((s) => s === 200).length;
    const count409 = statusCodes.filter((s) => s === 409).length;

    assert.equal(count200, 1, 'Exactly one parallel complete request must return 200 OK');
    assert.equal(count409, 9, 'All 9 remaining parallel complete requests must return 409 Conflict');
    console.log('  ✓ Hard Rule 5 verified: 10 parallel completeSession calls resulted in exactly ONE 200 OK and 9 409 Conflicts');

    // Verify package ledger has exactly ONE deduction entry for this session
    const updatedPkgRes = await fetch(`${baseUrl}/api/v1/packages/patient-packages/${assignedPkg.id}`, {
      headers: { Cookie: authCookieHeader },
    });
    assert.equal(updatedPkgRes.status, 200);
    const updatedPkg = ((await updatedPkgRes.json()) as any).data as PatientPackageDto;
    assert.equal(updatedPkg.items[0].completedSessions, 1);
    assert.equal(updatedPkg.items[0].remainingSessions, 9);
    assert.equal(updatedPkg.ledger?.length, 1);
    const firstLedgerEntry = updatedPkg.ledger[0];
    assert.equal(firstLedgerEntry.entryType, 'deduction');
    assert.equal(firstLedgerEntry.changeQuantity, -1);
    console.log(`  ✓ Package balance correctly updated: Completed 1 / Total 10, Remaining 9 (Ledger row: ${firstLedgerEntry.id})`);

    // 7. Reversal: reverseDeduction(ledgerId, reason, approver)
    const reverseRes = await fetch(`${baseUrl}/api/v1/packages/ledger/${firstLedgerEntry.id}/reverse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        reason: 'Session incomplete due to allergic flare, session refunded to package',
      }),
    });
    assert.equal(reverseRes.status, 201);
    const reversalEntry = ((await reverseRes.json()) as any).data as PackageSessionLedgerEntryDto;
    assert.equal(reversalEntry.entryType, 'reversal');
    assert.equal(reversalEntry.changeQuantity, 1);
    assert.equal(reversalEntry.originalLedgerId, firstLedgerEntry.id);

    // Verify balance restored: Completed 0, Remaining 10
    const reversedPkgRes = await fetch(`${baseUrl}/api/v1/packages/patient-packages/${assignedPkg.id}`, {
      headers: { Cookie: authCookieHeader },
    });
    const reversedPkg = ((await reversedPkgRes.json()) as any).data as PatientPackageDto;
    assert.equal(reversedPkg.items[0].completedSessions, 0);
    assert.equal(reversedPkg.items[0].remainingSessions, 10);
    console.log('  ✓ Reversal verified: reversal row inserted and balance restored to Completed 0 / Remaining 10');

    // 8. Reversal Idempotency: Second reversal of the same deduction returns 409 Conflict
    const secondReverseRes = await fetch(`${baseUrl}/api/v1/packages/ledger/${firstLedgerEntry.id}/reverse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        reason: 'Attempting duplicate reversal of the same deduction',
      }),
    });
    assert.equal(secondReverseRes.status, 409);
    console.log('  ✓ Reversal uniqueness verified: second reversal of the same deduction returned HTTP 409 Conflict');

    // 9. Direct UPDATE or DELETE on ledger fails (Append-only guarantee)
    const directUpdateRes = await fetch(`${baseUrl}/api/v1/packages/ledger/${firstLedgerEntry.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({ changeQuantity: -99 }),
    });
    assert.equal(directUpdateRes.status, 403);

    const directDeleteRes = await fetch(`${baseUrl}/api/v1/packages/ledger/${firstLedgerEntry.id}`, {
      method: 'DELETE',
      headers: {
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
    });
    assert.equal(directDeleteRes.status, 403);
    console.log('  ✓ Append-only guarantee verified: direct UPDATE/DELETE on ledger rejected with HTTP 403 Forbidden');

    // 10. Deduction beyond remaining: Assign 1-session package, exhaust it, attempt 2nd deduction -> 422
    const singleSessionPkgRes = await fetch(`${baseUrl}/api/v1/packages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        name: 'Single Trial Session',
        price: '4000.00',
        validityDays: 30,
        items: [{ serviceId: 'srv-hf-001', sessionCount: 1 }],
      }),
    });
    const singlePkg = ((await singleSessionPkgRes.json()) as any).data as PackageDto;

    const todayIso = new Date().toISOString().slice(0, 10);
    const assignSingleRes = await fetch(`${baseUrl}/api/v1/packages/assign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        patientId: 'pt-sumaiya-01',
        packageId: singlePkg.id,
        purchaseDate: todayIso,
        startDate: todayIso,
      }),
    });
    const assignedSingle = ((await assignSingleRes.json()) as any).data as PatientPackageDto;

    // Deduct the only session
    const deductRes1 = await packageService.completeSessionDeduct(
      {
        id: 'ses-single-01',
        sessionCode: 'SES-SINGLE-01',
        patientId: 'pt-sumaiya-01',
        serviceId: 'srv-hf-001',
        packageId: assignedSingle.id,
      },
      { id: 'usr-doctor-01', fullName: 'Dr. Farhana Khan', role: 'doctor' }
    );
    assert.equal(deductRes1.deducted, true);

    // Attempt second deduction on exhausted package -> expect ValidationError (422)
    await assert.rejects(
      async () => {
        await packageService.completeSessionDeduct(
          {
            id: 'ses-single-02',
            sessionCode: 'SES-SINGLE-02',
            patientId: 'pt-sumaiya-01',
            serviceId: 'srv-hf-001',
            packageId: assignedSingle.id,
          },
          { id: 'usr-doctor-01', fullName: 'Dr. Farhana Khan', role: 'doctor' }
        );
      },
      (err: any) => {
        assert.match(err.message, /zero remaining sessions|no remaining sessions/i);
        return true;
      }
    );
    console.log('  ✓ Balance exhaustion verified: deduction beyond remaining rejected');

    // 11. Expired Package -> No deduction
    const expiredPkg = await packageService.assignPackage(
      {
        patientId: 'pt-sumaiya-01',
        packageId: singlePkg.id,
        purchaseDate: '2025-01-01',
        startDate: '2025-01-01', // Expired in 2025!
      },
      { id: 'usr-doctor-01', fullName: 'Dr. Farhana Khan', role: 'doctor' }
    );
    await assert.rejects(
      async () => {
        await packageService.completeSessionDeduct(
          {
            id: 'ses-expired-01',
            sessionCode: 'SES-EXP-01',
            patientId: 'pt-sumaiya-01',
            serviceId: 'srv-hf-001',
            packageId: expiredPkg.id,
          },
          { id: 'usr-doctor-01', fullName: 'Dr. Farhana Khan', role: 'doctor' }
        );
      },
      (err: any) => {
        assert.match(err.message, /expired/i);
        return true;
      }
    );
    console.log('  ✓ Expiry check verified: deduction from expired package rejected');

    // 12. Package Renewal: Link new package to old package via renewed_from_id
    const renewRes = await fetch(`${baseUrl}/api/v1/packages/patient-packages/${assignedPkg.id}/renew`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        purchaseDate: '2027-04-01',
        startDate: '2027-04-01',
        priceSold: '38000.00',
        saleTerms: 'Standard renewal rate',
      }),
    });
    assert.equal(renewRes.status, 201);
    const renewedPkg = ((await renewRes.json()) as any).data as PatientPackageDto;
    assert.equal(renewedPkg.renewedFromId, assignedPkg.id);
    assert.equal(renewedPkg.status, 'active');
    console.log(`  ✓ Package renewal verified: new package ${renewedPkg.packageCode} linked to ${assignedPkg.id}`);

    // 13. Package Cancellation: Admin cancels package with reason and remaining handling
    const cancelRes = await fetch(`${baseUrl}/api/v1/packages/patient-packages/${renewedPkg.id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        reason: 'Patient relocated abroad permanently',
        remainingHandling: 'refunded',
        refundReference: 'REF-BKASH-89218',
        notes: 'Approved by Medical Director',
      }),
    });
    assert.equal(cancelRes.status, 200);
    const cancelledPkg = ((await cancelRes.json()) as any).data as PatientPackageDto;
    assert.equal(cancelledPkg.status, 'cancelled');
    assert.equal(cancelledPkg.cancellation?.reason, 'Patient relocated abroad permanently');
    assert.equal(cancelledPkg.cancellation?.remainingHandling, 'refunded');
    assert.equal(cancelledPkg.cancellation?.refundReference, 'REF-BKASH-89218');
    console.log('  ✓ Package cancellation verified: status=cancelled with reason, remaining handling (refunded), and audit');

    console.log('[PASS] Treatment Packages & Append-Only Session Ledger Tests Passed!');
  } finally {
    server.close();
  }
}

if (process.argv[1]?.endsWith('packageLedgerFlow.test.ts') || process.argv[1]?.endsWith('packageLedgerFlow.test.js')) {
  describe('Package Ledger Flow Tests', () => {
    it('executes full package lifecycle and append-only ledger suite', async () => {
      await runPackageLedgerFlowTests();
    });
  });
}
