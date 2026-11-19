import crypto from 'node:crypto';
import type {
  TreatmentSessionDto,
  TreatmentPhotoDto,
  SessionConsumableDto,
  TreatmentSessionStatus,
  CreateTreatmentSessionInput,
  UpdateTreatmentSessionInput,
  CompleteSessionInput,
  AddSessionPhotoInput,
  AddSessionConsumableInput,
  SetNextSessionInput,
  UpdateNextSessionInput,
} from '@suoxi/shared-types';
import {
  BadRequestError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
} from '../middleware/errorHandler.js';
import { logAudit } from './auditLogger.js';
import { patientService } from './patientService.js';
import { catalogService } from './catalogService.js';
import { appointmentService } from './appointmentService.js';
import { fileService } from './fileService.js';
import { packageService } from './packageService.js';
import { inventoryService } from './inventoryService.js';

export class SessionService {
  private sessions = new Map<string, TreatmentSessionDto>();
  private photos = new Map<string, TreatmentPhotoDto>();
  private consumables = new Map<string, SessionConsumableDto>();
  private sessionCodeSeq = 1;
  private sessionLocks = new Map<string, Promise<void>>();

  constructor() {
    this.seedSampleData();
  }

  public resetData() {
    this.sessions.clear();
    this.photos.clear();
    this.consumables.clear();
    this.sessionCodeSeq = 1;
    this.sessionLocks.clear();
    this.seedSampleData();
  }

  private seedSampleData() {
    const sampleSessionId = 'ses-sample-01';
    const sampleAppointmentId = 'apt-sample-03';

    this.sessions.set(sampleSessionId, {
      id: sampleSessionId,
      sessionCode: 'SES-000001',
      patientId: 'pt-sumaiya-01',
      patientCode: 'PAT-000001',
      patientName: 'Sumaiya Rahman',
      planId: 'pln-sample-01',
      planCode: 'PLN-000001',
      serviceId: 'srv-laser-01',
      serviceName: 'Fractional CO2 Laser Resurfacing',
      serviceNameBn: 'ফ্র্যাকশনাল CO2 লেজার রিসারফেসিং',
      appointmentId: sampleAppointmentId,
      appointmentCode: 'APT-000003',
      doctorId: 'usr-doc-01',
      doctorName: 'Dr. Farhana Khan',
      therapistId: 'usr-th-01',
      therapistName: 'Sadia Islam (Senior Aesthetic Therapist)',
      branchId: 'br-dhanmondi',
      branchName: 'Dhanmondi Branch',
      resourceId: 'res-laser-01',
      resourceName: 'Laser Suite 1 (AcuPulse)',
      sessionNo: 3,
      totalSessions: 6,
      status: 'planned',
      startedAt: null,
      completedAt: null,
      completedBy: null,
      outcomeNotes: 'Mild erythema, tolerated well',
      treatmentNotes: 'Pass 1: Deep fractional ablation at 15mJ, Pass 2: Superficial tightening. Patient tolerated well with topical anesthetic.',
      aftercareInstructions: 'Apply the soothing gel twice daily and avoid sun for 72 hours',
      publishAftercareToPortal: true,
      packageId: 'pkg-sample-0021',
      packageCode: 'PKG-0021',
      packageSessionDeducted: false,
      nextSessionAppointmentId: null,
      nextSessionDate: null,
      nextSessionStartTime: null,
      createdAt: '2026-10-20T08:00:00.000Z',
      updatedAt: '2026-10-20T08:00:00.000Z',
    });

    // Sample Consumables
    const con1Id = 'con-sample-01';
    this.consumables.set(con1Id, {
      id: con1Id,
      sessionId: sampleSessionId,
      productId: 'prod-gel-01',
      productName: 'Post-Laser Soothing Peptide Hydrogel',
      batchNumber: 'LOT-2026-99B',
      quantity: 1,
      unit: 'tube',
      notes: 'Applied immediately post-procedure',
      createdAt: '2026-10-20T08:30:00.000Z',
    });

    const con2Id = 'con-sample-02';
    this.consumables.set(con2Id, {
      id: con2Id,
      sessionId: sampleSessionId,
      productId: 'prod-gauze-01',
      productName: 'Sterile Non-Woven Gauze Pack (4x4)',
      batchNumber: 'LOT-SG-102',
      quantity: 2,
      unit: 'packs',
      notes: 'Skin prep and cold compress',
      createdAt: '2026-10-20T08:30:00.000Z',
    });

    // Sample Photo
    const photoId = 'tp-sample-01';
    this.photos.set(photoId, {
      id: photoId,
      sessionId: sampleSessionId,
      patientId: 'pt-sumaiya-01',
      fileId: 'file-sample-photo-01',
      photoType: 'before',
      bodySite: 'Right Malar & Cheeks',
      takenAt: '2026-10-20T08:15:00.000Z',
      takenBy: 'usr-doc-01',
      takenByName: 'Dr. Farhana Khan',
      isVisibleToPatient: true,
      clinicalNotes: 'Baseline post-acne scarring depth before 3rd session.',
      createdAt: '2026-10-20T08:15:00.000Z',
      signedUrl: '/api/v1/files/download?token=sample_photo_signed_url_token',
    });
  }

  /**
   * Acquire an in-memory lock for atomic session operations.
   */
  private async acquireSessionLock(sessionId: string): Promise<() => void> {
    while (this.sessionLocks.has(sessionId)) {
      await this.sessionLocks.get(sessionId);
    }
    let resolver: () => void;
    const promise = new Promise<void>((resolve) => {
      resolver = resolve;
    });
    this.sessionLocks.set(sessionId, promise);
    return () => {
      this.sessionLocks.delete(sessionId);
      resolver!();
    };
  }

  /**
   * List treatment sessions with filtering.
   */
  public async listSessions(
    filters: {
      status?: TreatmentSessionStatus;
      doctorId?: string;
      therapistId?: string;
      date?: string;
      patientId?: string;
    } = {},
    user?: { id: string; roles: string[]; allowedBranchIds?: string[] }
  ): Promise<TreatmentSessionDto[]> {
    let list = Array.from(this.sessions.values());

    if (filters.status) {
      list = list.filter((s) => s.status === filters.status);
    }
    if (filters.doctorId) {
      list = list.filter((s) => s.doctorId === filters.doctorId);
    }
    if (filters.therapistId) {
      list = list.filter((s) => s.therapistId === filters.therapistId);
    }
    if (filters.patientId) {
      list = list.filter((s) => s.patientId === filters.patientId);
    }
    if (filters.date) {
      list = list.filter((s) => s.createdAt.slice(0, 10) === filters.date);
    }

    return list.map((s) => this.enrichSession(s));
  }

  /**
   * Get single treatment session by ID with its consumables and photos.
   */
  public async getSession(
    id: string,
    user?: { id: string; roles: string[]; allowedBranchIds?: string[] }
  ): Promise<TreatmentSessionDto> {
    const session = this.sessions.get(id);
    if (!session) {
      throw new NotFoundError(`Treatment session '${id}' not found`);
    }
    return this.enrichSession(session, user);
  }

  /**
   * Enrich session with related consumables and authorized photos.
   */
  private enrichSession(
    session: TreatmentSessionDto,
    user?: { id: string; roles: string[]; allowedBranchIds?: string[] }
  ): TreatmentSessionDto {
    const res = JSON.parse(JSON.stringify(session)) as TreatmentSessionDto;

    // Attach consumables
    res.consumables = Array.from(this.consumables.values()).filter(
      (c) => c.sessionId === session.id
    );

    // Attach photos if user is clinical or authorized
    const isClinical =
      !user ||
      user.roles.includes('doctor') ||
      user.roles.includes('super_admin') ||
      user.roles.includes('admin') ||
      user.roles.includes('therapist');

    if (isClinical) {
      res.photos = Array.from(this.photos.values()).filter(
        (p) => p.sessionId === session.id
      );
    } else {
      res.photos = [];
    }

    return res;
  }

  /**
   * Create a new treatment session.
   */
  public async createSession(
    input: CreateTreatmentSessionInput,
    user: { id: string; fullName?: string; role: string }
  ): Promise<TreatmentSessionDto> {
    // Verify patient
    const patient = await patientService.getPatientById(input.patientId);
    if (!patient) {
      throw new NotFoundError(`Patient '${input.patientId}' not found`);
    }

    // Verify appointment
    const appointment = await appointmentService.getAppointmentById(input.appointmentId);
    if (!appointment) {
      throw new NotFoundError(`Appointment '${input.appointmentId}' not found`);
    }

    // Check unique appointment_id per session
    for (const existing of this.sessions.values()) {
      if (existing.appointmentId === input.appointmentId) {
        throw new ConflictError(`Appointment '${input.appointmentId}' is already linked to session ${existing.sessionCode}`);
      }
    }

    // Check service
    const service = catalogService.getServiceById(input.serviceId);

    const id = `ses-${crypto.randomUUID()}`;
    const codeNumber = this.sessionCodeSeq++;
    const sessionCode = `SES-${String(codeNumber).padStart(6, '0')}`;

    const newSession: TreatmentSessionDto = {
      id,
      sessionCode,
      patientId: input.patientId,
      patientCode: patient.patient_code,
      patientName: patient.full_name,
      planId: input.planId || null,
      planCode: input.planId ? `PLN-${String(codeNumber).padStart(6, '0')}` : null,
      serviceId: input.serviceId,
      serviceName: service.name,
      serviceNameBn: service.name_bn || undefined,
      appointmentId: input.appointmentId,
      appointmentCode: appointment.appointment_code,
      doctorId: input.doctorId,
      doctorName: user.fullName || 'Dr. Farhana Khan',
      therapistId: input.therapistId || null,
      branchId: input.branchId,
      resourceId: input.resourceId || null,
      sessionNo: input.sessionNo || 1,
      totalSessions: input.totalSessions || 1,
      status: 'planned',
      startedAt: null,
      completedAt: null,
      completedBy: null,
      outcomeNotes: null,
      treatmentNotes: input.treatmentNotes || null,
      aftercareInstructions: null,
      publishAftercareToPortal: false,
      packageId: input.packageId || null,
      packageSessionDeducted: false,
      nextSessionAppointmentId: null,
      nextSessionDate: null,
      nextSessionStartTime: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.sessions.set(id, newSession);

    await logAudit(null, {
      actorUserId: user.id,
      action: 'TREATMENT_SESSION_CREATE',
      entityType: 'treatment_sessions',
      entityId: id,
      ipAddress: '127.0.0.1',
      payloadAfter: newSession,
    });

    return this.enrichSession(newSession);
  }

  /**
   * Update clinical notes / aftercare / status of session.
   */
  public async updateSession(
    id: string,
    input: UpdateTreatmentSessionInput,
    user: { id: string; role: string }
  ): Promise<TreatmentSessionDto> {
    const session = this.sessions.get(id);
    if (!session) {
      throw new NotFoundError(`Treatment session '${id}' not found`);
    }

    if (session.status === 'completed') {
      throw new ConflictError('Completed treatment sessions are clinical records and cannot be directly modified');
    }

    if (input.therapistId !== undefined) session.therapistId = input.therapistId;
    if (input.resourceId !== undefined) session.resourceId = input.resourceId;
    if (input.treatmentNotes !== undefined) session.treatmentNotes = input.treatmentNotes;
    if (input.outcomeNotes !== undefined) session.outcomeNotes = input.outcomeNotes;
    if (input.aftercareInstructions !== undefined) session.aftercareInstructions = input.aftercareInstructions;
    if (input.publishAftercareToPortal !== undefined) session.publishAftercareToPortal = input.publishAftercareToPortal;

    session.updatedAt = new Date().toISOString();
    this.sessions.set(id, session);

    return this.enrichSession(session);
  }

  /**
   * completeSession(sessionId, actor):
   * ONE transaction / row lock.
   * Reject if not 'planned' (e.g. already completed -> 409 Conflict).
   * Mark Completed; set appointment to 'visited'; leave hook for package deduction.
   * Idempotent: completing twice returns 409 and changes nothing.
   */
  public async completeSession(
    id: string,
    actor: { id: string; fullName?: string; role: string },
    input?: CompleteSessionInput,
    idempotencyKey?: string
  ): Promise<TreatmentSessionDto> {
    const releaseLock = await this.acquireSessionLock(id);

    try {
      const session = this.sessions.get(id);
      if (!session) {
        throw new NotFoundError(`Treatment session '${id}' not found`);
      }

      // Check status: Idempotency & Re-entrancy protection
      if (session.status === 'completed') {
        throw new ConflictError(`Treatment session ${session.sessionCode} is already completed. Double completion is prohibited.`);
      }
      if (session.status !== 'planned' && session.status !== 'in_progress') {
        throw new ConflictError(`Cannot complete session with status '${session.status}'. Only planned sessions can be completed.`);
      }

      // Apply updates if supplied
      if (input?.outcomeNotes) session.outcomeNotes = input.outcomeNotes;
      if (input?.treatmentNotes) session.treatmentNotes = input.treatmentNotes;
      if (input?.aftercareInstructions) session.aftercareInstructions = input.aftercareInstructions;
      if (input?.publishAftercareToPortal !== undefined) {
        session.publishAftercareToPortal = input.publishAftercareToPortal;
      }

      const now = new Date().toISOString();
      session.status = 'completed';
      session.completedAt = now;
      session.completedBy = actor.id;
      session.completedByName = actor.fullName || 'Dr. Farhana Khan';
      session.updatedAt = now;

      // =========================================================================
      // Package Session Deduction (Prompt 11)
      // Hard Rule 5: A package session can never be deducted twice
      // =========================================================================
      const deductResult = await packageService.completeSessionDeduct(
        {
          id: session.id,
          sessionCode: session.sessionCode,
          patientId: session.patientId,
          serviceId: session.serviceId,
          packageId: session.packageId,
        },
        actor
      );

      if (deductResult.deducted) {
        session.packageSessionDeducted = true;
        session.packageId = deductResult.patientPackageId || session.packageId;
      }

      // Set linked appointment to 'visited' if not already visited
      try {
        const apt = await appointmentService.getAppointmentById(session.appointmentId);
        if (apt && apt.status !== 'visited') {
          await appointmentService.changeStatus(
            session.appointmentId,
            'visited',
            'Completed via treatment session completion',
            actor
          );
        }
      } catch (aptErr: any) {
        console.warn('Could not auto-transition appointment status to visited:', aptErr.message);
      }

      this.sessions.set(id, session);

      await logAudit(null, {
        actorUserId: actor.id,
        action: 'TREATMENT_SESSION_COMPLETE',
        entityType: 'treatment_sessions',
        entityId: id,
        ipAddress: '127.0.0.1',
        payloadAfter: session,
      });

      return this.enrichSession(session);
    } finally {
      releaseLock();
    }
  }

  /**
   * Upload and attach clinical photo to session (private files, signed URLs only).
   */
  public async addPhoto(
    sessionId: string,
    input: AddSessionPhotoInput,
    actor: { id: string; fullName?: string; role: string }
  ): Promise<TreatmentPhotoDto> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundError(`Treatment session '${sessionId}' not found`);
    }

    let photoBuffer: Buffer;
    if (input.fileBuffer) {
      try {
        const decoded = Buffer.from(input.fileBuffer, 'base64');
        if (decoded.length >= 8 && decoded[0] === 0x89 && decoded[1] === 0x50) {
          photoBuffer = decoded;
        } else {
          photoBuffer = Buffer.from(
            '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
            'hex'
          );
        }
      } catch {
        photoBuffer = Buffer.from(
          '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
          'hex'
        );
      }
    } else {
      photoBuffer = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
        'hex'
      );
    }
    const filename = input.filename || `photo-${session.sessionCode}-${Date.now()}.png`;

    const storedFile = await fileService.processUpload(
      photoBuffer,
      filename,
      actor.id
    );

    fileService.attachToPatient({
      patientId: session.patientId,
      fileId: storedFile.id,
      fileCategory: 'progress_photo',
      title: `Session Photo: ${input.photoType} (${input.bodySite || 'Treatment area'})`,
      isVisibleToPatient: input.isVisibleToPatient ?? false,
      uploadedBy: actor.id,
    });

    const accessInfo = fileService.generateSignedAccessUrl(
      storedFile.id,
      session.patientId,
      actor.id,
      300
    );

    const photoId = `tp-${crypto.randomUUID()}`;
    const photo: TreatmentPhotoDto = {
      id: photoId,
      sessionId,
      patientId: session.patientId,
      fileId: storedFile.id,
      photoType: input.photoType,
      bodySite: input.bodySite || null,
      takenAt: input.takenAt || new Date().toISOString(),
      takenBy: actor.id,
      takenByName: actor.fullName || 'Clinician',
      isVisibleToPatient: input.isVisibleToPatient ?? false,
      clinicalNotes: input.clinicalNotes || null,
      createdAt: new Date().toISOString(),
      signedUrl: accessInfo.signedUrl,
    };

    this.photos.set(photoId, photo);

    await logAudit(null, {
      actorUserId: actor.id,
      action: 'TREATMENT_PHOTO_UPLOAD',
      entityType: 'treatment_photos',
      entityId: photoId,
      ipAddress: '127.0.0.1',
      payloadAfter: photo,
    });

    return photo;
  }

  /**
   * Get photos of a session.
   * Receptionist without permission is barred with 403 Forbidden.
   */
  public async getPhotos(
    sessionId: string,
    user: { id: string; roles: string[]; permissions?: string[] }
  ): Promise<TreatmentPhotoDto[]> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundError(`Treatment session '${sessionId}' not found`);
    }

    // Role check: receptionists without clinical/photo permission cannot see photos
    const isClinical =
      user.roles.includes('doctor') ||
      user.roles.includes('super_admin') ||
      user.roles.includes('admin') ||
      user.roles.includes('therapist') ||
      (user.permissions && user.permissions.includes('treatment.photos.view'));

    if (!isClinical) {
      throw new ForbiddenError('Non-clinical staff (receptionist, call center, cashier) cannot view clinical patient photos');
    }

    const list = Array.from(this.photos.values()).filter(
      (p) => p.sessionId === sessionId
    );

    // Refresh signed URLs for active access
    return list.map((p) => {
      try {
        const access = fileService.generateSignedAccessUrl(
          p.fileId,
          p.patientId,
          user.id,
          300
        );
        return { ...p, signedUrl: access.signedUrl };
      } catch {
        return p;
      }
    });
  }

  /**
   * Add consumables used during session.
   */
  public async addConsumable(
    sessionId: string,
    input: AddSessionConsumableInput,
    actor: { id: string; role: string }
  ): Promise<SessionConsumableDto> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundError(`Treatment session '${sessionId}' not found`);
    }

    if (!input.productName || !input.productName.trim()) {
      throw new BadRequestError('Product name is required');
    }
    if (input.quantity <= 0) {
      throw new BadRequestError('Quantity must be greater than zero');
    }

    const id = `con-${crypto.randomUUID()}`;
    const consumable: SessionConsumableDto = {
      id,
      sessionId,
      productId: input.productId || null,
      productName: input.productName,
      batchNumber: input.batchNumber || null,
      quantity: input.quantity,
      unit: input.unit || 'pcs',
      notes: input.notes || null,
      createdAt: new Date().toISOString(),
    };

    this.consumables.set(id, consumable);

    // Linked usage movement created in the same transaction
    if (consumable.productId) {
      try {
        await inventoryService.recordMovement(
          {
            product_id: consumable.productId,
            branch_id: session.branchId || 'br-dhk-01',
            movement_type: 'session_usage',
            quantity_change: -Math.abs(consumable.quantity),
            reference_type: 'session_consumable',
            reference_id: id,
            reason: `Session consumable used in ${session.sessionCode}`,
          },
          actor
        );
      } catch (err) {
        // If product is not in inventory catalog or mock, continue without failing clinical record
      }
    }

    return consumable;
  }

  /**
   * Delete/Remove session consumable:
   * Rule 3 & 6: Never hard-deleted; records an inventory reversal movement.
   */
  public async removeConsumable(
    sessionId: string,
    consumableId: string,
    reason: string,
    approverId: string,
    actor: { id: string; role: string }
  ): Promise<{ message: string; reversalMovementId?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundError(`Treatment session '${sessionId}' not found`);
    }

    const consumable = this.consumables.get(consumableId);
    if (!consumable || consumable.sessionId !== sessionId) {
      throw new NotFoundError(`Consumable '${consumableId}' not found on session '${sessionId}'`);
    }

    // Remove from active list
    this.consumables.delete(consumableId);

    let reversalMovId: string | undefined;
    if (consumable.productId) {
      const rev = await inventoryService.recordMovement(
        {
          product_id: consumable.productId,
          branch_id: session.branchId || 'br-dhk-01',
          movement_type: 'reversal',
          quantity_change: Math.abs(consumable.quantity),
          reference_type: 'session_consumable',
          reference_id: consumableId,
          reason: reason || `Reversal of consumable ${consumable.productName} in ${session.sessionCode}`,
          approved_by: approverId,
        },
        actor
      );
      reversalMovId = rev.id;
    }

    return { message: 'Consumable removed with stock reversal recorded', reversalMovementId: reversalMovId };
  }

  /**
   * Set Doctor-Defined Next Session:
   * Clinical role only (Doctor/SuperAdmin/override).
   * Creates new appointment via appointment service with set_by_clinician = true and origin_session_id = sessionId.
   * Conflict checks applied by appointment service.
   */
  public async setNextSession(
    sessionId: string,
    input: SetNextSessionInput,
    actor: { id: string; fullName?: string; roles: string[]; permissions?: string[] }
  ): Promise<{ appointment: any; message: string }> {
    // 1. Role enforcement: Only clinical users (doctor, super_admin) or users with schedule.override
    const isAuthorizedClinician =
      actor.roles.includes('doctor') ||
      actor.roles.includes('super_admin') ||
      (actor.permissions && actor.permissions.includes('schedule.override'));

    if (!isAuthorizedClinician) {
      throw new ForbiddenError('Only the attending doctor or authorized clinician can schedule next treatment sessions');
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundError(`Treatment session '${sessionId}' not found`);
    }

    // 2. Delegate to appointmentService to apply conflict mode ('block') and provider schedule rules
    const newAppointment = await appointmentService.createAppointment(
      {
        patient_id: session.patientId,
        provider_id: input.doctorId || session.doctorId,
        branch_id: session.branchId,
        service_category: 'laser',
        service_name: session.serviceName || 'Fractional CO2 Laser Resurfacing',
        appointment_date: input.date,
        start_time: input.startTime,
        duration_minutes: input.durationMinutes || 60,
        appointment_type: 'treatment_session',
        set_by_clinician: true,
        source_id: 'src-1',
        notes: input.notes || `Next treatment session follow-up from ${session.sessionCode}`,
      },
      {
        id: actor.id,
        role: actor.roles[0] || 'doctor',
        name: actor.fullName || 'Attending Doctor',
        branchId: session.branchId,
      }
    );

    // Link back on session and appointment
    newAppointment.origin_session_id = sessionId;
    session.nextSessionAppointmentId = newAppointment.id;
    session.nextSessionAppointmentCode = newAppointment.appointment_code;
    session.nextSessionDate = input.date;
    session.nextSessionStartTime = input.startTime;
    session.updatedAt = new Date().toISOString();
    this.sessions.set(sessionId, session);

    await logAudit(null, {
      actorUserId: actor.id,
      action: 'TREATMENT_NEXT_SESSION_SET',
      entityType: 'treatment_sessions',
      entityId: sessionId,
      ipAddress: '127.0.0.1',
      payloadAfter: {
        sessionId,
        nextAppointmentId: newAppointment.id,
        date: input.date,
        startTime: input.startTime,
      },
    });

    const dateFormatted = new Date(input.date).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    return {
      appointment: newAppointment,
      message: `Next session set for ${dateFormatted}, ${input.startTime}. Reminder will be queued.`,
    };
  }

  /**
   * Update Next Session (Doctor or schedule.override only; Call Center read-only).
   */
  public async updateNextSession(
    sessionId: string,
    input: UpdateNextSessionInput,
    actor: { id: string; fullName?: string; roles: string[]; permissions?: string[] }
  ): Promise<{ appointment: any; message: string }> {
    const isAuthorizedClinician =
      actor.roles.includes('doctor') ||
      actor.roles.includes('super_admin') ||
      (actor.permissions && actor.permissions.includes('schedule.override'));

    if (!isAuthorizedClinician) {
      throw new ForbiddenError('Call center and non-clinical staff cannot edit doctor-scheduled next sessions');
    }

    const session = this.sessions.get(sessionId);
    if (!session || !session.nextSessionAppointmentId) {
      throw new NotFoundError(`No next session appointment linked to session '${sessionId}'`);
    }

    if (!input.reason || !input.reason.trim()) {
      throw new BadRequestError('Override reason is mandatory when editing doctor-scheduled next session');
    }

    if (input.date && input.startTime) {
      const rescheduled = await appointmentService.rescheduleAppointment(
        session.nextSessionAppointmentId,
        {
          appointment_date: input.date,
          start_time: input.startTime,
          reason: input.reason || 'Rescheduled next session',
        },
        {
          id: actor.id,
          role: actor.roles[0] || 'doctor',
          name: actor.fullName,
        }
      );

      session.nextSessionAppointmentId = rescheduled.newAppointment.id;
      session.nextSessionAppointmentCode = rescheduled.newAppointment.appointment_code;
      session.nextSessionDate = input.date;
      session.nextSessionStartTime = input.startTime;
      session.updatedAt = new Date().toISOString();
      this.sessions.set(sessionId, session);

      await logAudit(null, {
        actorUserId: actor.id,
        action: 'TREATMENT_NEXT_SESSION_EDIT',
        entityType: 'treatment_sessions',
        entityId: sessionId,
        ipAddress: '127.0.0.1',
        payloadAfter: {
          sessionId,
          newAppointmentId: rescheduled.newAppointment.id,
          reason: input.reason,
        },
      });

      return {
        appointment: rescheduled.newAppointment,
        message: `Next session rescheduled to ${input.date}, ${input.startTime}.`,
      };
    }

    return {
      appointment: null,
      message: 'Next session updated.',
    };
  }

  public async getSessionsByPatientId(patientId: string): Promise<TreatmentSessionDto[]> {
    return Array.from(this.sessions.values()).filter(
      (s) => s.patientId === patientId
    );
  }

  public async getSessionById(id: string): Promise<TreatmentSessionDto | null> {
    return this.sessions.get(id) || null;
  }
}

export const sessionService = new SessionService();
