import { Request, Response, NextFunction } from 'express';
import { getConfig } from '../config/env.js';

export function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction): void {
  // Defensive HTTP headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self' https:; frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self';"
  );

  try {
    const config = getConfig();
    if (config.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
  } catch {
    // If config fails, continue safely
  }

  next();
}

export function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  let allowedOrigin = '*';
  try {
    const config = getConfig();
    allowedOrigin = config.CORS_ORIGIN || '*';
  } catch {
    // fallback
  }

  const reqOrigin = req.headers.origin;
  if (reqOrigin && (allowedOrigin === '*' || reqOrigin === allowedOrigin || reqOrigin.endsWith('.run.app') || reqOrigin.includes('localhost') || reqOrigin.includes('127.0.0.1'))) {
    res.setHeader('Access-Control-Allow-Origin', reqOrigin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, Idempotency-Key, X-Request-Id, x-csrf-token'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id, Idempotent-Replay, x-csrf-token');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
}
