import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import crypto from 'node:crypto';
import { logger } from '../logger/logger.js';
import type { ApiError } from '@suoxi/shared-types';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad Request', details?: unknown) {
    super(400, 'BAD_REQUEST', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', details?: unknown) {
    super(401, 'UNAUTHORIZED', message, details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden', details?: unknown) {
    super(403, 'FORBIDDEN', message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: unknown) {
    super(404, 'NOT_FOUND', message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict with current state', details?: unknown) {
    super(409, 'CONFLICT', message, details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(422, 'VALIDATION_ERROR', message, details);
  }
}

export class UnprocessableEntityError extends ValidationError {}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests, please try again later', details?: unknown) {
    super(429, 'TOO_MANY_REQUESTS', message, details);
  }
}

export class InternalServerError extends AppError {
  constructor(message = 'Internal server error occurred', details?: unknown) {
    super(500, 'INTERNAL_ERROR', message, details);
  }
}

export function errorHandlerMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): Response {
  const reqAny = req as any;
  const requestId = reqAny.id || (typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : crypto.randomUUID());

  // 1. Zod Validation Error handling
  if (err instanceof ZodError) {
    const formattedIssues = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));

    const responsePayload: ApiError = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: formattedIssues,
        requestId,
      },
    };

    reqAny.log?.warn?.({ issues: formattedIssues }, 'Validation error on request');
    return res.status(422).json(responsePayload);
  }

  // 2. Controlled AppError handling
  if (err instanceof AppError) {
    const responsePayload: ApiError = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
        requestId,
      },
    };

    if (err.statusCode >= 500) {
      reqAny.log?.error?.({ err, code: err.code }, err.message);
    } else {
      reqAny.log?.warn?.({ code: err.code, details: err.details }, err.message);
    }

    return res.status(err.statusCode).json(responsePayload);
  }

  // 3. Catch-all for unhandled exceptions or raw SQL/DB errors
  // CRITICAL SECURITY RULE: NEVER leak database table names, SQL errors, connection strings, or stack traces!
  const unexpectedError = err instanceof Error ? err : new Error(String(err));
  
  if (reqAny.log) {
    reqAny.log.error({ err: unexpectedError }, 'Unhandled server exception caught by error middleware');
  } else {
    logger.error({ err: unexpectedError }, 'Unhandled server exception caught by error middleware');
  }

  const responsePayload: ApiError = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error occurred',
      requestId,
    },
  };

  return res.status(500).json(responsePayload);
}
