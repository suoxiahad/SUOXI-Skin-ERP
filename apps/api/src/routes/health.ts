import { Request, Response } from 'express';
import crypto from 'node:crypto';
import type { ApiResponse, HealthCheckResponse } from '@suoxi/shared-types';

export function handleHealthCheck(req: Request, res: Response): Response {
  const requestId = req.id || (typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : crypto.randomUUID());
  const timestamp = new Date().toISOString();

  const responseBody: ApiResponse<HealthCheckResponse> = {
    data: {
      status: 'healthy',
      service: 'suoxi-api',
      version: '0.1.0',
      uptimeSeconds: Math.floor(process.uptime() * 100) / 100,
      timestamp,
    },
    meta: {
      requestId,
      timestamp,
    },
  };

  return res.status(200).json(responseBody);
}
