export type ConsultationStatus = 'draft' | 'completed';
export type TreatmentPlanStatus = 'draft' | 'active' | 'completed' | 'cancelled';
export type ConsentType = 'treatment' | 'procedure' | 'photography' | 'general';

export interface TreatmentPlanDto {
  id: string;
  planCode: string;
  consultationId?: string | null;
  patientId: string;
  serviceId: string;
  serviceName?: string;
  doctorId: string;
  doctorName?: string;
  plannedSessions: number;
  completedSessions: number;
  startDate: string;
  expectedEndDate?: string | null;
  notes?: string | null;
  status: TreatmentPlanStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ConsentRecordDto {
  id: string;
  consentCode: string;
  patientId: string;
  consultationId?: string | null;
  serviceId: string;
  serviceName?: string;
  doctorId: string;
  doctorName?: string;
  consentType: ConsentType;
  consentText: string;
  consentTextBn?: string | null;
  isSigned: boolean;
  signedAt?: string | null;
  witnessName?: string | null;
  fileId?: string | null;
  createdAt: string;
}

export interface ConsultationDto {
  id: string;
  consultationCode: string;
  appointmentId?: string | null;
  patientId: string;
  patientCode?: string;
  patientName?: string;
  patientNameBn?: string;
  patientAge?: number;
  patientGender?: string;
  patientBloodGroup?: string;
  patientAllergies?: string[];
  patientActiveMeds?: string[];
  lastVisitedAt?: string | null;
  doctorId: string;
  doctorName?: string;
  doctorBmdcReg?: string;
  branchId: string;
  branchName?: string;
  chiefComplaint?: string | null;
  assessment?: string | null;
  clinicalNotes?: string | null;
  recommendedServiceId?: string | null;
  recommendedServiceName?: string | null;
  status: ConsultationStatus;
  version: number;
  completedAt?: string | null;
  treatmentPlans?: TreatmentPlanDto[];
  prescriptions?: string[]; // IDs
  consents?: ConsentRecordDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateConsultationRequest {
  appointmentId?: string;
  patientId: string;
  chiefComplaint?: string;
  assessment?: string;
  clinicalNotes?: string;
  recommendedServiceId?: string;
}

export interface PatchConsultationRequest {
  version: number;
  chiefComplaint?: string;
  assessment?: string;
  clinicalNotes?: string;
  recommendedServiceId?: string;
  status?: ConsultationStatus;
}

export interface CreateTreatmentPlanRequest {
  serviceId: string;
  plannedSessions: number;
  startDate: string;
  expectedEndDate?: string;
  notes?: string;
}

export interface CreateConsentRequest {
  serviceId: string;
  consentType: ConsentType;
  consentText: string;
  consentTextBn?: string;
  isSigned?: boolean;
  witnessName?: string;
  fileId?: string;
}
