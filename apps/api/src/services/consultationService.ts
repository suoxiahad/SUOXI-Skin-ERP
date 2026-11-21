import crypto from 'node:crypto';
import type {
  ConsultationDto,
  TreatmentPlanDto,
  ConsentRecordDto,
  CreateConsultationRequest,
  PatchConsultationRequest,
  CreateTreatmentPlanRequest,
  CreateConsentRequest,
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

export class ConsultationService {
  private consultations = new Map<string, ConsultationDto>();
  private treatmentPlans = new Map<string, TreatmentPlanDto>();
  private consentRecords = new Map<string, ConsentRecordDto>();
  private consultationCodeSeq = 1;
  private planCodeSeq = 1;
  private consentCodeSeq = 1;

  constructor() {
    this.seedSampleData();
  }

  private seedSampleData() {
    const sampleId = 'cns-sample-01';
    this.consultations.set(sampleId, {
      id: sampleId,
      consultationCode: 'CNS-000001',
      patientId: 'pt-sumaiya-01',
      patientCode: 'PAT-000001',
      patientName: 'Sumaiya Rahman',
      patientNameBn: 'সুমাইয়া রহমান',
      patientAge: 29,
      patientGender: 'Female',
      patientBloodGroup: 'B+',
      patientAllergies: ['Salicylic acid (mild redness)', 'Penicillin'],
      patientActiveMeds: ['Topical Clindamycin 1%'],
      lastVisitedAt: '2026-10-15T10:00:00.000Z',
      doctorId: 'usr-doc-01',
      doctorName: 'Dr. Farhana Khan',
      doctorBmdcReg: 'A-84920',
      branchId: 'br-dhanmondi',
      branchName: 'Dhanmondi Branch',
      chiefComplaint: 'Post-inflammatory hyperpigmentation on both cheeks following active acne flare.',
      assessment: 'Fitzpatrick Skin Type IV, localized epidermal hyperpigmentation, mild post-acne scarring.',
      clinicalNotes: 'Advised strict SPF 50 application and HydraFacial session with tailored antioxidant infusion.',
      recommendedServiceId: 'srv-hydrafacial-01',
      recommendedServiceName: 'HydraFacial Elite MD Rejuvenation',
      status: 'draft',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  public async getConsultation(id: string): Promise<ConsultationDto> {
    const cns = this.consultations.get(id);
    if (!cns) {
      throw new NotFoundError(`Consultation '${id}' not found`);
    }

    // Populate patient live clinical snapshot
    try {
      const patient = await patientService.getPatientById(cns.patientId);
      if (patient) {
        cns.patientCode = patient.patient_code;
        cns.patientName = patient.full_name;
        cns.patientNameBn = patient.full_name_bn || undefined;
        cns.patientGender = patient.gender;
        if (patient.date_of_birth) {
          const birthYear = new Date(patient.date_of_birth).getFullYear();
          cns.patientAge = new Date().getFullYear() - birthYear;
        }
      }
    } catch {
      // Keep existing snapshot if patient service lookup fails
    }

    // Attach treatment plans
    cns.treatmentPlans = Array.from(this.treatmentPlans.values()).filter(
      (tp) => tp.consultationId === id
    );

    // Attach consent records
    cns.consents = Array.from(this.consentRecords.values()).filter(
      (cr) => cr.consultationId === id
    );

    return { ...cns };
  }

  public async createConsultation(
    req: CreateConsultationRequest,
    user: { id: string; fullName?: string; primaryBranchId?: string }
  ): Promise<ConsultationDto> {
    if (!req.patientId) {
      throw new BadRequestError('patientId is required');
    }

    const patient = await patientService.getPatientById(req.patientId);
    if (!patient) {
      throw new NotFoundError(`Patient '${req.patientId}' not found`);
    }

    const consultationId = `cns-${crypto.randomUUID()}`;
    const code = `CNS-${String(this.consultationCodeSeq++).padStart(6, '0')}`;

    let serviceName: string | undefined;
    if (req.recommendedServiceId) {
      const srv = await catalogService.getServiceById(req.recommendedServiceId);
      if (srv) serviceName = srv.name;
    }

    let birthYear = 30;
    if (patient.date_of_birth) {
      birthYear = new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear();
    }

    const newCns: ConsultationDto = {
      id: consultationId,
      consultationCode: code,
      appointmentId: req.appointmentId || null,
      patientId: req.patientId,
      patientCode: patient.patient_code,
      patientName: patient.full_name,
      patientNameBn: patient.full_name_bn || undefined,
      patientAge: birthYear,
      patientGender: patient.gender,
      patientBloodGroup: 'B+',
      patientAllergies: ['Salicylic acid (mild redness)'],
      patientActiveMeds: ['Topical Clindamycin 1%'],
      doctorId: user.id,
      doctorName: user.fullName || 'Dr. Farhana Khan',
      doctorBmdcReg: 'A-84920',
      branchId: user.primaryBranchId || 'br-dhanmondi',
      branchName: 'Dhanmondi Branch',
      chiefComplaint: req.chiefComplaint || null,
      assessment: req.assessment || null,
      clinicalNotes: req.clinicalNotes || null,
      recommendedServiceId: req.recommendedServiceId || null,
      recommendedServiceName: serviceName,
      status: 'draft',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.consultations.set(consultationId, newCns);

    // If linked to an appointment, transition appointment status to visited
    if (req.appointmentId) {
      try {
        await appointmentService.updateAppointment(
          req.appointmentId,
          { status: 'visited', notes: 'Consultation conducted' } as any,
          { id: user.id, name: user.fullName || 'Doctor', role: 'doctor' }
        );
      } catch {
        // Continue if appointment already updated
      }
    }

    await logAudit(null, {
      actorUserId: user.id,
      action: 'CONSULTATION_CREATE',
      entityType: 'consultations',
      entityId: consultationId,
      ipAddress: '127.0.0.1',
      payloadAfter: newCns,
    });

    return newCns;
  }

  public async patchConsultation(
    id: string,
    req: PatchConsultationRequest,
    user: { id: string }
  ): Promise<ConsultationDto> {
    const cns = this.consultations.get(id);
    if (!cns) {
      throw new NotFoundError(`Consultation '${id}' not found`);
    }

    // Concurrency / lost-update protection
    if (req.version !== undefined && cns.version !== req.version) {
      throw new ConflictError(
        `Consultation version mismatch: expected ${req.version}, current is ${cns.version}. Reload before saving.`
      );
    }

    if (req.chiefComplaint !== undefined) cns.chiefComplaint = req.chiefComplaint.trim() || null;
    if (req.assessment !== undefined) cns.assessment = req.assessment.trim() || null;
    if (req.clinicalNotes !== undefined) cns.clinicalNotes = req.clinicalNotes.trim() || null;

    if (req.recommendedServiceId !== undefined) {
      cns.recommendedServiceId = req.recommendedServiceId || null;
      if (req.recommendedServiceId) {
        const srv = await catalogService.getServiceById(req.recommendedServiceId);
        cns.recommendedServiceName = srv ? srv.name : undefined;
      } else {
        cns.recommendedServiceName = undefined;
      }
    }

    if (req.status !== undefined) {
      cns.status = req.status;
      if (req.status === 'completed' && !cns.completedAt) {
        cns.completedAt = new Date().toISOString();
      }
    }

    cns.version = cns.version + 1;
    cns.updatedAt = new Date().toISOString();
    this.consultations.set(id, cns);

    await logAudit(null, {
      actorUserId: user.id,
      action: 'CONSULTATION_PATCH',
      entityType: 'consultations',
      entityId: id,
      ipAddress: '127.0.0.1',
      payloadAfter: cns,
    });

    return { ...cns };
  }

  public async createTreatmentPlan(
    consultationId: string,
    req: CreateTreatmentPlanRequest,
    user: { id: string; fullName?: string }
  ): Promise<TreatmentPlanDto> {
    const cns = this.consultations.get(consultationId);
    if (!cns) {
      throw new NotFoundError(`Consultation '${consultationId}' not found`);
    }

    const srv = await catalogService.getServiceById(req.serviceId);
    if (!srv) {
      throw new NotFoundError(`Treatment service '${req.serviceId}' not found`);
    }

    const planId = `pln-${crypto.randomUUID()}`;
    const planCode = `PLN-${String(this.planCodeSeq++).padStart(6, '0')}`;

    const plan: TreatmentPlanDto = {
      id: planId,
      planCode,
      consultationId,
      patientId: cns.patientId,
      serviceId: req.serviceId,
      serviceName: srv.name,
      doctorId: user.id,
      doctorName: user.fullName || cns.doctorName,
      plannedSessions: req.plannedSessions || 1,
      completedSessions: 0,
      startDate: req.startDate || new Date().toISOString().slice(0, 10),
      expectedEndDate: req.expectedEndDate || null,
      notes: req.notes || null,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.treatmentPlans.set(planId, plan);

    await logAudit(null, {
      actorUserId: user.id,
      action: 'TREATMENT_PLAN_CREATE',
      entityType: 'treatment_plans',
      entityId: planId,
      ipAddress: '127.0.0.1',
      payloadAfter: plan,
    });

    return plan;
  }

  public async createConsentRecord(
    consultationId: string,
    req: CreateConsentRequest,
    user: { id: string; fullName?: string }
  ): Promise<ConsentRecordDto> {
    const cns = this.consultations.get(consultationId);
    if (!cns) {
      throw new NotFoundError(`Consultation '${consultationId}' not found`);
    }

    const consentId = `cr-${crypto.randomUUID()}`;
    const consentCode = `CNSNT-${String(this.consentCodeSeq++).padStart(6, '0')}`;

    const consent: ConsentRecordDto = {
      id: consentId,
      consentCode,
      consultationId,
      patientId: cns.patientId,
      serviceId: req.serviceId,
      doctorId: user.id,
      doctorName: user.fullName || cns.doctorName,
      consentType: req.consentType,
      consentText: req.consentText,
      consentTextBn: req.consentTextBn || null,
      isSigned: Boolean(req.isSigned),
      signedAt: req.isSigned ? new Date().toISOString() : null,
      witnessName: req.witnessName || null,
      fileId: req.fileId || null,
      createdAt: new Date().toISOString(),
    };

    this.consentRecords.set(consentId, consent);

    await logAudit(null, {
      actorUserId: user.id,
      action: 'CONSENT_RECORD_CREATE',
      entityType: 'consent_records',
      entityId: consentId,
      ipAddress: '127.0.0.1',
      payloadAfter: consent,
    });

    return consent;
  }

  public resetData() {
    this.consultations.clear();
    this.treatmentPlans.clear();
    this.consentRecords.clear();
    this.consultationCodeSeq = 1;
    this.planCodeSeq = 1;
    this.consentCodeSeq = 1;
    this.seedSampleData();
  }
}

export const consultationService = new ConsultationService();
