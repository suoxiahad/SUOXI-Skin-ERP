import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { notificationService } from '../services/notificationService.js';
import { BadRequestError } from '../middleware/errorHandler.js';

export const webhooksRouter = Router();

// Notice: In accordance with Section B.5a, external webhook endpoints (e.g. gateway delivery receipts)
// are strictly exempt from CSRF cookie/token validation because they are machine-to-machine HTTP callbacks.

webhooksRouter.post('/sms/:provider', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const provider = req.params.provider;
    const payload = req.body || {};

    const signature = (req.headers['x-webhook-signature'] ||
      req.headers['x-signature'] ||
      req.headers['x-elitbuzz-signature']) as string | undefined;

    const timestamp = (req.headers['x-webhook-timestamp'] ||
      req.headers['x-timestamp']) as string | undefined;

    // Process webhook receipt
    const result = await notificationService.processDeliveryWebhook({
      provider,
      payload,
      signatureHeader: signature,
      timestampHeader: timestamp,
    });

    res.status(200).json({
      data: result,
      meta: {
        provider,
        requestId: req.id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});
