/**
 * Commission Outbox Worker
 * Consumes 'payment.recorded' and 'refund.completed' domain events from billingService outbox,
 * evaluating matching commission rules and idempotently creating commissions / reversals.
 */

import { billingService } from './billingService.js';
import { referralService } from './referralService.js';

export async function processOutboxDomainEvents(): Promise<{
  processed: number;
  commissionsCreated: number;
  reversalsCreated: number;
}> {
  const events = billingService.getDomainEvents();
  let processed = 0;
  let commissionsCreated = 0;
  let reversalsCreated = 0;

  for (const evt of events) {
    if (evt.processedAt) {
      continue; // Already processed
    }

    if (evt.eventType === 'payment.recorded') {
      const payload = evt.payload;
      if (payload && payload.patientId && payload.amount) {
        const comm = await referralService.accrueForPayment({
          paymentId: payload.paymentId || evt.aggregateId,
          patientId: payload.patientId,
          amount: Number(payload.amount),
        });
        if (comm) {
          commissionsCreated++;
        }
      }
      evt.processedAt = new Date().toISOString();
      processed++;
    } else if (evt.eventType === 'refund.completed') {
      const payload = evt.payload;
      if (payload && payload.sourcePaymentId && payload.amount) {
        const rev = await referralService.reverseForRefund({
          refundId: payload.refundId || evt.aggregateId,
          sourcePaymentId: payload.sourcePaymentId,
          amount: Number(payload.amount),
          patientId: payload.patientId,
        });
        if (rev) {
          reversalsCreated++;
        }
      }
      evt.processedAt = new Date().toISOString();
      processed++;
    }
  }

  return { processed, commissionsCreated, reversalsCreated };
}
