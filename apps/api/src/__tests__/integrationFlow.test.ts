import assert from 'node:assert/strict';
import { createApiApp } from '../app.js';
import {
  CSRF_HEADER_NAME,
  CSRF_COOKIE_NAME,
  ANON_COOKIE_NAME,
  parseCookies,
} from '../auth/csrf.js';
import { SESSION_COOKIE_NAME } from '../auth/session.js';
import { seedSuperadmin } from '../scripts/seedSuperadmin.js';
import { integrationService } from '../services/integrationService.js';
import type {
  IntegrationConfigDto,
  NotificationTemplateDto,
  NotificationEventRuleDto,
  IntegrationLogDto,
  TemplatePreviewResultDto,
  TestIntegrationResultDto,
} from '@suoxi/shared-types';

export async function runIntegrationFlowTests(): Promise<void> {
  console.log('[TEST-SUITE] Running Prompt 15 Integrations (SMTP + SMS) & Templates Flow Tests...');

  integrationService.resetData();

  const { username, oneTimePassword } = await seedSuperadmin({ silent: true });

  const app = createApiApp();
  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const standardOrigin = 'http://localhost:3000';

  try {
    // 1. Authenticate as Super Admin
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
    const sessionCookie = loginCookies[SESSION_COOKIE_NAME];

    // Helper for authenticated requests
    const authHeaders = (token = csrfToken) => ({
      'Content-Type': 'application/json',
      Origin: standardOrigin,
      [CSRF_HEADER_NAME]: token,
      Cookie: `${SESSION_COOKIE_NAME}=${sessionCookie}; ${CSRF_COOKIE_NAME}=${encodeURIComponent(token)}`,
    });

    // TEST 1: GET Integrations list - verify zero plain secret / ciphertext exposure (Hard Rule 10)
    console.log('  -> Test 1: Listing configurations masks credentials & never exposes plain secret');
    const listConfigsRes = await fetch(`${baseUrl}/api/v1/integrations/configs`, {
      headers: authHeaders(),
    });
    assert.equal(listConfigsRes.status, 200);
    const listConfigsJson = (await listConfigsRes.json()) as { data: IntegrationConfigDto[] };
    assert.ok(listConfigsJson.data.length >= 2, 'Pre-seeded SMTP and SMS configs should exist');

    for (const cfg of listConfigsJson.data) {
      assert.equal((cfg as any).credential, undefined, 'Plain credential must NEVER be returned');
      assert.equal((cfg as any).ciphertext, undefined, 'Ciphertext must NEVER be returned in DTO');
      assert.equal(cfg.has_credential, true, 'has_credential should be true');
      assert.equal(cfg.credential_masked, '••••••••', 'credential_masked must be placeholder');
    }

    // TEST 2: SSRF Protection Defense
    console.log('  -> Test 2: SSRF defense blocks HTTP, loopback, and cloud metadata (169.254.169.254)');

    // 2a. Reject Non-HTTPS
    const ssrfHttpRes = await fetch(`${baseUrl}/api/v1/integrations/configs`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        integration_type: 'sms_gateway',
        name: 'Insecure HTTP Gateway',
        config: {
          provider: 'generic',
          api_url: 'http://sms.external-insecure.com/send',
          auth_method: 'header_bearer',
          sender_id: 'SUOXI',
          rate_limit_per_minute: 60,
          max_retries: 2,
          retry_backoff_sec: 10,
        },
      }),
    });
    assert.equal(ssrfHttpRes.status, 422, 'Non-HTTPS URL must be rejected with 422');
    const ssrfHttpJson = (await ssrfHttpRes.json()) as any;
    assert.ok(ssrfHttpJson.error.message.includes('SSRF Protection Violation'));

    // 2b. Reject Loopback localhost
    const ssrfLocalRes = await fetch(`${baseUrl}/api/v1/integrations/configs`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        integration_type: 'sms_gateway',
        name: 'Malicious Localhost Target',
        config: {
          provider: 'generic',
          api_url: 'https://localhost:8080/internal-admin',
          auth_method: 'header_bearer',
          sender_id: 'SUOXI',
          rate_limit_per_minute: 60,
          max_retries: 2,
          retry_backoff_sec: 10,
        },
      }),
    });
    assert.equal(ssrfLocalRes.status, 422, 'Localhost host must be rejected with 422');

    // 2c. Reject Metadata IP 169.254.169.254
    const ssrfMetaRes = await fetch(`${baseUrl}/api/v1/integrations/configs`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        integration_type: 'sms_gateway',
        name: 'AWS/GCP Metadata Attempt',
        config: {
          provider: 'generic',
          api_url: 'https://169.254.169.254/computeMetadata/v1/',
          auth_method: 'header_bearer',
          sender_id: 'SUOXI',
          rate_limit_per_minute: 60,
          max_retries: 2,
          retry_backoff_sec: 10,
        },
      }),
    });
    assert.equal(ssrfMetaRes.status, 422, 'Metadata IP must be rejected with 422');

    // TEST 3: Only One Active Default per Type enforcement
    console.log('  -> Test 3: Enforcing only one active default per integration type');
    const createNewDefaultSmsRes = await fetch(`${baseUrl}/api/v1/integrations/configs`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        integration_type: 'sms_gateway',
        name: 'Elitbuzz Secondary High-Volume',
        is_default: true,
        is_active: true,
        config: {
          provider: 'elitbuzz',
          api_url: 'https://msg.elitbuzz-bd.com/smsapi',
          auth_method: 'query_param',
          sender_id: 'SUOXI VIP',
          rate_limit_per_minute: 200,
          max_retries: 3,
          retry_backoff_sec: 15,
        },
        credential: 'NEW_ELITBUZZ_KEY_12345',
      }),
    });
    assert.equal(createNewDefaultSmsRes.status, 201);
    const newDefaultSms = ((await createNewDefaultSmsRes.json()) as any).data as IntegrationConfigDto;
    assert.equal(newDefaultSms.is_default, true);
    assert.equal(newDefaultSms.has_credential, true);

    // Verify previous default was demoted
    const prevDefaultCheck = await fetch(`${baseUrl}/api/v1/integrations/configs/cfg-sms-01`, {
      headers: authHeaders(),
    });
    assert.equal(prevDefaultCheck.status, 200);
    const prevDefaultJson = ((await prevDefaultCheck.json()) as any).data as IntegrationConfigDto;
    assert.equal(prevDefaultJson.is_default, false, 'Previous default must be reset to false');

    // TEST 4: Templates - Token Whitelisting and 422 on unknown variables
    console.log('  -> Test 4: Token whitelisting rejects unknown variables with 422');
    const invalidTemplateRes = await fetch(`${baseUrl}/api/v1/templates`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        template_code: 'SMS_SECURITY_BREACH_TEST',
        channel: 'sms',
        language: 'en',
        name: 'Insecure Token Test',
        body: 'Hello {{patient_name}}, your secret password is {{patient_password}} and card is {{credit_card}}',
        allowed_variables: ['patient_name', 'appointment_date', 'clinic_phone'],
      }),
    });
    assert.equal(invalidTemplateRes.status, 422, 'Unknown tokens must be rejected with HTTP 422');
    const invalidTplJson = (await invalidTemplateRes.json()) as any;
    assert.ok(
      invalidTplJson.error.message.includes('{{patient_password}}'),
      'Error message must state rejected variable'
    );

    // Valid Template creation
    console.log('  -> Test 5: Creating and approving valid bilingual templates');
    const createTplRes = await fetch(`${baseUrl}/api/v1/templates`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        template_code: 'SMS_POST_OP_CARE_BN',
        channel: 'sms',
        language: 'bn',
        name: 'পোস্ট-ট্রিটমেন্ট যত্ন (বাংলা)',
        body: 'শ্রদ্ধেয় {{patient_name}}, ট্রিটমেন্টের পর রোদ এড়িয়ে চলুন। যেকোনো প্রয়োজনে কল করুন: {{clinic_phone}}',
        allowed_variables: ['patient_name', 'clinic_phone'],
      }),
    });
    assert.equal(createTplRes.status, 201);
    const createdTpl = ((await createTplRes.json()) as any).data as NotificationTemplateDto;
    assert.equal(createdTpl.status, 'draft');

    // Approve template
    const approveRes = await fetch(`${baseUrl}/api/v1/templates/${createdTpl.id}/approve`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({}),
    });
    assert.equal(approveRes.status, 200);
    const approvedTpl = ((await approveRes.json()) as any).data as NotificationTemplateDto;
    assert.equal(approvedTpl.status, 'approved');
    assert.ok(approvedTpl.approved_by, 'Should record approver user ID');

    // TEST 6: UCS-2 Segment Math and Live Preview with Bangla Text
    console.log('  -> Test 6: UCS-2 segment counter correctly segments Bangla Unicode text');
    const previewRes = await fetch(`${baseUrl}/api/v1/templates/preview`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        language: 'bn',
        body: 'প্রিয় {{patient_name}}, আগামীকাল {{appointment_time}} এ আপনার সেশন আছে। SUOXI Skin Care: {{clinic_phone}}',
        sample_data: {
          patient_name: 'সুমাইয়া রহমান',
          appointment_time: 'সকাল ১১:৩০',
          clinic_phone: '+8801711223344',
        },
      }),
    });
    assert.equal(previewRes.status, 200);
    const previewJson = ((await previewRes.json()) as any).data as TemplatePreviewResultDto;
    assert.equal(previewJson.is_unicode, true, 'Bangla text must be detected as Unicode (UCS-2)');
    assert.ok(previewJson.char_count > 60);
    assert.ok(previewJson.segment_count >= 1 && previewJson.segment_count <= 2);
    assert.ok(previewJson.rendered_body.includes('সুমাইয়া রহমান'));

    // Long Bangla text exceeding 70 chars triggers multi-segment (67 chars/part)
    const longBanglaText = 'প্রিয় সুমাইয়া রহমান, সুওক্সি স্কিন কেয়ার অ্যান্ড নান্দনিক সেন্টারে আপনার আগামীকালের অ্যাপয়েন্টমেন্ট নিশ্চিত করা হয়েছে। অনুগ্রহ করে ১৫ মিনিট পূর্বে উপস্থিত থাকবেন। হটলাইন: +৮৮০১৭১১২২৩৩৪৪';
    const longPreviewRes = await fetch(`${baseUrl}/api/v1/templates/preview`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        language: 'bn',
        body: longBanglaText,
      }),
    });
    assert.equal(longPreviewRes.status, 200);
    const longPreviewJson = ((await longPreviewRes.json()) as any).data as TemplatePreviewResultDto;
    assert.equal(longPreviewJson.is_unicode, true);
    assert.ok(longPreviewJson.char_count > 100);
    assert.ok(longPreviewJson.segment_count >= 2, 'UCS-2 text > 70 chars must require >= 2 segments');

    // TEST 7: Test Dispatch & Redacted Delivery Logs (Elitbuzz & SMTP)
    console.log('  -> Test 7: Integration test dispatch and sanitized delivery logs');
    const testSmsRes = await fetch(`${baseUrl}/api/v1/integrations/configs/cfg-sms-01/test`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        recipient: '+8801711223344',
        sample_message: 'Verification dispatch test',
      }),
    });
    assert.equal(testSmsRes.status, 200);
    const testSmsJson = ((await testSmsRes.json()) as any).data as TestIntegrationResultDto;
    assert.equal(testSmsJson.success, true);
    assert.ok(testSmsJson.provider_message_id?.startsWith('EB-MSG-'));

    // Fetch delivery logs and verify secret redaction
    const logsRes = await fetch(`${baseUrl}/api/v1/integrations/logs?type=sms_gateway`, {
      headers: authHeaders(),
    });
    assert.equal(logsRes.status, 200);
    const logsJson = ((await logsRes.json()) as any).data as IntegrationLogDto[];
    assert.ok(logsJson.length >= 1);
    const recentLog = logsJson[0];
    assert.equal(recentLog.status, 'success');
    assert.ok(recentLog.recipient.includes('****'), 'Recipient phone must be masked');
    assert.equal(recentLog.request_redacted?.api_key, '[REDACTED]', 'API key must be redacted in logs');

    // TEST 8: Event Rules Configuration
    console.log('  -> Test 8: Listing and updating event automation rules');
    const rulesRes = await fetch(`${baseUrl}/api/v1/event-rules`, {
      headers: authHeaders(),
    });
    assert.equal(rulesRes.status, 200);
    const rulesList = ((await rulesRes.json()) as any).data as NotificationEventRuleDto[];
    assert.ok(rulesList.length >= 2);

    const ruleToUpdate = rulesList[0];
    const updateRuleRes = await fetch(`${baseUrl}/api/v1/event-rules/${ruleToUpdate.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({
        event_type: ruleToUpdate.event_type,
        channel: ruleToUpdate.channel,
        template_id: ruleToUpdate.template_id,
        offset_minutes: -1440, // 24 hours prior
        quiet_hours_start: '22:00:00',
        quiet_hours_end: '07:30:00',
        requires_patient_consent: true,
        is_enabled: true,
      }),
    });
    assert.equal(updateRuleRes.status, 200);
    const updatedRule = ((await updateRuleRes.json()) as any).data as NotificationEventRuleDto;
    assert.equal(updatedRule.offset_minutes, -1440);
    assert.equal(updatedRule.quiet_hours_start, '22:00:00');
    assert.equal(updatedRule.quiet_hours_end, '07:30:00');
    assert.equal(updatedRule.is_enabled, true);

    console.log('  [PASS] All Prompt 15 Integrations & Templates tests passed successfully.');
  } finally {
    server.close();
  }
}
