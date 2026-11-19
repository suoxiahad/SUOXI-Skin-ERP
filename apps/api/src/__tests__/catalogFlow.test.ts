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
import { catalogService } from '../services/catalogService.js';
import type {
  TreatmentServiceDto,
  FoodLifestyleGuidanceDto,
} from '@suoxi/shared-types';

export async function runCatalogFlowTests(): Promise<void> {
  console.log('[TEST-SUITE] Running Treatment Catalog & Guidance Library Tests (Prompt 8)...');

  // Reset clean state
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
    // 1. Authenticate as Superadmin
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

    console.log('  ✓ Superadmin authenticated with session and CSRF');

    // 2. Categories listing
    const catsRes = await fetch(`${baseUrl}/api/v1/catalog/categories`, {
      headers: { Cookie: cookieHeader },
    });
    assert.equal(catsRes.status, 200);
    const catsData = (await catsRes.json()) as any;
    assert.ok(catsData.data.length >= 7);
    const facialCat = catsData.data.find((c: any) => c.code === 'facial');
    assert.ok(facialCat);
    assert.equal(facialCat.name_bn, 'ফেসিয়াল ও ত্বক পুনরুজ্জীবন');
    console.log('  ✓ Treatment categories verified with 7 standard aesthetic categories and Bangla translations');

    // 3. Treatment listing & Sample HydraFacial (HF-001) verification
    const treatsRes = await fetch(`${baseUrl}/api/v1/catalog/treatments`, {
      headers: { Cookie: cookieHeader },
    });
    assert.equal(treatsRes.status, 200);
    const treatsData = (await treatsRes.json()) as any;
    const hf = treatsData.data.find((t: TreatmentServiceDto) => t.service_code === 'HF-001');
    assert.ok(hf);
    assert.equal(hf.base_price, '4500.00'); // Price decimal safe
    assert.equal(hf.default_duration_minutes, 60);
    assert.equal(hf.default_followup_days, 14);
    assert.equal(hf.name_bn, 'হাইড্রাফেসিয়াল ট্রিটমেন্ট'); // Bangla renders
    console.log('  ✓ Sample treatment HydraFacial (HF-001) verified with BDT 4,500.00 price decimal safety and Bangla text');

    // 4. Create new treatment with decimal price
    const newTreatRes = await fetch(`${baseUrl}/api/v1/catalog/treatments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        service_code: 'CB-002',
        category_id: 'cat-laser',
        name: 'Carbon Laser Peel',
        name_bn: 'কার্বন লেজার পিল',
        description: 'Spectra carbon laser toning for pore reduction',
        base_price: 6500,
        default_duration_minutes: 45,
        default_followup_days: 21,
        requires_clinical_approval: false,
        allowed_resource_ids: ['res-room-laser', 'res-dev-laser'],
      }),
    });
    assert.equal(newTreatRes.status, 201);
    const newTreatData = (await newTreatRes.json()) as any;
    assert.equal(newTreatData.data.service_code, 'CB-002');
    assert.equal(newTreatData.data.base_price, '6500.00');
    console.log('  ✓ Treatment creation verified with formatted decimal price (6500.00)');

    // 5. Follow-up rules test
    const ruleRes = await fetch(`${baseUrl}/api/v1/catalog/treatments/${newTreatData.data.id}/followup-rules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        interval_days: 21,
        max_followups: 3,
        instructions: 'Check post-peel epidermal exfoliation and barrier recovery',
        instructions_bn: 'ত্বকের এক্সফোলিয়েশন ও ব্যারিয়ার রিকভারি পর্যবেক্ষণ',
        needs_clinical_approval: true,
      }),
    });
    assert.equal(ruleRes.status, 201);
    const ruleData = (await ruleRes.json()) as any;
    assert.equal(ruleData.data.interval_days, 21);
    assert.equal(ruleData.data.max_followups, 3);
    console.log('  ✓ Follow-up rule creation verified inside treatment');

    // 6. Food & Lifestyle Guidance: Item requires at least one language
    const invalidItemRes = await fetch(`${baseUrl}/api/v1/catalog/guidance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        service_id: newTreatData.data.id,
        title: 'Carbon Peel Aftercare Diet',
        items: [
          {
            section: 'recommended_foods',
            content_en: '   ',
            content_bn: '', // Neither language provided!
            sort_order: 1,
          },
        ],
      }),
    });
    assert.equal(invalidItemRes.status, 400);
    console.log('  ✓ Item language validation verified: rejects items missing both English and Bangla');

    // 7. Create valid Draft Guidance v1
    const draftRes = await fetch(`${baseUrl}/api/v1/catalog/guidance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        service_id: newTreatData.data.id,
        title: 'Carbon Laser Peel Diet & Post-Care',
        title_bn: 'কার্বন লেজার পিল পরবর্তী ডায়েট ও আফটার-কেয়ার',
        items: [
          {
            section: 'recommended_foods',
            content_en: 'Drink 2.5 litres of water and eat antioxidant-rich fruits',
            content_bn: 'প্রতিদিন ২.৫ লিটার পানি ও অ্যান্টিঅক্সিডেন্টযুক্ত ফল গ্রহণ করুন',
            sort_order: 1,
          },
          {
            section: 'foods_to_avoid',
            content_en: 'Spicy curries and artificial food colorings for 48 hours',
            content_bn: '৪৮ ঘণ্টা মসলাদার খাবার ও কৃত্রিম রঙযুক্ত খাবার বর্জন করুন',
            sort_order: 2,
          },
          {
            section: 'lifestyle_avoid',
            content_en: 'Direct sun exposure and sauna for 5 days',
            content_bn: '৫ দিন সরাসরি রোদ ও স্টিম বাথ এড়িয়ে চলুন',
            sort_order: 3,
          },
        ],
      }),
    });
    assert.equal(draftRes.status, 201);
    const draftData = (await draftRes.json()) as any;
    assert.equal(draftData.data.version_number, 1);
    assert.equal(draftData.data.status, 'draft');
    const guidanceV1Id = draftData.data.id;
    console.log('  ✓ Draft guidance v1 created successfully');

    // 8. Submit v1 for approval
    const submitRes = await fetch(`${baseUrl}/api/v1/catalog/guidance/${guidanceV1Id}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
    });
    assert.equal(submitRes.status, 200);
    const submitData = (await submitRes.json()) as any;
    assert.equal(submitData.data.status, 'pending_approval');
    console.log('  ✓ Guidance v1 submitted -> status transitioned to pending_approval');

    // 9. Approve v1 as clinician (superadmin)
    const approveV1Res = await fetch(`${baseUrl}/api/v1/catalog/guidance/${guidanceV1Id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
    });
    assert.equal(approveV1Res.status, 200);
    const approvedV1Data = (await approveV1Res.json()) as any;
    assert.equal(approvedV1Data.data.status, 'approved');
    console.log('  ✓ Guidance v1 approved by clinician');

    // 10. Immutability Check: Editing an approved version must return HTTP 409 Conflict
    const editApprovedRes = await fetch(`${baseUrl}/api/v1/catalog/guidance/${guidanceV1Id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        title: 'Tampered Title on Approved Guidance',
      }),
    });
    assert.equal(editApprovedRes.status, 409);
    console.log('  ✓ Immutability rule verified: editing approved guidance returned HTTP 409 Conflict');

    // 11. Create Draft Version 2
    const draftV2Res = await fetch(`${baseUrl}/api/v1/catalog/guidance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        service_id: newTreatData.data.id,
        title: 'Carbon Laser Peel Diet & Post-Care (v2 Revised Protocol)',
        title_bn: 'কার্বন লেজার পিল ডায়েট ও আফটার-কেয়ার (পরিমার্জিত সংস্করণ ২)',
        items: [
          {
            section: 'recommended_foods',
            content_en: 'Drink 3 litres of water and increase citrus fruit intake',
            content_bn: 'প্রতিদিন ৩ লিটার পানি ও লেবুজাতীয় ফল খান',
            sort_order: 1,
          },
          {
            section: 'foods_to_avoid',
            content_en: 'Spicy food and dairy for 72 hours',
            content_bn: '৭২ ঘণ্টা মসলাদার ও দুগ্ধজাত খাবার পরিহার করুন',
            sort_order: 2,
          },
        ],
      }),
    });
    assert.equal(draftV2Res.status, 201);
    const draftV2Data = (await draftV2Res.json()) as any;
    assert.equal(draftV2Data.data.version_number, 2);
    const guidanceV2Id = draftV2Data.data.id;
    console.log('  ✓ Guidance v2 draft created with version_number = 2');

    // 12. Non-clinical Approve Check -> 403 Forbidden
    // Create a receptionist user without clinical role
    const nonClinicalPassword = 'ReceptionistSecure#2026';
    const nonClinicalPasswordHash = await hashPassword(nonClinicalPassword);
    const nonClinicalUserId = 'usr-recep-catalog-01';

    userRegistry.addUser({
      id: nonClinicalUserId,
      username: 'receptionist_cat',
      email: 'receptionist_cat@suoxi.com',
      phone: '+8801700000000',
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
        username: 'receptionist_cat',
        primaryBranchId: 'br-dhanmondi',
        allBranches: false,
        allowedBranchIds: ['br-dhanmondi'],
        mustChangePassword: false,
        roles: ['receptionist'],
        rolePermissions: ['guidance.approve'],
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
        username: 'receptionist_cat',
        password: nonClinicalPassword,
      }),
    });
    assert.equal(recepLoginRes.status, 200);
    const recepLoginCookies = parseCookies(
      recepLoginRes.headers.getSetCookie ? recepLoginRes.headers.getSetCookie().join('; ') : recepLoginRes.headers.get('set-cookie') || ''
    );
    const recepAuthCookie = `${SESSION_COOKIE_NAME}=${recepLoginCookies[SESSION_COOKIE_NAME]}; ${CSRF_COOKIE_NAME}=${encodeURIComponent(recepCsrfData.data.csrfToken)}`;

    const nonClinicalApproveRes = await fetch(`${baseUrl}/api/v1/catalog/guidance/${guidanceV2Id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: recepCsrfData.data.csrfToken,
        Cookie: recepAuthCookie,
      },
    });
    assert.equal(nonClinicalApproveRes.status, 403);
    console.log('  ✓ Clinical gate verified: non-clinical staff rejected with HTTP 403 Forbidden');

    // 13. Approving v2 retires v1 atomically
    const approveV2Res = await fetch(`${baseUrl}/api/v1/catalog/guidance/${guidanceV2Id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
    });
    assert.equal(approveV2Res.status, 200);
    const approvedV2Data = (await approveV2Res.json()) as any;
    assert.equal(approvedV2Data.data.status, 'approved');

    // Verify v1 is now retired
    const checkV1Res = await fetch(`${baseUrl}/api/v1/catalog/guidance/${guidanceV1Id}`, {
      headers: { Cookie: cookieHeader },
    });
    const checkV1Data = (await checkV1Res.json()) as any;
    assert.equal(checkV1Data.data.status, 'retired');
    console.log('  ✓ Atomic retirement verified: approving v2 atomically retired v1');

    // 14. Two parallel approvals -> only one approved row remains
    // Create draft v3 and draft v4 for the same service
    const draftV3Res = await fetch(`${baseUrl}/api/v1/catalog/guidance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        service_id: newTreatData.data.id,
        title: 'Carbon Peel Protocol v3',
        items: [{ section: 'general_advice', content_en: 'Advise hydration', sort_order: 1 }],
      }),
    });
    const draftV4Res = await fetch(`${baseUrl}/api/v1/catalog/guidance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        service_id: newTreatData.data.id,
        title: 'Carbon Peel Protocol v4',
        items: [{ section: 'general_advice', content_en: 'Advise strict SPF', sort_order: 1 }],
      }),
    });
    const v3Id = ((await draftV3Res.json()) as any).data.id;
    const v4Id = ((await draftV4Res.json()) as any).data.id;

    // Fire two approval calls concurrently
    const [pApprove3, pApprove4] = await Promise.all([
      fetch(`${baseUrl}/api/v1/catalog/guidance/${v3Id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: standardOrigin,
          [CSRF_HEADER_NAME]: csrfToken,
          Cookie: cookieHeader,
        },
      }),
      fetch(`${baseUrl}/api/v1/catalog/guidance/${v4Id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: standardOrigin,
          [CSRF_HEADER_NAME]: csrfToken,
          Cookie: cookieHeader,
        },
      }),
    ]);

    assert.ok(pApprove3.status === 200 || pApprove3.status === 409);
    assert.ok(pApprove4.status === 200 || pApprove4.status === 409);

    // Verify all guidances for this service: exactly ONE is approved!
    const allGuidancesRes = await fetch(`${baseUrl}/api/v1/catalog/guidance?serviceId=${newTreatData.data.id}`, {
      headers: { Cookie: cookieHeader },
    });
    const allGuidances = (await allGuidancesRes.json()) as any;
    const approvedList = allGuidances.data.filter((g: any) => g.status === 'approved');
    assert.equal(approvedList.length, 1);
    console.log(`  ✓ Concurrency lock verified: parallel approvals resolved to exactly ONE approved version (v${approvedList[0].version_number})`);
  } finally {
    server.close();
  }
}
