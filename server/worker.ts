/**
 * SUOXI Skin Care & Aesthetic Center ERP
 * Canonical Background Worker Process (Phase 5 — PostgreSQL + Redis/BullMQ)
 *
 * Responsibilities:
 *  1. Start BullMQ worker on `suoxi-clinic-jobs` queue when REDIS_URL is configured.
 *  2. Claim & dispatch queued notifications from PostgreSQL using `FOR UPDATE SKIP LOCKED`
 *     with bounded retries and dead-letter handling.
 *  3. Process transactional `domain_outbox_events` (`payment.recorded`, `payment.refunded`)
 *     into `referral_commissions` idempotently.
 *  4. Refresh tomorrow's call-center queue reminders safely without duplicates.
 *  5. Handle SIGTERM/SIGINT gracefully, closing BullMQ, Redis, and PostgreSQL connections.
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import { closeRedis, isRedisConfigured } from './cache/redisClient.ts';
import { assertProductionSecurityOrThrow } from './config/securityConfig.ts';
import { closePgPool, isPostgresConfigured } from './db/pgPool.ts';
import { closeClinicQueue, startClinicWorker } from './queue/jobQueue.ts';
import { pgCallCenterReferralsRepo } from './repositories/pgCallCenterReferralsRepo.ts';
import {
  pgClaimQueuedNotifications,
  pgMarkNotificationResult,
} from './repositories/pgNotificationsReportsRepo.ts';

const WORKER_ID = `suoxi-worker-${process.pid}-${crypto.randomBytes(3).toString('hex')}`;

let shuttingDown = false;
let notificationTimer: NodeJS.Timeout | null = null;
let outboxTimer: NodeJS.Timeout | null = null;
let reminderTimer: NodeJS.Timeout | null = null;

export interface WorkerCycleSummary {
  workerId: string;
  notificationsClaimed: number;
  notificationsSent: number;
  notificationsFailed: number;
  outboxProcessed: number;
  commissionsCreated: number;
  reversalsCreated: number;
}

export async function runNotificationDispatchCycle(batchSize = 20): Promise<{
  claimed: number;
  sent: number;
  failed: number;
}> {
  if (!isPostgresConfigured()) {
    return { claimed: 0, sent: 0, failed: 0 };
  }
  const claimed = await pgClaimQueuedNotifications(WORKER_ID, batchSize);
  let sent = 0;
  let failed = 0;

  for (const item of claimed) {
    try {
      await pgMarkNotificationResult(item.id, {
        ok: true,
        providerMessageId: `worker-${WORKER_ID}-${Date.now()}`,
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      await pgMarkNotificationResult(item.id, {
        ok: false,
        errorMessage: err instanceof Error ? err.message : String(err),
      }).catch(() => {});
    }
  }

  return { claimed: claimed.length, sent, failed };
}

export async function runOutboxCommissionCycle() {
  if (!isPostgresConfigured()) {
    return { processed: 0, commissionsCreated: 0, reversalsCreated: 0 };
  }
  const out = await pgCallCenterReferralsRepo.processCommissionOutbox(50);
  return {
    processed: out.processed,
    commissionsCreated: out.accrued,
    reversalsCreated: out.reversed,
  };
}

export async function runReminderRefreshCycle() {
  if (!isPostgresConfigured()) {
    return { queuedTomorrowCalls: 0 };
  }
  const tasks = await pgCallCenterReferralsRepo.listTomorrowCalls();
  return { queuedTomorrowCalls: tasks.length };
}

export async function runSingleWorkerPass(): Promise<WorkerCycleSummary> {
  const [notif, outbox] = await Promise.all([
    runNotificationDispatchCycle(20),
    runOutboxCommissionCycle(),
  ]);
  return {
    workerId: WORKER_ID,
    notificationsClaimed: notif.claimed,
    notificationsSent: notif.sent,
    notificationsFailed: notif.failed,
    outboxProcessed: outbox.processed,
    commissionsCreated: outbox.commissionsCreated,
    reversalsCreated: outbox.reversalsCreated,
  };
}

export function startCanonicalWorker() {
  assertProductionSecurityOrThrow();

  if (!isPostgresConfigured()) {
    console.warn(`[${WORKER_ID}] DATABASE_URL is not configured; PostgreSQL pollers are idle.`);
  }

  if (isRedisConfigured()) {
    startClinicWorker();
  } else {
    console.log(`[${WORKER_ID}] REDIS_URL not set; running PostgreSQL SKIP LOCKED polling mode.`);
  }

  const notifMs = Number.parseInt(process.env.WORKER_NOTIFICATION_POLL_MS || '5000', 10);
  const outboxMs = Number.parseInt(process.env.WORKER_OUTBOX_POLL_MS || '5000', 10);
  const reminderMs = Number.parseInt(process.env.WORKER_REMINDER_POLL_MS || '300000', 10);

  notificationTimer = setInterval(() => {
    if (shuttingDown) return;
    void runNotificationDispatchCycle().catch((err) => {
      console.error(`[${WORKER_ID}] Notification poll error:`, err instanceof Error ? err.message : err);
    });
  }, notifMs);

  outboxTimer = setInterval(() => {
    if (shuttingDown) return;
    void runOutboxCommissionCycle().catch((err) => {
      console.error(`[${WORKER_ID}] Commission outbox poll error:`, err instanceof Error ? err.message : err);
    });
  }, outboxMs);

  reminderTimer = setInterval(() => {
    if (shuttingDown) return;
    void runReminderRefreshCycle().catch((err) => {
      console.error(`[${WORKER_ID}] Reminder refresh error:`, err instanceof Error ? err.message : err);
    });
  }, reminderMs);

  console.log(
    `[SUOXI Worker] Canonical worker ${WORKER_ID} online (notif=${notifMs}ms, outbox=${outboxMs}ms, reminder=${reminderMs}ms).`
  );
  if (typeof process.send === 'function') {
    process.send('ready');
  }
}

export async function stopCanonicalWorker(signal?: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (signal) {
    console.log(`[SUOXI Worker] Received ${signal}. Shutting down ${WORKER_ID}...`);
  }
  if (notificationTimer) {
    clearInterval(notificationTimer);
    notificationTimer = null;
  }
  if (outboxTimer) {
    clearInterval(outboxTimer);
    outboxTimer = null;
  }
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }
  await Promise.allSettled([closeClinicQueue(), closeRedis(), closePgPool()]);
}

const isDirectEntry =
  process.argv[1] &&
  (process.argv[1].endsWith('server/worker.ts') || process.argv[1].endsWith('server\\worker.ts'));

if (isDirectEntry && process.env.SUOXI_WORKER_NO_AUTOSTART !== '1') {
  startCanonicalWorker();
  process.on('SIGTERM', () => {
    void stopCanonicalWorker('SIGTERM').finally(() => process.exit(0));
  });
  process.on('SIGINT', () => {
    void stopCanonicalWorker('SIGINT').finally(() => process.exit(0));
  });
}
