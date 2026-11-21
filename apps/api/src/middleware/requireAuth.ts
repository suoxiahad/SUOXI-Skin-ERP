import { Request, Response, NextFunction } from 'express';
import { UnauthorizedError, ForbiddenError } from './errorHandler.js';
import {
  parseCookies,
  getCookieName,
  parseAndVerifyToken,
  validateOriginAndReferer,
  computeSubjectHash,
  CSRF_HEADER_NAME,
  CSRF_COOKIE_NAME,
} from '../auth/csrf.js';
import { getSessionStore, hashSessionId, SESSION_COOKIE_NAME, StaffSession } from '../auth/session.js';
import { resolvePermissions } from '../services/permissionResolver.js';
import type { AccessContext } from '@suoxi/shared-types';

declare global {
  namespace Express {
    interface Request {
      session?: StaffSession;
      sessionId?: string;
      accessContext?: AccessContext;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const cookies = parseCookies(req.headers['cookie']);
  const sessionCookieName = getCookieName(SESSION_COOKIE_NAME);
  const rawSessionId = cookies[sessionCookieName] || cookies[SESSION_COOKIE_NAME];

  if (!rawSessionId) {
    return next(new UnauthorizedError('Authentication required: Missing staff session cookie'));
  }

  const sessionHash = hashSessionId(rawSessionId);
  const store = getSessionStore();
  const session = await store.getSessionByHash(sessionHash);

  if (!session) {
    return next(new UnauthorizedError('Authentication required: Invalid or expired staff session'));
  }

  // Touch session activity
  await store.touchSession(sessionHash);

  // Resolve user permissions & branch scope
  const accessContext = await resolvePermissions(session.staffUserId);
  if (!accessContext) {
    return next(new UnauthorizedError('Authentication required: User account not found or disabled'));
  }

  req.sessionId = rawSessionId;
  req.session = session;
  req.accessContext = accessContext;

  // Section B.5a Double-submit CSRF enforcement on unsafe mutating methods
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;
    const cookieToken = cookies[getCookieName(CSRF_COOKIE_NAME)] || cookies[CSRF_COOKIE_NAME];

    if (!headerToken) {
      return next(new ForbiddenError('CSRF_FAILED: Missing x-csrf-token header'));
    }
    if (!cookieToken) {
      return next(new ForbiddenError('CSRF_FAILED: Missing CSRF cookie'));
    }
    if (headerToken !== cookieToken) {
      return next(new ForbiddenError('CSRF_FAILED: Mismatched CSRF header and cookie tokens'));
    }

    try {
      validateOriginAndReferer(req);
      const parsed = parseAndVerifyToken(headerToken);
      if (parsed.realm !== 'staff') {
        return next(new ForbiddenError(`CSRF_FAILED: Token issued for ${parsed.realm} realm cannot be used on staff`));
      }
      if (parsed.bindingType === 's') {
        const expectedHash = computeSubjectHash(rawSessionId);
        if (parsed.subjectHash !== expectedHash) {
          return next(new ForbiddenError('CSRF_FAILED: Token was not issued for current session'));
        }
      }
    } catch (csrfErr) {
      return next(csrfErr);
    }
  }

  next();
}
