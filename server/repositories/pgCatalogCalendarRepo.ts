/**
 * SUOXI Skin Care & Aesthetic Center ERP
 * PostgreSQL Repository: Treatment Catalog, Guidance Templates,
 * Calendar Range View, Provider Schedules, Sources, Resources & Slot Availability
 */

import crypto from 'node:crypto';
import type { User } from '../../src/types/index.ts';
import { pgQuery } from '../db/pgPool.ts';
import { pgLogAuditEvent, toDateOnly, toIsoString, toNumber } from './pgHelpers.ts';

// ============================================================================
// 1. CATALOG CATEGORIES & TREATMENT SERVICES
// ============================================================================

export async function pgListCatalogCategories() {
  const res = await pgQuery(
    'SELECT * FROM catalog_categories ORDER BY sort_order ASC, name ASC'
  );
  return res.rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    nameBn: r.name_bn || undefined,
    description: r.description || '',
    sortOrder: toNumber(r.sort_order),
    isActive: Boolean(r.is_active),
    createdAt: toIsoString(r.created_at),
  }));
}

export async function pgCreateCatalogCategory(
  payload: { code: string; name: string; nameBn?: string; description?: string; sortOrder?: number },
  actor: User,
  ipAddress: string
) {
  const id = `cat-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const res = await pgQuery(
    `
    INSERT INTO catalog_categories (id, code, name, name_bn, description, sort_order, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, TRUE)
    RETURNING *
    `,
    [id, payload.code.trim().toUpperCase(), payload.name.trim(), payload.nameBn || null, payload.description || '', payload.sortOrder ?? 0]
  );
  await pgLogAuditEvent(actor, 'CATALOG_CATEGORY_CREATED', 'catalog_category', id, `Created category ${payload.name}`, ipAddress);
  const r = res.rows[0];
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    nameBn: r.name_bn || undefined,
    description: r.description || '',
    sortOrder: toNumber(r.sort_order),
    isActive: Boolean(r.is_active),
  };
}

export async function pgListTreatmentServices(filters?: { categoryId?: string; activeOnly?: boolean; search?: string }) {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filters?.categoryId) {
    params.push(filters.categoryId);
    conds.push(`t.category_id = $${params.length}`);
  }
  if (filters?.activeOnly) {
    conds.push('t.is_active = TRUE');
  }
  if (filters?.search) {
    params.push(`%${filters.search.trim()}%`);
    conds.push(`(t.name ILIKE $${params.length} OR t.code ILIKE $${params.length})`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const res = await pgQuery(
    `
    SELECT t.*, c.name AS category_name
    FROM treatment_services t
    LEFT JOIN catalog_categories c ON c.id = t.category_id
    ${where}
    ORDER BY t.name ASC
    `,
    params
  );
  return res.rows.map((r) => ({
    id: r.id,
    categoryId: r.category_id,
    categoryName: r.category_name || undefined,
    code: r.code,
    name: r.name,
    nameBn: r.name_bn || undefined,
    description: r.description || '',
    defaultDurationMinutes: toNumber(r.default_duration_minutes, 30),
    basePriceBDT: toNumber(r.base_price_bdt),
    requiresDoctor: Boolean(r.requires_doctor),
    requiresConsent: Boolean(r.requires_consent),
    isActive: Boolean(r.is_active),
    metadata: r.metadata || {},
    createdAt: toIsoString(r.created_at),
  }));
}

export async function pgCreateTreatmentService(
  payload: {
    categoryId: string;
    code: string;
    name: string;
    nameBn?: string;
    description?: string;
    defaultDurationMinutes?: number;
    basePriceBDT: number;
    requiresDoctor?: boolean;
    requiresConsent?: boolean;
  },
  actor: User,
  ipAddress: string
) {
  const id = `srv-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const res = await pgQuery(
    `
    INSERT INTO treatment_services (
      id, category_id, code, name, name_bn, description,
      default_duration_minutes, base_price_bdt, requires_doctor, requires_consent, is_active
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
    RETURNING *
    `,
    [
      id,
      payload.categoryId,
      payload.code.trim().toUpperCase(),
      payload.name.trim(),
      payload.nameBn || null,
      payload.description || '',
      payload.defaultDurationMinutes ?? 30,
      payload.basePriceBDT,
      Boolean(payload.requiresDoctor),
      Boolean(payload.requiresConsent),
    ]
  );
  await pgLogAuditEvent(actor, 'TREATMENT_SERVICE_CREATED', 'treatment_service', id, `Created service ${payload.name}`, ipAddress);
  const r = res.rows[0];
  return {
    id: r.id,
    categoryId: r.category_id,
    code: r.code,
    name: r.name,
    nameBn: r.name_bn || undefined,
    description: r.description || '',
    defaultDurationMinutes: toNumber(r.default_duration_minutes, 30),
    basePriceBDT: toNumber(r.base_price_bdt),
    requiresDoctor: Boolean(r.requires_doctor),
    requiresConsent: Boolean(r.requires_consent),
    isActive: Boolean(r.is_active),
  };
}

export async function pgUpdateTreatmentService(
  id: string,
  patch: Partial<{
    name: string;
    nameBn: string;
    description: string;
    defaultDurationMinutes: number;
    basePriceBDT: number;
    requiresDoctor: boolean;
    requiresConsent: boolean;
    isActive: boolean;
  }>,
  actor: User,
  ipAddress: string
) {
  const res = await pgQuery(
    `
    UPDATE treatment_services
    SET name = COALESCE($2, name),
        name_bn = COALESCE($3, name_bn),
        description = COALESCE($4, description),
        default_duration_minutes = COALESCE($5, default_duration_minutes),
        base_price_bdt = COALESCE($6, base_price_bdt),
        requires_doctor = COALESCE($7, requires_doctor),
        requires_consent = COALESCE($8, requires_consent),
        is_active = COALESCE($9, is_active),
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [
      id,
      patch.name ?? null,
      patch.nameBn ?? null,
      patch.description ?? null,
      patch.defaultDurationMinutes ?? null,
      patch.basePriceBDT ?? null,
      patch.requiresDoctor ?? null,
      patch.requiresConsent ?? null,
      patch.isActive ?? null,
    ]
  );
  if ((res.rowCount || 0) === 0) return null;
  await pgLogAuditEvent(actor, 'TREATMENT_SERVICE_UPDATED', 'treatment_service', id, `Updated service ${id}`, ipAddress);
  const r = res.rows[0];
  return {
    id: r.id,
    categoryId: r.category_id,
    code: r.code,
    name: r.name,
    basePriceBDT: toNumber(r.base_price_bdt),
    defaultDurationMinutes: toNumber(r.default_duration_minutes, 30),
    isActive: Boolean(r.is_active),
  };
}

export async function pgListTreatmentFollowUpRules(treatmentId?: string) {
  const res = treatmentId
    ? await pgQuery('SELECT * FROM treatment_followup_rules WHERE treatment_id = $1 ORDER BY delay_days ASC', [treatmentId])
    : await pgQuery('SELECT * FROM treatment_followup_rules ORDER BY created_at DESC');
  return res.rows.map((r) => ({
    id: r.id,
    treatmentId: r.treatment_id,
    triggerEvent: r.trigger_event,
    delayDays: toNumber(r.delay_days),
    channel: r.channel,
    instructions: r.instructions,
    isActive: Boolean(r.is_active),
  }));
}

export async function pgCreateTreatmentFollowUpRule(
  treatmentId: string,
  payload: { triggerEvent?: string; delayDays: number; channel?: string; instructions?: string },
  actor: User,
  ipAddress: string
) {
  const id = `tfr-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const res = await pgQuery(
    `
    INSERT INTO treatment_followup_rules (id, treatment_id, trigger_event, delay_days, channel, instructions, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, TRUE)
    RETURNING *
    `,
    [id, treatmentId, payload.triggerEvent || 'session_completed', payload.delayDays, payload.channel || 'call', payload.instructions || '']
  );
  await pgLogAuditEvent(actor, 'FOLLOWUP_RULE_CREATED', 'treatment_followup_rule', id, `Created follow-up rule for ${treatmentId}`, ipAddress);
  return res.rows[0];
}

// ============================================================================
// 2. GUIDANCE TEMPLATES (FOOD & LIFESTYLE LIBRARY)
// ============================================================================

export async function pgListGuidanceTemplates(status?: string) {
  const res = status
    ? await pgQuery('SELECT * FROM guidance_templates WHERE status = $1 ORDER BY updated_at DESC', [status])
    : await pgQuery('SELECT * FROM guidance_templates ORDER BY updated_at DESC');
  return res.rows.map((r) => ({
    id: r.id,
    code: r.code,
    title: r.title,
    titleBn: r.title_bn || undefined,
    category: r.category,
    treatmentId: r.treatment_id || undefined,
    recommendedFoods: Array.isArray(r.recommended_foods) ? r.recommended_foods : [],
    prohibitedFoods: Array.isArray(r.prohibited_foods) ? r.prohibited_foods : [],
    lifestylePrecautions: Array.isArray(r.lifestyle_precautions) ? r.lifestyle_precautions : [],
    sunProtection: r.sun_protection || '',
    waterLiters: toNumber(r.water_liters, 3),
    status: r.status,
    submittedBy: r.submitted_by || undefined,
    approvedBy: r.approved_by || undefined,
    approvedAt: r.approved_at ? toIsoString(r.approved_at) : undefined,
    createdAt: toIsoString(r.created_at),
  }));
}

export async function pgCreateGuidanceTemplate(
  payload: {
    code?: string;
    title: string;
    titleBn?: string;
    category?: string;
    treatmentId?: string;
    recommendedFoods?: string[];
    prohibitedFoods?: string[];
    lifestylePrecautions?: string[];
    sunProtection?: string;
    waterLiters?: number;
  },
  actor: User,
  ipAddress: string
) {
  const id = `gdt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const code = (payload.code || `GD-${Date.now().toString().slice(-6)}`).toUpperCase();
  const res = await pgQuery(
    `
    INSERT INTO guidance_templates (
      id, code, title, title_bn, category, treatment_id,
      recommended_foods, prohibited_foods, lifestyle_precautions,
      sun_protection, water_liters, status, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, 'draft', $12)
    RETURNING *
    `,
    [
      id,
      code,
      payload.title.trim(),
      payload.titleBn || null,
      payload.category || 'general',
      payload.treatmentId || null,
      JSON.stringify(payload.recommendedFoods || []),
      JSON.stringify(payload.prohibitedFoods || []),
      JSON.stringify(payload.lifestylePrecautions || []),
      payload.sunProtection || '',
      payload.waterLiters ?? 3.0,
      actor.id,
    ]
  );
  await pgLogAuditEvent(actor, 'GUIDANCE_TEMPLATE_CREATED', 'guidance_template', id, `Created guidance template ${payload.title}`, ipAddress);
  return res.rows[0];
}

export async function pgTransitionGuidanceTemplateStatus(
  id: string,
  nextStatus: 'pending_approval' | 'approved' | 'archived',
  actor: User,
  ipAddress: string
) {
  const res = await pgQuery(
    `
    UPDATE guidance_templates
    SET status = $2,
        submitted_by = CASE WHEN $2 = 'pending_approval' THEN $3 ELSE submitted_by END,
        approved_by = CASE WHEN $2 = 'approved' THEN $3 ELSE approved_by END,
        approved_at = CASE WHEN $2 = 'approved' THEN NOW() ELSE approved_at END,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
    `,
    [id, nextStatus, actor.id]
  );
  if ((res.rowCount || 0) === 0) return null;
  await pgLogAuditEvent(actor, `GUIDANCE_TEMPLATE_${nextStatus.toUpperCase()}`, 'guidance_template', id, `Guidance template moved to ${nextStatus}`, ipAddress);
  return res.rows[0];
}

// ============================================================================
// 3. APPOINTMENT SOURCES, RESOURCES, PROVIDER SCHEDULES & CALENDAR AVAILABILITY
// ============================================================================

export async function pgListAppointmentSources() {
  const res = await pgQuery('SELECT * FROM appointment_sources WHERE is_active = TRUE ORDER BY name ASC');
  return res.rows;
}

export async function pgListClinicResources(branchId?: string) {
  const res = branchId && branchId !== 'all'
    ? await pgQuery('SELECT * FROM clinic_resources WHERE branch_id = $1 AND is_active = TRUE ORDER BY name ASC', [branchId])
    : await pgQuery('SELECT * FROM clinic_resources WHERE is_active = TRUE ORDER BY name ASC');
  return res.rows;
}

export async function pgListProviderSchedules(filters?: { branchId?: string; providerId?: string }) {
  const conds: string[] = ['is_active = TRUE'];
  const params: unknown[] = [];
  if (filters?.branchId && filters.branchId !== 'all') {
    params.push(filters.branchId);
    conds.push(`branch_id = $${params.length}`);
  }
  if (filters?.providerId) {
    params.push(filters.providerId);
    conds.push(`provider_id = $${params.length}`);
  }
  const res = await pgQuery(
    `SELECT * FROM provider_schedules WHERE ${conds.join(' AND ')} ORDER BY day_of_week ASC, start_time ASC`,
    params
  );
  return res.rows;
}

export async function pgUpsertProviderSchedule(
  payload: {
    branchId: string;
    providerId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    slotDurationMinutes?: number;
  },
  actor: User,
  ipAddress: string
) {
  const id = `psch-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const res = await pgQuery(
    `
    INSERT INTO provider_schedules (id, branch_id, provider_id, day_of_week, start_time, end_time, slot_duration_minutes, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
    ON CONFLICT (branch_id, provider_id, day_of_week, start_time)
    DO UPDATE SET end_time = EXCLUDED.end_time, slot_duration_minutes = EXCLUDED.slot_duration_minutes, is_active = TRUE, updated_at = NOW()
    RETURNING *
    `,
    [id, payload.branchId, payload.providerId, payload.dayOfWeek, payload.startTime, payload.endTime, payload.slotDurationMinutes ?? 30]
  );
  await pgLogAuditEvent(actor, 'PROVIDER_SCHEDULE_UPDATED', 'provider_schedule', res.rows[0].id, `Updated schedule for provider ${payload.providerId}`, ipAddress);
  return res.rows[0];
}

export async function pgGetCalendarEvents(params: {
  startDate: string;
  endDate: string;
  branchId?: string;
  doctorId?: string;
}) {
  const start = new Date(params.startDate);
  const end = new Date(params.endDate);
  const diffDays = Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  if (Number.isNaN(diffDays) || diffDays < 0 || diffDays > 42) {
    const err = new Error('Calendar date range must be valid and cannot exceed 42 days') as Error & { statusCode?: number; code?: string };
    err.statusCode = 400;
    err.code = 'INVALID_DATE_RANGE';
    throw err;
  }

  const conds = ['appointment_date >= $1::date', 'appointment_date <= $2::date'];
  const values: unknown[] = [params.startDate, params.endDate];
  if (params.branchId && params.branchId !== 'all') {
    values.push(params.branchId);
    conds.push(`branch_id = $${values.length}`);
  }
  if (params.doctorId) {
    values.push(params.doctorId);
    conds.push(`doctor_id = $${values.length}`);
  }

  const res = await pgQuery(
    `SELECT * FROM appointments WHERE ${conds.join(' AND ')} ORDER BY appointment_date ASC, appointment_time ASC`,
    values
  );

  return res.rows.map((r) => ({
    id: r.id,
    patientId: r.patient_id,
    patientName: r.patient_name,
    patientPhone: r.patient_phone,
    doctorId: r.doctor_id,
    doctorName: r.doctor_name,
    branchId: r.branch_id,
    serviceName: r.service_name,
    date: toDateOnly(r.appointment_date),
    time: r.appointment_time,
    durationMinutes: toNumber(r.duration_minutes, 30),
    status: r.status,
    source: r.booking_method || 'reception',
  }));
}

export async function pgGetSlotAvailability(params: {
  branchId: string;
  doctorId: string;
  date: string;
}) {
  const targetDate = new Date(`${params.date}T00:00:00Z`);
  const dow = targetDate.getUTCDay();

  const [schedRes, bookedRes] = await Promise.all([
    pgQuery<{ start_time: string; end_time: string; slot_duration_minutes: number }>(
      `
      SELECT start_time, end_time, slot_duration_minutes
      FROM provider_schedules
      WHERE branch_id = $1 AND provider_id = $2 AND day_of_week = $3 AND is_active = TRUE
      ORDER BY start_time ASC
      `,
      [params.branchId, params.doctorId, dow]
    ),
    pgQuery<{ appointment_time: string }>(
      `
      SELECT appointment_time
      FROM appointments
      WHERE branch_id = $1 AND doctor_id = $2 AND appointment_date = $3::date
        AND status NOT IN ('cancelled', 'no_show', 'rescheduled')
      `,
      [params.branchId, params.doctorId, params.date]
    ),
  ]);

  const bookedTimes = new Set(bookedRes.rows.map((r) => r.appointment_time));
  const windows =
    schedRes.rows.length > 0
      ? schedRes.rows
      : [{ start_time: '09:00', end_time: '20:00', slot_duration_minutes: 30 }];

  const slots: Array<{ time: string; available: boolean }> = [];
  for (const w of windows) {
    const [sh, sm] = w.start_time.split(':').map(Number);
    const [eh, em] = w.end_time.split(':').map(Number);
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    const step = Math.max(10, Number(w.slot_duration_minutes || 30));
    for (let m = startMin; m + step <= endMin; m += step) {
      const hh = String(Math.floor(m / 60)).padStart(2, '0');
      const mm = String(m % 60).padStart(2, '0');
      const label = `${hh}:${mm}`;
      slots.push({ time: label, available: !bookedTimes.has(label) });
    }
  }

  return {
    branchId: params.branchId,
    doctorId: params.doctorId,
    date: params.date,
    slots,
  };
}
