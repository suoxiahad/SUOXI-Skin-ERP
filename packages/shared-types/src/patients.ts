export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-';
export type AcquisitionSource = 'call' | 'walk_in' | 'referral' | 'social_media' | 'other';
export type PatientStatus = 'active' | 'inactive' | 'merged';

export interface PatientDto {
  id: string;
  patientCode: string;
  branchId: string;
  fullName: string;
  fullNameBn?: string;
  gender: Gender;
  dateOfBirth?: string;
  approximateAge?: number;
  bloodGroup?: BloodGroup;
  primaryMobile: string;
  secondaryMobile?: string;
  email?: string;
  address?: string;
  area?: string;
  city: string;
  district: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  preferredLanguage: 'bn' | 'en';
  acquisitionSource: AcquisitionSource;
  referrerId?: string;
  status: PatientStatus;
  mergedIntoPatientId?: string;
  lastVisit?: string;
  dueAmount?: number;
  consentSmsNotifications?: boolean;
  consentEmailNotifications?: boolean;
  consentMarketing?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Restricted DTO for Call Center agents.
 * Strict privacy: omits address, district, emergency contacts, medical history, and billing.
 */
export interface RestrictedCallCenterPatientDto {
  id: string;
  patientCode: string;
  branchId: string;
  fullName: string;
  fullNameBn?: string;
  gender: Gender;
  approximateAge?: number;
  primaryMobile: string;
  preferredLanguage: 'bn' | 'en';
  status: PatientStatus;
  lastVisit?: string;
}

export interface CreatePatientRequest {
  fullName: string;
  fullNameBn?: string;
  gender: Gender;
  dateOfBirth?: string;
  approximateAge?: number;
  bloodGroup?: BloodGroup;
  primaryMobile: string;
  secondaryMobile?: string;
  email?: string;
  address?: string;
  area?: string;
  city?: string;
  district?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  preferredLanguage?: 'bn' | 'en';
  acquisitionSource?: AcquisitionSource;
  referrerId?: string;
  proceedWithDuplicate?: boolean;
  consentSmsNotifications?: boolean;
  consentEmailNotifications?: boolean;
  consentMarketing?: boolean;
}


export interface UpdatePatientRequest extends Partial<CreatePatientRequest> {
  status?: PatientStatus;
}

export interface PatientDuplicateCheckResult {
  hasDuplicate: boolean;
  match?: {
    id: string;
    patientCode: string;
    fullName: string;
    fullNameBn?: string;
    primaryMobile: string;
    city?: string;
    area?: string;
  };
}

export interface PatientDuplicateCandidateDto {
  id: string;
  primaryPatientId: string;
  duplicatePatientId: string;
  primaryPatient: PatientDto | RestrictedCallCenterPatientDto;
  duplicatePatient: PatientDto | RestrictedCallCenterPatientDto;
  matchConfidence: 'high' | 'medium' | 'low';
  matchReasons: string[];
  status: 'pending' | 'not_duplicate' | 'confirmed_duplicate' | 'merged';
  detectedDuring: string;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNotes?: string;
  createdAt: string;
}

export interface PatientMedicalHistoryDto {
  patientId: string;
  allergies?: string;
  skinType?: string;
  currentMedications?: string;
  chronicConditions?: string;
  pastAestheticProcedures?: string;
  contraindications?: string;
  updatedAt: string;
}

export type MedicalEntryCategory =
  | 'allergy'
  | 'chronic_condition'
  | 'current_medication'
  | 'past_surgery'
  | 'family_history'
  | 'skin_history'
  | 'lifestyle'
  | 'pregnancy'
  | 'other';

export type MedicalEntrySeverity = 'mild' | 'moderate' | 'severe' | 'life_threatening';

export interface PatientMedicalEntryDto {
  id: string;
  patientId: string;
  category: MedicalEntryCategory;
  title: string;
  details?: string | null;
  severity?: MedicalEntrySeverity | null;
  onsetDate?: string | null;
  isActive: boolean;
  createdBy: string;
  creatorName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMedicalEntryRequest {
  category: MedicalEntryCategory;
  title: string;
  details?: string;
  severity?: MedicalEntrySeverity;
  onsetDate?: string;
  isActive?: boolean;
}

export type PatientNoteType =
  | 'general'
  | 'clinical'
  | 'clinical_alert'
  | 'front_desk'
  | 'call_center'
  | 'billing'
  | 'administrative';

export interface PatientNoteDto {
  id: string;
  patientId: string;
  authorId: string;
  authorName?: string;
  authorRole?: string;
  noteType: PatientNoteType;
  noteText: string;
  isPinned: boolean;
  createdAt: string;
}

export interface CreatePatientNoteRequest {
  noteType: PatientNoteType;
  noteText: string;
  isPinned?: boolean;
}

export interface PatientTimelineItemDto {
  id: string;
  patientId: string;
  eventType: string;
  eventAt: string;
  summary: string;
  refType: string;
  refId: string;
}

export interface PatientNextSessionInfo {
  sessionDate: string;
  timeSlot: string;
  doctorName: string;
  treatmentName: string;
  status: 'CONFIRMED' | 'BOOKED' | 'CHECKED_IN';
}

export interface PatientPackageBalanceInfo {
  packageName: string;
  sessionsLeft: number;
  totalSessions: number;
  expiresAt: string;
}

export interface PatientProfileDto extends PatientDto {
  nextSession?: PatientNextSessionInfo | null;
  packageBalance?: PatientPackageBalanceInfo | null;
  activeTreatmentPlan?: string | null;
  portalAccount?: {
    status: 'NOT_CREATED' | 'ACTIVE' | 'INVITED' | 'DEACTIVATED';
    loginId?: string;
  };
}
