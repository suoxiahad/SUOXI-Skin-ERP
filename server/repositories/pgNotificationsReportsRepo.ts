/**
 * SUOXI Skin Care & Aesthetic Center ERP
 * PostgreSQL Repository: Notifications Queue (SKIP LOCKED), Webhook Events,
 * Staff Alerts, Call Contact Logs, Follow-Up Rules & Real Reports Hub + CSV Export
 */

import crypto from 'node:crypto';
import type { User } from '../../src/types/index.ts';
import { sanitizeCsvCell } from '../config/securityConfig.ts';
import { pgQuery, withPgTransaction } from '../db/pgPool.ts';
import { pgLogAuditEvent, pgRequireBranch, toDateOnly, toIsoString, toNumber } from './pgHelpers.ts';

// ============================================================================
// 1. NOTIFICATIONS QUEUE & EVENT RULES
// ============================================================================

export async function pgEnqueueNotification(params: {
  idempotencyKey?: string;
  branchId?: string | null;
  patientId?: string | null;
  channel: 'sms' | 'email' | 'in_app';
  recipient: string;
  subject?: string;
  body: string;
  scheduledFor?: string;
}) {
  const id = `ntf-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const res = await pgQuery(
    `
    INSERT INTO notifications (
      id, idempotency_key, branch_id, patient_id, channel, recipient, subject, body, status, scheduled_for
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued', COALESCE($9::timestamptz, NOW()))
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING *
    `,
    [
      id,
      params.idempotencyKey || null,
      params.branchId || null,
      params.patientId || null,
      params.channel,
      params.recipient,
      params.subject || null,
      params.body,
      params.scheduledFor || null,
    ]
  );
  if ((res.rowCount || 0) === 0 && params.idempotencyKey) {
    const existing = await pgQuery('SELECT * FROM notifications WHERE idempotency_key = $1 LIMIT 1', [
      params.idempotencyKey,
    ]);
    return { notification: existing.rows[0], deduplicated: true };
  }
  return { notification: res.rows[0], deduplicated: false };
}

export async function pgClaimQueuedNotifications(workerId: string, limit = 25) {
  return withPgTransaction(async (client) => {
    const res = await client.query(
      `
      WITH next_batch AS (
        SELECT id
        FROM notifications
        WHERE status = 'queued'
          AND scheduled_for <= NOW()
          AND (locked_until IS NULL OR locked_until < NOW())
        ORDER BY scheduled_for ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
      )
      UPDATE notifications n
      SET status = 'processing',
          locked_by = $2,
          locked_until = NOW() + INTERVAL '5 minutes',
          attempts = n.attempts + 1,
          updated_at = NOW()
      FROM next_batch
      WHERE n.id = next_batch.id
      RETURNING n.*
      `,
      [limit, workerId]
    );
    return res.rows;
  });
}

export async function pgMarkNotificationResult(
  id: string,
  outcome: { ok: boolean; providerMessageId?: string; errorMessage?: string }
) {
  if (outcome.ok) {
    await pgQuery(
      `
      UPDATE notifications
      SET status = 'sent',
          provider_message_id = COALESCE($2, provider_message_id),
          sent_at = NOW(),
          locked_until = NULL,
          last_error = NULL,
          updated_at = NOW()
      WHERE id = $1
      `,
      [id, outcome.providerMessageId || null]
    );
  } else {
    await pgQuery(
      `
      UPDATE notifications
      SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
          scheduled_for = CASE WHEN attempts >= max_attempts THEN scheduled_for ELSE NOW() + INTERVAL '2 minutes' END,
          locked_until = NULL,
          last_error = $2,
          updated_at = NOW()
      WHERE id = $1
      `,
      [id, (outcome.errorMessage || 'Delivery failed').slice(0, 500)]
    );
  }
}

export async function pgListNotifications(filters?: { branchId?: string; channel?: string; status?: string }) {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filters?.branchId && filters.branchId !== 'all') {
    params.push(filters.branchId);
    conds.push(`branch_id = $${params.length}`);
  }
  if (filters?.channel) {
    params.push(filters.channel);
    conds.push(`channel = $${params.length}`);
  }
  if (filters?.status) {
    params.push(filters.status);
    conds.push(`status = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const res = await pgQuery(`SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT 200`, params);
  return res.rows;
}

export async function pgRecordWebhookEvent(params: {
  provider: string;
  providerEventId: string;
  eventType: string;
  signatureVerified: boolean;
  payload: unknown;
  providerMessageId?: string;
  deliveryStatus?: 'delivered' | 'failed';
}) {
  return withPgTransaction(async (client) => {
    const id = `whk-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const insertRes = await client.query(
      `
      INSERT INTO webhook_events (id, provider, provider_event_id, event_type, signature_verified, payload, status)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'processed')
      ON CONFLICT (provider, provider_event_id) DO NOTHING
      RETURNING *
      `,
      [
        id,
        params.provider,
        params.providerEventId,
        params.eventType,
        params.signatureVerified,
        JSON.stringify(params.payload ?? {}),
      ]
    );
    if ((insertRes.rowCount || 0) === 0) {
      return { deduplicated: true, eventId: params.providerEventId };
    }

    if (params.providerMessageId && params.deliveryStatus) {
      await client.query(
        `
        UPDATE notifications
        SET status = $2,
            delivered_at = CASE WHEN $2 = 'delivered' THEN NOW() ELSE delivered_at END,
            updated_at = NOW()
        WHERE provider_message_id = $1
        `,
        [params.providerMessageId, params.deliveryStatus]
      );
    }

    return { deduplicated: false, event: insertRes.rows[0] };
  });
}

// ============================================================================
// 2. STAFF ALERTS & CALL CONTACT LOGS
// ============================================================================

export async function pgListStaffAlerts(user: User) {
  const res = await pgQuery(
    `
    SELECT * FROM staff_alerts
    WHERE (target_user_id = $1 OR target_role = $2 OR (target_user_id IS NULL AND target_role IS NULL))
      AND (branch_id IS NULL OR branch_id = $3 OR $2 = 'super_admin')
    ORDER BY is_read ASC, created_at DESC
    LIMIT 100
    `,
    [user.id, user.role, user.branchId]
  );
  return res.rows;
}

export async function pgCreateStaffAlert(params: {
  branchId?: string | null;
  targetUserId?: string | null;
  targetRole?: string | null;
  severity?: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  resourceType?: string;
  resourceId?: string;
}) {
  const id = `alt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const res = await pgQuery(
    `
    INSERT INTO staff_alerts (id, branch_id, target_user_id, target_role, severity, title, message, resource_type, resource_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
    `,
    [
      id,
      params.branchId || null,
      params.targetUserId || null,
      params.targetRole || null,
      params.severity || 'info',
      params.title,
      params.message,
      params.resourceType || null,
      params.resourceId || null,
    ]
  );
  return res.rows[0];
}

export async function pgMarkStaffAlertRead(alertId: string, user: User) {
  const res = await pgQuery(
    `
    UPDATE staff_alerts
    SET is_read = TRUE, read_at = NOW()
    WHERE id = $1 AND (target_user_id = $2 OR target_role = $3 OR target_user_id IS NULL)
    RETURNING *
    `,
    [alertId, user.id, user.role]
  );
  return res.rows[0] || null;
}

export async function pgLogCallContact(
  payload: {
    taskId?: string;
    appointmentId?: string;
    patientId: string;
    branchId?: string;
    outcome: string;
    patientIntent?: string;
    callNotes?: string;
    rescheduleRequestedDate?: string;
    rescheduleRequestedTime?: string;
  },
  actor: User,
  ipAddress: string
) {
  const id = `ccl-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const branch = await pgRequireBranch(payload.branchId || actor.branchId);
  const res = await pgQuery(
    `
    INSERT INTO call_contact_logs (
      id, task_id, appointment_id, patient_id, branch_id, outcome, patient_intent,
      call_notes, reschedule_requested_date, reschedule_requested_time, agent_id, agent_name
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, $11, $12)
    RETURNING *
    `,
    [
      id,
      payload.taskId || null,
      payload.appointmentId || null,
      payload.patientId,
      branch.id,
      payload.outcome,
      payload.patientIntent || null,
      payload.callNotes || '',
      payload.rescheduleRequestedDate || null,
      payload.rescheduleRequestedTime || null,
      actor.id,
      actor.name,
    ]
  );
  await pgLogAuditEvent(actor, 'CALL_CONTACT_LOGGED', 'call_contact_log', id, `Logged call outcome: ${payload.outcome}`, ipAddress);
  return res.rows[0];
}

// ============================================================================
// 3. REAL POSTGRESQL REPORTS HUB & AUDITED CSV EXPORT
// ============================================================================

export async function pgGenerateReport(params: {
  reportType: 'revenue' | 'collections' | 'appointments' | 'inventory' | 'commissions' | 'call_center';
  branchId?: string;
  startDate?: string;
  endDate?: string;
}) {
  const branchFilter = params.branchId && params.branchId !== 'all' ? params.branchId : null;
  const startDate = params.startDate || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const endDate = params.endDate || new Date().toISOString().slice(0, 10);

  if (params.reportType === 'revenue') {
    const res = await pgQuery(
      `
      SELECT
        created_at::date::text AS report_date,
        branch_id,
        COUNT(*)::int AS invoice_count,
        COALESCE(SUM(total_amount_bdt), 0)::numeric(12,2) AS total_billed_bdt,
        COALESCE(SUM(paid_amount_bdt), 0)::numeric(12,2) AS total_paid_bdt,
        COALESCE(SUM(due_amount_bdt), 0)::numeric(12,2) AS total_due_bdt
      FROM invoices
      WHERE status <> 'void'
        AND created_at::date >= $1::date
        AND created_at::date <= $2::date
        AND ($3::text IS NULL OR branch_id = $3)
      GROUP BY created_at::date, branch_id
      ORDER BY created_at::date DESC
      `,
      [startDate, endDate, branchFilter]
    );
    return { reportType: 'revenue', startDate, endDate, rows: res.rows };
  }

  if (params.reportType === 'collections') {
    const res = await pgQuery(
      `
      SELECT
        method,
        COUNT(*)::int AS payment_count,
        COALESCE(SUM(amount_bdt), 0)::numeric(12,2) AS total_collected_bdt
      FROM payment_records
      WHERE status = 'valid'
        AND paid_at::date >= $1::date
        AND paid_at::date <= $2::date
      GROUP BY method
      ORDER BY total_collected_bdt DESC
      `,
      [startDate, endDate]
    );
    return { reportType: 'collections', startDate, endDate, rows: res.rows };
  }

  if (params.reportType === 'appointments') {
    const res = await pgQuery(
      `
      SELECT
        appointment_date::text AS date,
        status,
        COUNT(*)::int AS count
      FROM appointments
      WHERE appointment_date >= $1::date
        AND appointment_date <= $2::date
        AND ($3::text IS NULL OR branch_id = $3)
      GROUP BY appointment_date, status
      ORDER BY appointment_date DESC
      `,
      [startDate, endDate, branchFilter]
    );
    return { reportType: 'appointments', startDate, endDate, rows: res.rows };
  }

  if (params.reportType === 'inventory') {
    const res = await pgQuery(
      `
      SELECT
        id, item_code, sku, name, category, branch_id, current_stock, reorder_level,
        unit_cost_bdt, selling_price_bdt, expiry_date, status
      FROM inventory_items
      WHERE is_active = TRUE AND ($1::text IS NULL OR branch_id = $1)
      ORDER BY current_stock ASC, name ASC
      `,
      [branchFilter]
    );
    return {
      reportType: 'inventory',
      startDate,
      endDate,
      rows: res.rows.map((r) => ({ ...r, expiry_date: r.expiry_date ? toDateOnly(r.expiry_date) : '' })),
    };
  }

  if (params.reportType === 'commissions') {
    const res = await pgQuery(
      `
      SELECT
        status,
        COALESCE(kind, 'accrual') AS kind,
        COUNT(*)::int AS entry_count,
        COALESCE(SUM(net_amount_bdt), 0)::numeric(12,2) AS total_commission_bdt
      FROM referral_commissions
      WHERE created_at::date >= $1::date AND created_at::date <= $2::date
      GROUP BY status, kind
      ORDER BY status ASC
      `,
      [startDate, endDate]
    );
    return { reportType: 'commissions', startDate, endDate, rows: res.rows };
  }

  // call_center
  const res = await pgQuery(
    `
    SELECT
      call_status,
      COUNT(*)::int AS task_count
    FROM call_center_tasks
    WHERE appointment_date >= $1::date AND appointment_date <= $2::date
    GROUP BY call_status
    `,
    [startDate, endDate]
  );
  return { reportType: 'call_center', startDate, endDate, rows: res.rows };
}

export async function pgExportReportCsv(params: {
  reportType: 'revenue' | 'collections' | 'appointments' | 'inventory' | 'commissions' | 'call_center';
  branchId?: string;
  startDate?: string;
  endDate?: string;
  actor: User;
  ipAddress: string;
}) {
  const report = await pgGenerateReport(params);
  const rows = report.rows as Record<string, unknown>[];
  const headers = rows.length > 0 ? Object.keys(rows[0]) : ['no_data'];

  const lines: string[] = [headers.map((h) => sanitizeCsvCell(h)).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => sanitizeCsvCell(row[h])).join(','));
  }

  const exportId = `exp-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  await pgQuery(
    `
    INSERT INTO data_export_logs (id, report_type, format, branch_id, filters, row_count, exported_by, exported_by_name, ip_address)
    VALUES ($1, $2, 'csv', $3, $4::jsonb, $5, $6, $7, $8)
    `,
    [
      exportId,
      params.reportType,
      params.branchId || null,
      JSON.stringify({ startDate: report.startDate, endDate: report.endDate }),
      rows.length,
      params.actor.id,
      params.actor.name,
      params.ipAddress,
    ]
  );

  await pgLogAuditEvent(
    params.actor,
    'REPORT_EXPORTED',
    'report',
    exportId,
    `Exported ${params.reportType} CSV (${rows.length} rows)`,
    params.ipAddress
  );

  return {
    exportId,
    filename: `suoxi_${params.reportType}_${toDateOnly(new Date())}.csv`,
    rowCount: rows.length,
    csv: lines.join('\r\n'),
  };
}
