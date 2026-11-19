import assert from 'node:assert/strict';
import { referralService } from '../services/referralService.js';
import { billingService } from '../services/billingService.js';
import { processOutboxDomainEvents } from '../services/commissionWorker.js';

export async function runReferralFlowTests(): Promise<void> {
  console.log('\n--- Running Referral & Commission Flow Tests (Prompt 19) ---');
  referralService.resetData();
  billingService.resetData();

  const superAdminActor = {
    id: 'usr-admin-01',
    fullName: 'Super Admin',
    roles: ['super_admin'],
    branchId: 'br-dhk-01',
    permissions: new Set(['referral.create', 'referral.view', 'commission.view', 'commission.approve', 'commission.payout', 'commission.payout_details', 'commission.rule_manage']),
  };

  const cashierActor = {
    id: 'usr-cashier-01',
    fullName: 'Clinic Cashier',
    roles: ['cashier'],
    branchId: 'br-dhk-01',
    permissions: new Set(['referral.view', 'commission.view', 'commission.approve', 'commission.payout']),
  };

  // Test 1: Register Referrer with AES-256-GCM encrypted payout details & check masking
  console.log('Test 1: Referrer creation, AES-256-GCM encryption & permission masking...');
  const ref = await referralService.createReferrer(
    {
      referrerType: 'doctor',
      fullName: 'Prof. Dr. Kabir Ahmed',
      fullNameBn: 'অধ্যাপক ডা. কবির আহমেদ',
      mobile: '+8801719876543',
      email: 'dr.kabir@example.com',
      organizationName: 'Labaid Hospital Dhanmondi',
      payoutMethod: 'bank_transfer',
      payoutAccountDetails: 'A/C 205011998877, Eastern Bank Ltd, Dhanmondi Branch',
      notes: 'Head of Dermatology',
    },
    superAdminActor
  );
  assert.ok(ref.id.startsWith('ref-'), 'Referrer ID must have ref- prefix');
  assert.ok(ref.referrerCode.startsWith('REF-'), 'Referrer code must have REF- prefix');
  assert.equal(ref.hasPayoutDetails, true, 'hasPayoutDetails must be true');

  // Verify default masked view for cashier
  const cashierView = await referralService.getReferrerById(ref.id, cashierActor);
  assert.ok(
    cashierView.payoutDetailsMasked?.includes('••••••••'),
    'Cashier without commission.payout_details must see masked payout account'
  );

  // Verify decrypted view for super admin
  const adminView = await referralService.getReferrerById(ref.id, superAdminActor);
  assert.ok(
    adminView.payoutDetailsMasked?.includes('Eastern Bank Ltd'),
    'Super Admin with permission must see decrypted payout details'
  );
  console.log('✓ Referrer registered and encrypted credentials verified.');

  // Test 2: Patient Attribution Invariant (Single current referrer & history)
  console.log('Test 2: Patient attribution (Single current referrer invariant)...');
  const patientId = 'pt-sumaiya-01';

  // Attribution 1: Assign to Dr. Kabir
  const attr1 = await referralService.assignPatientReferrer(
    patientId,
    {
      referrerId: ref.id,
      attributionReason: 'Patient referred for facial resurfacing consultation',
    },
    superAdminActor
  );
  assert.equal(attr1.isCurrent, true, 'First attribution must be current');

  const cur1 = referralService.getPatientCurrentReferrer(patientId);
  assert.equal(cur1?.referrerId, ref.id, 'Current referrer must match Dr. Kabir');

  // Attribution 2: Re-assign to an Agent (e.g. ref-002)
  const attr2 = await referralService.assignPatientReferrer(
    patientId,
    {
      referrerId: 'ref-002',
      attributionReason: 'Re-attributed per patient corporate partner discount card',
    },
    superAdminActor
  );
  assert.equal(attr2.isCurrent, true, 'New attribution must be current');

  // Verify single current invariant: old attribution must now have isCurrent = false
  const history = referralService.getPatientReferralHistory(patientId);
  assert.equal(history.length, 2, 'History must contain 2 attribution records');
  const currentRecords = history.filter((h) => h.isCurrent);
  assert.equal(currentRecords.length, 1, 'Strict Invariant: Exactly ONE current referrer allowed');
  assert.equal(currentRecords[0].referrerId, 'ref-002', 'Current record must be ref-002');
  console.log('✓ Patient attribution history and single-current-referrer invariant verified.');

  // Re-assign back to ref (Dr. Kabir) for commission tests
  await referralService.assignPatientReferrer(
    patientId,
    {
      referrerId: ref.id,
      attributionReason: 'Re-assigned to Dr. Kabir for ongoing dermatological care',
    },
    superAdminActor
  );

  // Test 3: Commission Accrual upon Payment Realization
  console.log('Test 3: Idempotent commission accrual on payment realization...');
  // Doctor Standard rule CR-00001: 10% of paid_amount, min base 1,000, 10% withholding tax
  const paymentAmount = 4000.0;
  const paymentId = 'pay-test-001';

  const comm1 = await referralService.accrueForPayment({
    paymentId,
    patientId,
    amount: paymentAmount,
  });

  assert.ok(comm1, 'Commission must be created');
  assert.equal(comm1.status, 'pending', 'Commission must initially be pending');
  assert.equal(comm1.baseAmount, 4000.0, 'Base amount must match realized payment');
  assert.equal(comm1.computedAmount, 400.0, 'Computed gross must be 10% of 4000 = 400 BDT');
  assert.equal(comm1.withholdingPercent, 10.0, 'Withholding tax percent snapshot must be 10%');
  assert.equal(comm1.withholdingAmount, 40.0, 'Withholding tax amount must be 40 BDT');
  assert.equal(comm1.netAmount, 360.0, 'Net amount must be 400 - 40 = 360 BDT');

  // Verify Idempotency: Duplicate accrual call with same paymentId must return identical commission
  const commDuplicate = await referralService.accrueForPayment({
    paymentId,
    patientId,
    amount: paymentAmount,
  });
  assert.equal(commDuplicate?.id, comm1.id, 'Idempotency: duplicate payment event must not create duplicate commission');
  console.log('✓ Commission accrued accurately with withholding tax snapshot and idempotency key.');

  // Test 4: Outbox Worker integration with billingService events
  console.log('Test 4: Domain event outbox worker processing...');
  // Record payment in billingService
  const invoice = await billingService.createInvoice(
    {
      patientId,
      branchId: 'br-dhk-01',
      items: [
        {
          itemType: 'treatment',
          serviceId: 'srv-hf-001',
          quantity: 1,
          unitPrice: '5000.00',
        },
      ],
    },
    superAdminActor
  );
  await billingService.issueInvoice(invoice.id, superAdminActor);

  const paymentRes = await billingService.recordPayment(
    {
      patientId,
      branchId: 'br-dhk-01',
      paymentMethodCode: 'BKASH',
      transactionReference: 'BKASH-TRX-998811',
      amount: '5000.00',
      allocations: [{ invoiceId: invoice.id, amount: '5000.00' }],
    },
    'idemp-test-01',
    superAdminActor
  );

  // Process outbox
  const outboxResult = await processOutboxDomainEvents();
  assert.ok(outboxResult.processed >= 1, 'Worker must process payment.recorded event');
  assert.ok(outboxResult.commissionsCreated >= 1, 'Worker must generate commission for attributed patient');

  // Verify commissions list
  const commsForRef = referralService.listCommissions({ referrerId: ref.id });
  assert.ok(commsForRef.length >= 2, 'Dr. Kabir must have accrued commissions');
  console.log('✓ Outbox domain events consumed and processed by worker.');

  // Test 5: Proportional Refund Reversal (Hard Rule 3)
  console.log('Test 5: Proportional refund reversal...');
  const refundResult = await referralService.reverseForRefund({
    refundId: 'ref-test-001',
    sourcePaymentId: paymentId,
    amount: 2000.0, // 50% partial refund of 4,000 BDT payment
    patientId,
  });

  assert.ok(refundResult, 'Reversal commission row must be created');
  assert.equal(refundResult.kind, 'reversal', 'Kind must be reversal');
  assert.equal(refundResult.computedAmount, -200.0, 'Reversal must be proportional (50% of 400 BDT = -200 BDT)');
  assert.equal(refundResult.netAmount, -180.0, 'Net reversal must be -180 BDT');
  assert.equal(refundResult.parentCommissionId, comm1.id, 'Reversal must link to parent commission');
  console.log('✓ Proportional reversal created with non-destructive negative ledger row.');

  // Test 6: Snapshot Immutability (Rule edits do not mutate historical commissions)
  console.log('Test 6: Rule snapshot immutability...');
  const crRule = referralService.findMatchingRule('doctor');
  assert.ok(crRule, 'Active doctor rule must exist');
  const originalRate = comm1.appliedRate;

  // Update rule rate to 25%
  await referralService.updateCommissionRule(crRule.id, { rateValue: 25.0 }, superAdminActor);

  // Check that comm1 still has 10%
  const reloadedComm1 = referralService.listCommissions().find((c) => c.id === comm1.id);
  assert.equal(reloadedComm1?.appliedRate, originalRate, 'Historical commission must maintain snapshot of applied rate');
  console.log('✓ Rule snapshot immutability verified.');

  // Test 7: Approval and Single-Payout Guarantee
  console.log('Test 7: Approval and Single-Payout settlement...');
  // Find a pending commission
  const targetComm = commsForRef.find((c) => c.status === 'pending' && c.kind === 'accrual');
  assert.ok(targetComm, 'Pending accrual commission must exist');

  // Approve commission
  const approved = await referralService.approveCommissions([targetComm.id], superAdminActor);
  assert.equal(approved[0].status, 'approved', 'Status must transition to approved');

  // Create Payout
  const payout = await referralService.createPayout(
    {
      referrerId: ref.id,
      commissionIds: [targetComm.id],
      payoutMethod: 'bank_transfer',
      paymentReference: 'EBL-TRX-99887722',
      paidDate: '2026-10-24',
      notes: 'Bi-weekly doctor commission payout',
    },
    cashierActor
  );

  assert.ok(payout.payoutNumber.startsWith('PAYOUT-'), 'Payout must have formatted number');
  assert.equal(payout.commissionCount, 1, 'Commission count must be 1');
  assert.equal(payout.netPayoutAmount, targetComm.netAmount, 'Payout net must match commission net');

  // Verify target commission is now paid and bound to payout
  const settledComm = referralService.listCommissions().find((c) => c.id === targetComm.id);
  assert.equal(settledComm?.status, 'paid', 'Commission status must be paid');
  assert.equal(settledComm?.payoutId, payout.id, 'Commission must be bound to payoutId');

  // Test Single-Payout Invariant: Attempting to pay out the same commission again must be rejected
  await assert.rejects(
    async () => {
      await referralService.createPayout(
        {
          referrerId: ref.id,
          commissionIds: [targetComm.id],
          payoutMethod: 'bank_transfer',
          paymentReference: 'DUPLICATE-TRY',
        },
        cashierActor
      );
    },
    /cannot be paid out/i,
    'Single-Payout Guarantee: Already paid commission cannot be settled in another payout'
  );
  console.log('✓ Single-payout guarantee and atomic settlement verified.');

  console.log('=== ALL REFERRAL & COMMISSION TESTS PASSED ===\n');
}
