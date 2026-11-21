/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * PostgreSQL Repository: Patients, Medical Documents, Appointments,
 * Consultations, Prescriptions (Frozen Lifestyle Snapshot) & Rx Protocols
 */

import crypto from 'node:crypto';
import type {
  Appointment,
  AppointmentStatus,
  Consultation,
  MedicalAttachment,
  Patient,
  Prescription,
  RxProtocol,
  User,
} from '../../src/types/index.ts';
import { pgQuery, withPgTransaction } from '../db/pgPool.ts';
import { savePrivateDataUrl } from '../storage/localFileStorage.ts';
import {
  generateCode,
  pgLogAuditEvent,
  toDateOnly,
  toIsoString,
  toNumber,
} from './pgHelpers.ts';

export function mapPatientRow(row: Record<string, unknown>): Patient {
  return {
    id: String(row.id),
    patientIdCode: String(row.patient_id_code),
    name: String(row.name),
    nameBn: row.name_bn ? String(row.name_bn) : undefined,
    phone: String(row.phone),
    email: row.email ? String(row.email) : undefined,
    gender: (row.gender as Patient['gender']) || 'female',
    dateOfBirth: row.date_of_birth ? toDateOnly(row.date_of_birth) : undefined,
    age: row.age !== null && row.age !== undefined ? toNumber(row.age) : undefined,
    bloodGroup: row.blood_group ? String(row.blood_group) : undefined,
    address: row.address ? String(row.address) : undefined,
    city: String(row.city || 'Dhaka'),
    branchId: String(row.branch_id),
    allergies: Array.isArray(row.allergies) ? (row.allergies as string[]) : [],
    medicalHistory: row.medical_history ? String(row.medical_history) : undefined,
    skinType: (row.skin_type as Patient['skinType']) || undefined,
    referredBy: row.referred_by ? String(row.referred_by) : undefined,
    referrerDoctorId: row.referrer_doctor_id ? String(row.referrer_doctor_id) : undefined,
    isFlaggedDuplicate: Boolean(row.is_flagged_duplicate),
    duplicateReason: row.duplicate_reason ? String(row.duplicate_reason) : undefined,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapAppointmentRow(row: Record<string, unknown>): Appointment & Record<string, unknown> {
  const dateStr = toDateOnly(row.appointment_date);
  const timeStr = String(row.appointment_time || '10:00');
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    patient_id: String(row.patient_id),
    patientName: String(row.patient_name),
    patient_name: String(row.patient_name),
    patientPhone: String(row.patient_phone || ''),
    patient_mobile: String(row.patient_phone || ''),
    patientAge: row.patient_age !== null && row.patient_age !== undefined ? toNumber(row.patient_age) : undefined,
    patientGender: (row.patient_gender as Appointment['patientGender']) || undefined,
    patientAddress: row.patient_address ? String(row.patient_address) : undefined,
    patientBloodGroup: row.patient_blood_group ? String(row.patient_blood_group) : undefined,
    branchId: String(row.branch_id),
    branch_id: String(row.branch_id),
    branchName: String(row.branch_name || ''),
    branch_name: String(row.branch_name || ''),
    doctorId: String(row.doctor_id),
    provider_id: String(row.doctor_id),
    doctorName: String(row.doctor_name),
    provider_name: String(row.doctor_name),
    diseaseName: row.disease_name ? String(row.disease_name) : undefined,
    bookingMethod: row.booking_method ? String(row.booking_method) : undefined,
    serviceCategory: (row.service_category as Appointment['serviceCategory']) || 'General Consultation',
    service_category: String(row.service_category || 'General Consultation'),
    serviceName: String(row.service_name),
    service_name: String(row.service_name),
    appointmentDate: dateStr,
    appointment_date: dateStr,
    appointmentTime: timeStr,
    start_time: timeStr,
    durationMinutes: toNumber(row.duration_minutes, 30),
    duration_minutes: toNumber(row.duration_minutes, 30),
    status: (row.status as AppointmentStatus) || 'booked',
    statusReason: row.status_reason ? String(row.status_reason) : undefined,
    callReference: row.call_reference ? String(row.call_reference) : undefined,
    call_reference: row.call_reference ? String(row.call_reference) : undefined,
    notes: row.notes ? String(row.notes) : undefined,
    createdBy: String(row.created_by || ''),
    created_by: String(row.created_by || ''),
    createdAt: toIsoString(row.created_at),
    created_at: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    updated_at: toIsoString(row.updated_at),
  };
}

function mapConsultationRow(row: Record<string, unknown>): Consultation {
  return {
    id: String(row.id),
    patientId: String(row.patient_id),
    patientName: String(row.patient_name),
    doctorId: String(row.doctor_id),
    doctorName: String(row.doctor_name),
    appointmentId: row.appointment_id ? String(row.appointment_id) : undefined,
    consultationDate: toDateOnly(row.consultation_date),
    chiefComplaints: String(row.chief_complaints || ''),
    examinationNotes: String(row.examination_notes || ''),
    clinicalDiagnosis: String(row.clinical_diagnosis || ''),
    skinAnalysis: (row.skin_analysis as Consultation['skinAnalysis']) || undefined,
    recommendedProcedures: Array.isArray(row.recommended_procedures)
      ? (row.recommended_procedures as string[])
      : [],
    nextSessionDate: row.next_session_date ? toDateOnly(row.next_session_date) : undefined,
    nextSessionNotes: row.next_session_notes ? String(row.next_session_notes) : undefined,
    prescriptionId: row.prescription_id ? String(row.prescription_id) : undefined,
    createdAt: toIsoString(row.created_at),
  };
}

function mapPrescriptionRow(row: Record<string, unknown>): Prescription {
  return {
    id: String(row.id),
    prescriptionCode: String(row.prescription_code),
    patientId: String(row.patient_id),
    patientCode: row.patient_code ? String(row.patient_code) : undefined,
    patientName: String(row.patient_name),
    patientAge: row.patient_age !== null && row.patient_age !== undefined ? toNumber(row.patient_age) : undefined,
    patientGender: row.patient_gender ? String(row.patient_gender) : undefined,
    patientPhone: row.patient_phone ? String(row.patient_phone) : undefined,
    patientAddress: row.patient_address ? String(row.patient_address) : undefined,
    doctorId: String(row.doctor_id),
    doctorName: String(row.doctor_name),
    doctorCredentials: String(row.doctor_credentials || ''),
    consultationId: String(row.consultation_id || ''),
    chiefComplaints: row.chief_complaints ? String(row.chief_complaints) : undefined,
    pastHistory: row.past_history ? String(row.past_history) : undefined,
    operationHistory: row.operation_history ? String(row.operation_history) : undefined,
    investigations: row.investigations ? String(row.investigations) : undefined,
    diagnosis: String(row.diagnosis || ''),
    skinAnalysis: (row.skin_analysis as Prescription['skinAnalysis']) || undefined,
    recommendedProcedures: Array.isArray(row.recommended_procedures)
      ? (row.recommended_procedures as string[])
      : undefined,
    adviceList: Array.isArray(row.advice_list) ? (row.advice_list as string[]) : undefined,
    planNotes: row.plan_notes ? String(row.plan_notes) : undefined,
    medicines: Array.isArray(row.medicines) ? (row.medicines as Prescription['medicines']) : [],
    lifestyleGuidance: row.lifestyle_guidance as Prescription['lifestyleGuidance'],
    nextSessionDate: row.next_session_date ? toDateOnly(row.next_session_date) : undefined,
    version: toNumber(row.version, 1),
    isFinalized: row.is_finalized !== false,
    language: (row.language as Prescription['language']) || 'both',
    createdAt: toIsoString(row.created_at),
  };
}

function mapRxProtocolRow(row: Record<string, unknown>): RxProtocol {
  return {
    id: String(row.id),
    name: String(row.name),
    subtitle: String(row.subtitle || ''),
    category: row.category as RxProtocol['category'],
    isActive: row.is_active !== false,
    isDefaultBaseline: Boolean(row.is_default_baseline),
    diagnosis: String(row.diagnosis || ''),
    chiefComplaints: String(row.chief_complaints || ''),
    investigations: String(row.investigations || ''),
    examinationNotes: String(row.examination_notes || ''),
    skinType: (row.skin_type as RxProtocol['skinType']) || 'combination',
    targetZones: Array.isArray(row.target_zones) ? (row.target_zones as string[]) : [],
    procedures: Array.isArray(row.procedures) ? (row.procedures as string[]) : [],
    medicines: Array.isArray(row.medicines) ? (row.medicines as RxProtocol['medicines']) : [],
    adviceList: Array.isArray(row.advice_list) ? (row.advice_list as string[]) : [],
    sunInstructions: String(row.sun_instructions || ''),
    sunInstructionsBn: String(row.sun_instructions_bn || ''),
    waterLiters: toNumber(row.water_liters, 2.5),
    followUpDays: toNumber(row.follow_up_days, 14),
    morningRoutine: Array.isArray(row.morning_routine) ? (row.morning_routine as string[]) : [],
    eveningRoutine: Array.isArray(row.evening_routine) ? (row.evening_routine as string[]) : [],
    recommendedFoods: Array.isArray(row.recommended_foods) ? (row.recommended_foods as string[]) : [],
    prohibitedFoods: Array.isArray(row.prohibited_foods) ? (row.prohibited_foods as string[]) : [],
    createdBy: row.created_by ? String(row.created_by) : undefined,
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapMedicalDocRow(row: Record<string, unknown>): MedicalAttachment {
  return {
    id: String(row.id),
    documentCode: String(row.document_code),
    patientId: String(row.patient_id),
    patientName: String(row.patient_name),
    patientPhone: String(row.patient_phone || ''),
    type: row.doc_type as MedicalAttachment['type'],
    title: String(row.title),
    titleBn: row.title_bn ? String(row.title_bn) : undefined,
    category: row.category as MedicalAttachment['category'],
    procedureName: row.procedure_name ? String(row.procedure_name) : undefined,
    sessionNumber: row.session_number !== null && row.session_number !== undefined ? toNumber(row.session_number) : undefined,
    photoType: (row.photo_type as MedicalAttachment['photoType']) || undefined,
    fileUrl: String(row.file_url),
    thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : undefined,
    fileSize: String(row.file_size || ''),
    fileFormat: (row.file_format as MedicalAttachment['fileFormat']) || 'PNG',
    doctorName: String(row.doctor_name || ''),
    signedByPatient: Boolean(row.signed_by_patient),
    signatureDate: row.signature_date ? toDateOnly(row.signature_date) : undefined,
    clinicalNotes: row.clinical_notes ? String(row.clinical_notes) : undefined,
    isConfidential: row.is_confidential !== false,
    createdAt: toIsoString(row.created_at),
  };
}

export const pgPatientClinicalRepo = {
  // ---------------------------------------------------------------------------
  // Patients
  // ---------------------------------------------------------------------------
  async listPatients(query?: string): Promise<Patient[]> {
    const q = (query || '').trim().toLowerCase();
    if (!q) {
      const res = await pgQuery('SELECT * FROM patients ORDER BY created_at DESC');
      return res.rows.map(mapPatientRow);
    }
    const like = `%${q}%`;
    const res = await pgQuery(
      `
      SELECT * FROM patients
      WHERE LOWER(name) LIKE $1
         OR LOWER(COALESCE(name_bn, '')) LIKE $1
         OR phone LIKE $1
         OR LOWER(patient_id_code) LIKE $1
      ORDER BY created_at DESC
      `,
      [like]
    );
    return res.rows.map(mapPatientRow);
  },

  async findPatientByIdentifier(
    idOrCode: string,
    client?: { query: typeof pgQuery }
  ): Promise<Patient | null> {
    const norm = (idOrCode || '').trim();
    if (!norm) return null;
    const alt = norm.startsWith('pat-')
      ? norm.replace('pat-', 'pt-')
      : norm.startsWith('pt-')
      ? norm.replace('pt-', 'pat-')
      : norm;
    const exec = client ? client.query.bind(client) : pgQuery;
    const res = await exec(
      `
      SELECT * FROM patients
      WHERE id = $1 OR id = $2 OR LOWER(patient_id_code) = LOWER($1)
      LIMIT 1
      `,
      [norm, alt]
    );
    return res.rows[0] ? mapPatientRow(res.rows[0]) : null;
  },

  async createPatient(
    data: {
      name: string;
      nameBn?: string;
      phone: string;
      email?: string;
      gender: 'female' | 'male' | 'other';
      dateOfBirth?: string;
      age?: number;
      bloodGroup?: string;
      address?: string;
      city?: string;
      branchId?: string;
      allergies?: string[];
      medicalHistory?: string;
      skinType?: Patient['skinType'];
    },
    actor: User,
    ipAddress: string
  ): Promise<Patient> {
    return withPgTransaction(async (client) => {
      const normalizedPhone = data.phone.startsWith('+') ? data.phone : `+${data.phone}`;
      const dupRes = await client.query(
        'SELECT id, patient_id_code, name FROM patients WHERE phone = $1 LIMIT 1',
        [normalizedPhone]
      );
      const dup = dupRes.rows[0];
      const isFlaggedDuplicate = Boolean(dup);
      const duplicateReason = dup
        ? `Phone matches existing patient ${dup.patient_id_code} (${dup.name}). Flagged for manual review.`
        : null;

      const id = `pt-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const patientIdCode = generateCode('SX');
      const branchId = data.branchId || 'br-dhanmondi';

      const res = await client.query(
        `
        INSERT INTO patients (
          id, patient_id_code, name, name_bn, phone, email, gender, date_of_birth,
          age, blood_group, address, city, branch_id, allergies, medical_history,
          skin_type, is_flagged_duplicate, duplicate_reason, created_at, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14::jsonb, $15,
          $16, $17, $18, NOW(), NOW()
        )
        RETURNING *
        `,
        [
          id,
          patientIdCode,
          data.name,
          data.nameBn || null,
          normalizedPhone,
          data.email || null,
          data.gender,
          data.dateOfBirth || null,
          data.age ?? null,
          data.bloodGroup || null,
          data.address || null,
          data.city || 'Dhaka',
          branchId,
          JSON.stringify(Array.isArray(data.allergies) ? data.allergies : []),
          data.medicalHistory || null,
          data.skinType || null,
          isFlaggedDuplicate,
          duplicateReason,
        ]
      );

      const created = mapPatientRow(res.rows[0]);
      await pgLogAuditEvent(
        actor,
        'PATIENT_CREATED',
        'patient',
        created.id,
        `Registered patient ${created.name} (${created.patientIdCode})${isFlaggedDuplicate ? ' [FLAGGED DUPLICATE]' : ''}`,
        ipAddress,
        client
      );
      return created;
    });
  },

  async updatePatient(
    idOrCode: string,
    patch: Partial<Patient>,
    actor: User,
    ipAddress: string
  ): Promise<Patient | null> {
    return withPgTransaction(async (client) => {
      const existing = await this.findPatientByIdentifier(idOrCode, client);
      if (!existing) return null;

      let normalizedPhone = existing.phone;
      let isDuplicate = Boolean(existing.isFlaggedDuplicate);
      let duplicateReason = existing.duplicateReason || null;

      if (patch.phone) {
        normalizedPhone = patch.phone.startsWith('+') ? patch.phone : `+${patch.phone}`;
        const dupRes = await client.query(
          'SELECT id, patient_id_code, name FROM patients WHERE id <> $1 AND phone = $2 LIMIT 1',
          [existing.id, normalizedPhone]
        );
        if (dupRes.rows[0]) {
          isDuplicate = true;
          duplicateReason = `Phone matches existing patient ${dupRes.rows[0].patient_id_code} (${dupRes.rows[0].name}). Flagged for manual review.`;
        }
      }

      const res = await client.query(
        `
        UPDATE patients SET
          name = $2,
          name_bn = $3,
          phone = $4,
          email = $5,
          gender = $6,
          date_of_birth = $7,
          age = $8,
          blood_group = $9,
          address = $10,
          city = $11,
          branch_id = $12,
          allergies = $13::jsonb,
          medical_history = $14,
          skin_type = $15,
          is_flagged_duplicate = $16,
          duplicate_reason = $17,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [
          existing.id,
          patch.name ?? existing.name,
          patch.nameBn !== undefined ? patch.nameBn || null : existing.nameBn || null,
          normalizedPhone,
          patch.email !== undefined ? patch.email || null : existing.email || null,
          patch.gender ?? existing.gender,
          patch.dateOfBirth !== undefined ? patch.dateOfBirth || null : existing.dateOfBirth || null,
          patch.age !== undefined ? patch.age ?? null : existing.age ?? null,
          patch.bloodGroup !== undefined ? patch.bloodGroup || null : existing.bloodGroup || null,
          patch.address !== undefined ? patch.address || null : existing.address || null,
          patch.city ?? existing.city,
          patch.branchId ?? existing.branchId,
          JSON.stringify(patch.allergies !== undefined ? patch.allergies : existing.allergies || []),
          patch.medicalHistory !== undefined ? patch.medicalHistory || null : existing.medicalHistory || null,
          patch.skinType !== undefined ? patch.skinType || null : existing.skinType || null,
          patch.isFlaggedDuplicate !== undefined ? patch.isFlaggedDuplicate : isDuplicate,
          patch.duplicateReason !== undefined ? patch.duplicateReason || null : duplicateReason,
        ]
      );

      const updated = mapPatientRow(res.rows[0]);
      await pgLogAuditEvent(
        actor,
        'PATIENT_UPDATED',
        'patient',
        updated.id,
        `Updated details for patient ${updated.name} (${updated.patientIdCode})`,
        ipAddress,
        client
      );
      return updated;
    });
  },

  // ---------------------------------------------------------------------------
  // Appointments
  // ---------------------------------------------------------------------------
  async listAppointments(filters: {
    branchId?: string;
    patientId?: string;
    providerId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: Array<Appointment & Record<string, unknown>>; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.branchId && filters.branchId !== 'all') {
      params.push(filters.branchId);
      conditions.push(`branch_id = $${params.length}`);
    }
    if (filters.patientId) {
      params.push(filters.patientId);
      conditions.push(`patient_id = $${params.length}`);
    }
    if (filters.providerId && filters.providerId !== 'all') {
      params.push(filters.providerId);
      conditions.push(`doctor_id = $${params.length}`);
    }
    if (filters.status && filters.status !== 'all') {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filters.startDate) {
      params.push(filters.startDate);
      conditions.push(`appointment_date >= $${params.length}::date`);
    }
    if (filters.endDate) {
      params.push(filters.endDate);
      conditions.push(`appointment_date <= $${params.length}::date`);
    }
    if (filters.search && filters.search.trim()) {
      params.push(`%${filters.search.trim().toLowerCase()}%`);
      const p = `$${params.length}`;
      conditions.push(
        `(LOWER(patient_name) LIKE ${p} OR patient_phone LIKE ${p} OR LOWER(doctor_name) LIKE ${p} OR LOWER(service_name) LIKE ${p})`
      );
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(Math.max(filters.limit || 100, 1), 500);
    const page = Math.max(filters.page || 1, 1);
    const offset = (page - 1) * limit;

    const countRes = await pgQuery<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM appointments ${where}`,
      params
    );
    const total = toNumber(countRes.rows[0]?.cnt, 0);

    const listParams = [...params, limit, offset];
    const res = await pgQuery(
      `
      SELECT * FROM appointments ${where}
      ORDER BY appointment_date DESC, appointment_time DESC, created_at DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}
      `,
      listParams
    );

    return { items: res.rows.map(mapAppointmentRow), total };
  },

  async getAppointmentById(id: string): Promise<(Appointment & Record<string, unknown>) | null> {
    const res = await pgQuery('SELECT * FROM appointments WHERE id = $1', [id]);
    return res.rows[0] ? mapAppointmentRow(res.rows[0]) : null;
  },

  async createAppointment(
    raw: Record<string, unknown>,
    actor: User,
    ipAddress: string
  ): Promise<Appointment & Record<string, unknown>> {
    const patientId = String(raw.patient_id || raw.patientId || '');
    const doctorId = String(raw.provider_id || raw.doctorId || 'usr-101');
    const branchId = String(raw.branch_id || raw.branchId || 'br-dhanmondi');
    const appointmentDate = String(raw.appointment_date || raw.appointmentDate || '');
    const appointmentTime = String(raw.start_time || raw.appointmentTime || '');
    const durationMinutes = toNumber(raw.duration_minutes || raw.durationMinutes, 30);
    const diseaseName = raw.disease_name || raw.diseaseName ? String(raw.disease_name || raw.diseaseName) : null;
    const bookingMethod =
      raw.booking_method || raw.bookingMethod ? String(raw.booking_method || raw.bookingMethod) : null;

    return withPgTransaction(async (client) => {
      const pt = await this.findPatientByIdentifier(patientId, client);
      if (!pt) {
        const err = new Error('Patient not found') as Error & { statusCode?: number };
        err.statusCode = 404;
        throw err;
      }

      const brRes = await client.query('SELECT id, name FROM branches WHERE id = $1', [branchId]);
      const branch = brRes.rows[0] || { id: pt.branchId || 'br-dhanmondi', name: 'Dhanmondi Main Center' };

      const docRes = await client.query('SELECT id, name FROM users WHERE id = $1', [doctorId]);
      const doctorName =
        (docRes.rows[0]?.name as string) ||
        String(raw.doctorName || raw.provider_name || 'Dr. Nusrat Jahan');

      const serviceCategory = String(raw.service_category || raw.serviceCategory || 'General Consultation');
      const serviceName = String(
        raw.service_name ||
          raw.serviceName ||
          (diseaseName ? `Consultation: ${diseaseName}` : 'General Consultation')
      );
      const notesWithMeta = [
        diseaseName ? `Disease: ${diseaseName}` : '',
        bookingMethod ? `Method: ${bookingMethod}` : '',
        raw.notes ? String(raw.notes) : '',
      ]
        .filter(Boolean)
        .join(' | ');

      const id = `apt-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      let res;
      try {
        res = await client.query(
          `
          INSERT INTO appointments (
            id, patient_id, patient_name, patient_phone, patient_age, patient_gender,
            patient_address, patient_blood_group, branch_id, branch_name, doctor_id,
            doctor_name, disease_name, booking_method, service_category, service_name,
            appointment_date, appointment_time, duration_minutes, status, call_reference,
            notes, created_by, created_at, updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11,
            $12, $13, $14, $15, $16,
            $17::date, $18, $19, 'confirmed', $20,
            $21, $22, NOW(), NOW()
          )
          RETURNING *
          `,
          [
            id,
            pt.id,
            pt.name,
            pt.phone,
            pt.age ?? null,
            pt.gender || null,
            pt.address || pt.city || 'Dhaka',
            pt.bloodGroup || null,
            branch.id,
            branch.name,
            doctorId,
            doctorName,
            diseaseName,
            bookingMethod,
            serviceCategory,
            serviceName,
            appointmentDate,
            appointmentTime,
            durationMinutes,
            String(raw.call_reference || raw.callReference || bookingMethod || ''),
            notesWithMeta || null,
            actor.id,
          ]
        );
      } catch (err: unknown) {
        const pgErr = err as { code?: string; constraint?: string };
        if (pgErr?.code === '23505') {
          const conflictErr = new Error(
            `Doctor ${doctorName} already has an active appointment on ${appointmentDate} at ${appointmentTime}`
          ) as Error & { statusCode?: number; code?: string };
          conflictErr.statusCode = 409;
          conflictErr.code = 'SLOT_CONFLICT';
          throw conflictErr;
        }
        throw err;
      }

      await client.query(
        `
        INSERT INTO appointment_status_history (id, appointment_id, from_status, to_status, reason, changed_by, changed_by_name)
        VALUES ($1, $2, NULL, 'confirmed', 'Initial booking', $3, $4)
        `,
        [`ash-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`, id, actor.id, actor.name]
      );

      const created = mapAppointmentRow(res.rows[0]);
      await pgLogAuditEvent(
        actor,
        'APPOINTMENT_CREATED',
        'appointment',
        created.id,
        `Booked ${created.serviceName} for ${created.patientName} on ${created.appointmentDate} ${created.appointmentTime}`,
        ipAddress,
        client
      );
      return created;
    });
  },

  async updateAppointment(
    id: string,
    patch: Record<string, unknown>,
    actor: User,
    ipAddress: string
  ): Promise<(Appointment & Record<string, unknown>) | null> {
    return withPgTransaction(async (client) => {
      const existingRes = await client.query('SELECT * FROM appointments WHERE id = $1 FOR UPDATE', [id]);
      if (existingRes.rows.length === 0) return null;
      const cur = mapAppointmentRow(existingRes.rows[0]);

      let res;
      try {
        res = await client.query(
          `
          UPDATE appointments SET
            doctor_id = $2,
            doctor_name = $3,
            service_category = $4,
            service_name = $5,
            appointment_date = $6::date,
            appointment_time = $7,
            duration_minutes = $8,
            status = $9,
            status_reason = $10,
            notes = $11,
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
          `,
          [
            id,
            String(patch.provider_id || patch.doctorId || cur.doctorId),
            String(patch.provider_name || patch.doctorName || cur.doctorName),
            String(patch.service_category || patch.serviceCategory || cur.serviceCategory),
            String(patch.service_name || patch.serviceName || cur.serviceName),
            String(patch.appointment_date || patch.appointmentDate || cur.appointmentDate),
            String(patch.start_time || patch.appointmentTime || cur.appointmentTime),
            toNumber(patch.duration_minutes || patch.durationMinutes, cur.durationMinutes),
            String(patch.status || cur.status),
            patch.statusReason !== undefined ? String(patch.statusReason) : cur.statusReason || null,
            patch.notes !== undefined ? String(patch.notes) : cur.notes || null,
          ]
        );
      } catch (err: unknown) {
        const pgErr = err as { code?: string };
        if (pgErr?.code === '23505') {
          const conflictErr = new Error('Selected doctor slot is already booked') as Error & {
            statusCode?: number;
            code?: string;
          };
          conflictErr.statusCode = 409;
          conflictErr.code = 'SLOT_CONFLICT';
          throw conflictErr;
        }
        throw err;
      }
      const updated = mapAppointmentRow(res.rows[0]);
      await pgLogAuditEvent(
        actor,
        'APPOINTMENT_UPDATED',
        'appointment',
        updated.id,
        `Updated appointment for ${updated.patientName} (${updated.appointmentDate} ${updated.appointmentTime})`,
        ipAddress,
        client
      );
      return updated;
    });
  },

  async changeAppointmentStatus(
    id: string,
    status: AppointmentStatus,
    reason: string | undefined,
    actor: User,
    ipAddress: string
  ): Promise<(Appointment & Record<string, unknown>) | null> {
    return withPgTransaction(async (client) => {
      const prevRes = await client.query<{ status: string }>(
        'SELECT status FROM appointments WHERE id = $1 FOR UPDATE',
        [id]
      );
      if (prevRes.rows.length === 0) return null;
      const prevStatus = prevRes.rows[0].status;

      const res = await client.query(
        `
        UPDATE appointments
        SET status = $2, status_reason = COALESCE($3, status_reason), updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [id, status, reason || null]
      );
      if (res.rows.length === 0) return null;

      await client.query(
        `
        INSERT INTO appointment_status_history (id, appointment_id, from_status, to_status, reason, changed_by, changed_by_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          `ash-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
          id,
          prevStatus,
          status,
          reason || null,
          actor.id,
          actor.name,
        ]
      );

      const updated = mapAppointmentRow(res.rows[0]);
      await pgLogAuditEvent(
        actor,
        status === 'cancelled' ? 'APPOINTMENT_CANCELLED' : 'APPOINTMENT_STATUS_CHANGED',
        'appointment',
        updated.id,
        `Appointment for ${updated.patientName} changed to ${status}${reason ? ` — Reason: ${reason}` : ''}`,
        ipAddress,
        client
      );
      return updated;
    });
  },

  // ---------------------------------------------------------------------------
  // Consultations, Prescriptions & Rx Protocols
  // ---------------------------------------------------------------------------
  async listConsultations(patientId?: string): Promise<Consultation[]> {
    const res = patientId
      ? await pgQuery(
          'SELECT * FROM consultations WHERE patient_id = $1 ORDER BY consultation_date DESC, created_at DESC',
          [patientId]
        )
      : await pgQuery('SELECT * FROM consultations ORDER BY consultation_date DESC, created_at DESC');
    return res.rows.map(mapConsultationRow);
  },

  async createConsultation(
    data: {
      patientId: string;
      appointmentId?: string;
      chiefComplaints: string;
      examinationNotes: string;
      clinicalDiagnosis: string;
      skinAnalysis?: Consultation['skinAnalysis'];
      recommendedProcedures: string[];
      nextSessionDate?: string;
      nextSessionNotes?: string;
    },
    actor: User,
    ipAddress: string
  ): Promise<Consultation> {
    return withPgTransaction(async (client) => {
      const pt = await this.findPatientByIdentifier(data.patientId, client);
      if (!pt) {
        const err = new Error('Patient not found') as Error & { statusCode?: number };
        err.statusCode = 404;
        throw err;
      }

      const id = `cons-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const res = await client.query(
        `
        INSERT INTO consultations (
          id, patient_id, patient_name, doctor_id, doctor_name, appointment_id,
          consultation_date, chief_complaints, examination_notes, clinical_diagnosis,
          skin_analysis, recommended_procedures, next_session_date, next_session_notes,
          created_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          NOW(), $7, $8, $9,
          $10::jsonb, $11::jsonb, $12, $13,
          NOW()
        )
        RETURNING *
        `,
        [
          id,
          pt.id,
          pt.name,
          actor.id,
          actor.name,
          data.appointmentId || null,
          data.chiefComplaints,
          data.examinationNotes,
          data.clinicalDiagnosis,
          data.skinAnalysis ? JSON.stringify(data.skinAnalysis) : null,
          JSON.stringify(data.recommendedProcedures || []),
          data.nextSessionDate || null,
          data.nextSessionNotes || null,
        ]
      );

      if (data.appointmentId) {
        await client.query(
          "UPDATE appointments SET status = 'visited', updated_at = NOW() WHERE id = $1",
          [data.appointmentId]
        );
      }

      const created = mapConsultationRow(res.rows[0]);
      await pgLogAuditEvent(
        actor,
        'CONSULTATION_CREATED',
        'consultation',
        created.id,
        `Dr. ${actor.name} completed consultation for ${pt.name}. Next Session Date: ${created.nextSessionDate || 'None'}`,
        ipAddress,
        client
      );
      return created;
    });
  },

  async listPrescriptions(patientId?: string): Promise<Prescription[]> {
    const res = patientId
      ? await pgQuery('SELECT * FROM prescriptions WHERE patient_id = $1 ORDER BY created_at DESC', [
          patientId,
        ])
      : await pgQuery('SELECT * FROM prescriptions ORDER BY created_at DESC');
    return res.rows.map(mapPrescriptionRow);
  },

  async createPrescription(
    data: {
      patientId: string;
      consultationId: string;
      diagnosis: string;
      chiefComplaints?: string;
      pastHistory?: string;
      operationHistory?: string;
      investigations?: string;
      recommendedProcedures?: string[];
      adviceList?: string[];
      planNotes?: string;
      skinAnalysis?: Prescription['skinAnalysis'];
      language: 'en' | 'bn' | 'both';
      nextSessionDate?: string;
      medicines: Array<Omit<Prescription['medicines'][number], 'id'>>;
      lifestyleGuidance: Omit<
        Prescription['lifestyleGuidance'],
        'id' | 'prescriptionId' | 'isFrozenSnapshot' | 'snapshotVersion' | 'createdAt'
      >;
    },
    actor: User,
    ipAddress: string
  ): Promise<Prescription> {
    return withPgTransaction(async (client) => {
      const pt = await this.findPatientByIdentifier(data.patientId, client);
      if (!pt) {
        const err = new Error('Patient not found') as Error & { statusCode?: number };
        err.statusCode = 404;
        throw err;
      }

      const rxId = `rx-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const prescriptionCode = generateCode('RX');
      const nowIso = new Date().toISOString();
      const medicines = data.medicines.map((m, idx) => ({ ...m, id: `med-${rxId}-${idx + 1}` }));
      const lifestyleGuidance = {
        id: `flg-${rxId}`,
        prescriptionId: rxId,
        isFrozenSnapshot: true,
        snapshotVersion: 1,
        ...data.lifestyleGuidance,
        createdAt: nowIso,
      };
      const doctorCredentials = actor.specialization
        ? `${actor.specialization} (${actor.bmdcRegNo || 'BMDC Reg'})`
        : 'Consultant Aesthetic Dermatologist';

      const consCheck = data.consultationId
        ? await client.query('SELECT id FROM consultations WHERE id = $1', [data.consultationId])
        : { rows: [] };
      const validConsultationId = consCheck.rows[0] ? data.consultationId : null;

      const res = await client.query(
        `
        INSERT INTO prescriptions (
          id, prescription_code, patient_id, patient_code, patient_name, patient_age,
          patient_gender, patient_phone, patient_address, doctor_id, doctor_name,
          doctor_credentials, consultation_id, chief_complaints, past_history,
          operation_history, investigations, diagnosis, skin_analysis,
          recommended_procedures, advice_list, plan_notes, medicines,
          lifestyle_guidance, next_session_date, version, is_finalized, language, created_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15,
          $16, $17, $18, $19::jsonb,
          $20::jsonb, $21::jsonb, $22, $23::jsonb,
          $24::jsonb, $25, 1, TRUE, $26, NOW()
        )
        RETURNING *
        `,
        [
          rxId,
          prescriptionCode,
          pt.id,
          pt.patientIdCode,
          pt.name,
          pt.age ?? null,
          pt.gender || null,
          pt.phone,
          pt.address || pt.city || null,
          actor.id,
          actor.name,
          doctorCredentials,
          validConsultationId,
          data.chiefComplaints || null,
          data.pastHistory || null,
          data.operationHistory || null,
          data.investigations || null,
          data.diagnosis,
          data.skinAnalysis ? JSON.stringify(data.skinAnalysis) : null,
          JSON.stringify(data.recommendedProcedures || []),
          JSON.stringify(data.adviceList || []),
          data.planNotes || null,
          JSON.stringify(medicines),
          JSON.stringify(lifestyleGuidance),
          data.nextSessionDate || null,
          data.language || 'both',
        ]
      );

      if (validConsultationId) {
        await client.query('UPDATE consultations SET prescription_id = $2 WHERE id = $1', [
          validConsultationId,
          rxId,
        ]);
      }

      const created = mapPrescriptionRow(res.rows[0]);
      await pgLogAuditEvent(
        actor,
        'PRESCRIPTION_FINALIZED',
        'prescription',
        created.id,
        `Dr. ${actor.name} finalized prescription ${created.prescriptionCode} with frozen Food & Lifestyle snapshot for ${pt.name}`,
        ipAddress,
        client
      );
      return created;
    });
  },

  async listRxProtocols(activeOnly: boolean): Promise<RxProtocol[]> {
    const res = activeOnly
      ? await pgQuery('SELECT * FROM rx_protocols WHERE is_active = TRUE ORDER BY updated_at DESC')
      : await pgQuery('SELECT * FROM rx_protocols ORDER BY updated_at DESC');
    return res.rows.map(mapRxProtocolRow);
  },

  async createRxProtocol(data: Omit<RxProtocol, 'id' | 'updatedAt' | 'createdBy'>, actor: User, ipAddress: string): Promise<RxProtocol> {
    return withPgTransaction(async (client) => {
      if (data.isDefaultBaseline) {
        await client.query('UPDATE rx_protocols SET is_default_baseline = FALSE WHERE is_default_baseline = TRUE');
      }
      const id = `proto-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const res = await client.query(
        `
        INSERT INTO rx_protocols (
          id, name, subtitle, category, is_active, is_default_baseline,
          diagnosis, chief_complaints, investigations, examination_notes, skin_type,
          target_zones, procedures, medicines, advice_list, sun_instructions,
          sun_instructions_bn, water_liters, follow_up_days, morning_routine,
          evening_routine, recommended_foods, prohibited_foods, created_by, updated_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16,
          $17, $18, $19, $20::jsonb,
          $21::jsonb, $22::jsonb, $23::jsonb, $24, NOW()
        )
        RETURNING *
        `,
        [
          id,
          data.name,
          data.subtitle || '',
          data.category,
          data.isActive !== false,
          Boolean(data.isDefaultBaseline),
          data.diagnosis || '',
          data.chiefComplaints || '',
          data.investigations || '',
          data.examinationNotes || '',
          data.skinType || 'combination',
          JSON.stringify(data.targetZones || []),
          JSON.stringify(data.procedures || []),
          JSON.stringify(data.medicines || []),
          JSON.stringify(data.adviceList || []),
          data.sunInstructions || '',
          data.sunInstructionsBn || '',
          data.waterLiters ?? 2.5,
          data.followUpDays ?? 14,
          JSON.stringify(data.morningRoutine || []),
          JSON.stringify(data.eveningRoutine || []),
          JSON.stringify(data.recommendedFoods || []),
          JSON.stringify(data.prohibitedFoods || []),
          actor.name,
        ]
      );
      const created = mapRxProtocolRow(res.rows[0]);
      await pgLogAuditEvent(
        actor,
        'RX_PROTOCOL_CREATED',
        'rx_protocol',
        created.id,
        `${actor.name} created Rx protocol "${created.name}"`,
        ipAddress,
        client
      );
      return created;
    });
  },

  async updateRxProtocol(id: string, patch: Partial<RxProtocol>, actor: User, ipAddress: string): Promise<RxProtocol | null> {
    return withPgTransaction(async (client) => {
      const existingRes = await client.query('SELECT * FROM rx_protocols WHERE id = $1 FOR UPDATE', [id]);
      if (existingRes.rows.length === 0) return null;
      const cur = mapRxProtocolRow(existingRes.rows[0]);

      if (patch.isDefaultBaseline) {
        await client.query('UPDATE rx_protocols SET is_default_baseline = FALSE WHERE id <> $1', [id]);
      }

      const merged = { ...cur, ...patch };
      const res = await client.query(
        `
        UPDATE rx_protocols SET
          name = $2, subtitle = $3, category = $4, is_active = $5, is_default_baseline = $6,
          diagnosis = $7, chief_complaints = $8, investigations = $9, examination_notes = $10,
          skin_type = $11, target_zones = $12::jsonb, procedures = $13::jsonb,
          medicines = $14::jsonb, advice_list = $15::jsonb, sun_instructions = $16,
          sun_instructions_bn = $17, water_liters = $18, follow_up_days = $19,
          morning_routine = $20::jsonb, evening_routine = $21::jsonb,
          recommended_foods = $22::jsonb, prohibited_foods = $23::jsonb, updated_at = NOW()
        WHERE id = $1
        RETURNING *
        `,
        [
          id,
          merged.name,
          merged.subtitle,
          merged.category,
          merged.isActive,
          Boolean(merged.isDefaultBaseline),
          merged.diagnosis,
          merged.chiefComplaints,
          merged.investigations,
          merged.examinationNotes,
          merged.skinType,
          JSON.stringify(merged.targetZones || []),
          JSON.stringify(merged.procedures || []),
          JSON.stringify(merged.medicines || []),
          JSON.stringify(merged.adviceList || []),
          merged.sunInstructions,
          merged.sunInstructionsBn,
          merged.waterLiters,
          merged.followUpDays,
          JSON.stringify(merged.morningRoutine || []),
          JSON.stringify(merged.eveningRoutine || []),
          JSON.stringify(merged.recommendedFoods || []),
          JSON.stringify(merged.prohibitedFoods || []),
        ]
      );
      const updated = mapRxProtocolRow(res.rows[0]);
      await pgLogAuditEvent(
        actor,
        'RX_PROTOCOL_UPDATED',
        'rx_protocol',
        updated.id,
        `${actor.name} updated Rx protocol "${updated.name}"`,
        ipAddress,
        client
      );
      return updated;
    });
  },

  async deleteRxProtocol(id: string, actor: User, ipAddress: string): Promise<boolean> {
    return withPgTransaction(async (client) => {
      const res = await client.query('DELETE FROM rx_protocols WHERE id = $1 RETURNING id, name, is_default_baseline', [id]);
      if (res.rows.length === 0) return false;
      const removed = res.rows[0];
      if (removed.is_default_baseline) {
        await client.query(`
          UPDATE rx_protocols SET is_default_baseline = TRUE
          WHERE id = (SELECT id FROM rx_protocols ORDER BY updated_at DESC LIMIT 1)
        `);
      }
      await pgLogAuditEvent(
        actor,
        'RX_PROTOCOL_DELETED',
        'rx_protocol',
        String(removed.id),
        `${actor.name} deleted Rx protocol "${removed.name}"`,
        ipAddress,
        client
      );
      return true;
    });
  },

  // ---------------------------------------------------------------------------
  // Medical Documents (Metadata in PostgreSQL; binary files handled in Phase 4)
  // ---------------------------------------------------------------------------
  async listMedicalDocuments(filters: { patientId?: string; type?: string }): Promise<MedicalAttachment[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.patientId) {
      params.push(filters.patientId);
      conditions.push(`patient_id = $${params.length}`);
    }
    if (filters.type && filters.type !== 'all') {
      params.push(filters.type);
      conditions.push(`(doc_type = $${params.length} OR category = $${params.length})`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const res = await pgQuery(`SELECT * FROM medical_attachments ${where} ORDER BY created_at DESC`, params);
    return res.rows.map(mapMedicalDocRow);
  },

  async createMedicalDocument(
    data: {
      patientId: string;
      title: string;
      titleBn?: string;
      type?: MedicalAttachment['type'];
      category?: MedicalAttachment['category'];
      procedureName?: string;
      sessionNumber?: number;
      photoType?: MedicalAttachment['photoType'];
      fileUrl?: string;
      storagePath?: string;
      fileSize?: string;
      fileFormat?: MedicalAttachment['fileFormat'];
      clinicalNotes?: string;
      signedByPatient?: boolean;
    },
    actor: User,
    ipAddress: string
  ): Promise<MedicalAttachment> {
    return withPgTransaction(async (client) => {
      const pt = await this.findPatientByIdentifier(data.patientId, client);
      if (!pt) {
        const err = new Error('Patient not found') as Error & { statusCode?: number };
        err.statusCode = 404;
        throw err;
      }

      const id = `doc-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`;
      const docCode = generateCode('DOC');
      let storagePath = data.storagePath || null;
      let fileUrl = data.fileUrl || '/assets/clinical/sample_document.png';
      let fileSize = data.fileSize || '1.8 MB';
      let fileFormat: MedicalAttachment['fileFormat'] = data.fileFormat || 'PNG';

      // Persist base64 clinical photos / PDFs cleanly onto private VPS UPLOAD_DIR
      if (fileUrl.startsWith('data:')) {
        const stored = await savePrivateDataUrl(fileUrl, data.category || data.type);
        storagePath = stored.storagePath;
        fileUrl = `/api/v1/files/by-doc/${id}`;
        fileSize = stored.fileSizeLabel;
        fileFormat = stored.fileFormat;
      }

      const res = await client.query(
        `
        INSERT INTO medical_attachments (
          id, document_code, patient_id, patient_name, patient_phone, doc_type,
          title, title_bn, category, procedure_name, session_number, photo_type,
          storage_path, file_url, thumbnail_url, file_size, file_format, doctor_name,
          signed_by_patient, signature_date, clinical_notes, is_confidential, created_at
        )
        VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18,
          $19, $20, $21, TRUE, NOW()
        )
        RETURNING *
        `,
        [
          id,
          docCode,
          pt.id,
          pt.name,
          pt.phone,
          data.type || 'clinical_photo',
          data.title,
          data.titleBn || null,
          data.category || 'Before-After Photos',
          data.procedureName || null,
          data.sessionNumber ? Number(data.sessionNumber) : null,
          data.photoType || null,
          storagePath,
          fileUrl,
          fileUrl,
          fileSize,
          fileFormat,
          actor.name,
          Boolean(data.signedByPatient),
          data.signedByPatient ? new Date().toISOString() : null,
          data.clinicalNotes || null,
        ]
      );
      const created = mapMedicalDocRow(res.rows[0]);
      await pgLogAuditEvent(
        actor,
        'MEDICAL_DOCUMENT_UPLOADED',
        'medical_document',
        created.id,
        `Added ${created.category} (${created.documentCode}) for ${pt.name}`,
        ipAddress,
        client
      );
      return created;
    });
  },
};
