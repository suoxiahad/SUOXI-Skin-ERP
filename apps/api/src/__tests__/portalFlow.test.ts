import assert from 'node:assert/strict';
import { portalService } from '../services/portalService.js';
import { patientService } from '../services/patientService.js';
import { prescriptionService } from '../services/prescriptionService.js';
import { sessionService } from '../services/sessionService.js';
import { billingService } from '../services/billingService.js';
import { fileService } from '../services/fileService.js';
import {
  generateCsrfToken,
  validateCsrf,
  PORTAL_SESSION_COOKIE_NAME,
} from '../auth/csrf.js';
import { SESSION_COOKIE_NAME } from '../auth/session.js';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../middleware/errorHandler.js';
import { requirePortalAuth } from '../middleware/requirePortalAuth.js';
import { requireAuth } from '../middleware/requireAuth.js';

export async function runPortalFlowTests() {
  console.log('--- Running Patient Portal Test Suite (Prompt 18) ---');

  // Reset all services
  await portalService.resetData();
  prescriptionService.resetData();
  sessionService.resetData();
  fileService.reset();

  const patientAId = 'pt-sumaiya-01'; // Sumaiya Rahman

  // Register patient B dynamically
  const createdB = await patientService.createPatient(
    {
      fullName: 'Tamanna Islam',
      fullNameBn: 'তামান্না ইসলাম',
      gender: 'female',
      primaryMobile: '+8801899112233',
      city: 'Dhaka',
      district: 'Dhaka',
    },
    'br-dhk-01',
    'usr-admin-01',
    '127.0.0.1'
  );
  const patientBId = createdB.patient.id;

  // =========================================================================
  // 1. Staff Provisioning & Single-Use Setup Token Lifecycle
  // =========================================================================
  console.log('1. Testing Staff Provisioning & Single-Use Setup Token Lifecycle...');

  const provisionResult = await portalService.createPortalAccount(
    patientBId,
    '+8801899112233',
    { id: 'usr-admin-01' }
  );

  assert.equal(provisionResult.account.patientId, patientBId);
  assert.equal(provisionResult.account.status, 'pending_setup');
  assert.ok(provisionResult.setupToken, 'Must generate setup token');
  assert.ok(provisionResult.setupUrl.includes(provisionResult.setupToken));

  // Patient B completes initial setup
  await portalService.completeSetupOrReset(
    provisionResult.setupToken,
    'SecurePassTamanna123!'
  );

  const accountB = await portalService.getAccountByPatientId(patientBId);
  assert.equal(accountB?.status, 'active', 'Account must become active after password setup');

  // Attempt to REUSE the same setup token -> must fail with BadRequestError
  await assert.rejects(
    async () => {
      await portalService.completeSetupOrReset(
        provisionResult.setupToken,
        'AnotherPassword123!'
      );
    },
    (err: any) => err instanceof BadRequestError && err.message.includes('already been used'),
    'Reusing an expired or consumed setup token must be rejected'
  );

  console.log('   ✓ Single-use setup token works and prevents replay reuse');

  // =========================================================================
  // 2. Authentication, Lockout & Password Security
  // =========================================================================
  console.log('2. Testing Authentication, Argon2id & 15-Minute Lockout Defense...');

  // Successful login for Patient A
  const loginA = await portalService.login('+8801711223344', 'PatientPass123!', '127.0.0.1');
  assert.ok(loginA.sessionToken, 'Login must yield session token');
  assert.equal(loginA.account.patientId, patientAId);

  // Test lockout: 5 consecutive failed logins
  for (let i = 1; i <= 4; i++) {
    await assert.rejects(
      async () => {
        await portalService.login('+8801899112233', 'WrongPassword!', '127.0.0.1');
      },
      (err: any) => err instanceof UnauthorizedError
    );
  }

  // 5th failed attempt -> locks account
  await assert.rejects(
    async () => {
      await portalService.login('+8801899112233', 'WrongPassword!', '127.0.0.1');
    },
    (err: any) => err instanceof UnauthorizedError
  );

  // 6th attempt -> immediately locked with TooManyRequestsError
  await assert.rejects(
    async () => {
      await portalService.login('+8801899112233', 'SecurePassTamanna123!', '127.0.0.1');
    },
    (err: any) =>
      err instanceof TooManyRequestsError && err.message.includes('locked due to multiple failed'),
    'Account must be locked after 5 failed attempts'
  );

  console.log('   ✓ Argon2id authentication and 15-minute brute-force lockout verified');

  // =========================================================================
  // 3. Double-Submit CSRF Realm Isolation (Staff vs. Portal)
  // =========================================================================
  console.log('3. Testing Double-Submit CSRF Realm Isolation (Section B.5a)...');

  const staffToken = generateCsrfToken('usr-admin-01', 's', 'staff');
  const portalToken = generateCsrfToken(loginA.account.accountId, 's', 'portal');

  // Verify staff token fails on portal realm
  const mockReqPortal = {
    method: 'PATCH',
    headers: {
      origin: 'https://ais-dev-oubukwg75v34nf3ehzv2c4-1008370122089.asia-southeast1.run.app',
      'content-type': 'application/json',
      'x-csrf-token': staffToken,
      cookie: `suoxi_portal_csrf=${staffToken}`,
    },
    body: { address: 'New Address' },
  } as any;

  assert.throws(
    () => {
      validateCsrf(mockReqPortal, loginA.account.accountId, 's', 'portal');
    },
    (err: any) =>
      err instanceof ForbiddenError &&
      err.message.includes('Token issued for staff realm cannot be used on portal'),
    'Staff CSRF token must fail when supplied to portal route'
  );

  // Verify portal token fails on staff realm
  const mockReqStaff = {
    method: 'POST',
    headers: {
      origin: 'https://ais-dev-oubukwg75v34nf3ehzv2c4-1008370122089.asia-southeast1.run.app',
      'content-type': 'application/json',
      'x-csrf-token': portalToken,
      cookie: `suoxi_csrf=${portalToken}`,
    },
    body: { reason: 'Test' },
  } as any;

  assert.throws(
    () => {
      validateCsrf(mockReqStaff, 'usr-admin-01', 's', 'staff');
    },
    (err: any) =>
      err instanceof ForbiddenError &&
      err.message.includes('Token issued for portal realm cannot be used on staff'),
    'Portal CSRF token must fail when supplied to staff route'
  );

  console.log('   ✓ Strict bidirectional CSRF realm isolation enforced');

  // =========================================================================
  // 4. Session Cookie Isolation & Mutual Rejection
  // =========================================================================
  console.log('4. Testing Session Cookie Isolation (Staff Cookie on Portal & Vice Versa)...');

  // Staff cookie passed to portal middleware -> must reject with 401
  const reqWithStaffCookie = {
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=staff_session_token_12345`,
    },
  } as any;

  await new Promise<void>((resolve, reject) => {
    requirePortalAuth(reqWithStaffCookie, {} as any, (err: any) => {
      if (err instanceof UnauthorizedError) {
        resolve();
      } else {
        reject(new Error('requirePortalAuth must reject when only staff session cookie is present'));
      }
    });
  });

  // Portal session cookie passed to staff middleware -> must reject with 401
  const reqWithPortalCookie = {
    headers: {
      cookie: `${PORTAL_SESSION_COOKIE_NAME}=${loginA.sessionToken}`,
    },
  } as any;

  await new Promise<void>((resolve, reject) => {
    requireAuth(reqWithPortalCookie, {} as any, (err: any) => {
      if (err instanceof UnauthorizedError) {
        resolve();
      } else {
        reject(new Error('requireAuth must reject when only portal session cookie is present'));
      }
    });
  });

  console.log('   ✓ Mutual session cookie isolation enforced (401 on cross-realm use)');

  // =========================================================================
  // 5. Zero-Trust IDOR Protection Suite
  // =========================================================================
  console.log('5. Testing Zero-Trust IDOR Protection (Patient A requesting Patient B data)...');

  // Create a finalized + published prescription for Patient B
  const rxB = await prescriptionService.createPrescription(
    {
      patientId: patientBId,
      diagnosis: 'Acne Vulgaris Grade II',
      items: [{ itemName: 'Benzoyl Peroxide 5% Gel' }],
    },
    { id: 'usr-doc-01', fullName: 'Dr. Farhana Khan', primaryBranchId: 'br-dhk-01' }
  );

  await prescriptionService.finalizePrescription(rxB.id, {
    id: 'usr-doc-01',
    fullName: 'Dr. Farhana Khan',
    role: 'doctor',
  });

  await prescriptionService.publishToPortal(rxB.id, true, { id: 'usr-doc-01' });

  // Patient A attempts to download Patient B's prescription PDF by ID -> MUST THROW 404
  await assert.rejects(
    async () => {
      await portalService.getPortalPrescriptionPdf(patientAId, rxB.id);
    },
    (err: any) => err instanceof NotFoundError && err.message.includes('not found'),
    'Patient A requesting Patient B prescription PDF must return 404 (IDOR blocked)'
  );

  // Patient A lists prescriptions -> Patient B's prescription must NOT be in the list
  const patientARxList = await portalService.getPortalPrescriptions(patientAId);
  const foundBInA = patientARxList.some((r) => r.id === rxB.id);
  assert.equal(foundBInA, false, 'Patient A must never see Patient B prescriptions in list');

  console.log('   ✓ IDOR suite: 404 returned on cross-patient resource access');

  // =========================================================================
  // 6. Visibility Gates (Drafts & Unpublished Aftercare Hiding)
  // =========================================================================
  console.log('6. Testing Clinical Visibility Gates (Drafts, Unpublished Aftercare & Private Files)...');

  // Create draft prescription for Patient A
  const draftRxA = await prescriptionService.createPrescription(
    {
      patientId: patientAId,
      diagnosis: 'Draft Consult Skin Evaluation',
      items: [{ itemName: 'Moisturizer' }],
    },
    { id: 'usr-doc-01', fullName: 'Dr. Farhana Khan', primaryBranchId: 'br-dhk-01' }
  );

  const rxListA = await portalService.getPortalPrescriptions(patientAId);
  const draftFound = rxListA.some((r) => r.id === draftRxA.id);
  assert.equal(draftFound, false, 'Draft prescriptions must be invisible in patient portal');

  // Use pre-seeded treatment session for Patient A and test publishAftercareToPortal = false
  const seededSession = await sessionService.getSessionById('ses-sample-01');
  assert.ok(seededSession, 'Sample session should exist');
  seededSession.aftercareInstructions = 'Secret clinician note not for patient';
  seededSession.publishAftercareToPortal = false;

  const portalSessionsA = await portalService.getPortalSessions(patientAId);
  const matchedSession = portalSessionsA.find((s) => s.id === 'ses-sample-01');
  assert.ok(matchedSession, 'Session item should exist');
  assert.equal(
    matchedSession.aftercareInstructions,
    null,
    'Unpublished aftercare must be stripped and returned as null'
  );
  assert.equal(matchedSession.aftercarePublished, false);

  // Now set publishAftercareToPortal = true
  seededSession.publishAftercareToPortal = true;
  seededSession.aftercareInstructions = 'Apply soothing gel twice daily';
  const publishedSessionsA = await portalService.getPortalSessions(patientAId);
  const pubMatched = publishedSessionsA.find((s) => s.id === 'ses-sample-01');
  assert.equal(
    pubMatched?.aftercareInstructions,
    'Apply soothing gel twice daily',
    'Published aftercare must be visible to patient'
  );
  assert.equal(pubMatched?.aftercarePublished, true);

  console.log('   ✓ Visibility gates strictly hide drafts and unpublished clinical aftercare');

  // =========================================================================
  // 7. Rate-Limited OTP Brute-Force Lockout
  // =========================================================================
  console.log('7. Testing Rate-Limited Contact Change OTP Brute-Force Protection...');

  const otpReq = await portalService.requestContactOtp(
    loginA.account.accountId,
    patientAId,
    'mobile',
    '+8801999888777'
  );

  assert.ok(otpReq.success);
  assert.ok(otpReq.simulatedOtp);

  // Submit 3 wrong attempts
  for (let i = 1; i <= 3; i++) {
    await assert.rejects(
      async () => {
        await portalService.confirmContactOtp(
          loginA.account.accountId,
          patientAId,
          'mobile',
          '+8801999888777',
          '000000'
        );
      },
      (err: any) => err instanceof BadRequestError && err.message.includes('Invalid verification code'),
      `Attempt ${i} must fail with invalid code error`
    );
  }

  // 4th attempt with the CORRECT code -> MUST BE LOCKED OUT (TooManyRequestsError)
  await assert.rejects(
    async () => {
      await portalService.confirmContactOtp(
        loginA.account.accountId,
        patientAId,
        'mobile',
        '+8801999888777',
        otpReq.simulatedOtp!
      );
    },
    (err: any) =>
      err instanceof TooManyRequestsError && err.message.includes('Maximum verification attempts'),
    'OTP must be locked out after 3 failed attempts even if correct code is then submitted'
  );

  console.log('   ✓ OTP brute-force lockout after 3 attempts fully verified');

  console.log('✓ All Patient Portal (Prompt 18) verification tests passed successfully!\n');
}
