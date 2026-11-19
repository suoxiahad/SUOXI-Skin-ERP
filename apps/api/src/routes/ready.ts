import { Request, Response } from 'express';
import crypto from 'node:crypto';
import { checkDbHealth } from '../db/pool.js';
import type { ApiResponse, ReadinessCheckResponse } from '@suoxi/shared-types';

export async function handleReadinessCheck(req: Request, res: Response): Promise<Response> {
  const requestId = req.id || (typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : crypto.randomUUID());
  const timestamp = new Date().toISOString();

  const dbHealth = await checkDbHealth();
  const isDbReady = dbHealth.status === 'ready';

  const readinessData: ReadinessCheckResponse = {
    status: isDbReady ? 'ready' : 'not_ready',
    service: 'suoxi-api',
    dependencies: {
      database: {
        status: dbHealth.status,
        message: dbHealth.message || (isDbReady ? 'Connected and operational' : 'Database not fully ready'),
        latencyMs: dbHealth.latencyMs,
      },
      worker: {
        status: 'standby',
        message: 'Background worker queue initialized',
      },
    },
    timestamp,
  };

  const responseBody: ApiResponse<ReadinessCheckResponse> = {
    data: readinessData,
    meta: {
      requestId,
      timestamp,
    },
  };

  return res.status(isDbReady ? 200 : 503).json(responseBody);
}

/**
 * Kubernetes-style /readyz endpoint:
 * Returns HTTP 200 when database is fully operational,
 * and HTTP 503 Service Unavailable when database connection is unconfigured or pending schema.
 */
export async function handleReadyzCheck(req: Request, res: Response): Promise<Response> {
  const requestId = req.id || (typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : crypto.randomUUID());
  const timestamp = new Date().toISOString();

  const dbHealth = await checkDbHealth();
  const isReady = dbHealth.status === 'ready';

  const statusCode = isReady ? 200 : 503;

  return res.status(statusCode).json({
    status: isReady ? 'ready' : 'not_ready',
    database: {
      status: dbHealth.status,
      message: dbHealth.message,
    },
    requestId,
    timestamp,
  });
}
