import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { getConfig } from '../config/env.js';
import { ForbiddenError, BadRequestError } from '../middleware/errorHandler.js';

export const CSRF_COOKIE_NAME = 'suoxi_csrf';
export const ANON_COOKIE_NAME = 'suoxi_anon_id';
export const PORTAL_CSRF_COOKIE_NAME = 'suoxi_portal_csrf';
export const PORTAL_ANON_COOKIE_NAME = 'suoxi_portal_anon_id';
export const PORTAL_SESSION_COOKIE_NAME = 'suoxi_portal_session';
export const CSRF_HEADER_NAME = 'x-csrf-token';
export const CSRF_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export type CsrfRealm = 'staff' | 'portal';
export type CsrfBindingType = 's' | 'a'; // 's' = session-bound, 'a' = anon-bound

function getCsrfSecret(): string {
  const config = getConfig();
  return config.JWT_SECRET || 'suoxi_dev_csrf_secret_min_32_characters_default';
}

export function computeSubjectHash(subjectId: string): string {
  return crypto.createHash('sha256').update(subjectId, 'utf8').digest('hex').substring(0, 16);
}

export function generateCsrfToken(
  subjectId: string,
  bindingType: CsrfBindingType,
  realm: CsrfRealm = 'staff'
): string {
  const secret = getCsrfSecret();
  const rawId = crypto.randomBytes(16).toString('hex');
  const subjectHash = computeSubjectHash(subjectId);
  const timestamp = Date.now().toString(36);

  const payload = `${rawId}.${subjectHash}.${timestamp}.${realm}.${bindingType}`;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  return `${payload}.${hmac}`;
}

export interface ParsedCsrfToken {
  rawId: string;
  subjectHash: string;
  timestamp: number;
  realm: CsrfRealm;
  bindingType: CsrfBindingType;
  signature: string;
}

export function parseAndVerifyToken(token: string): ParsedCsrfToken {
  if (!token || typeof token !== 'string') {
    throw new ForbiddenError('CSRF_FAILED: Missing or malformed CSRF token');
  }

  const parts = token.split('.');
  if (parts.length !== 6) {
    throw new ForbiddenError('CSRF_FAILED: Malformed CSRF token format');
  }

  const [rawId, subjectHash, timestampStr, realm, bindingType, signature] = parts;
  const payload = `${rawId}.${subjectHash}.${timestampStr}.${realm}.${bindingType}`;
  const secret = getCsrfSecret();
  const expectedHmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  // Constant-time HMAC comparison
  const sigBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedHmac, 'hex');
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    throw new ForbiddenError('CSRF_FAILED: Tampered or invalid CSRF signature');
  }

  const timestamp = parseInt(timestampStr, 36);
  if (isNaN(timestamp) || Date.now() - timestamp > CSRF_TOKEN_TTL_MS) {
    throw new ForbiddenError('CSRF_FAILED: CSRF token has expired');
  }

  if (realm !== 'staff' && realm !== 'portal') {
    throw new ForbiddenError('CSRF_FAILED: Invalid CSRF realm');
  }

  if (bindingType !== 's' && bindingType !== 'a') {
    throw new ForbiddenError('CSRF_FAILED: Invalid CSRF binding type');
  }

  return {
    rawId,
    subjectHash,
    timestamp,
    realm: realm as CsrfRealm,
    bindingType: bindingType as CsrfBindingType,
    signature,
  };
}

export function getCookieName(baseName: string): string {
  const config = getConfig();
  if (config.NODE_ENV === 'production') {
    return `__Host-${baseName}`;
  }
  return baseName;
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const name = parts.shift()?.trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join('='));
    }
  });

  return list;
}

export function setCsrfCookie(
  res: Response,
  token: string,
  anonId?: string
): void {
  const config = getConfig();
  const isProd = config.NODE_ENV === 'production';
  const csrfCookie = getCookieName(CSRF_COOKIE_NAME);
  const anonCookie = getCookieName(ANON_COOKIE_NAME);

  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: CSRF_TOKEN_TTL_MS,
  };

  res.cookie(csrfCookie, token, cookieOptions);

  if (anonId) {
    res.cookie(anonCookie, anonId, cookieOptions);
  }
}

export function clearAuthCookies(res: Response): void {
  const isProd = getConfig().NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
  };

  res.clearCookie(getCookieName('suoxi_session'), cookieOptions);
  res.clearCookie(getCookieName(CSRF_COOKIE_NAME), cookieOptions);
}

export function setPortalCsrfCookie(
  res: Response,
  token: string,
  anonId?: string
): void {
  const config = getConfig();
  const isProd = config.NODE_ENV === 'production';
  const csrfCookie = getCookieName(PORTAL_CSRF_COOKIE_NAME);
  const anonCookie = getCookieName(PORTAL_ANON_COOKIE_NAME);

  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: CSRF_TOKEN_TTL_MS,
  };

  res.cookie(csrfCookie, token, cookieOptions);

  if (anonId) {
    res.cookie(anonCookie, anonId, cookieOptions);
  }
}

export function clearPortalAuthCookies(res: Response): void {
  const isProd = getConfig().NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
  };

  res.clearCookie(getCookieName(PORTAL_SESSION_COOKIE_NAME), cookieOptions);
  res.clearCookie(getCookieName(PORTAL_CSRF_COOKIE_NAME), cookieOptions);
}

/**
 * Validates Origin/Referer headers against allowed domains
 */
export function validateOriginAndReferer(req: Request): void {
  const origin = req.headers['origin'];
  const referer = req.headers['referer'];

  if (!origin && !referer) {
    throw new ForbiddenError('CSRF_FAILED: Missing both Origin and Referer headers');
  }

  const checkUrl = (origin || referer) as string;
  try {
    const parsed = new URL(checkUrl);
    const host = parsed.host;
    const config = getConfig();

    // Allow local development, specific configured CORS origin, or trusted Cloud Run applet domains
    const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    const isAllowedCustomOrigin = Boolean(config.CORS_ORIGIN && config.CORS_ORIGIN !== '*' && checkUrl.startsWith(config.CORS_ORIGIN));
    const isAllowedRunApp = host.endsWith('.run.app');

    if (!isLocalhost && !isAllowedCustomOrigin && !isAllowedRunApp) {
      throw new ForbiddenError(`CSRF_FAILED: Disallowed origin: ${host}`);
    }
  } catch (err) {
    if (err instanceof ForbiddenError) throw err;
    throw new ForbiddenError('CSRF_FAILED: Invalid Origin or Referer header URL');
  }
}

/**
 * Validates double-submit CSRF protection on mutating requests (B.5a)
 */
export function validateCsrf(
  req: Request,
  expectedSubjectId: string,
  expectedBindingType: CsrfBindingType,
  expectedRealm: CsrfRealm = 'staff'
): void {
  // 1. Validate Origin / Referer
  validateOriginAndReferer(req);

  // 2. Validate Content-Type on mutating requests with payloads
  const contentType = req.headers['content-type'];
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body && Object.keys(req.body).length > 0) {
    if (!contentType || !contentType.toLowerCase().startsWith('application/json')) {
      throw new BadRequestError('Unsupported Content-Type. Expected application/json');
    }
  }

  // 3. Extract tokens from Header and Cookie
  const headerToken = req.headers[CSRF_HEADER_NAME];
  const cookies = parseCookies(req.headers['cookie']);
  const cookieBaseName = expectedRealm === 'portal' ? PORTAL_CSRF_COOKIE_NAME : CSRF_COOKIE_NAME;
  const cookieToken = cookies[getCookieName(cookieBaseName)] || cookies[cookieBaseName];

  if (!headerToken) {
    throw new ForbiddenError('CSRF_FAILED: Missing x-csrf-token header');
  }
  if (!cookieToken) {
    throw new ForbiddenError('CSRF_FAILED: Missing CSRF cookie');
  }
  if (headerToken !== cookieToken) {
    throw new ForbiddenError('CSRF_FAILED: Mismatched CSRF header and cookie tokens');
  }

  // 4. Verify signature, timestamp, binding, and realm
  const parsed = parseAndVerifyToken(headerToken as string);

  if (parsed.realm !== expectedRealm) {
    throw new ForbiddenError(`CSRF_FAILED: Token issued for ${parsed.realm} realm cannot be used on ${expectedRealm}`);
  }

  if (parsed.bindingType !== expectedBindingType) {
    throw new ForbiddenError(`CSRF_FAILED: Invalid token binding type (${parsed.bindingType} !== ${expectedBindingType})`);
  }

  const expectedHash = computeSubjectHash(expectedSubjectId);
  if (parsed.subjectHash !== expectedHash) {
    throw new ForbiddenError('CSRF_FAILED: Token was not issued for the current subject identifier');
  }
}
