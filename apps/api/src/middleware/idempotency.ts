import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { BadRequestError, ConflictError, ValidationError } from './errorHandler.js';
import { logger } from '../logger/logger.js';

export interface IdempotencyRecord {
  idempotencyKey: string;
  routePath: string;
  requestPayloadHash: string;
  status: 'pending' | 'completed' | 'failed';
  responseStatusCode?: number;
  responseBody?: string;
  createdAt: number;
}

export interface IdempotencyStore {
  get(key: string, routePath: string): Promise<IdempotencyRecord | null>;
  setPending(key: string, routePath: string, payloadHash: string): Promise<void>;
  setCompleted(
    key: string,
    routePath: string,
    statusCode: number,
    responseBody: string
  ): Promise<void>;
  setFailed(key: string, routePath: string): Promise<void>;
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private records = new Map<string, IdempotencyRecord>();

  private makeKey(key: string, routePath: string): string {
    return `${routePath}:${key}`;
  }

  async get(key: string, routePath: string): Promise<IdempotencyRecord | null> {
    const record = this.records.get(this.makeKey(key, routePath));
    return record ? { ...record } : null;
  }

  async setPending(key: string, routePath: string, payloadHash: string): Promise<void> {
    this.records.set(this.makeKey(key, routePath), {
      idempotencyKey: key,
      routePath,
      requestPayloadHash: payloadHash,
      status: 'pending',
      createdAt: Date.now(),
    });
  }

  async setCompleted(
    key: string,
    routePath: string,
    statusCode: number,
    responseBody: string
  ): Promise<void> {
    const existing = this.records.get(this.makeKey(key, routePath));
    if (existing) {
      existing.status = 'completed';
      existing.responseStatusCode = statusCode;
      existing.responseBody = responseBody;
    }
  }

  async setFailed(key: string, routePath: string): Promise<void> {
    const existing = this.records.get(this.makeKey(key, routePath));
    if (existing) {
      existing.status = 'failed';
    }
  }

  clear(): void {
    this.records.clear();
  }
}

let activeStore: IdempotencyStore = new InMemoryIdempotencyStore();

export function setIdempotencyStore(store: IdempotencyStore): void {
  activeStore = store;
}

export function getIdempotencyStore(): IdempotencyStore {
  return activeStore;
}

export function computePayloadHash(payload: unknown): string {
  const normalized = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
  return crypto.createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export interface IdempotencyOptions {
  required?: boolean;
  store?: IdempotencyStore;
}

/**
 * Enforces idempotency for sensitive mutating actions (payments, refunds, stock adjustments).
 * Returns cached responses on replays with `Idempotent-Replay: true`.
 * Blocks concurrent duplicate in-flight requests with 409 Conflict.
 */
export function idempotencyMiddleware(options: IdempotencyOptions = {}) {
  const isRequired = options.required ?? true;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only apply to mutating HTTP methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = req.headers['idempotency-key'];

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
      if (isRequired) {
        return next(
          new BadRequestError('Missing required Idempotency-Key header for mutating request')
        );
      }
      return next();
    }

    const trimmedKey = idempotencyKey.trim();
    if (trimmedKey.length > 128) {
      return next(new BadRequestError('Idempotency-Key must not exceed 128 characters'));
    }

    const store = options.store || activeStore;
    const routePath = req.baseUrl + (req.route?.path || req.path);
    const payloadHash = computePayloadHash(req.body);

    try {
      const existing = await store.get(trimmedKey, routePath);

      if (existing) {
        if (existing.status === 'pending') {
          return next(
            new ConflictError(
              'A request with this Idempotency-Key is currently being processed. Please retry shortly.'
            )
          );
        }

        if (existing.status === 'completed') {
          // Verify payload hash matches
          if (existing.requestPayloadHash !== payloadHash) {
            return next(
              new ValidationError(
                'Idempotency-Key has already been used with a different request payload'
              )
            );
          }

          // Return cached response with Idempotent-Replay header
          res.setHeader('Idempotent-Replay', 'true');
          res.status(existing.responseStatusCode || 200);

          if (existing.responseBody) {
            try {
              const parsed = JSON.parse(existing.responseBody);
              res.json(parsed);
              return;
            } catch {
              res.send(existing.responseBody);
              return;
            }
          } else {
            res.end();
            return;
          }
        }
      }

      // Record as pending
      await store.setPending(trimmedKey, routePath, payloadHash);

      // Intercept response methods to cache result on completion
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = function (body: unknown): Response {
        const statusCode = res.statusCode;
        const serialized = JSON.stringify(body);

        if (statusCode < 500) {
          store.setCompleted(trimmedKey, routePath, statusCode, serialized).catch((err) => {
            logger.warn({ err }, 'Failed to set idempotency completed state');
          });
        } else {
          store.setFailed(trimmedKey, routePath).catch(() => {});
        }

        return originalJson(body);
      };

      res.send = function (body: unknown): Response {
        const statusCode = res.statusCode;
        const serialized = typeof body === 'string' ? body : JSON.stringify(body);

        if (statusCode < 500) {
          store.setCompleted(trimmedKey, routePath, statusCode, serialized).catch((err) => {
            logger.warn({ err }, 'Failed to set idempotency completed state');
          });
        } else {
          store.setFailed(trimmedKey, routePath).catch(() => {});
        }

        return originalSend(body);
      };

      next();
    } catch (err) {
      next(err);
    }
  };
}
