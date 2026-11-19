import pino, { Logger, LoggerOptions } from 'pino';
import { getConfig } from '../config/env.js';

export const REDACTED_KEYS = [
  'password',
  '*.password',
  'pass',
  '*.pass',
  'token',
  '*.token',
  'secret',
  '*.secret',
  'authorization',
  'headers.authorization',
  'req.headers.authorization',
  'cookie',
  'headers.cookie',
  'req.headers.cookie',
  'jwt',
  '*.jwt',
  'apiKey',
  '*.apiKey',
  'SMS_GATEWAY_API_KEY',
  'credit_card',
  '*.credit_card',
  'pin',
  '*.pin',
  'nid',
  '*.nid',
  'sql',
  '*.sql',
  'err.sql',
  'body',
  'req.body',
  '*.body',
  'set-cookie',
  'headers.set-cookie',
];

export function createLogger(
  options?: Partial<LoggerOptions>,
  destination?: pino.DestinationStream
): Logger {
  let level = 'info';
  try {
    const config = getConfig();
    if (config.NODE_ENV === 'test') {
      level = 'silent';
    } else if (config.NODE_ENV === 'development') {
      level = 'debug';
    }
  } catch {
    // Fallback if config is not yet initialized
  }

  const pinoOpts: LoggerOptions = {
    level: options?.level || level,
    redact: {
      paths: REDACTED_KEYS,
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      service: 'suoxi-api',
      env: process.env.NODE_ENV || 'development',
    },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    ...options,
  };

  return destination ? pino(pinoOpts, destination) : pino(pinoOpts);
}

export const logger = createLogger();

export function createChildLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
