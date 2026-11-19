/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * Private VPS Local Disk Storage Engine
 *
 * Stores Patient Photos (Before/After), Clinical Documents & Prescription Attachments
 * strictly inside `UPLOAD_DIR` (e.g. /var/data/suoxi/uploads on VPS — outside Git & webroot).
 *
 * Security Guarantees:
 *  - Strict MIME + extension allowlist (PNG, JPG, WEBP, PDF)
 *  - Max file size enforcement (15 MB)
 *  - Strict path traversal protection (`path.resolve` confined to `UPLOAD_DIR`)
 *  - Atomic write & authenticated streaming only (never served as public static files)
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB

const ALLOWED_MIME_MAP: Record<string, { ext: string; format: 'PNG' | 'JPG' | 'PDF' }> = {
  'image/png': { ext: 'png', format: 'PNG' },
  'image/jpeg': { ext: 'jpg', format: 'JPG' },
  'image/jpg': { ext: 'jpg', format: 'JPG' },
  'image/webp': { ext: 'webp', format: 'PNG' },
  'application/pdf': { ext: 'pdf', format: 'PDF' },
};

export type UploadFolderCategory =
  | 'clinical_photos'
  | 'consent_forms'
  | 'lab_reports'
  | 'prescriptions'
  | 'general';

export function getUploadRootDir(): string {
  const configured = (process.env.UPLOAD_DIR || '').trim();
  const root = configured ? path.resolve(configured) : path.resolve(process.cwd(), 'storage', 'uploads');
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true, mode: 0o750 });
  }
  return root;
}

export function mapCategoryToFolder(categoryOrType?: string): UploadFolderCategory {
  const norm = (categoryOrType || '').toLowerCase();
  if (norm.includes('photo') || norm.includes('before') || norm.includes('after')) return 'clinical_photos';
  if (norm.includes('consent')) return 'consent_forms';
  if (norm.includes('lab') || norm.includes('biopsy') || norm.includes('patch')) return 'lab_reports';
  if (norm.includes('prescription') || norm.includes('rx')) return 'prescriptions';
  return 'general';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export interface StoredFileMeta {
  storagePath: string; // Relative to UPLOAD_DIR, e.g. clinical_photos/2026-11/uuid.png
  absolutePath: string;
  mimeType: string;
  fileFormat: 'PNG' | 'JPG' | 'PDF';
  sizeBytes: number;
  fileSizeLabel: string;
  sha256: string;
}

/**
 * Validates file buffer, writes atomically into `<UPLOAD_DIR>/<folder>/<YYYY-MM>/<uuid>.<ext>`.
 */
export async function savePrivateFileBuffer(params: {
  buffer: Buffer;
  mimeType: string;
  categoryOrType?: string;
}): Promise<StoredFileMeta> {
  const mime = params.mimeType.toLowerCase().trim();
  const rule = ALLOWED_MIME_MAP[mime];
  if (!rule) {
    const err = new Error(
      `Unsupported file type '${mime}'. Only PNG, JPG, WEBP, and PDF files are permitted.`
    ) as Error & { statusCode?: number; code?: string };
    err.statusCode = 400;
    err.code = 'UNSUPPORTED_MEDIA_TYPE';
    throw err;
  }

  if (params.buffer.length === 0) {
    const err = new Error('Uploaded file is empty') as Error & { statusCode?: number; code?: string };
    err.statusCode = 400;
    err.code = 'EMPTY_FILE';
    throw err;
  }

  if (params.buffer.length > MAX_UPLOAD_BYTES) {
    const err = new Error('File exceeds maximum allowed size of 15 MB') as Error & {
      statusCode?: number;
      code?: string;
    };
    err.statusCode = 413;
    err.code = 'FILE_TOO_LARGE';
    throw err;
  }

  const root = getUploadRootDir();
  const folder = mapCategoryToFolder(params.categoryOrType);
  const ym = new Date().toISOString().slice(0, 7); // YYYY-MM
  const fileName = `${crypto.randomUUID()}.${rule.ext}`;

  const relDir = path.join(folder, ym);
  const absDir = path.resolve(root, relDir);
  if (!absDir.startsWith(root)) {
    throw new Error('Invalid upload target directory');
  }

  await fs.promises.mkdir(absDir, { recursive: true, mode: 0o750 });

  const relPath = path.posix.join(folder, ym, fileName);
  const absPath = path.resolve(root, relDir, fileName);
  const tmpPath = `${absPath}.tmp`;

  await fs.promises.writeFile(tmpPath, params.buffer, { mode: 0o640 });
  await fs.promises.rename(tmpPath, absPath);

  const sha256 = crypto.createHash('sha256').update(params.buffer).digest('hex');

  return {
    storagePath: relPath,
    absolutePath: absPath,
    mimeType: mime,
    fileFormat: rule.format,
    sizeBytes: params.buffer.length,
    fileSizeLabel: formatFileSize(params.buffer.length),
    sha256,
  };
}

/**
 * Decodes a `data:<mime>;base64,<data>` URI and stores it in private VPS storage.
 */
export async function savePrivateDataUrl(
  dataUrl: string,
  categoryOrType?: string
): Promise<StoredFileMeta> {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!match) {
    const err = new Error('Invalid base64 data URL') as Error & { statusCode?: number; code?: string };
    err.statusCode = 400;
    err.code = 'INVALID_DATA_URL';
    throw err;
  }
  const mimeType = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  return savePrivateFileBuffer({ buffer, mimeType, categoryOrType });
}

/**
 * Resolves a stored relative path safely inside UPLOAD_DIR (blocks `../` traversal).
 */
export function resolveSafePrivateFilePath(storagePath: string): {
  absolutePath: string;
  mimeType: string;
} | null {
  if (!storagePath || storagePath.includes('\0')) return null;
  const root = getUploadRootDir();
  const normalizedRel = storagePath.replace(/^\/+/, '');
  const resolved = path.resolve(root, normalizedRel);

  // Must strictly stay inside root
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    return null;
  }

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    return null;
  }

  const ext = path.extname(resolved).toLowerCase();
  const mimeType =
    ext === '.pdf'
      ? 'application/pdf'
      : ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : ext === '.webp'
      ? 'image/webp'
      : 'image/png';

  return { absolutePath: resolved, mimeType };
}

export function getPrivateStorageHealth(): {
  ok: boolean;
  uploadDir: string;
  writable: boolean;
} {
  try {
    const uploadDir = getUploadRootDir();
    fs.accessSync(uploadDir, fs.constants.W_OK | fs.constants.R_OK);
    return { ok: true, uploadDir, writable: true };
  } catch {
    return { ok: false, uploadDir: process.env.UPLOAD_DIR || 'storage/uploads', writable: false };
  }
}
