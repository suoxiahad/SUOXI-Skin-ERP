import { Request, Response, NextFunction } from 'express';

/**
 * Safe HTTP Request Logger Middleware
 * 
 * Enforces strict security & privacy rules:
 * - Logs HTTP method, sanitized path, status code, duration, and requestId.
 * - NEVER logs request bodies or response bodies.
 * - NEVER logs authorization headers, cookies, tokens, or passwords.
 */
export function requestLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    // Strip query parameters to avoid logging sensitive query strings
    const sanitizedUrl = req.originalUrl ? req.originalUrl.split('?')[0] : req.url.split('?')[0];

    req.log?.info?.(
      {
        method: req.method,
        url: sanitizedUrl,
        statusCode: res.statusCode,
        durationMs,
      },
      'HTTP request completed'
    );
  });

  next();
}
