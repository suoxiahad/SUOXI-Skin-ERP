import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import {
  generateCsrfToken,
  setPortalCsrfCookie,
  clearPortalAuthCookies,
  validateCsrf,
  parseCookies,
  getCookieName,
  PORTAL_ANON_COOKIE_NAME,
  PORTAL_SESSION_COOKIE_NAME,
} from '../auth/csrf.js';
import { portalService } from '../services/portalService.js';
import { getConfig } from '../config/env.js';

export const portalAuthRouter = Router();

// Validation Schemas
const loginSchema = z.object({
  loginIdentifier: z.string().min(1, 'Login identifier is required'),
  password: z.string().min(1, 'Password is required'),
});

const setupSchema = z.object({
  token: z.string().min(1, 'Setup token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

const forgotSchema = z.object({
  loginIdentifier: z.string().min(1, 'Login identifier is required'),
});

const resetSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

// 1. GET /portal/auth/csrf (Public CSRF token before login/setup)
portalAuthRouter.get('/csrf', (req: Request, res: Response) => {
  const cookies = parseCookies(req.headers['cookie']);
  const anonCookieName = getCookieName(PORTAL_ANON_COOKIE_NAME);
  let anonId = cookies[anonCookieName] || cookies[PORTAL_ANON_COOKIE_NAME];

  if (!anonId) {
    anonId = crypto.randomUUID();
  }

  const token = generateCsrfToken(anonId, 'a', 'portal');
  setPortalCsrfCookie(res, token, anonId);

  res.status(200).json({
    data: {
      csrfToken: token,
      realm: 'portal',
      binding: 'anon',
    },
    meta: {
      requestId: (req as any).id || (req.headers['x-request-id'] as string) || crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    },
  });
});

// 2. POST /portal/auth/login
portalAuthRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cookies = parseCookies(req.headers['cookie']);
    const anonCookieName = getCookieName(PORTAL_ANON_COOKIE_NAME);
    const anonId = cookies[anonCookieName] || cookies[PORTAL_ANON_COOKIE_NAME] || '';

    // Double-submit CSRF check for anon-bound portal token
    validateCsrf(req, anonId, 'a', 'portal');

    const body = loginSchema.parse(req.body);
    const result = await portalService.login(
      body.loginIdentifier,
      body.password,
      req.ip || '127.0.0.1',
      req.headers['user-agent'] || ''
    );

    // Set portal session cookie
    const isProd = getConfig().NODE_ENV === 'production';
    res.cookie(getCookieName(PORTAL_SESSION_COOKIE_NAME), result.sessionToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
      maxAge: 12 * 60 * 60 * 1000,
    });

    // Token rotation on login: Rotate to session-bound CSRF token
    const sessionCsrf = generateCsrfToken(result.account.accountId, 's', 'portal');
    setPortalCsrfCookie(res, sessionCsrf);

    res.status(200).json({
      data: {
        account: result.account,
        csrfToken: sessionCsrf,
      },
      meta: {
        requestId: (req as any).id || (req.headers['x-request-id'] as string) || crypto.randomUUID(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 3. POST /portal/auth/setup
portalAuthRouter.post('/setup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cookies = parseCookies(req.headers['cookie']);
    const anonCookieName = getCookieName(PORTAL_ANON_COOKIE_NAME);
    const anonId = cookies[anonCookieName] || cookies[PORTAL_ANON_COOKIE_NAME] || '';

    validateCsrf(req, anonId, 'a', 'portal');

    const body = setupSchema.parse(req.body);
    await portalService.completeSetupOrReset(body.token, body.password);

    res.status(200).json({
      data: { success: true, message: 'Account setup completed. You may now log in.' },
      meta: { requestId: (req as any).id || (req.headers['x-request-id'] as string) || crypto.randomUUID(), timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// 4. POST /portal/auth/forgot
portalAuthRouter.post('/forgot', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cookies = parseCookies(req.headers['cookie']);
    const anonCookieName = getCookieName(PORTAL_ANON_COOKIE_NAME);
    const anonId = cookies[anonCookieName] || cookies[PORTAL_ANON_COOKIE_NAME] || '';

    validateCsrf(req, anonId, 'a', 'portal');

    const body = forgotSchema.parse(req.body);
    const result = await portalService.requestForgotPassword(body.loginIdentifier);

    res.status(200).json({
      data: {
        success: true,
        message: 'If an account matches that login, password reset instructions have been sent.',
        simulatedToken: result.token,
      },
      meta: { requestId: (req as any).id || (req.headers['x-request-id'] as string) || crypto.randomUUID(), timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// 5. POST /portal/auth/reset
portalAuthRouter.post('/reset', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cookies = parseCookies(req.headers['cookie']);
    const anonCookieName = getCookieName(PORTAL_ANON_COOKIE_NAME);
    const anonId = cookies[anonCookieName] || cookies[PORTAL_ANON_COOKIE_NAME] || '';

    validateCsrf(req, anonId, 'a', 'portal');

    const body = resetSchema.parse(req.body);
    await portalService.completeSetupOrReset(body.token, body.password);

    res.status(200).json({
      data: { success: true, message: 'Password reset successfully. You may now log in.' },
      meta: { requestId: (req as any).id || (req.headers['x-request-id'] as string) || crypto.randomUUID(), timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

// 6. POST /portal/auth/logout
portalAuthRouter.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cookies = parseCookies(req.headers['cookie']);
    const portalSessionCookie =
      cookies[getCookieName(PORTAL_SESSION_COOKIE_NAME)] ||
      cookies[PORTAL_SESSION_COOKIE_NAME];

    if (portalSessionCookie) {
      await portalService.logout(portalSessionCookie);
    }

    clearPortalAuthCookies(res);

    // Issue a clean anon CSRF token on logout
    const newAnonId = crypto.randomUUID();
    const newAnonToken = generateCsrfToken(newAnonId, 'a', 'portal');
    setPortalCsrfCookie(res, newAnonToken, newAnonId);

    res.status(200).json({
      data: { success: true, message: 'Logged out successfully', csrfToken: newAnonToken },
      meta: { requestId: (req as any).id || (req.headers['x-request-id'] as string) || crypto.randomUUID(), timestamp: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});
