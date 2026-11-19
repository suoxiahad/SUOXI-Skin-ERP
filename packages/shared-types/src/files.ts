export type FileCategory =
  | 'lab_report'
  | 'imaging'
  | 'referral_letter'
  | 'id_proof'
  | 'before_photo'
  | 'after_photo'
  | 'progress_photo'
  | 'general';

export interface FileRecordDto {
  id: string;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  sha256Checksum: string;
  uploadedBy: string;
  createdAt: string;
}

export interface PatientFileDto {
  id: string;
  patientId: string;
  fileId: string;
  fileCategory: FileCategory;
  title: string;
  isVisibleToPatient: boolean;
  takenAt?: string | null;
  uploadedBy: string;
  uploaderName?: string;
  createdAt: string;
  file: FileRecordDto;
  signedAccessUrl?: string;
}

export interface FileUploadResponse {
  file: FileRecordDto;
  patientFile?: PatientFileDto;
}

export interface FileAccessUrlResponse {
  fileId: string;
  signedUrl: string;
  expiresAt: string;
  expiresInSeconds: number;
}
