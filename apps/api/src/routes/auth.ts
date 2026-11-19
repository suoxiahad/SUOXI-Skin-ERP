import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import {
  generateCsrfToken,
  setCsrfCookie,
  validateCsrf,
  parseCookies,
  clearAuthCookies,
  getCookieName,
  ANON_COOKIE_NAME,
} from '../auth/csrf.js';
import {
  getSessionStore,
  setSessionCookie,
  hashSessionId,
  SESSION_COOKIE_NAME,
} from '../auth/session.js';
import {
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
} from '../auth/password.js';
import { checkLockout, lockoutTracker } from '../auth/lockout.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireMustChangePassword } from '../middleware/requireMustChangePassword.js';
import { validateBody } from '../middleware/validation.js';
import {
  UnauthorizedError,
  BadRequestError,
  AppError,
} from '../middleware/errorHandler.js';
import { getRbacRepository } from '../services/permissionResolver.js';
import { logAudit } from '../services/auditLogger.js';
import type { ApiResponse, SessionUserDto, LoginResponse, CsrfTokenResponse } from '@suoxi/shared-types';

export const authRouter = Router();

// Zod Schemas
const loginSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100),
  password: z.string().min(1, 'Password is required'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(10, 'New password must be at least 10 characters long'),
});

const forgotPasswordSchema = z.object({
  usernameOrEmail: z.string().min(1, 'Username or email is required'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string().min(10, 'New password must be at least 10 characters long'),
});

// In-memory password store & user registry for auth service operations
export interface AuthUser {
  id: string;
  username: string;
  email: string;
  phone: string;
  passwordHash: string;
  fullName: string;
  fullNameBn?: string;
  status: 'active' | 'inactive' | 'suspended';
  allBranches: boolean;
  mustChangePassword: boolean;
  primaryBranchId: string;
}

class UserRegistry {
  private users = new Map<string, AuthUser>();
  private resetTokens = new Map<string, { userId: string; expiresAt: number; isUsed: boolean }>();

  addUser(user: AuthUser): void {
    this.users.set(user.username.toLowerCase(), user);
    this.users.set(user.id, user);
  }

  findByUsernameOrEmail(identifier: string): AuthUser | null {
    const key = identifier.toLowerCase().trim();
    for (const u of this.users.values()) {
      if (u.username.toLowerCase() === key || u.email.toLowerCase() === key) {
        return u;
      }
    }
    return null;
  }

  findById(id: string): AuthUser | null {
    return this.users.get(id) || null;
  }

  updatePassword(userId: string, newHash: string): void {
    const user = this.findById(userId);
    if (user) {
      user.passwordHash = newHash;
      user.mustChangePassword = false;
    }
  }

  createResetToken(userId: string): string {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
    this.resetTokens.set(tokenHash, {
      userId,
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour
      isUsed: false,
    });
    return rawToken;
  }

  consumeResetToken(rawToken: string): string | null {
    const tokenHash = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
    const record = this.resetTokens.get(tokenHash);
    if (!record) return null;
    if (record.isUsed || Date.now() > record.expiresAt) return null;

    record.isUsed = true;
    return record.userId;
  }

  clear(): void {
    this.users.clear();
    this.resetTokens.clear();
  }
}

export const userRegistry = new UserRegistry();

// -----------------------------------------------------------------------------
// 1. GET /auth/csrf (Public, safe, no-store)
// -----------------------------------------------------------------------------
authRouter.get('/csrf', async (req: Request, res: Response): Promise<Response> => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const cookies = parseCookies(req.headers['cookie']);
  const sessionCookieName = getCookieName(SESSION_COOKIE_NAME);
  const anonCookieName = getCookieName(ANON_COOKIE_NAME);

  const rawSessionId = cookies[sessionCookieName] || cookies[SESSION_COOKIE_NAME];
  let subjectId: string;
  let bindingType: 's' | 'a';
  let anonIdToSet: string | undefined;

  if (rawSessionId) {
    const session = await getSessionStore().getSessionByHash(hashSessionId(rawSessionId));
    if (session) {
      subjectId = rawSessionId;
      bindingType = 's';
    } else {
      subjectId = cookies[anonCookieName] || crypto.randomUUID();
      bindingType = 'a';
      if (!cookies[anonCookieName]) anonIdToSet = subjectId;
    }
  } else {
    subjectId = cookies[anonCookieName] || crypto.randomUUID();
    bindingType = 'a';
    if (!cookies[anonCookieName]) anonIdToSet = subjectId;
  }

  const csrfToken = generateCsrfToken(subjectId, bindingType, 'staff');
  setCsrfCookie(res, csrfToken, anonIdToSet);

  const responsePayload: ApiResponse<CsrfTokenResponse> = {
    data: { csrfToken },
    meta: {
      requestId: req.id,
      timestamp: new Date().toISOString(),
    },
  };

  return res.status(200).json(responsePayload);
});

// -----------------------------------------------------------------------------
// 2. POST /auth/login (Public, rate-limited, anon-bound CSRF)
// -----------------------------------------------------------------------------
authRouter.post(
  '/login',
  validateBody(loginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { username, password } = req.body;
    const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';

    try {
      // 1. Lockout verification (HTTP 423)
      checkLockout(username, clientIp);

      // 2. CSRF verification (anon-bound token)
      const cookies = parseCookies(req.headers['cookie']);
      const anonId = cookies[getCookieName(ANON_COOKIE_NAME)] || cookies[ANON_COOKIE_NAME] || '';
      validateCsrf(req, anonId, 'a', 'staff');

      // 3. User lookup & timing-safe verification
      const user = userRegistry.findByUsernameOrEmail(username);

      if (!user) {
        // Thwart timing attacks via dummy Argon2id calculation
        await verifyDummyPassword(password);
        lockoutTracker.recordFailure(username, clientIp);
        throw new UnauthorizedError('Incorrect username or password');
      }

      if (user.status !== 'active') {
        await verifyDummyPassword(password);
        lockoutTracker.recordFailure(username, clientIp);
        throw new UnauthorizedError('Incorrect username or password');
      }

      const isValidPassword = await verifyPassword(user.passwordHash, password);
      if (!isValidPassword) {
        lockoutTracker.recordFailure(username, clientIp);
        throw new UnauthorizedError('Incorrect username or password');
      }

      // Successful authentication
      lockoutTracker.recordSuccess(username, clientIp);

      // 4. Session regeneration (Anti-session-fixation)
      const sessionStore = getSessionStore();
      const { sessionId } = await sessionStore.createSession(
        user.id,
        clientIp,
        req.headers['user-agent']
      );

      // 5. Rotate CSRF token (Session-bound)
      const newCsrfToken = generateCsrfToken(sessionId, 's', 'staff');
      setSessionCookie(res, sessionId);
      setCsrfCookie(res, newCsrfToken);

      // 6. Resolve user details & permissions
      const rbacData = await getRbacRepository().getUserRbacData(user.id);

      const userDto: SessionUserDto = {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        fullName: user.fullName,
        fullNameBn: user.fullNameBn,
        roles: rbacData?.roles || [],
        effectivePermissions: Array.from(rbacData?.rolePermissions || []),
        branches: [
          {
            id: user.primaryBranchId || 'SKC-01',
            code: 'SKC-01',
            name: 'SUOXI Skin Care & Aesthetic Center',
            isDefault: true,
          },
        ],
        allBranches: user.allBranches,
        mustChangePassword: user.mustChangePassword,
      };

      await logAudit(null, {
        actorUserId: user.id,
        action: 'auth.login',
        entityType: 'staff_users',
        entityId: user.id,
        branchId: user.primaryBranchId || null,
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'] || null,
      });

      const responsePayload: ApiResponse<LoginResponse> = {
        data: {
          user: userDto,
          csrfToken: newCsrfToken,
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      };

      res.status(200).json(responsePayload);
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 3. POST /auth/logout (Session required, session-bound CSRF)
// -----------------------------------------------------------------------------
authRouter.post(
  '/logout',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Validate session-bound CSRF token
      validateCsrf(req, req.sessionId!, 's', 'staff');

      // Revoke session in store
      if (req.session) {
        await getSessionStore().revokeSession(req.session.sessionHash);
      }

      // Clear authentication cookies
      clearAuthCookies(res);

      // Generate and return a fresh anonymous-bound CSRF token for subsequent login
      const freshAnonId = crypto.randomUUID();
      const freshCsrfToken = generateCsrfToken(freshAnonId, 'a', 'staff');
      setCsrfCookie(res, freshCsrfToken, freshAnonId);

      const responsePayload: ApiResponse<{ success: boolean; csrfToken: string }> = {
        data: {
          success: true,
          csrfToken: freshCsrfToken,
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      };

      res.status(200).json(responsePayload);
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 4. GET /auth/me (Session required)
// -----------------------------------------------------------------------------
authRouter.get(
  '/me',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = userRegistry.findById(req.session!.staffUserId);
      if (!user) {
        throw new UnauthorizedError('User profile not found');
      }

      const rbacData = await getRbacRepository().getUserRbacData(user.id);

      const userDto: SessionUserDto = {
        id: user.id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        fullName: user.fullName,
        fullNameBn: user.fullNameBn,
        roles: rbacData?.roles || [],
        effectivePermissions: Array.from(req.accessContext?.effectivePermissions || []),
        branches: [
          {
            id: user.primaryBranchId || 'SKC-01',
            code: 'SKC-01',
            name: 'SUOXI Skin Care & Aesthetic Center',
            isDefault: true,
          },
        ],
        allBranches: user.allBranches,
        mustChangePassword: user.mustChangePassword,
      };

      const responsePayload: ApiResponse<SessionUserDto> = {
        data: userDto,
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      };

      res.status(200).json(responsePayload);
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 5. POST /auth/change-password (Session required, session-bound CSRF)
// -----------------------------------------------------------------------------
authRouter.post(
  '/change-password',
  requireAuth,
  validateBody(changePasswordSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { currentPassword, newPassword } = req.body;

    try {
      validateCsrf(req, req.sessionId!, 's', 'staff');

      const user = userRegistry.findById(req.session!.staffUserId);
      if (!user) {
        throw new UnauthorizedError('User account not found');
      }

      const isCurrentValid = await verifyPassword(user.passwordHash, currentPassword);
      if (!isCurrentValid) {
        throw new BadRequestError('Incorrect current password');
      }

      const newHash = await hashPassword(newPassword);
      userRegistry.updatePassword(user.id, newHash);

      // Rotate session and CSRF token
      await getSessionStore().revokeSession(req.session!.sessionHash);
      const { sessionId: newSessionId } = await getSessionStore().createSession(
        user.id,
        req.ip || '127.0.0.1',
        req.headers['user-agent']
      );

      const newCsrfToken = generateCsrfToken(newSessionId, 's', 'staff');
      setSessionCookie(res, newSessionId);
      setCsrfCookie(res, newCsrfToken);

      await logAudit(null, {
        actorUserId: user.id,
        action: 'auth.password_change',
        entityType: 'staff_users',
        entityId: user.id,
        ipAddress: req.ip || '127.0.0.1',
      });

      const responsePayload: ApiResponse<{ success: boolean; csrfToken: string }> = {
        data: {
          success: true,
          csrfToken: newCsrfToken,
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      };

      res.status(200).json(responsePayload);
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 6. POST /auth/forgot-password (Public, CSRF anon-bound)
// -----------------------------------------------------------------------------
authRouter.post(
  '/forgot-password',
  validateBody(forgotPasswordSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { usernameOrEmail } = req.body;

    try {
      const cookies = parseCookies(req.headers['cookie']);
      const anonId = cookies[getCookieName(ANON_COOKIE_NAME)] || cookies[ANON_COOKIE_NAME] || '';
      validateCsrf(req, anonId, 'a', 'staff');

      const user = userRegistry.findByUsernameOrEmail(usernameOrEmail);
      if (user && user.status === 'active') {
        userRegistry.createResetToken(user.id);
        // In full stack, dispatches background email job via worker
      }

      // Constant-time generic response to prevent user enumeration
      const responsePayload: ApiResponse<{ message: string }> = {
        data: {
          message: 'If an active account exists with that identifier, password reset instructions have been sent.',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      };

      res.status(200).json(responsePayload);
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// 7. POST /auth/reset-password (Public, CSRF anon-bound)
// -----------------------------------------------------------------------------
authRouter.post(
  '/reset-password',
  validateBody(resetPasswordSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { token, newPassword } = req.body;

    try {
      const cookies = parseCookies(req.headers['cookie']);
      const anonId = cookies[getCookieName(ANON_COOKIE_NAME)] || cookies[ANON_COOKIE_NAME] || '';
      validateCsrf(req, anonId, 'a', 'staff');

      const userId = userRegistry.consumeResetToken(token);
      if (!userId) {
        throw new BadRequestError('Invalid, expired, or already-consumed reset token');
      }

      const newHash = await hashPassword(newPassword);
      userRegistry.updatePassword(userId, newHash);

      // Revoke all existing sessions for user (strict security: no auto-login)
      await getSessionStore().revokeAllUserSessions(userId);

      await logAudit(null, {
        actorUserId: userId,
        action: 'auth.password_reset',
        entityType: 'staff_users',
        entityId: userId,
        ipAddress: req.ip || '127.0.0.1',
      });

      const responsePayload: ApiResponse<{ message: string }> = {
        data: {
          message: 'Password has been successfully reset. Please log in with your new password.',
        },
        meta: {
          requestId: req.id,
          timestamp: new Date().toISOString(),
        },
      };

      res.status(200).json(responsePayload);
    } catch (err) {
      next(err);
    }
  }
);
