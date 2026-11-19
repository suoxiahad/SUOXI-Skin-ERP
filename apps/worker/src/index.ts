/**
 * SUOXI CRM — Background Worker Service
 * Node.js 24 LTS background job runner:
 * 1. Queue Dispatcher: Claims due notifications with SKIP LOCKED semantics & visibility timeout crash recovery.
 * 2. Reminder Generator: 24h prior session reminders, quiet-hours aware, patient consent checked.
 * 3. Graceful shutdown handler.
 */

import crypto from 'node:crypto';
import { notificationService } from '../../api/src/services/notificationService.js';
import { callCenterService } from '../../api/src/services/callCenterService.js';
import { processOutboxDomainEvents } from '../../api/src/services/commissionWorker.js';

const WORKER_ID = `worker-${process.pid}-${crypto.randomUUID().slice(0, 6)}`;

let isShuttingDown = false;
let pollingTimer: NodeJS.Timeout | null = null;
let reminderTimer: NodeJS.Timeout | null = null;
let followUpTimer: NodeJS.Timeout | null = null;
let commissionTimer: NodeJS.Timeout | null = null;

let stats = {
  workerId: WORKER_ID,
  startedAt: new Date().toISOString(),
  dispatchedCount: 0,
  failedCount: 0,
  followUpTasksGenerated: 0,
  cyclesCompleted: 0,
  lastRunAt: undefined as string | undefined,
};

export async function runDispatchCycle(): Promise<{ claimed: number; sent: number; failed: number }> {
  try {
    const result = await notificationService.claimAndDispatchBatch({
      workerId: WORKER_ID,
      batchSize: 10,
      visibilityTimeoutSec: 60,
    });

    stats.dispatchedCount += result.sent;
    stats.failedCount += result.failed;
    stats.cyclesCompleted += 1;
    stats.lastRunAt = new Date().toISOString();

    return result;
  } catch (err) {
    console.error(`[${WORKER_ID}] Dispatch cycle encountered error:`, err);
    return { claimed: 0, sent: 0, failed: 0 };
  }
}

export async function runReminderCycle(): Promise<{ generated: number; skipped: number }> {
  try {
    const result = await notificationService.generateSessionReminders();
    return { generated: result.generated, skipped: result.skipped };
  } catch (err) {
    console.error(`[${WORKER_ID}] Reminder generator encountered error:`, err);
    return { generated: 0, skipped: 0 };
  }
}

export async function runFollowUpCycle(): Promise<{ generated: number; skippedDuplicates: number }> {
  try {
    const result = await callCenterService.generateFollowUpTasks();
    stats.followUpTasksGenerated += result.generated;
    return { generated: result.generated, skippedDuplicates: result.skippedDuplicates };
  } catch (err) {
    console.error(`[${WORKER_ID}] Follow-up task generator encountered error:`, err);
    return { generated: 0, skippedDuplicates: 0 };
  }
}

export async function runCommissionCycle(): Promise<{ processed: number; commissionsCreated: number; reversalsCreated: number }> {
  try {
    return await processOutboxDomainEvents();
  } catch (err) {
    console.error(`[${WORKER_ID}] Commission outbox worker encountered error:`, err);
    return { processed: 0, commissionsCreated: 0, reversalsCreated: 0 };
  }
}

export function startWorker(options?: {
  pollIntervalMs?: number;
  reminderIntervalMs?: number;
  followUpIntervalMs?: number;
  commissionIntervalMs?: number;
}) {
  const pollMs = options?.pollIntervalMs || 5000;
  const reminderMs = options?.reminderIntervalMs || 60000;
  const followUpMs = options?.followUpIntervalMs || 120000; // Every 2 minutes
  const commissionMs = options?.commissionIntervalMs || 5000;

  console.log(`[SUOXI-WORKER] Starting worker instance ${WORKER_ID}...`);

  // Start dispatch poller
  pollingTimer = setInterval(async () => {
    if (isShuttingDown) return;
    await runDispatchCycle();
  }, pollMs);

  // Start reminder poller
  reminderTimer = setInterval(async () => {
    if (isShuttingDown) return;
    await runReminderCycle();
  }, reminderMs);

  // Start follow-up tasks generator poller
  followUpTimer = setInterval(async () => {
    if (isShuttingDown) return;
    await runFollowUpCycle();
  }, followUpMs);

  // Start commission outbox poller
  commissionTimer = setInterval(async () => {
    if (isShuttingDown) return;
    await runCommissionCycle();
  }, commissionMs);
}

export function stopWorker() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
  if (reminderTimer) {
    clearInterval(reminderTimer);
    reminderTimer = null;
  }
  if (followUpTimer) {
    clearInterval(followUpTimer);
    followUpTimer = null;
  }
  if (commissionTimer) {
    clearInterval(commissionTimer);
    commissionTimer = null;
  }
  console.log(`[SUOXI-WORKER] Worker ${WORKER_ID} stopped.`);
}

function handleShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[SUOXI-WORKER] Received ${signal}. Shutting down worker gracefully...`);
  stopWorker();
  process.exit(0);
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

export function getWorkerStatus() {
  return {
    service: 'suoxi-worker',
    workerId: WORKER_ID,
    status: isShuttingDown ? 'stopping' : 'active',
    uptimeSeconds: process.uptime(),
    stats,
    timestamp: new Date().toISOString(),
  };
}
