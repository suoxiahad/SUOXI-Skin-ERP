import type { Request, Response, NextFunction } from 'express';
import { UnauthorizedError } from './errorHandler.js';
import { portalService } from '../services/portalService.js';
import { parseCookies, getCookieName, PORTAL_SESSION_COOKIE_NAME } from '../auth/csrf.js';

export interface PortalAuthContext {
  accountId: string;
  patientId: string;
}

declare global {
  namespace Express {
    interface Request {
      portalUser?: PortalAuthContext;
    }
  }
}

export async function requirePortalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // If the browser is requesting an HTML page for the SPA router, or visiting the portal root ('/'), pass through to Vite
    const accept = req.headers?.accept;
    if (accept && accept.includes('text/html') && !accept.includes('application/json')) {
      return next();
    }
    if (req.path === '/') {
      return next();
    }

    const cookies = parseCookies(req.headers['cookie']);
    const portalSessionCookie =
      cookies[getCookieName(PORTAL_SESSION_COOKIE_NAME)] ||
      cookies[PORTAL_SESSION_COOKIE_NAME];

    if (!portalSessionCookie) {
      throw new UnauthorizedError('Authentication required for patient portal');
    }

    const session = await portalService.getSession(portalSessionCookie);
    if (!session) {
      throw new UnauthorizedError('Portal session has expired or is invalid');
    }

    req.portalUser = {
      accountId: session.account.id,
      patientId: session.patientId,
    };

    next();
  } catch (err) {
    next(err);
  }
}
