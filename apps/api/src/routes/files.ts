import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth.js';
import { requirePermission } from '../middleware/requirePermission.js';
import { BadRequestError, NotFoundError, ForbiddenError } from '../middleware/errorHandler.js';
import { fileService } from '../services/fileService.js';
import { patientRepository } from '../services/patientService.js';
import type { ApiResponse, FileRecordDto, FileAccessUrlResponse } from '@suoxi/shared-types';

export const filesRouter = Router();

const uploadFileSchema = z.object({
  filename: z.string().min(1, 'Filename is required').max(255),
  contentBase64: z.string().min(1, 'File content (base64) is required'),
  patientId: z.string().optional(),
  fileCategory: z
    .enum([
      'lab_report',
      'imaging',
      'referral_letter',
      'id_proof',
      'before_photo',
      'after_photo',
      'progress_photo',
      'general',
    ])
    .optional(),
  title: z.string().max(150).optional(),
  isVisibleToPatient: z.boolean().optional(),
  takenAt: z.string().optional().nullable(),
});

// -----------------------------------------------------------------------------
// 1. POST /files (Upload file asset with extension + magic-byte MIME validation)
// -----------------------------------------------------------------------------
filesRouter.post(
  '/',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = uploadFileSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid file upload payload', parsed.error.format());
      }

      const {
        filename,
        contentBase64,
        patientId,
        fileCategory = 'general',
        title,
        isVisibleToPatient,
        takenAt,
      } = parsed.data;

      // Decode Base64 buffer
      const buffer = Buffer.from(contentBase64, 'base64');
      const uploaderId = req.session?.staffUserId || 'usr_system';

      // Enforce extension, magic-byte MIME validation, and size limit
      const fileRecord = await fileService.processUpload(buffer, filename, uploaderId);

      let patientFile = undefined;
      if (patientId) {
        const patient = await patientRepository.findById(patientId);
        if (!patient) {
          throw new NotFoundError('Target patient record not found');
        }

        const pf = fileService.attachToPatient({
          patientId,
          fileId: fileRecord.id,
          fileCategory,
          title: title || filename,
          isVisibleToPatient,
          takenAt,
          uploadedBy: uploaderId,
        });

        patientFile = pf;
      }

      const response: ApiResponse<{
        file: FileRecordDto;
        patientFile?: any;
      }> = {
        data: {
          file: {
            id: fileRecord.id,
            storageKey: fileRecord.storage_key,
            originalFilename: fileRecord.original_filename,
            mimeType: fileRecord.mime_type,
            sizeBytes: fileRecord.size_bytes,
            sha256Checksum: fileRecord.sha256_checksum,
            uploadedBy: fileRecord.uploaded_by,
            createdAt: fileRecord.created_at,
          },
          patientFile,
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      };

      res.status(201).json(response);
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 2. GET /files/:id/access (Generate short-lived <= 5 min HMAC-signed access URL)
// -----------------------------------------------------------------------------
filesRouter.get(
  '/:id/access',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const fileId = req.params.id;
      const patientId = typeof req.query.patientId === 'string' ? req.query.patientId : '';

      const file = fileService.getFileById(fileId);
      if (!file) {
        throw new NotFoundError('File not found');
      }

      // Check permission
      if (!req.accessContext?.hasPermission('patient.view')) {
        throw new ForbiddenError('Access Denied to file asset');
      }

      const userId = req.session?.staffUserId || 'unknown';
      const signedAccess = fileService.generateSignedAccessUrl(fileId, patientId, userId, 300);

      const response: ApiResponse<FileAccessUrlResponse> = {
        data: signedAccess,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      };

      res.status(200).json(response);
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 3. GET /files/download?token=... (Verify HMAC signature, expiry, and serve safely)
// -----------------------------------------------------------------------------
filesRouter.get(
  '/download',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = typeof req.query.token === 'string' ? req.query.token : '';
      if (!token) {
        throw new BadRequestError('Missing download access token');
      }

      // Verify token signature, expiration & get buffer
      const { file, buffer } = await fileService.verifyAndReadFile(token);

      // Sanitize filename for Content-Disposition header
      const safeFilename = file.original_filename.replace(/["\r\n\\]/g, '_');

      res.setHeader('Content-Type', file.mime_type);
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.setHeader('Content-Length', buffer.length);
      res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      res.status(200).send(buffer);
    } catch (err) {
      next(err);
    }
  }
);
