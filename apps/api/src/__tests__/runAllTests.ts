import { runEnvTests } from './env.test.js';
import { runLoggerTests } from './logger.test.js';
import { runErrorTests } from './error.test.js';
import { runTransactionTests } from './transaction.test.js';
import { runMigratorTests } from './migrator.test.js';
import { runIdempotencyTests } from './idempotency.test.js';
import { runHealthAndReadinessTests } from './health.test.js';
import { runCodeSequenceTests } from './codeSequence.test.js';
import { runRbacTests } from './rbacResolver.test.js';
import { runCsrfMatrixTests } from './csrfMatrix.test.js';
import { runAuthFlowTests } from './authFlow.test.js';
import { runPatientFlowTests } from './patientFlow.test.js';
import { runAppointmentFlowTests } from './appointmentFlow.test.js';
import { runCalendarFlowTests } from './calendarFlow.test.js';
import { runCatalogFlowTests } from './catalogFlow.test.js';
import { runConsultationPrescriptionFlowTests } from './consultationPrescriptionFlow.test.js';
import { runTreatmentSessionFlowTests } from './treatmentSessionFlow.test.js';
import { runPackageLedgerFlowTests } from './packageLedgerFlow.test.js';
import { runBillingFlowTests } from './billingFlow.test.js';
import { runInventoryFlowTests } from './inventoryFlow.test.js';
import { runIntegrationFlowTests } from './integrationFlow.test.js';
import { runNotificationQueueFlowTests } from './notificationQueueFlow.test.js';
import { runCallCenterFlowTests } from './callCenterFlow.test.js';
import { runPortalFlowTests } from './portalFlow.test.js';
import { runReferralFlowTests } from './referralFlow.test.js';
import { runReportFlowTests } from './reportFlow.test.js';
import { runSecurityHardeningPassTests } from './securityHardeningPass.test.js';

async function main() {
  console.log('================================================================');
  console.log('SUOXI CRM — Backend Test Suite (Prompt 2A through Prompt 21)');
  console.log('================================================================');

  const suites: Array<{ name: string; fn: () => Promise<void> }> = [
    { name: 'Environment Validation & Secret Redaction', fn: runEnvTests },
    { name: 'Pino Logger & Key Redaction', fn: runLoggerTests },
    { name: 'API-CONV Error Envelope & SQL Masking', fn: runErrorTests },
    { name: 'Transaction & Deadlock Retry Handling', fn: runTransactionTests },
    { name: 'Migration Runner Checksum & Schema Gate', fn: runMigratorTests },
    { name: 'Idempotency Middleware & Replay Caching', fn: runIdempotencyTests },
    { name: 'Health, /readyz & Security Headers', fn: runHealthAndReadinessTests },
    { name: 'Concurrency-Safe Code Sequences (nextCode)', fn: runCodeSequenceTests },
    { name: 'RBAC Permission Resolution & Branch Isolation', fn: runRbacTests },
    { name: 'Section B.5a Double-Submit CSRF Matrix (Items a-k)', fn: runCsrfMatrixTests },
    { name: 'Auth Lifecycle, Lockout & Password Security', fn: runAuthFlowTests },
    { name: 'Patient Registration, Search, Duplicate Prevention & Clinical Privacy', fn: runPatientFlowTests },
    { name: 'Appointments Concurrency, Status Lifecycle, Clinical Protection & Timeline', fn: runAppointmentFlowTests },
    { name: 'Calendar Views, 42-Day Range Capping, Shaded Schedules & Reschedule', fn: runCalendarFlowTests },
    { name: 'Treatment Catalog & Food & Lifestyle Guidance Library', fn: runCatalogFlowTests },
    { name: 'Consultations, Prescriptions, "Suggest Food" & PDF Generation', fn: runConsultationPrescriptionFlowTests },
    { name: 'Treatment Sessions, Consumables & Doctor-Defined Next Session', fn: runTreatmentSessionFlowTests },
    { name: 'Treatment Packages & Append-Only Session Ledger', fn: runPackageLedgerFlowTests },
    { name: 'Billing: Invoices, Payments, Receipts, Refunds & Outbox', fn: runBillingFlowTests },
    { name: 'Inventory: Products, Movements, Batches & Purchases', fn: runInventoryFlowTests },
    { name: 'Integrations (SMTP + SMS), Templates, Event Rules & Redacted Logs (Prompt 15)', fn: runIntegrationFlowTests },
    { name: 'Notification Queue, SMS Reminders, Consent, Dispatch & Webhooks (Prompt 16)', fn: runNotificationQueueFlowTests },
    { name: 'Call Center Dashboard, Follow-Up Deduplication & Reschedule Routing (Prompt 17)', fn: runCallCenterFlowTests },
    { name: 'Patient Portal: IDOR Defense, Visibility Gates, Realm Isolation & OTP (Prompt 18)', fn: runPortalFlowTests },
    { name: 'Referrals, Accrual Engine, Payout Batches & Invariants (Prompt 19)', fn: runReferralFlowTests },
    { name: 'Reports Hub, Server-Side Aggregation, CSV Formula Shield & Export Logs (Prompt 20)', fn: runReportFlowTests },
    { name: 'Security & Data-Integrity Hardening Audit (Prompt 21)', fn: runSecurityHardeningPassTests },
  ];

  let passed = 0;
  let failed = 0;

  for (const suite of suites) {
    try {
      await suite.fn();
      passed++;
      console.log(`[PASS] ${suite.name}\n`);
    } catch (err) {
      failed++;
      console.error(`[FAIL] ${suite.name}:`, err, '\n');
    }
  }

  console.log('================================================================');
  console.log(`Test Execution Summary: ${passed} passed, ${failed} failed (${suites.length} total suites)`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL TEST ERROR]', err);
  process.exit(1);
});
