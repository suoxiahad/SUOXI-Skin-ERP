import crypto from 'node:crypto';
import type {
  PrescriptionDto,
  PrescriptionItemDto,
  PrescriptionGuidanceSnapshotDto,
  PrescriptionGuidanceSnapshotItemDto,
  CreatePrescriptionRequest,
  PatchPrescriptionRequest,
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
import { pdfService } from './pdfService.js';
import { fileService } from './fileService.js';

export class PrescriptionService {
  private prescriptions = new Map<string, PrescriptionDto>();
  private prescriptionLocks = new Map<string, Promise<void>>();
  private rxCodeSeq = 1;

  constructor() {
    this.seedSampleData();
  }

  private seedSampleData() {
    const sampleId = 'rx-sample-01';
    this.prescriptions.set(sampleId, {
      id: sampleId,
      prescriptionCode: 'RX-000001',
      consultationId: 'cns-sample-01',
      patientId: 'pt-sumaiya-01',
      patientCode: 'PAT-000001',
      patientName: 'Sumaiya Rahman',
      patientNameBn: 'সুমাইয়া রহমান',
      patientAge: 29,
      patientGender: 'Female',
      doctorId: 'usr-doc-01',
      doctorName: 'Dr. Farhana Khan',
      doctorNameBn: 'ডাঃ ফারহানা খান',
      doctorBmdcReg: 'A-84920',
      doctorDesignation: 'Consultant Aesthetic Dermatologist',
      branchId: 'br-dhanmondi',
      branchName: 'Dhanmondi Branch',
      versionNumber: 1,
      diagnosis: 'Post-acne hyperpigmentation',
      advice: 'Avoid direct sun exposure between 10am-4pm and strictly refrain from picking the skin.',
      followupAdvice: 'HydraFacial follow-up session scheduled in 14 days.',
      nextSessionDate: '2026-11-03',
      language: 'both',
      suggestFood: true,
      serviceId: 'srv-hydrafacial-01',
      serviceName: 'HydraFacial Elite MD Rejuvenation',
      status: 'draft',
      publishedToPortal: false,
      items: [
        {
          id: 'rxi-01',
          prescriptionId: sampleId,
          itemName: 'Sunscreen SPF 50+',
          itemNameBn: 'সানস্ক্রিন এসপিএফ ৫০+',
          strength: 'SPF 50+ PA++++',
          dosage: '2 finger lengths',
          frequency: 'Every morning',
          frequencyBn: 'প্রতিদিন সকালে',
          duration: '30 days',
          route: 'Topical',
          instructions: 'Apply 20 minutes before stepping outdoors. Reapply every 3 hours.',
          instructionsBn: 'বাইরে যাওয়ার ২০ মিনিট আগে লাগাবেন। ৩ ঘণ্টা পর পর পুনরায় লাগাবেন।',
          sortOrder: 1,
        },
        {
          id: 'rxi-02',
          prescriptionId: sampleId,
          itemName: 'Niacinamide 10% + Zinc 1% Serum',
          itemNameBn: 'নায়াসিনামাইড ১০% সিরাম',
          strength: '10%',
          dosage: '3-4 drops',
          frequency: '1+0+1',
          frequencyBn: '১+০+১',
          duration: '30 days',
          route: 'Topical',
          instructions: 'Apply on cleansed skin before moisturizer.',
          instructionsBn: 'মুখ ধোয়ার পর ময়েশ্চারাইজারের আগে লাগাবেন।',
          sortOrder: 2,
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  public async getPrescription(id: string): Promise<PrescriptionDto> {
    const rx = this.prescriptions.get(id);
    if (!rx) {
      throw new NotFoundError(`Prescription '${id}' not found`);
    }

    // Refresh patient snapshot
    try {
      const p = await patientService.getPatientById(rx.patientId);
      if (p) {
        rx.patientCode = p.patient_code;
        rx.patientName = p.full_name;
        rx.patientNameBn = p.full_name_bn || undefined;
        rx.patientGender = p.gender;
        if (p.date_of_birth) {
          rx.patientAge = new Date().getFullYear() - new Date(p.date_of_birth).getFullYear();
        }
      }
    } catch {
      // Keep existing data
    }

    return JSON.parse(JSON.stringify(rx));
  }

  public async createPrescription(
    req: CreatePrescriptionRequest,
    user: { id: string; fullName?: string; primaryBranchId?: string; role?: string }
  ): Promise<PrescriptionDto> {
    if (!req.patientId) {
      throw new BadRequestError('patientId is required');
    }
    if (!req.diagnosis || !req.diagnosis.trim()) {
      throw new BadRequestError('Clinical diagnosis is required');
    }

    const patient = await patientService.getPatientById(req.patientId);
    if (!patient) {
      throw new NotFoundError(`Patient '${req.patientId}' not found`);
    }

    const prescriptionId = `rx-${crypto.randomUUID()}`;
    const prescriptionCode = `RX-${String(this.rxCodeSeq++).padStart(6, '0')}`;

    let serviceName: string | undefined;
    if (req.serviceId) {
      const srv = await catalogService.getServiceById(req.serviceId);
      if (srv) serviceName = srv.name;
    }

    const items: PrescriptionItemDto[] = (req.items || []).map((it, idx) => ({
      id: `rxi-${crypto.randomUUID()}`,
      prescriptionId,
      itemName: it.itemName,
      itemNameBn: it.itemNameBn || null,
      inventoryProductId: it.inventoryProductId || null,
      strength: it.strength || null,
      dosage: it.dosage || null,
      frequency: it.frequency || null,
      frequencyBn: it.frequencyBn || null,
      duration: it.duration || null,
      route: it.route || 'Topical',
      instructions: it.instructions || null,
      instructionsBn: it.instructionsBn || null,
      sortOrder: it.sortOrder ?? idx + 1,
    }));

    let patientAge = 30;
    if (patient.date_of_birth) {
      patientAge = new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear();
    }

    const newRx: PrescriptionDto = {
      id: prescriptionId,
      prescriptionCode,
      consultationId: req.consultationId || null,
      patientId: req.patientId,
      patientCode: patient.patient_code,
      patientName: patient.full_name,
      patientNameBn: patient.full_name_bn || undefined,
      patientAge,
      patientGender: patient.gender,
      doctorId: user.id,
      doctorName: user.fullName || 'Dr. Farhana Khan',
      doctorBmdcReg: 'A-84920',
      doctorDesignation: 'Consultant Aesthetic Dermatologist',
      branchId: user.primaryBranchId || 'br-dhanmondi',
      branchName: 'Dhanmondi Branch',
      versionNumber: 1,
      diagnosis: req.diagnosis.trim(),
      advice: req.advice || null,
      followupAdvice: req.followupAdvice || null,
      nextSessionDate: req.nextSessionDate || null,
      language: req.language || 'both',
      suggestFood: Boolean(req.suggestFood),
      serviceId: req.serviceId || null,
      serviceName,
      status: 'draft',
      publishedToPortal: false,
      items,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.prescriptions.set(prescriptionId, newRx);

    await logAudit(null, {
      actorUserId: user.id,
      action: 'PRESCRIPTION_CREATE',
      entityType: 'prescriptions',
      entityId: prescriptionId,
      ipAddress: '127.0.0.1',
      payloadAfter: newRx,
    });

    return newRx;
  }

  public async patchPrescription(
    id: string,
    req: PatchPrescriptionRequest,
    user: { id: string }
  ): Promise<PrescriptionDto> {
    const rx = this.prescriptions.get(id);
    if (!rx) {
      throw new NotFoundError(`Prescription '${id}' not found`);
    }

    // IMMUTABILITY RULE: Cannot edit finalized, superseded, or void prescriptions
    if (rx.status === 'finalized' || rx.status === 'superseded' || rx.status === 'void') {
      throw new ConflictError(
        'Finalized clinical prescriptions are immutable and cannot be edited. A correction requires creating a new version.'
      );
    }

    if (req.diagnosis !== undefined) {
      if (!req.diagnosis.trim()) throw new BadRequestError('Diagnosis cannot be empty');
      rx.diagnosis = req.diagnosis.trim();
    }
    if (req.advice !== undefined) rx.advice = req.advice.trim() || null;
    if (req.followupAdvice !== undefined) rx.followupAdvice = req.followupAdvice.trim() || null;
    if (req.nextSessionDate !== undefined) rx.nextSessionDate = req.nextSessionDate || null;
    if (req.language !== undefined) rx.language = req.language;
    if (req.suggestFood !== undefined) rx.suggestFood = Boolean(req.suggestFood);

    if (req.serviceId !== undefined) {
      rx.serviceId = req.serviceId || null;
      if (req.serviceId) {
        const srv = await catalogService.getServiceById(req.serviceId);
        rx.serviceName = srv ? srv.name : undefined;
      } else {
        rx.serviceName = undefined;
      }
    }

    if (req.items) {
      rx.items = req.items.map((it, idx) => ({
        id: `rxi-${crypto.randomUUID()}`,
        prescriptionId: id,
        itemName: it.itemName,
        itemNameBn: it.itemNameBn || null,
        inventoryProductId: it.inventoryProductId || null,
        strength: it.strength || null,
        dosage: it.dosage || null,
        frequency: it.frequency || null,
        frequencyBn: it.frequencyBn || null,
        duration: it.duration || null,
        route: it.route || 'Topical',
        instructions: it.instructions || null,
        instructionsBn: it.instructionsBn || null,
        sortOrder: it.sortOrder ?? idx + 1,
      }));
    }

    rx.updatedAt = new Date().toISOString();
    this.prescriptions.set(id, rx);

    await logAudit(null, {
      actorUserId: user.id,
      action: 'PRESCRIPTION_PATCH',
      entityType: 'prescriptions',
      entityId: id,
      ipAddress: '127.0.0.1',
      payloadAfter: rx,
    });

    return JSON.parse(JSON.stringify(rx));
  }

  /**
   * Finalize Prescription (Highest Clinical Risk):
   * Executed with mutex lock to guarantee atomic concurrency serialization.
   * Rejects if not draft (second call -> 409).
   * Copies approved guidance snapshot if suggest_food = true.
   * Generates and stores A4 PDF with SHA-256 hash.
   */
  public async finalizePrescription(
    id: string,
    user: { id: string; role: string; fullName?: string; permissions?: Set<string> | string[] }
  ): Promise<PrescriptionDto> {
    const isClinicalRole = user.role === 'doctor' || user.role === 'super_admin';
    if (!isClinicalRole) {
      throw new ForbiddenError(
        'Only clinicians with clinical roles (Doctor / Super Admin) can finalize prescriptions'
      );
    }

    // Mutex locking per prescription ID
    let releaseLock: () => void = () => {};
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    while (this.prescriptionLocks.has(id)) {
      await this.prescriptionLocks.get(id);
    }
    this.prescriptionLocks.set(id, lockPromise);

    try {
      const rx = this.prescriptions.get(id);
      if (!rx) {
        throw new NotFoundError(`Prescription '${id}' not found`);
      }

      // Re-entrancy & state validation: ONLY draft can be finalized
      if (rx.status !== 'draft') {
        throw new ConflictError(
          `Cannot finalize prescription: current status is '${rx.status}'. Only draft prescriptions can be finalized.`
        );
      }

      rx.status = 'finalized';
      rx.finalizedAt = new Date().toISOString();
      rx.finalizedBy = user.id;
      rx.finalizedByName = user.fullName || 'Dr. Farhana Khan';

      // Suggest Food Snapshot copying
      if (rx.suggestFood && rx.serviceId) {
        const approvedGuidance = catalogService.getActiveApprovedGuidance(rx.serviceId);
        if (approvedGuidance) {
          const snapshotId = `pgs-${crypto.randomUUID()}`;
          const snapshotItems: PrescriptionGuidanceSnapshotItemDto[] = approvedGuidance.items.map(
            (it, idx) => ({
              id: `pgsi-${crypto.randomUUID()}`,
              snapshotId,
              section: it.section,
              contentEn: it.content_en || null,
              contentBn: it.content_bn || null,
              sortOrder: it.sort_order ?? idx + 1,
            })
          );

          const guidanceSnapshot: PrescriptionGuidanceSnapshotDto = {
            id: snapshotId,
            prescriptionId: id,
            sourceGuidanceId: approvedGuidance.id,
            serviceId: rx.serviceId,
            versionNumber: approvedGuidance.version_number,
            title: approvedGuidance.title,
            titleBn: approvedGuidance.title_bn || null,
            approvedByDoctorName: approvedGuidance.approver_name || 'Dr. Farhana Khan',
            approvedByBmdcReg: 'A-84920',
            approvedAt: approvedGuidance.approved_at || new Date().toISOString(),
            snapshotAt: new Date().toISOString(),
            items: snapshotItems,
          };

          rx.guidanceSnapshot = guidanceSnapshot;
        }
      }

      rx.updatedAt = new Date().toISOString();
      this.prescriptions.set(id, rx);

      // Post-commit PDF generation
      try {
        const pdfResult = await pdfService.generatePrescriptionPdf(rx);
        const storedFile = await fileService.processUpload(
          pdfResult.pdfBuffer,
          `prescription-${rx.prescriptionCode}.pdf`,
          user.id
        );

        fileService.attachToPatient({
          patientId: rx.patientId,
          fileId: storedFile.id,
          fileCategory: 'general',
          title: `Prescription ${rx.prescriptionCode} v${rx.versionNumber}`,
          isVisibleToPatient: rx.publishedToPortal ?? false,
          uploadedBy: user.id,
        });

        const accessUrlInfo = fileService.generateSignedAccessUrl(
          storedFile.id,
          rx.patientId,
          user.id,
          300
        );

        rx.pdfFileId = storedFile.id;
        rx.pdfSha256 = pdfResult.sha256;
        rx.pdfUrl = accessUrlInfo.signedUrl;
        this.prescriptions.set(id, rx);
      } catch (pdfErr: any) {
        console.warn('PDF generation deferred/warning:', pdfErr.message);
      }

      await logAudit(null, {
        actorUserId: user.id,
        action: 'PRESCRIPTION_FINALIZE',
        entityType: 'prescriptions',
        entityId: id,
        ipAddress: '127.0.0.1',
        payloadAfter: rx,
      });

      return JSON.parse(JSON.stringify(rx));
    } finally {
      this.prescriptionLocks.delete(id);
      releaseLock();
    }
  }

  /**
   * Correct Prescription:
   * Atomically supersedes parent version and spawns child version with version_number = parent + 1.
   */
  public async correctPrescription(
    id: string,
    reason: string,
    user: { id: string; fullName?: string; role: string }
  ): Promise<PrescriptionDto> {
    if (!reason || !reason.trim()) {
      throw new BadRequestError('Correction reason is mandatory');
    }

    const parentRx = this.prescriptions.get(id);
    if (!parentRx) {
      throw new NotFoundError(`Prescription '${id}' not found`);
    }

    if (parentRx.status !== 'finalized') {
      throw new BadRequestError(`Cannot correct prescription with status '${parentRx.status}'. Only finalized prescriptions can be corrected.`);
    }

    // Check linear versioning constraint: at most one correction branch per version
    const existingChild = Array.from(this.prescriptions.values()).find(
      (r) => r.previousVersionId === id
    );
    if (existingChild) {
      throw new ConflictError(`Prescription version ${parentRx.versionNumber} already has a correction branch (${existingChild.prescriptionCode})`);
    }

    // Supersede parent
    parentRx.status = 'superseded';
    parentRx.supersededReason = reason.trim();
    parentRx.updatedAt = new Date().toISOString();
    this.prescriptions.set(id, parentRx);

    // Spawn new version
    const newId = `rx-${crypto.randomUUID()}`;
    const newItems: PrescriptionItemDto[] = parentRx.items.map((it, idx) => ({
      ...it,
      id: `rxi-${crypto.randomUUID()}`,
      prescriptionId: newId,
      sortOrder: idx + 1,
    }));

    const childRx: PrescriptionDto = {
      ...JSON.parse(JSON.stringify(parentRx)),
      id: newId,
      previousVersionId: id,
      versionNumber: parentRx.versionNumber + 1,
      status: 'draft',
      voidReason: null,
      supersededReason: null,
      finalizedAt: null,
      finalizedBy: null,
      finalizedByName: null,
      publishedToPortal: false,
      pdfFileId: null,
      pdfSha256: null,
      pdfUrl: null,
      items: newItems,
      guidanceSnapshot: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.prescriptions.set(newId, childRx);

    await logAudit(null, {
      actorUserId: user.id,
      action: 'PRESCRIPTION_CORRECT',
      entityType: 'prescriptions',
      entityId: id,
      ipAddress: '127.0.0.1',
      reason,
      payloadAfter: { parentId: id, childId: newId, newVersion: childRx.versionNumber },
    });

    return JSON.parse(JSON.stringify(childRx));
  }

  /**
   * Void Prescription
   */
  public async voidPrescription(
    id: string,
    reason: string,
    user: { id: string }
  ): Promise<PrescriptionDto> {
    if (!reason || !reason.trim()) {
      throw new BadRequestError('Reason for voiding prescription is required');
    }

    const rx = this.prescriptions.get(id);
    if (!rx) {
      throw new NotFoundError(`Prescription '${id}' not found`);
    }

    if (rx.status === 'void') {
      throw new ConflictError('Prescription is already voided');
    }

    rx.status = 'void';
    rx.voidReason = reason.trim();
    rx.updatedAt = new Date().toISOString();
    this.prescriptions.set(id, rx);

    await logAudit(null, {
      actorUserId: user.id,
      action: 'PRESCRIPTION_VOID',
      entityType: 'prescriptions',
      entityId: id,
      ipAddress: '127.0.0.1',
      reason,
      payloadAfter: rx,
    });

    return JSON.parse(JSON.stringify(rx));
  }

  /**
   * Publish to Patient Portal
   * CHECK (published_to_portal = 0 OR status = 'finalized')
   */
  public async publishToPortal(
    id: string,
    publish: boolean,
    user: { id: string }
  ): Promise<PrescriptionDto> {
    const rx = this.prescriptions.get(id);
    if (!rx) {
      throw new NotFoundError(`Prescription '${id}' not found`);
    }

    if (publish && rx.status !== 'finalized') {
      throw new BadRequestError(
        'Only finalized prescriptions can be published to the patient portal'
      );
    }

    rx.publishedToPortal = Boolean(publish);
    rx.updatedAt = new Date().toISOString();
    this.prescriptions.set(id, rx);

    await logAudit(null, {
      actorUserId: user.id,
      action: 'PRESCRIPTION_PUBLISH_PORTAL',
      entityType: 'prescriptions',
      entityId: id,
      ipAddress: '127.0.0.1',
      payloadAfter: { publishedToPortal: rx.publishedToPortal },
    });

    return JSON.parse(JSON.stringify(rx));
  }

  /**
   * Retrieve full version genealogy for a prescription code / chain
   */
  public async getPrescriptionHistory(codeOrId: string): Promise<PrescriptionDto[]> {
    const target = this.prescriptions.get(codeOrId) || Array.from(this.prescriptions.values()).find(
      (r) => r.prescriptionCode === codeOrId
    );
    if (!target) return [];

    return Array.from(this.prescriptions.values())
      .filter((r) => r.prescriptionCode === target.prescriptionCode)
      .sort((a, b) => a.versionNumber - b.versionNumber);
  }

  public async getPrescriptionsByPatientId(patientId: string): Promise<PrescriptionDto[]> {
    return Array.from(this.prescriptions.values()).filter(
      (r) => r.patientId === patientId
    );
  }

  public async getPrescriptionById(id: string): Promise<PrescriptionDto | null> {
    return this.prescriptions.get(id) || null;
  }

  public resetData() {
    this.prescriptions.clear();
    this.prescriptionLocks.clear();
    this.rxCodeSeq = 1;
    this.seedSampleData();
  }
}

export const prescriptionService = new PrescriptionService();
