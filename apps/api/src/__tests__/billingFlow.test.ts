import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createApiApp } from '../app.js';
import {
  InvoiceDto,
  PaymentDto,
  PaymentMethodDto,
  RefundDto,
  ReceiptDto,
  PatientDuesDto,
} from '@suoxi/shared-types';
import {
  CSRF_HEADER_NAME,
  CSRF_COOKIE_NAME,
  ANON_COOKIE_NAME,
  parseCookies,
} from '../auth/csrf.js';
import { SESSION_COOKIE_NAME } from '../auth/session.js';
import { seedSuperadmin } from '../scripts/seedSuperadmin.js';
import { billingService } from '../services/billingService.js';
import { patientService } from '../services/patientService.js';

export async function runBillingFlowTests(): Promise<void> {
  console.log('[TEST-SUITE] Running Billing: Invoices, Payments, Refunds & Outbox Tests (Prompt 12)...');

  billingService.resetData();

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
    console.log('  ✓ Cashier / Superadmin authenticated with session and CSRF');

    // 2. DEV Sample Seed Verification (INV-2026-000231, Sumaiya Rahman)
    const seedInvRes = await fetch(`${baseUrl}/api/v1/invoices/inv-sample-01`, {
      headers: { Cookie: authCookieHeader },
    });
    assert.equal(seedInvRes.status, 200);
    const seedInv = ((await seedInvRes.json()) as any).data as InvoiceDto;
    assert.equal(seedInv.invoiceNo, 'INV-2026-000231');
    assert.equal(seedInv.subtotal, '4500.00');
    assert.equal(seedInv.discountAmount, '500.00');
    assert.equal(seedInv.totalAmount, '4000.00');
    assert.equal(seedInv.paidAmount, '2000.00');
    assert.equal(seedInv.dueAmount, '2000.00');
    assert.equal(seedInv.status, 'partially_paid');
    console.log(`  ✓ DEV Sample verified: ${seedInv.invoiceNo} (Total ৳ 4,000, Paid ৳ 2,000, Due ৳ 2,000)`);

    // 3. Client Total Tamper Protection: Client sends fraudulent total, server recomputes
    const tamperCreateRes = await fetch(`${baseUrl}/api/v1/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        patientId: 'pt-sumaiya-01',
        branchId: 'br-dhk-01',
        invoiceDate: '2026-10-21',
        items: [
          {
            itemType: 'treatment',
            serviceId: 'srv-hf-001',
            description: 'HydraFacial Treatment Session',
            quantity: 2,
            unitPrice: '4500.00', // 2 x 4500 = 9000
            discountAmount: '1000.00', // line total = 8000
          },
        ],
        // Tampered totals sent by malicious client
        subtotal: '100.00',
        totalAmount: '50.00',
        issueImmediately: true,
      }),
    });
    assert.equal(tamperCreateRes.status, 201);
    const tamperInv = ((await tamperCreateRes.json()) as any).data as InvoiceDto;
    assert.equal(tamperInv.subtotal, '8000.00'); // Server recomputed!
    assert.equal(tamperInv.totalAmount, '8000.00');
    assert.equal(tamperInv.dueAmount, '8000.00');
    assert.equal(tamperInv.paidAmount, '0.00');
    assert.equal(tamperInv.status, 'unpaid');
    console.log('  ✓ Client total tamper protection verified: server recomputed accurate subtotal (৳ 8,000) and due (৳ 8,000)');

    // 4. Discount Limit Enforcement: Receptionist (limit 5%) attempts 20% discount without authorizer -> 403 Forbidden
    const unauthDiscountRes = await fetch(`${baseUrl}/api/v1/invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        patientId: 'pt-sumaiya-01',
        branchId: 'br-dhk-01',
        invoiceDate: '2026-10-21',
        discountPercent: '20.00',
        discountReason: 'Friend of doctor',
        // No discountAuthorizedBy supplied
        items: [
          {
            itemType: 'treatment',
            serviceId: 'srv-hf-001',
            description: 'Laser Resurfacing Trial',
            quantity: 1,
            unitPrice: '10000.00',
          },
        ],
      }),
    });
    // In our test, super_admin role has 100% max discount limit, so superadmin passes.
    // Let's test calling createInvoice directly with receptionist actor to assert 403 Forbidden.
    await assert.rejects(
      async () => {
        await billingService.createInvoice(
          {
            patientId: 'pt-sumaiya-01',
            branchId: 'br-dhk-01',
            invoiceDate: '2026-10-21',
            discountPercent: '20.00',
            discountReason: 'Unauthorized discount',
            items: [
              {
                itemType: 'treatment',
                description: 'Trial Service',
                quantity: 1,
                unitPrice: '10000.00',
              },
            ],
          },
          { id: 'usr-rec-01', role: 'receptionist' }
        );
      },
      (err: any) => {
        assert.match(err.message, /exceeds your role limit/i);
        return true;
      }
    );
    console.log('  ✓ Discount policy verified: discount exceeding role limit rejected without supervisor authorization');

    // 4b. Verify Payment Methods use BIGINT UNSIGNED numeric IDs + code business keys (no pm-* strings)
    const pmRes = await fetch(`${baseUrl}/api/v1/billing/payment-methods`, {
      headers: { Cookie: authCookieHeader },
    });
    assert.equal(pmRes.status, 200);
    const paymentMethodsList = ((await pmRes.json()) as any).data as PaymentMethodDto[];
    assert.ok(paymentMethodsList.length >= 5, 'Seeded payment methods must exist');
    for (const pm of paymentMethodsList) {
      assert.equal(typeof pm.id, 'number', 'payment_methods.id must be numeric BIGINT UNSIGNED');
      assert.ok(Number(pm.id) > 0, 'payment_methods.id must be positive');
      assert.ok(!String(pm.id).startsWith('pm-'), 'Legacy pm-* VARCHAR IDs must not exist');
    }
    const cashMethod = paymentMethodsList.find((m) => m.code === 'CASH')!;
    const bkashMethod = paymentMethodsList.find((m) => m.code === 'BKASH')!;
    assert.ok(cashMethod && bkashMethod, 'CASH and BKASH business keys must exist');

    // 5. Concurrency Gate: 5 parallel payments totalling more than due -> over-allocation rejected, balance never negative
    // Target invoice: seedInv (due is ৳ 2,000). Let's dispatch 5 parallel payments of ৳ 1,000 each (total ৳ 5,000 > ৳ 2,000).
    const parallelPayments = Array.from({ length: 5 }).map((_, idx) =>
      fetch(`${baseUrl}/api/v1/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: standardOrigin,
          [CSRF_HEADER_NAME]: csrfToken,
          Cookie: authCookieHeader,
          'Idempotency-Key': `parallel-pay-key-${idx}-${Date.now()}`,
        },
        body: JSON.stringify({
          patientId: 'pt-sumaiya-01',
          branchId: 'br-dhk-01',
          paymentMethodId: cashMethod.id,
          amount: '1000.00',
          allocations: [
            {
              invoiceId: seedInv.id,
              amount: '1000.00',
            },
          ],
        }),
      })
    );

    const paymentResults = await Promise.all(parallelPayments);
    const paymentStatuses = paymentResults.map((r) => r.status);
    const count201 = paymentStatuses.filter((s) => s === 201).length;
    const countConflict = paymentStatuses.filter((s) => s === 409).length;

    assert.equal(count201, 2, 'Exactly 2 payments of ৳ 1,000 can succeed before due of ৳ 2,000 is exhausted');
    assert.equal(countConflict, 3, 'Remaining 3 parallel payments must be rejected with HTTP 409 Conflict');

    // Check resulting invoice balance
    const updatedSeedInv = await billingService.getInvoiceById(seedInv.id);
    assert.equal(updatedSeedInv.paidAmount, '4000.00');
    assert.equal(updatedSeedInv.dueAmount, '0.00');
    assert.equal(updatedSeedInv.status, 'paid');
    console.log('  ✓ Concurrency & lock order verified: 5 parallel payments prevented over-allocation; final due is exactly ৳ 0.00 (never negative)');

    // 6. Idempotency-Key Deduplication: Re-sending exact same key returns cached identical response
    const idemKey = 'unique-idem-payment-key-2026';
    const pay1Res = await fetch(`${baseUrl}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
        'Idempotency-Key': idemKey,
      },
      body: JSON.stringify({
        patientId: 'pt-sumaiya-01',
        branchId: 'br-dhk-01',
        paymentMethodId: bkashMethod.id,
        amount: '3000.00',
        transactionReference: 'TRX-IDEM-001',
        isAdvance: true, // Advance payment
      }),
    });
    assert.equal(pay1Res.status, 201);
    const pay1 = ((await pay1Res.json()) as any).data as PaymentDto;

    // Repeat identical request with same Idempotency-Key
    const pay2Res = await fetch(`${baseUrl}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
        'Idempotency-Key': idemKey,
      },
      body: JSON.stringify({
        patientId: 'pt-sumaiya-01',
        branchId: 'br-dhk-01',
        paymentMethodId: bkashMethod.id,
        amount: '3000.00',
        transactionReference: 'TRX-IDEM-001',
        isAdvance: true,
      }),
    });
    assert.equal(pay2Res.status, 201);
    const pay2 = ((await pay2Res.json()) as any).data as PaymentDto;
    assert.equal(pay1.id, pay2.id);
    assert.equal(pay1.paymentNo, pay2.paymentNo);
    console.log('  ✓ Idempotency verified: duplicate submission returned cached response without creating second payment');

    // 7. Duplicate bKash TrxID -> 409 Conflict (also exercises paymentMethodCode business-key lookup)
    const dupTrxRes = await fetch(`${baseUrl}/api/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
        'Idempotency-Key': 'different-key-same-trx',
      },
      body: JSON.stringify({
        patientId: 'pt-sumaiya-01',
        branchId: 'br-dhk-01',
        paymentMethodCode: 'BKASH',
        amount: '1500.00',
        transactionReference: 'TRX-IDEM-001', // Duplicate TrxID
      }),
    });
    assert.equal(dupTrxRes.status, 409);
    console.log('  ✓ TrxID uniqueness verified: duplicate bKash TrxID rejected with HTTP 409 Conflict');

    // 8. Printable Receipt & Number-to-Words
    const receiptRes = await fetch(`${baseUrl}/api/v1/receipts/${pay1.id}`, {
      headers: { Cookie: authCookieHeader },
    });
    assert.equal(receiptRes.status, 200);
    const receipt = ((await receiptRes.json()) as any).data as ReceiptDto;
    assert.equal(receipt.amount, '3000.00');
    assert.equal(receipt.amountInWords, 'Three Thousand Taka Only');
    assert.equal(receipt.staffRecordedBadge, true);
    console.log(`  ✓ Printable receipt verified: ${receipt.receiptNo} — "${receipt.amountInWords}" with "Staff recorded" badge`);

    // 9. Refunds: Request, Approve, and Mark Paid Lifecycle
    // Allocate ৳ 2000 from pay1 to tamperInv (due ৳ 8,000)
    const allocRes = await fetch(`${baseUrl}/api/v1/payments/${pay1.id}/allocate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        allocations: [
          {
            invoiceId: tamperInv.id,
            amount: '2000.00',
          },
        ],
      }),
    });
    assert.equal(allocRes.status, 200);

    // Request refund > refundable -> 422
    const overRefundRes = await fetch(`${baseUrl}/api/v1/refunds`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        sourcePaymentId: pay1.id,
        amount: '50000.00', // Exceeds cap
        reason: 'Requested excessive refund',
      }),
    });
    assert.equal(overRefundRes.status, 422);
    console.log('  ✓ Refund cap verified: refund amount > refundable balance rejected with HTTP 422 Unprocessable Entity');

    // Request valid refund of ৳ 1,000
    const reqRefundRes = await fetch(`${baseUrl}/api/v1/refunds`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        sourcePaymentId: pay1.id,
        invoiceId: tamperInv.id,
        amount: '1000.00',
        reason: 'Patient experienced mild contact dermatitis, session refunded',
      }),
    });
    assert.equal(reqRefundRes.status, 201);
    const refund = ((await reqRefundRes.json()) as any).data as RefundDto;
    assert.equal(refund.status, 'requested');

    // Approve refund
    const appRefundRes = await fetch(`${baseUrl}/api/v1/refunds/${refund.id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({ notes: 'Approved by Medical Director' }),
    });
    assert.equal(appRefundRes.status, 200);

    // Mark refund paid
    const paidRefundRes = await fetch(`${baseUrl}/api/v1/refunds/${refund.id}/mark-paid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: standardOrigin,
        [CSRF_HEADER_NAME]: csrfToken,
        Cookie: authCookieHeader,
      },
      body: JSON.stringify({
        refundMethodCode: 'BKASH',
        transactionReference: 'REF-BKASH-9988',
        notes: 'bKash disbursement completed',
      }),
    });
    assert.equal(paidRefundRes.status, 200);
    const paidRefund = ((await paidRefundRes.json()) as any).data as RefundDto;
    assert.equal(paidRefund.status, 'paid');
    console.log(`  ✓ 3-Stage Refund lifecycle verified: ${paidRefund.refundNo} marked paid via bKash (TrxID: REF-BKASH-9988)`);

    // 10. Transactional Outbox: Verify events exist in domain_events
    const outboxEvents = billingService.getDomainEvents();
    assert.ok(outboxEvents.length >= 2);
    const paymentEvt = outboxEvents.find((e) => e.eventType === 'payment.recorded');
    const refundEvt = outboxEvents.find((e) => e.eventType === 'refund.completed');
    assert.ok(paymentEvt, 'payment.recorded event must exist in domain_events outbox');
    assert.ok(refundEvt, 'refund.completed event must exist in domain_events outbox');
    console.log(`  ✓ Transactional Outbox verified: ${outboxEvents.length} events logged in domain_events table (payment.recorded, refund.completed)`);

    // 11. Patient Dues View Verification (v_patient_dues)
    const duesRes = await fetch(`${baseUrl}/api/v1/patients/pt-sumaiya-01/dues`, {
      headers: { Cookie: authCookieHeader },
    });
    assert.equal(duesRes.status, 200);
    const duesData = ((await duesRes.json()) as any).data as PatientDuesDto;
    assert.ok(Number(duesData.totalInvoiced) > 0);
    assert.ok(Number(duesData.totalPaid) > 0);
    console.log(`  ✓ Patient Dues view verified: Invoiced ৳ ${duesData.totalInvoiced}, Paid ৳ ${duesData.totalPaid}, Net Due ৳ ${duesData.netPatientDue}`);

    // 12. Daily Collections Report (v_daily_collections)
    const today = new Date().toISOString().split('T')[0];
    const collectionsRes = await fetch(`${baseUrl}/api/v1/billing/collections?date=${today}`, {
      headers: { Cookie: authCookieHeader },
    });
    assert.equal(collectionsRes.status, 200);
    const report = ((await collectionsRes.json()) as any).data;
    assert.ok(Number(report.grandTotalReceived) > 0);
    console.log(`  ✓ Daily collections report verified: Grand Received ৳ ${report.grandTotalReceived}, Net Collected ৳ ${report.grandNetCollected}`);

    console.log('[PASS] Billing: Invoices, Payments, Refunds & Outbox Tests Passed!');
  } finally {
    server.close();
  }
}

if (process.argv[1]?.endsWith('billingFlow.test.ts') || process.argv[1]?.endsWith('billingFlow.test.js')) {
  describe('Billing Flow Tests', () => {
    it('executes full billing lifecycle, concurrency, and outbox test suite', async () => {
      await runBillingFlowTests();
    });
  });
}
