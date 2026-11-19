export type TreatmentSessionStatus =
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'missed';

export type TreatmentPhotoType = 'before' | 'after' | 'progress';

export interface TreatmentPhotoDto {
  id: string;
  sessionId: string;
  patientId: string;
  fileId: string;
  photoType: TreatmentPhotoType;
  bodySite?: string | null;
  takenAt: string;
  takenBy: string;
  takenByName?: string;
  isVisibleToPatient: boolean;
  clinicalNotes?: string | null;
  createdAt: string;
  signedUrl?: string;
}

export interface SessionConsumableDto {
  id: string;
  sessionId: string;
  productId?: string | null;
  productName: string;
  batchNumber?: string | null;
  quantity: number;
  unit: string;
  notes?: string | null;
  createdAt: string;
}

export interface TreatmentSessionDto {
  id: string;
  sessionCode: string;
  patientId: string;
  patientName?: string;
  patientCode?: string;
  planId?: string | null;
  planCode?: string | null;
  serviceId: string;
  serviceName?: string;
  serviceNameBn?: string;
  appointmentId: string;
  appointmentCode?: string;
  doctorId: string;
  doctorName?: string;
  therapistId?: string | null;
  therapistName?: string | null;
  branchId: string;
  branchName?: string;
  resourceId?: string | null;
  resourceName?: string | null;
  sessionNo: number;
  totalSessions: number;
  status: TreatmentSessionStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  completedBy?: string | null;
  completedByName?: string | null;
  outcomeNotes?: string | null;
  treatmentNotes?: string | null;
  aftercareInstructions?: string | null;
  publishAftercareToPortal: boolean;
  packageId?: string | null;
  packageCode?: string | null;
  packageSessionDeducted: boolean;
  nextSessionAppointmentId?: string | null;
  nextSessionAppointmentCode?: string | null;
  nextSessionDate?: string | null;
  nextSessionStartTime?: string | null;
  photos?: TreatmentPhotoDto[];
  consumables?: SessionConsumableDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTreatmentSessionInput {
  patientId: string;
  appointmentId: string;
  serviceId: string;
  doctorId: string;
  branchId: string;
  planId?: string | null;
  therapistId?: string | null;
  resourceId?: string | null;
  sessionNo?: number;
  totalSessions?: number;
  treatmentNotes?: string | null;
  packageId?: string | null;
}

export interface UpdateTreatmentSessionInput {
  therapistId?: string | null;
  resourceId?: string | null;
  treatmentNotes?: string | null;
  outcomeNotes?: string | null;
  aftercareInstructions?: string | null;
  publishAftercareToPortal?: boolean;
}

export interface CompleteSessionInput {
  outcomeNotes?: string | null;
  treatmentNotes?: string | null;
  aftercareInstructions?: string | null;
  publishAftercareToPortal?: boolean;
}

export interface AddSessionPhotoInput {
  photoType: TreatmentPhotoType;
  bodySite?: string | null;
  takenAt?: string;
  isVisibleToPatient?: boolean;
  clinicalNotes?: string | null;
  fileBuffer?: string; // Base64 buffer when uploaded via API
  filename?: string;
  mimeType?: string;
}

export interface AddSessionConsumableInput {
  productId?: string | null;
  productName: string;
  batchNumber?: string | null;
  quantity: number;
  unit?: string;
  notes?: string | null;
}

export interface SetNextSessionInput {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  durationMinutes?: number;
  doctorId?: string;
  resourceId?: string | null;
  notes?: string;
  patientInstructions?: string;
}

export interface UpdateNextSessionInput {
  date?: string;
  startTime?: string;
  durationMinutes?: number;
  notes?: string;
  reason: string; // Mandatory reason for schedule override
}
