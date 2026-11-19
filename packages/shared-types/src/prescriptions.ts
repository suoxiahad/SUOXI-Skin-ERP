export type PrescriptionStatus = 'draft' | 'finalized' | 'superseded' | 'void';
export type PrescriptionLanguage = 'en' | 'bn' | 'both';

export interface PrescriptionItemDto {
  id: string;
  prescriptionId: string;
  itemName: string;
  itemNameBn?: string | null;
  inventoryProductId?: string | null;
  strength?: string | null;
  dosage?: string | null;
  frequency?: string | null;
  frequencyBn?: string | null;
  duration?: string | null;
  route?: string | null;
  instructions?: string | null;
  instructionsBn?: string | null;
  sortOrder: number;
}

export interface PrescriptionGuidanceSnapshotItemDto {
  id: string;
  snapshotId: string;
  section:
    | 'recommended_foods'
    | 'foods_to_avoid'
    | 'lifestyle_habits'
    | 'skincare_routine'
    | 'general_advice'
    | 'lifestyle_do'
    | 'lifestyle_avoid';
  contentEn?: string | null;
  contentBn?: string | null;
  sortOrder: number;
}

export interface PrescriptionGuidanceSnapshotDto {
  id: string;
  prescriptionId: string;
  sourceGuidanceId: string;
  serviceId: string;
  versionNumber: number;
  title: string;
  titleBn?: string | null;
  approvedByDoctorName: string;
  approvedByBmdcReg?: string | null;
  approvedAt: string;
  snapshotAt: string;
  items: PrescriptionGuidanceSnapshotItemDto[];
}

export interface PrescriptionDto {
  id: string;
  prescriptionCode: string;
  consultationId?: string | null;
  patientId: string;
  patientCode?: string;
  patientName?: string;
  patientNameBn?: string;
  patientAge?: number;
  patientGender?: string;
  patientMobile?: string;
  doctorId: string;
  doctorName?: string;
  doctorNameBn?: string;
  doctorBmdcReg?: string;
  doctorDesignation?: string;
  branchId: string;
  branchName?: string;
  previousVersionId?: string | null;
  versionNumber: number;
  diagnosis: string;
  advice?: string | null;
  followupAdvice?: string | null;
  nextSessionDate?: string | null;
  language: PrescriptionLanguage;
  suggestFood: boolean;
  serviceId?: string | null;
  serviceName?: string | null;
  guidanceId?: string | null;
  status: PrescriptionStatus;
  voidReason?: string | null;
  supersededReason?: string | null;
  finalizedAt?: string | null;
  finalizedBy?: string | null;
  finalizedByName?: string | null;
  publishedToPortal: boolean;
  pdfFileId?: string | null;
  pdfSha256?: string | null;
  pdfUrl?: string | null;
  items: PrescriptionItemDto[];
  guidanceSnapshot?: PrescriptionGuidanceSnapshotDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePrescriptionItemInput {
  itemName: string;
  itemNameBn?: string;
  inventoryProductId?: string;
  strength?: string;
  dosage?: string;
  frequency?: string;
  frequencyBn?: string;
  duration?: string;
  route?: string;
  instructions?: string;
  instructionsBn?: string;
  sortOrder?: number;
}

export interface CreatePrescriptionRequest {
  consultationId?: string;
  patientId: string;
  serviceId?: string;
  diagnosis: string;
  advice?: string;
  followupAdvice?: string;
  nextSessionDate?: string;
  language?: PrescriptionLanguage;
  suggestFood?: boolean;
  items?: CreatePrescriptionItemInput[];
}

export interface PatchPrescriptionRequest {
  diagnosis?: string;
  advice?: string;
  followupAdvice?: string;
  nextSessionDate?: string;
  language?: PrescriptionLanguage;
  suggestFood?: boolean;
  serviceId?: string;
  items?: CreatePrescriptionItemInput[];
}

export interface CorrectPrescriptionRequest {
  reason: string;
}

export interface VoidPrescriptionRequest {
  reason: string;
}

export interface PublishPrescriptionRequest {
  publish: boolean;
}
