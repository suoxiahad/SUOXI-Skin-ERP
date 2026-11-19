import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { logger } from '../logger/logger.js';
import type { Logger } from 'pino';

// Extend Express Request type to include id and child logger
declare global {
  namespace Express {
    interface Request {
      id: string;
      log: Logger;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Read incoming header or generate a cryptographically strong UUID v4
  const incomingId = req.headers['x-request-id'];
  let requestId: string;

  if (typeof incomingId === 'string' && incomingId.trim().length > 0 && incomingId.length <= 128) {
    // Sanitize to alphanumeric + hyphens
    requestId = incomingId.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  } else {
    requestId = crypto.randomUUID();
  }

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  req.log = logger.child({ requestId });

  next();
}
