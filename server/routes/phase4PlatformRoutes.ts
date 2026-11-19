/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * Phase 4 Platform Express Router:
 *  - Production Argon2 Auth & Redis Session Endpoints + Demo Switcher Lock
 *  - Private VPS Local File Upload & Authenticated Download/Streaming
 *  - Redis-Cached Executive Dashboard & Sales Analytics Summaries
 *  - BullMQ Queue & Platform Status Endpoints
 */

import fs from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { User } from '../../src/types/index.ts';
import {
  type AuthedRequest,
  changeOwnPassword,
  isDemoRoleSwitcherAllowed,
  isProductionAuthEnabled,
  loginWithPassword,
  logoutSession,
  resolveSessionFromRequest,
} from '../auth/productionAuth.ts';
import { runWithAuthContext } from '../auth/requestContext.ts';
import { getOrSetCache, invalidateCachePrefixes } from '../cache/dashboardCache.ts';
import { checkRedisHealth, isRedisConfigured } from '../cache/redisClient.ts';
import { isPostgresConfigured, pgQuery } from '../db/pgPool.ts';
import { enqueueClinicJob, getQueueStats } from '../queue/jobQueue.ts';
import { extractClientIp, sendPgError, sendPgSuccess, toNumber } from '../repositories/pgHelpers.ts';
import {
  getPrivateStorageHealth,
  MAX_UPLOAD_BYTES,
  resolveSafePrivateFilePath,
  savePrivateDataUrl,
  savePrivateFileBuffer,
} from '../storage/localFileStorage.ts';

export interface Phase4RouterDeps {
  getFallbackUser: () => User;
}

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const PUBLIC_API_PREFIXES = [
  '/api/v1/health',
  '/api/v1/csrf-token',
  '/api/v1/auth/status',
  '/api/v1/auth/login',
  '/api/v1/auth/logout',
  '/api/v1/portal/',
];

/**
 * Middleware mounted before API routes:
 *  - Resolves Redis/PG session if cookie is present and attaches `req.authUser` & `req.sessionId`.
 *  - When production auth is enabled (`DATABASE_URL` set & demo switcher disabled),
 *    blocks unauthenticated requests to protected `/api/v1/*` routes with `401 AUTH_REQUIRED`.
 *  - Automatically invalidates Redis dashboard caches on mutating requests.
 */
export function createPhase4AuthMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authedReq = req as AuthedRequest;

    // Auto-invalidate dashboard caches after successful state-changing API mutations
    if (
      req.path.startsWith('/api/v1/') &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) &&
      !req.path.startsWith('/api/v1/auth/')
    ) {
      res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          invalidateCachePrefixes(['dashboard:', 'analytics:']).catch(() => {});
        }
      });
    }

    // Attempt session resolution if cookie exists
    try {
      const session = await resolveSessionFromRequest(req);
      if (session) {
        authedReq.authUser = session.user;
        authedReq.sessionId = session.sessionId;
      }
    } catch (err) {
      console.warn('[SUOXI Auth] Session resolution notice:', err instanceof Error ? err.message : err);
    }

    const proceed = () =>
      runWithAuthContext({ user: authedReq.authUser, sessionId: authedReq.sessionId }, () => next());

    // Only enforce login barrier on /api/v1/* when production auth is active
    if (!req.path.startsWith('/api/v1/') || !isProductionAuthEnabled()) {
      return proceed();
    }

    const isPublic = PUBLIC_API_PREFIXES.some(
      (prefix) => req.path === prefix || req.path.startsWith(prefix)
    );
    if (isPublic) {
      return proceed();
    }

    if (!authedReq.authUser) {
      return sendPgError(res, 401, 'AUTH_REQUIRED', 'Authentication required. Please sign in.');
    }

    return proceed();
  };
}

export function createPhase4PlatformRouter(deps: Phase4RouterDeps): express.Router {
  const router = express.Router();

  const resolveActor = (req: Request): User => {
    const authed = req as AuthedRequest;
    return authed.authUser || deps.getFallbackUser();
  };

  // ===========================================================================
  // 1. PRODUCTION AUTHENTICATION & DEMO ROLE-SWITCHER LOCK
  // ===========================================================================

  router.get('/api/v1/auth/status', async (_req, res) => {
    return sendPgSuccess(res, {
      authMode: isProductionAuthEnabled() ? 'production_session' : 'preview_demo',
      allowRoleSwitcher: isDemoRoleSwitcherAllowed(),
      postgresConfigured: isPostgresConfigured(),
      redisConfigured: isRedisConfigured(),
    });
  });

  router.get('/api/v1/auth/me', (req, res, next) => {
    const authed = req as AuthedRequest;
    if (isProductionAuthEnabled()) {
      if (!authed.authUser) {
        return sendPgError(res, 401, 'AUTH_REQUIRED', 'Not authenticated');
      }
      return sendPgSuccess(res, {
        user: authed.authUser,
        authMode: 'production_session',
        allowRoleSwitcher: isDemoRoleSwitcherAllowed(),
      });
    }

    // Preview mode: return current fallback user along with mode flags
    return sendPgSuccess(res, {
      user: authed.authUser || deps.getFallbackUser(),
      authMode: 'preview_demo',
      allowRoleSwitcher: true,
    });
  });

  router.post('/api/v1/auth/login', async (req, res) => {
    if (!isPostgresConfigured()) {
      return sendPgError(
        res,
        400,
        'AUTH_NOT_ENABLED_IN_PREVIEW',
        'Password login activates automatically on VPS with PostgreSQL configured.'
      );
    }

    const schema = z.object({
      email: z.string().email('Valid staff email is required'),
      password: z.string().min(1, 'Password is required'),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid login credentials format', parsed.error.format());
    }

    try {
      const session = await loginWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
        req,
        res,
      });
      return sendPgSuccess(res, {
        user: session.user,
        mustChangePassword: session.mustChangePassword,
        expiresAt: session.expiresAt,
        authMode: 'production_session',
        allowRoleSwitcher: isDemoRoleSwitcherAllowed(),
      });
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: string };
      return sendPgError(res, e.statusCode || 401, e.code || 'LOGIN_FAILED', e.message || 'Login failed');
    }
  });

  router.post('/api/v1/auth/logout', async (req, res) => {
    try {
      const authed = req as AuthedRequest;
      await logoutSession(req, res, authed.authUser);
      return sendPgSuccess(res, { loggedOut: true });
    } catch (err) {
      return sendPgError(res, 500, 'LOGOUT_FAILED', err instanceof Error ? err.message : 'Logout failed');
    }
  });

  router.post('/api/v1/auth/change-password', async (req, res) => {
    if (!isPostgresConfigured()) {
      return sendPgError(res, 400, 'NOT_AVAILABLE', 'Password management requires PostgreSQL.');
    }

    const authed = req as AuthedRequest;
    if (!authed.authUser) {
      return sendPgError(res, 401, 'AUTH_REQUIRED', 'Authentication required');
    }

    const schema = z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendPgError(res, 400, 'VALIDATION_ERROR', 'Password must be at least 8 characters', parsed.error.format());
    }

    try {
      await changeOwnPassword({
        user: authed.authUser,
        currentPassword: parsed.data.currentPassword,
        newPassword: parsed.data.newPassword,
        ipAddress: extractClientIp(req.headers, req.ip || '127.0.0.1'),
        deviceInfo: String(req.headers['user-agent'] || 'Web Browser').slice(0, 180),
      });
      return sendPgSuccess(res, { updated: true });
    } catch (err) {
      const e = err as Error & { statusCode?: number; code?: string };
      return sendPgError(res, e.statusCode || 400, e.code || 'PASSWORD_CHANGE_FAILED', e.message);
    }
  });

  // Lock Demo Role Switcher strictly in production mode
  router.post('/api/v1/auth/switch-role', (req, res, next) => {
    if (!isDemoRoleSwitcherAllowed()) {
      return sendPgError(
        res,
        403,
        'DEMO_DISABLED_IN_PRODUCTION',
        'Demo role switching is disabled in production. Please sign in with an authorized staff account.'
      );
    }
    return next();
  });

  // ===========================================================================
  // 2. PRIVATE VPS LOCAL FILE STORAGE (UPLOAD + AUTHENTICATED STREAMING)
  // ===========================================================================

  router.post('/api/v1/files/upload', (req, res) => {
    const contentType = req.headers['content-type'] || '';

    // Mode A: JSON base64 upload ({ dataUrl, category })
    if (contentType.includes('application/json')) {
      const { dataUrl, category, docType } = req.body || {};
      if (!dataUrl || typeof dataUrl !== 'string') {
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'dataUrl (base64 data URI) is required');
      }
      savePrivateDataUrl(dataUrl, category || docType)
        .then((stored) =>
          sendPgSuccess(
            res,
            {
              storagePath: stored.storagePath,
              fileUrl: `/api/v1/files/view?path=${encodeURIComponent(stored.storagePath)}`,
              fileFormat: stored.fileFormat,
              fileSize: stored.fileSizeLabel,
              sizeBytes: stored.sizeBytes,
              sha256: stored.sha256,
            },
            {},
            201
          )
        )
        .catch((err) => {
          const e = err as Error & { statusCode?: number; code?: string };
          return sendPgError(res, e.statusCode || 400, e.code || 'UPLOAD_FAILED', e.message);
        });
      return;
    }

    // Mode B: multipart/form-data upload (field: "file")
    uploadMiddleware.single('file')(req, res, async (multerErr) => {
      if (multerErr) {
        return sendPgError(res, 400, 'UPLOAD_ERROR', multerErr.message);
      }
      const file = (req as Request & { file?: Express.Multer.File }).file;
      if (!file) {
        return sendPgError(res, 400, 'VALIDATION_ERROR', 'No file uploaded (expected form field "file")');
      }

      try {
        const category = String(req.body?.category || req.body?.docType || 'general');
        const stored = await savePrivateFileBuffer({
          buffer: file.buffer,
          mimeType: file.mimetype,
          categoryOrType: category,
        });
        return sendPgSuccess(
          res,
          {
            storagePath: stored.storagePath,
            fileUrl: `/api/v1/files/view?path=${encodeURIComponent(stored.storagePath)}`,
            fileFormat: stored.fileFormat,
            fileSize: stored.fileSizeLabel,
            sizeBytes: stored.sizeBytes,
            sha256: stored.sha256,
            originalName: file.originalname,
          },
          {},
          201
        );
      } catch (err) {
        const e = err as Error & { statusCode?: number; code?: string };
        return sendPgError(res, e.statusCode || 400, e.code || 'UPLOAD_FAILED', e.message);
      }
    });
  });

  // Stream private file safely by relative storagePath (strictly inside UPLOAD_DIR)
  router.get('/api/v1/files/view', (req, res) => {
    const relPath = String(req.query.path || '');
    const resolved = resolveSafePrivateFilePath(relPath);
    if (!resolved) {
      return sendPgError(res, 404, 'FILE_NOT_FOUND', 'Requested file was not found');
    }

    const download = req.query.download === '1' || req.query.download === 'true';
    res.setHeader('Content-Type', resolved.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (download) {
      res.setHeader('Content-Disposition', `attachment; filename="${path.basename(resolved.absolutePath)}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${path.basename(resolved.absolutePath)}"`);
    }

    return fs.createReadStream(resolved.absolutePath).pipe(res);
  });

  // Stream private file by medical_attachments.id (verifies PostgreSQL record)
  router.get('/api/v1/files/by-doc/:docId', async (req, res) => {
    if (!isPostgresConfigured()) {
      return sendPgError(res, 404, 'FILE_NOT_FOUND', 'Document file lookup requires PostgreSQL');
    }

    try {
      const result = await pgQuery<{ storage_path: string | null; title: string }>(
        'SELECT storage_path, title FROM medical_attachments WHERE id = $1 LIMIT 1',
        [req.params.docId]
      );
      if (result.rowCount === 0 || !result.rows[0].storage_path) {
        return sendPgError(res, 404, 'FILE_NOT_FOUND', 'Document file not found');
      }

      const resolved = resolveSafePrivateFilePath(result.rows[0].storage_path);
      if (!resolved) {
        return sendPgError(res, 404, 'FILE_NOT_FOUND', 'File missing on storage disk');
      }

      const download = req.query.download === '1' || req.query.download === 'true';
      const safeName = `${result.rows[0].title.replace(/[^a-zA-Z0-9._-]/g, '_')}${path.extname(resolved.absolutePath)}`;
      res.setHeader('Content-Type', resolved.mimeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${safeName}"`);

      return fs.createReadStream(resolved.absolutePath).pipe(res);
    } catch (err) {
      return sendPgError(res, 500, 'FILE_STREAM_ERROR', err instanceof Error ? err.message : 'Failed to stream file');
    }
  });

  // ===========================================================================
  // 3. REDIS-CACHED DASHBOARD & SALES ANALYTICS SUMMARIES
  // ===========================================================================

  router.get('/api/v1/dashboard/summary', async (req, res) => {
    const branchId = (req.query.branchId as string) || 'all';
    const cacheKey = `dashboard:summary:${branchId}`;

    try {
      const { data, cacheHit } = await getOrSetCache(cacheKey, 45, async () => {
        if (!isPostgresConfigured()) {
          return {
            mode: 'preview_fallback',
            branchId,
            generatedAt: new Date().toISOString(),
          };
        }

        const branchFilter = branchId !== 'all' ? 'AND branch_id = $1' : '';
        const params = branchId !== 'all' ? [branchId] : [];

        const [patRes, aptRes, invRes, pkgRes, stockRes, callRes] = await Promise.all([
          pgQuery<{ total: string }>(`SELECT COUNT(*)::text AS total FROM patients WHERE 1=1 ${branchFilter}`, params),
          pgQuery<{ today_total: string; confirmed: string; visited: string }>(
            `
            SELECT
              COUNT(*) FILTER (WHERE appointment_date = CURRENT_DATE)::text AS today_total,
              COUNT(*) FILTER (WHERE appointment_date = CURRENT_DATE AND status = 'confirmed')::text AS confirmed,
              COUNT(*) FILTER (WHERE appointment_date = CURRENT_DATE AND status = 'visited')::text AS visited
            FROM appointments
            WHERE 1=1 ${branchFilter}
            `,
            params
          ),
          pgQuery<{
            total_billed: string;
            total_paid: string;
            total_due: string;
            today_collected: string;
          }>(
            `
            SELECT
              COALESCE(SUM(total_amount_bdt) FILTER (WHERE status <> 'void'), 0)::text AS total_billed,
              COALESCE(SUM(paid_amount_bdt) FILTER (WHERE status <> 'void'), 0)::text AS total_paid,
              COALESCE(SUM(due_amount_bdt) FILTER (WHERE status <> 'void'), 0)::text AS total_due,
              COALESCE(SUM(paid_amount_bdt) FILTER (WHERE status <> 'void' AND created_at::date = CURRENT_DATE), 0)::text AS today_collected
            FROM invoices
            WHERE 1=1 ${branchFilter}
            `,
            params
          ),
          pgQuery<{ active_packages: string; remaining_sessions: string }>(
            `
            SELECT
              COUNT(*) FILTER (WHERE status = 'active')::text AS active_packages,
              COALESCE(SUM(remaining_sessions) FILTER (WHERE status = 'active'), 0)::text AS remaining_sessions
            FROM treatment_packages
            `
          ),
          pgQuery<{ low_stock: string; expired: string }>(
            `
            SELECT
              COUNT(*) FILTER (WHERE status = 'low_stock')::text AS low_stock,
              COUNT(*) FILTER (WHERE status = 'expired')::text AS expired
            FROM inventory_items
            WHERE is_active = TRUE ${branchFilter}
            `,
            params
          ),
          pgQuery<{ pending_calls: string }>(
            `
            SELECT COUNT(*) FILTER (WHERE call_status = 'pending')::text AS pending_calls
            FROM call_center_tasks
            WHERE appointment_date >= CURRENT_DATE
            `
          ),
        ]);

        return {
          mode: 'postgresql',
          branchId,
          totalPatients: toNumber(patRes.rows[0]?.total),
          appointmentsToday: toNumber(aptRes.rows[0]?.today_total),
          confirmedToday: toNumber(aptRes.rows[0]?.confirmed),
          visitedToday: toNumber(aptRes.rows[0]?.visited),
          totalBilledBDT: toNumber(invRes.rows[0]?.total_billed),
          totalCollectedBDT: toNumber(invRes.rows[0]?.total_paid),
          totalDueBDT: toNumber(invRes.rows[0]?.total_due),
          todayCollectedBDT: toNumber(invRes.rows[0]?.today_collected),
          activePackages: toNumber(pkgRes.rows[0]?.active_packages),
          remainingSessionsTotal: toNumber(pkgRes.rows[0]?.remaining_sessions),
          lowStockItems: toNumber(stockRes.rows[0]?.low_stock),
          expiredItems: toNumber(stockRes.rows[0]?.expired),
          pendingFollowupCalls: toNumber(callRes.rows[0]?.pending_calls),
          generatedAt: new Date().toISOString(),
        };
      });

      return sendPgSuccess(res, data, { cacheHit, cacheEngine: isRedisConfigured() ? 'redis' : 'memory' });
    } catch (err) {
      return sendPgError(res, 500, 'DASHBOARD_SUMMARY_FAILED', err instanceof Error ? err.message : 'Failed');
    }
  });

  router.get('/api/v1/analytics/sales-summary', async (req, res) => {
    const days = Math.min(Math.max(parseInt(String(req.query.days || '30'), 10) || 30, 1), 365);
    const cacheKey = `analytics:sales:${days}d`;

    try {
      const { data, cacheHit } = await getOrSetCache(cacheKey, 60, async () => {
        if (!isPostgresConfigured()) {
          return { mode: 'preview_fallback', days, byMethod: [], dailyTotals: [] };
        }

        const [byMethodRes, dailyRes] = await Promise.all([
          pgQuery<{ method: string; total_bdt: string; tx_count: string }>(
            `
            SELECT
              method,
              COALESCE(SUM(amount_bdt), 0)::text AS total_bdt,
              COUNT(*)::text AS tx_count
            FROM payment_records
            WHERE status = 'valid'
              AND paid_at >= NOW() - ($1::int || ' days')::interval
            GROUP BY method
            ORDER BY SUM(amount_bdt) DESC
            `,
            [days]
          ),
          pgQuery<{ day: string; total_bdt: string }>(
            `
            SELECT
              paid_at::date::text AS day,
              COALESCE(SUM(amount_bdt), 0)::text AS total_bdt
            FROM payment_records
            WHERE status = 'valid'
              AND paid_at >= NOW() - ($1::int || ' days')::interval
            GROUP BY paid_at::date
            ORDER BY paid_at::date ASC
            `,
            [days]
          ),
        ]);

        return {
          mode: 'postgresql',
          days,
          byMethod: byMethodRes.rows.map((r) => ({
            method: r.method,
            totalBDT: toNumber(r.total_bdt),
            count: toNumber(r.tx_count),
          })),
          dailyTotals: dailyRes.rows.map((r) => ({
            date: r.day,
            totalBDT: toNumber(r.total_bdt),
          })),
          generatedAt: new Date().toISOString(),
        };
      });

      return sendPgSuccess(res, data, { cacheHit, cacheEngine: isRedisConfigured() ? 'redis' : 'memory' });
    } catch (err) {
      return sendPgError(res, 500, 'ANALYTICS_FAILED', err instanceof Error ? err.message : 'Failed');
    }
  });

  // ===========================================================================
  // 4. BACKGROUND QUEUE & INFRASTRUCTURE STATUS
  // ===========================================================================

  router.get('/api/v1/system/queue-stats', async (_req, res) => {
    try {
      const [queue, redis, storage] = await Promise.all([
        getQueueStats(),
        checkRedisHealth(),
        Promise.resolve(getPrivateStorageHealth()),
      ]);
      return sendPgSuccess(res, {
        queue,
        redis,
        storage,
        authMode: isProductionAuthEnabled() ? 'production_session' : 'preview_demo',
      });
    } catch (err) {
      return sendPgError(res, 500, 'QUEUE_STATS_FAILED', err instanceof Error ? err.message : 'Failed');
    }
  });

  router.post('/api/v1/system/jobs/enqueue', async (req, res) => {
    const actor = resolveActor(req);
    if (actor.role !== 'super_admin' && actor.role !== 'admin_manager') {
      return sendPgError(res, 403, 'FORBIDDEN', 'Only Super Admin or Branch Manager can enqueue background jobs');
    }

    const schema = z.object({
      jobName: z.enum([
        'send_sms_reminder',
        'send_email_notification',
        'invalidate_dashboard_cache',
        'backup_audit_log',
      ]),
      payload: z.record(z.string(), z.unknown()).default({}),
      delayMs: z.number().int().min(0).max(86400000).optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return sendPgError(res, 400, 'VALIDATION_ERROR', 'Invalid job request', parsed.error.format());
    }

    const queued = await enqueueClinicJob(parsed.data.jobName, parsed.data.payload, {
      delayMs: parsed.data.delayMs,
    });
    return sendPgSuccess(res, queued, {}, 202);
  });

  return router;
}
