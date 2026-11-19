import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync, mkdirSync } from 'node:fs';
import { getConfig } from '../config/env.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../middleware/errorHandler.js';
import type {
  FileRecordDto,
  PatientFileDto,
  FileCategory,
  FileAccessUrlResponse,
} from '@suoxi/shared-types';

export const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.heic']);
export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

export interface StorageDriver {
  save(storageKey: string, buffer: Buffer): Promise<void>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
}

export class LocalStorageDriver implements StorageDriver {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.resolve(process.cwd(), 'storage/uploads');
    if (!existsSync(this.baseDir)) {
      mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async save(storageKey: string, buffer: Buffer): Promise<void> {
    const safeKey = path.basename(storageKey);
    const targetPath = path.join(this.baseDir, safeKey);
    await fs.writeFile(targetPath, buffer);
  }

  async read(storageKey: string): Promise<Buffer> {
    const safeKey = path.basename(storageKey);
    const targetPath = path.join(this.baseDir, safeKey);
    try {
      return await fs.readFile(targetPath);
    } catch {
      throw new NotFoundError('Underlying file storage object not found');
    }
  }

  async delete(storageKey: string): Promise<void> {
    const safeKey = path.basename(storageKey);
    const targetPath = path.join(this.baseDir, safeKey);
    try {
      await fs.unlink(targetPath);
    } catch {
      // Ignore if already deleted
    }
  }
}

/**
 * Validates file magic bytes (real binary signature).
 * Rejects executables (e.g. .exe starting with 'MZ' / 0x4D 0x5A) renamed to .jpg.
 */
export function detectMagicMime(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;

  // PDF: %PDF- (0x25 0x50 0x44 0x46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // JPEG / JPG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // WEBP: RIFF....WEBP (0x52 0x49 0x46 0x46 ... 0x57 0x45 0x42 0x50)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  // HEIC / HEIF: ftypheic or ftypmif1 at offset 4
  if (buffer.length >= 12) {
    const ftyp = buffer.toString('ascii', 4, 12);
    if (ftyp.includes('heic') || ftyp.includes('mif1')) {
      return 'image/heic';
    }
  }

  return null;
}

export interface FileRecord {
  id: string;
  storage_key: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  sha256_checksum: string;
  uploaded_by: string;
  created_at: string;
}

export interface PatientFileRecord {
  id: string;
  patient_id: string;
  file_id: string;
  file_category: FileCategory;
  title: string;
  is_visible_to_patient: boolean;
  taken_at?: string | null;
  uploaded_by: string;
  created_at: string;
  deleted_at?: string | null;
}

export class FileService {
  private files = new Map<string, FileRecord>();
  private patientFiles = new Map<string, PatientFileRecord>();
  private storage: StorageDriver;
  private signingSecret: string;

  constructor(storageDriver?: StorageDriver) {
    this.storage = storageDriver || new LocalStorageDriver();
    const config = getConfig();
    this.signingSecret = config.JWT_SECRET || 'suoxi_file_signing_secret_key_default';
  }

  setStorageDriver(driver: StorageDriver): void {
    this.storage = driver;
  }

  /**
   * Validates and persists an uploaded file.
   */
  async processUpload(
    buffer: Buffer,
    originalFilename: string,
    uploadedBy: string
  ): Promise<FileRecord> {
    // 1. Enforce size limits
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestError(
        `File exceeds maximum permitted size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`
      );
    }
    if (buffer.length === 0) {
      throw new BadRequestError('Empty file buffer provided');
    }

    // 2. Extension validation
    const ext = path.extname(originalFilename).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new BadRequestError(
        `Disallowed file extension '${ext}'. Allowed: .pdf, .jpg, .png, .webp, .heic`
      );
    }

    // 3. Magic-byte MIME validation (Anti-Tampering)
    const detectedMime = detectMagicMime(buffer);
    if (!detectedMime) {
      throw new BadRequestError(
        'Invalid or corrupted file content. Binary signature does not match allowed MIME types'
      );
    }

    // Reject .exe disguised as image (e.g. MZ header)
    if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
      throw new BadRequestError('Executable binary detected. Upload rejected.');
    }

    // 4. Compute SHA-256 Checksum
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // 5. Generate random storage key (never use user-supplied filename)
    const randomKey = `${crypto.randomUUID()}${ext}`;

    // 6. Persist to storage driver
    await this.storage.save(randomKey, buffer);

    // 7. Store metadata record
    const id = `file_${crypto.randomUUID()}`;
    const record: FileRecord = {
      id,
      storage_key: randomKey,
      original_filename: path.basename(originalFilename),
      mime_type: detectedMime,
      size_bytes: buffer.length,
      sha256_checksum: sha256,
      uploaded_by: uploadedBy,
      created_at: new Date().toISOString(),
    };

    this.files.set(id, record);
    return record;
  }

  /**
   * Attaches an uploaded file to a patient.
   */
  attachToPatient(params: {
    patientId: string;
    fileId: string;
    fileCategory: FileCategory;
    title: string;
    isVisibleToPatient?: boolean;
    takenAt?: string | null;
    uploadedBy: string;
  }): PatientFileRecord {
    const file = this.files.get(params.fileId);
    if (!file) {
      throw new NotFoundError('Referenced file record not found');
    }

    const id = `pf_${crypto.randomUUID()}`;
    const record: PatientFileRecord = {
      id,
      patient_id: params.patientId,
      file_id: params.fileId,
      file_category: params.fileCategory,
      title: params.title || file.original_filename,
      is_visible_to_patient: params.isVisibleToPatient ?? false,
      taken_at: params.takenAt || null,
      uploaded_by: params.uploadedBy,
      created_at: new Date().toISOString(),
      deleted_at: null,
    };

    this.patientFiles.set(id, record);
    return record;
  }

  /**
   * Retrieves files attached to a patient.
   */
  getPatientFiles(patientId: string, filterVisibleOnly = false): PatientFileDto[] {
    const results: PatientFileDto[] = [];

    for (const pf of this.patientFiles.values()) {
      if (pf.patient_id === patientId && !pf.deleted_at) {
        if (filterVisibleOnly && !pf.is_visible_to_patient) {
          continue;
        }

        const file = this.files.get(pf.file_id);
        if (file) {
          results.push({
            id: pf.id,
            patientId: pf.patient_id,
            fileId: pf.file_id,
            fileCategory: pf.file_category,
            title: pf.title,
            isVisibleToPatient: pf.is_visible_to_patient,
            takenAt: pf.taken_at,
            uploadedBy: pf.uploaded_by,
            createdAt: pf.created_at,
            file: {
              id: file.id,
              storageKey: file.storage_key,
              originalFilename: file.original_filename,
              mimeType: file.mime_type,
              sizeBytes: file.size_bytes,
              sha256Checksum: file.sha256_checksum,
              uploadedBy: file.uploaded_by,
              createdAt: file.created_at,
            },
          });
        }
      }
    }

    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * Generates a short-lived (<= 5 min) HMAC-SHA256 signed access URL.
   */
  generateSignedAccessUrl(
    fileId: string,
    patientId: string,
    userId: string,
    expiresInSeconds = 300 // 5 minutes max
  ): FileAccessUrlResponse {
    const file = this.files.get(fileId);
    if (!file) {
      throw new NotFoundError('File not found');
    }

    const effectiveExpirySec = Math.min(expiresInSeconds, 300);
    const expiresAt = Date.now() + effectiveExpirySec * 1000;

    const payload = JSON.stringify({
      fid: fileId,
      pid: patientId,
      uid: userId,
      exp: expiresAt,
    });

    const b64Payload = Buffer.from(payload).toString('base64url');
    const signature = crypto
      .createHmac('sha256', this.signingSecret)
      .update(b64Payload)
      .digest('hex');

    const token = `${b64Payload}.${signature}`;
    const signedUrl = `/api/v1/files/download?token=${token}`;

    return {
      fileId,
      signedUrl,
      expiresAt: new Date(expiresAt).toISOString(),
      expiresInSeconds: effectiveExpirySec,
    };
  }

  /**
   * Verifies signed download token and returns the file buffer with metadata.
   */
  async verifyAndReadFile(
    token: string,
    requestingPatientId?: string
  ): Promise<{ file: FileRecord; buffer: Buffer }> {
    if (!token || !token.includes('.')) {
      throw new ForbiddenError('Malformed or missing access token');
    }

    const [b64Payload, signature] = token.split('.');
    if (!b64Payload || !signature) {
      throw new ForbiddenError('Invalid token segments');
    }

    // Verify HMAC
    const expectedSig = crypto
      .createHmac('sha256', this.signingSecret)
      .update(b64Payload)
      .digest('hex');

    const expectedBuf = Buffer.from(expectedSig);
    const actualBuf = Buffer.from(signature);

    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      throw new ForbiddenError('Invalid token signature. Download access denied.');
    }

    // Decode and parse payload
    let payload: { fid: string; pid: string; uid: string; exp: number };
    try {
      payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
    } catch {
      throw new ForbiddenError('Invalid token payload encoding');
    }

    // Check expiry
    if (Date.now() > payload.exp) {
      throw new ForbiddenError('Signed access URL has expired');
    }

    // If restricted to a specific patient, check ownership
    if (requestingPatientId && payload.pid !== requestingPatientId) {
      throw new ForbiddenError('Access to another patient’s file is forbidden');
    }

    const file = this.files.get(payload.fid);
    if (!file) {
      throw new NotFoundError('File record not found');
    }

    const buffer = await this.storage.read(file.storage_key);
    return { file, buffer };
  }

  getFileById(id: string): FileRecord | null {
    return this.files.get(id) || null;
  }

  reset(): void {
    this.files.clear();
    this.patientFiles.clear();
  }
}

export const fileService = new FileService();
