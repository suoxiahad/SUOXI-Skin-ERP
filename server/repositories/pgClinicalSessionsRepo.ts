/**
 * SUOXI Skin Care & Aesthetic Center ERP
 * PostgreSQL Repository: Treatment Sessions, Atomic Consumables Deduction,
 * Treatment Plans, Consents, Patient Medical Records, Notes & File Asset Metadata
 */

import crypto from 'node:crypto';
import type { User } from '../../src/types/index.ts';
import { pgQuery, withPgTransaction } from '../db/pgPool.ts';
import { pgLogAuditEvent, toDateOnly, toIsoString, toNumber } from './pgHelpers.ts';
import { pgNextSequenceCode } from './pgSecurityStoreRepo.ts';

// ============================================================================
// 1. FILE ASSETS METADATA (PostgreSQL source of truth for private files)
// ============================================================================

export async function pgRecordFileAsset(params: {
  branchId?: string | null;
  patientId?: string | null;
  documentId?: string | null;
  category: string;
  originalFilename: string;
  storagePath: string;
  mimeType: string;
  fileExt: string;
  sizeBytes: number;
  sha256Hash: string;
  isConfidential?: boolean;
  patientVisible?: boolean;
  uploadedBy: string;
}) {
  const id = `fas-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const res = await pgQuery(
    `
    INSERT INTO file_assets (
      id, branch_id, patient_id, document_id, category, original_filename,
      storage_path, mime_type, file_ext, size_bytes, sha256_hash,
      is_confidential, patient_visible, uploaded_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    ON CONFLICT (storage_path) DO UPDATE SET
      patient_id = COALESCE(EXCLUDED.patient_id, file_assets.patient_id),
      document_id = COALESCE(EXCLUDED.document_id, file_assets.document_id),
      updated_at = NOW()
    RETURNING *
    `,
    [
      id,
      params.branchId || null,
      params.patientId || null,
      params.documentId || null,
      params.category,
      params.originalFilename.slice(0, 250),
      params.storagePath,
      params.mimeType,
      params.fileExt,
      params.sizeBytes,
      params.sha256Hash,
      params.isConfidential ?? true,
      params.patientVisible ?? false,
      params.uploadedBy,
    ]
  );
  return res.rows[0];
}

export async function pgGetFileAssetByPath(storagePath: string) {
  const res = await pgQuery(
    'SELECT * FROM file_assets WHERE storage_path = $1 AND deleted_at IS NULL LIMIT 1',
    [storagePath]
  );
  return res.rows[0] || null;
}

// ============================================================================
// 2. PATIENT MEDICAL HISTORIES, CLINICAL ENTRIES & NOTES
// ============================================================================

export async function pgGetPatientMedicalHistory(patientId: string) {
  const res = await pgQuery('SELECT * FROM patient_medical_histories WHERE patient_id = $1 LIMIT 1', [patientId]);
  if ((res.rowCount || 0) === 0) {
    return {
      patientId,
      allergies: [],
      chronicConditions: [],
      currentMedications: [],
      skinType: null,
      fitzpatrickType: null,
      pregnancyLactation: false,
      contraindications: '',
      notes: '',
    };
  }
  const r = res.rows[0];
  return {
    patientId: r.patient_id,
    allergies: Array.isArray(r.allergies) ? r.allergies : [],
    chronicConditions: Array.isArray(r.chronic_conditions) ? r.chronic_conditions : [],
    currentMedications: Array.isArray(r.current_medications) ? r.current_medications : [],
    skinType: r.skin_type || null,
    fitzpatrickType: r.fitzpatrick_type || null,
    pregnancyLactation: Boolean(r.pregnancy_lactation),
    contraindications: r.contraindications || '',
    notes: r.notes || '',
    updatedAt: toIsoString(r.updated_at),
  };
}

export async function pgUpsertPatientMedicalHistory(
  patientId: string,
  payload: {
    allergies?: string[];
    chronicConditions?: string[];
    currentMedications?: string[];
    skinType?: string;
    fitzpatrickType?: string;
    pregnancyLactation?: boolean;
    contraindications?: string;
    notes?: string;
  },
  actor: User,
  ipAddress: string
) {
  await pgQuery(
    `
    INSERT INTO patient_medical_histories (
      patient_id, allergies, chronic_conditions, current_medications,
      skin_type, fitzpatrick_type, pregnancy_lactation, contraindications, notes, updated_by
    )
    VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (patient_id) DO UPDATE SET
      allergies = EXCLUDED.allergies,
      chronic_conditions = EXCLUDED.chronic_conditions,
      current_medications = EXCLUDED.current_medications,
      skin_type = EXCLUDED.skin_type,
      fitzpatrick_type = EXCLUDED.fitzpatrick_type,
      pregnancy_lactation = EXCLUDED.pregnancy_lactation,
      contraindications = EXCLUDED.contraindications,
      notes = EXCLUDED.notes,
      updated_by = EXCLUDED.updated_by,
      updated_at = NOW()
    `,
    [
      patientId,
      JSON.stringify(payload.allergies || []),
      JSON.stringify(payload.chronicConditions || []),
      JSON.stringify(payload.currentMedications || []),
      payload.skinType || null,
      payload.fitzpatrickType || null,
      Boolean(payload.pregnancyLactation),
      payload.contraindications || null,
      payload.notes || null,
      actor.id,
    ]
  );
  await pgLogAuditEvent(actor, 'MEDICAL_HISTORY_UPDATED', 'patient', patientId, `Updated medical history for ${patientId}`, ipAddress);
  return pgGetPatientMedicalHistory(patientId);
}

export async function pgListPatientNotes(patientId: string, includeClinical: boolean) {
  const res = includeClinical
    ? await pgQuery('SELECT * FROM patient_notes WHERE patient_id = $1 ORDER BY created_at DESC', [patientId])
    : await pgQuery('SELECT * FROM patient_notes WHERE patient_id = $1 AND is_clinical = FALSE ORDER BY created_at DESC', [patientId]);
  return res.rows.map((r) => ({
    id: r.id,
    patientId: r.patient_id,
    branchId: r.branch_id,
    noteType: r.note_type,
    isClinical: Boolean(r.is_clinical),
    content: r.content,
    createdBy: r.created_by,
    createdByName: r.created_by_name,
    createdAt: toIsoString(r.created_at),
  }));
}

export async function pgCreatePatientNote(
  patientId: string,
  payload: { noteType?: string; isClinical?: boolean; content: string; branchId?: string },
  actor: User,
  ipAddress: string
) {
  const id = `pnt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const branchId = payload.branchId || actor.branchId || 'br-dhanmondi';
  const res = await pgQuery(
    `
    INSERT INTO patient_notes (id, patient_id, branch_id, note_type, is_clinical, content, created_by, created_by_name)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
    `,
    [id, patientId, branchId, payload.noteType || 'general', Boolean(payload.isClinical), payload.content, actor.id, actor.name]
  );
  await pgLogAuditEvent(actor, 'PATIENT_NOTE_CREATED', 'patient_note', id, `Added note on patient ${patientId}`, ipAddress);
  return res.rows[0];
}

// ============================================================================
// 3. TREATMENT PLANS & CONSENT RECORDS
// ============================================================================

export async function pgListTreatmentPlans(patientId: string) {
  const res = await pgQuery('SELECT * FROM treatment_plans WHERE patient_id = $1 ORDER BY created_at DESC', [patientId]);
  return res.rows;
}

export async function pgCreateTreatmentPlan(
  payload: {
    consultationId?: string;
    patientId: string;
    branchId?: string;
    title: string;
    plannedProcedures?: unknown[];
    estimatedTotalBDT?: number;
    notes?: string;
  },
  actor: User,
  ipAddress: string
) {
  const id = `tpl-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const res = await pgQuery(
    `
    INSERT INTO treatment_plans (
      id, consultation_id, patient_id, branch_id, doctor_id,
      title, planned_procedures, estimated_total_bdt, status, notes
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, 'active', $9)
    RETURNING *
    `,
    [
      id,
      payload.consultationId || null,
      payload.patientId,
      payload.branchId || actor.branchId || 'br-dhanmondi',
      actor.id,
      payload.title,
      JSON.stringify(payload.plannedProcedures || []),
      payload.estimatedTotalBDT ?? 0,
      payload.notes || null,
    ]
  );
  await pgLogAuditEvent(actor, 'TREATMENT_PLAN_CREATED', 'treatment_plan', id, `Created plan ${payload.title}`, ipAddress);
  return res.rows[0];
}

export async function pgCreateConsentRecord(
  payload: {
    patientId: string;
    consultationId?: string;
    treatmentName: string;
    consentText: string;
    signedByPatient?: boolean;
    fileAssetId?: string;
  },
  actor: User,
  ipAddress: string
) {
  const id = `cns-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const res = await pgQuery(
    `
    INSERT INTO consent_records (
      id, patient_id, consultation_id, treatment_name, consent_text,
      signed_by_patient, signed_at, witnessed_by, file_asset_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 THEN NOW() ELSE NULL END, $7, $8)
    RETURNING *
    `,
    [
      id,
      payload.patientId,
      payload.consultationId || null,
      payload.treatmentName,
      payload.consentText,
      Boolean(payload.signedByPatient),
      actor.id,
      payload.fileAssetId || null,
    ]
  );
  await pgLogAuditEvent(actor, 'CONSENT_RECORDED', 'consent_record', id, `Recorded consent for ${payload.treatmentName}`, ipAddress);
  return res.rows[0];
}

// ============================================================================
// 4. TREATMENT SESSIONS, ATOMIC CONSUMABLES DEDUCTION & PHOTOS
// ============================================================================

export async function pgListTreatmentSessions(filters?: { patientId?: string; branchId?: string; status?: string }) {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filters?.patientId) {
    params.push(filters.patientId);
    conds.push(`patient_id = $${params.length}`);
  }
  if (filters?.branchId && filters.branchId !== 'all') {
    params.push(filters.branchId);
    conds.push(`branch_id = $${params.length}`);
  }
  if (filters?.status) {
    params.push(filters.status);
    conds.push(`status = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const res = await pgQuery(
    `SELECT * FROM treatment_sessions ${where} ORDER BY created_at DESC LIMIT 200`,
    params
  );
  return res.rows.map((r) => ({
    id: r.id,
    sessionCode: r.session_code,
    patientId: r.patient_id,
    branchId: r.branch_id,
    appointmentId: r.appointment_id || undefined,
    packageId: r.package_id || undefined,
    serviceId: r.service_id || undefined,
    serviceName: r.service_name,
    providerId: r.provider_id,
    providerName: r.provider_name,
    sessionNumber: toNumber(r.session_number, 1),
    status: r.status,
    startedAt: toIsoString(r.started_at),
    completedAt: r.completed_at ? toIsoString(r.completed_at) : undefined,
    clinicalNotes: r.clinical_notes || '',
    machineSettings: r.machine_settings || undefined,
    nextSessionDate: r.next_session_date ? toDateOnly(r.next_session_date) : undefined,
    nextSessionNotes: r.next_session_notes || undefined,
  }));
}

export async function pgStartTreatmentSession(
  payload: {
    patientId: string;
    branchId?: string;
    appointmentId?: string;
    packageId?: string;
    serviceId?: string;
    serviceName: string;
    providerId?: string;
    providerName?: string;
    sessionNumber?: number;
    clinicalNotes?: string;
    machineSettings?: string;
  },
  actor: User,
  ipAddress: string
) {
  return withPgTransaction(async (client) => {
    const id = `ses-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const sessionCode = await pgNextSequenceCode('SESSION', 'SES-', 6, client);
    const branchId = payload.branchId || actor.branchId || 'br-dhanmondi';

    const res = await client.query(
      `
      INSERT INTO treatment_sessions (
        id, session_code, patient_id, branch_id, appointment_id, package_id, service_id,
        service_name, provider_id, provider_name, session_number, status,
        started_at, clinical_notes, machine_settings, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'in_progress', NOW(), $12, $13, $14)
      RETURNING *
      `,
      [
        id,
        sessionCode,
        payload.patientId,
        branchId,
        payload.appointmentId || null,
        payload.packageId || null,
        payload.serviceId || null,
        payload.serviceName,
        payload.providerId || actor.id,
        payload.providerName || actor.name,
        payload.sessionNumber ?? 1,
        payload.clinicalNotes || '',
        payload.machineSettings || null,
        actor.id,
      ]
    );

    await pgLogAuditEvent(
      actor,
      'TREATMENT_SESSION_STARTED',
      'treatment_session',
      id,
      `Started session ${sessionCode} (${payload.serviceName}) for patient ${payload.patientId}`,
      ipAddress,
      client
    );
    return res.rows[0];
  });
}

/**
 * Records a session consumable AND atomically deducts stock using SELECT ... FOR UPDATE,
 * guaranteeing stock can never go negative under concurrency.
 */
export async function pgAddSessionConsumable(
  sessionId: string,
  payload: { inventoryItemId: string; quantity: number; batchNumber?: string },
  actor: User,
  ipAddress: string
) {
  if (!Number.isFinite(payload.quantity) || payload.quantity <= 0) {
    const err = new Error('Consumable quantity must be positive') as Error & { statusCode?: number; code?: string };
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  return withPgTransaction(async (client) => {
    const sessRes = await client.query<{ id: string; branch_id: string; status: string }>(
      'SELECT id, branch_id, status FROM treatment_sessions WHERE id = $1 FOR UPDATE',
      [sessionId]
    );
    if ((sessRes.rowCount || 0) === 0) {
      const err = new Error('Treatment session not found') as Error & { statusCode?: number; code?: string };
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }
    if (sessRes.rows[0].status === 'cancelled') {
      const err = new Error('Cannot add consumables to a cancelled session') as Error & { statusCode?: number; code?: string };
      err.statusCode = 422;
      err.code = 'INVALID_STATE';
      throw err;
    }

    const itemRes = await client.query<{
      id: string;
      name: string;
      current_stock: number;
      reorder_level: number;
      unit_cost_bdt: string;
      branch_id: string;
    }>(
      'SELECT id, name, current_stock, reorder_level, unit_cost_bdt, branch_id FROM inventory_items WHERE id = $1 FOR UPDATE',
      [payload.inventoryItemId]
    );

    if ((itemRes.rowCount || 0) === 0) {
      const err = new Error('Inventory item not found') as Error & { statusCode?: number; code?: string };
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    const item = itemRes.rows[0];
    const qtyInt = Math.ceil(payload.quantity);
    if (item.current_stock < qtyInt) {
      const err = new Error(
        `Insufficient stock for ${item.name}. Available: ${item.current_stock}, requested: ${qtyInt}`
      ) as Error & { statusCode?: number; code?: string };
      err.statusCode = 422;
      err.code = 'INSUFFICIENT_STOCK';
      throw err;
    }

    const newStock = item.current_stock - qtyInt;
    const newStatus = newStock <= item.reorder_level ? 'low_stock' : 'in_stock';
    await client.query(
      'UPDATE inventory_items SET current_stock = $2, status = $3, updated_at = NOW() WHERE id = $1',
      [item.id, newStock, newStatus]
    );

    const consumableId = `scn-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const cRes = await client.query(
      `
      INSERT INTO session_consumables (id, session_id, inventory_item_id, batch_number, quantity, unit_cost_bdt, recorded_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
      `,
      [consumableId, sessionId, item.id, payload.batchNumber || null, qtyInt, toNumber(item.unit_cost_bdt), actor.id]
    );

    const moveId = `smv-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    await client.query(
      `
      INSERT INTO stock_movements (
        id, branch_id, inventory_item_id, batch_number, movement_type,
        quantity_delta, balance_after, unit_cost_bdt, reference_type, reference_id, reason, performed_by
      )
      VALUES ($1, $2, $3, $4, 'session_consumable', $5, $6, $7, 'treatment_session', $8, $9, $10)
      `,
      [
        moveId,
        sessRes.rows[0].branch_id,
        item.id,
        payload.batchNumber || null,
        -qtyInt,
        newStock,
        toNumber(item.unit_cost_bdt),
        sessionId,
        `Consumed in treatment session ${sessionId}`,
        actor.id,
      ]
    );

    await pgLogAuditEvent(
      actor,
      'SESSION_CONSUMABLE_DEDUCTED',
      'treatment_session',
      sessionId,
      `Deducted ${qtyInt} of ${item.name} (new balance: ${newStock})`,
      ipAddress,
      client
    );
    return { consumable: cRes.rows[0], balanceAfter: newStock };
  });
}

export async function pgCompleteTreatmentSession(
  sessionId: string,
  payload: { clinicalNotes?: string; nextSessionDate?: string; nextSessionNotes?: string },
  actor: User,
  ipAddress: string
) {
  return withPgTransaction(async (client) => {
    const res = await client.query(
      `
      UPDATE treatment_sessions
      SET status = 'completed',
          completed_at = NOW(),
          clinical_notes = COALESCE($2, clinical_notes),
          next_session_date = COALESCE($3::date, next_session_date),
          next_session_notes = COALESCE($4, next_session_notes),
          updated_at = NOW()
      WHERE id = $1 AND status <> 'cancelled'
      RETURNING *
      `,
      [sessionId, payload.clinicalNotes ?? null, payload.nextSessionDate ?? null, payload.nextSessionNotes ?? null]
    );
    if ((res.rowCount || 0) === 0) return null;

    await pgLogAuditEvent(
      actor,
      'TREATMENT_SESSION_COMPLETED',
      'treatment_session',
      sessionId,
      `Completed treatment session ${res.rows[0].session_code}`,
      ipAddress,
      client
    );
    return res.rows[0];
  });
}

export async function pgAddTreatmentPhoto(
  sessionId: string,
  payload: { patientId: string; fileAssetId?: string; photoStage: 'before' | 'during' | 'after' | 'followup'; patientVisible?: boolean; notes?: string },
  actor: User,
  ipAddress: string
) {
  const id = `tph-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const res = await pgQuery(
    `
    INSERT INTO treatment_photos (id, session_id, patient_id, file_asset_id, photo_stage, patient_visible, notes, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
    `,
    [id, sessionId, payload.patientId, payload.fileAssetId || null, payload.photoStage, Boolean(payload.patientVisible), payload.notes || null, actor.id]
  );
  await pgLogAuditEvent(actor, 'TREATMENT_PHOTO_LINKED', 'treatment_session', sessionId, `Linked ${payload.photoStage} photo`, ipAddress);
  return res.rows[0];
}
