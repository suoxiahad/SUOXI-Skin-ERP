/**
 * SUOXI Skin Care & Aesthetic Center ERP
 * Security Configuration, Production Fail-Closed Validator, Log Redaction & CSV Shield
 */

import crypto from 'node:crypto';

export interface SecurityValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Validates required production security invariants at startup.
 * In NODE_ENV=production, missing secrets, MySQL URLs, or demo flags MUST fail closed.
 */
export function validateProductionSecurity(env: NodeJS.ProcessEnv = process.env): SecurityValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProd = env.NODE_ENV === 'production';

  const dbUrl = (env.DATABASE_URL || '').trim();
  if (dbUrl.startsWith('mysql://')) {
    errors.push('DATABASE_URL must use PostgreSQL (postgresql://...). MySQL is decommissioned and unsupported.');
  }

  if (isProd) {
    if (!dbUrl || (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://'))) {
      errors.push('Production requires DATABASE_URL starting with postgresql:// or postgres://');
    }

    if (env.ENABLE_DEMO_ROLE_SWITCHER === 'true') {
      errors.push('ENABLE_DEMO_ROLE_SWITCHER=true is strictly forbidden in production.');
    }

    const sessionSecret = (env.SESSION_SECRET || env.JWT_SECRET || '').trim();
    if (sessionSecret.length < 32) {
      errors.push('Production requires SESSION_SECRET (or JWT_SECRET) of at least 32 characters.');
    }

    const masterKey = (env.APP_MASTER_KEY || '').trim();
    if (masterKey.length < 32) {
      errors.push('Production requires APP_MASTER_KEY of at least 32 characters for field/integration encryption.');
    }

    const corsOrigin = (env.CORS_ORIGIN || '').trim();
    if (!corsOrigin || corsOrigin === '*') {
      warnings.push('CORS_ORIGIN is unset or wildcard in production; restricting cross-origin requests to same-origin.');
    }
  } else {
    if (!dbUrl) {
      warnings.push('Running in non-production mode without DATABASE_URL.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function assertProductionSecurityOrThrow(env: NodeJS.ProcessEnv = process.env): void {
  const result = validateProductionSecurity(env);
  for (const w of result.warnings) {
    console.warn(`[SUOXI Security Warning] ${w}`);
  }
  if (!result.valid) {
    const msg = `[SUOXI Security FATAL] Startup refused due to insecure configuration:\n - ${result.errors.join('\n - ')}`;
    throw new Error(msg);
  }
}

/**
 * Returns a 32-byte AES-256 key derived from APP_MASTER_KEY.
 * In production, strictly fails closed if APP_MASTER_KEY is missing or < 32 chars.
 */
export function getEncryptionMasterKey(): Buffer {
  const raw = (process.env.APP_MASTER_KEY || '').trim();
  if (raw.length >= 32) {
    return crypto.createHash('sha256').update(raw).digest();
  }
  if (isProductionRuntime()) {
    throw new Error('APP_MASTER_KEY (>= 32 chars) is required in production');
  }
  // Ephemeral per-process random dev key when running locally without APP_MASTER_KEY
  if (!ephemeralDevKey) {
    ephemeralDevKey = crypto.randomBytes(32);
  }
  return ephemeralDevKey;
}

let ephemeralDevKey: Buffer | null = null;

export function encryptSensitiveValue(plaintext: string): {
  iv: string;
  authTag: string;
  ciphertext: string;
} {
  const key = getEncryptionMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
    ciphertext: encrypted.toString('hex'),
  };
}

export function decryptSensitiveValue(payload: {
  iv: string;
  authTag: string;
  ciphertext: string;
}): string {
  const key = getEncryptionMasterKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function encryptSecret(plaintext: string): string {
  const { iv, authTag, ciphertext } = encryptSensitiveValue(plaintext);
  return `${iv}.${authTag}.${ciphertext}`;
}

export function decryptSecret(encoded: string): string {
  const parts = encoded.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted secret payload');
  }
  const [iv, authTag, ciphertext] = parts;
  return decryptSensitiveValue({ iv, authTag, ciphertext });
}

export function maskSecret(value: string | undefined | null): string {
  if (!value || value.length === 0) return '';
  if (value.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(12, value.length - 4))}${value.slice(-4)}`;
}

const REDACT_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'pass',
  'smtppass',
  'smtp_pass',
  'apikey',
  'api_key',
  'secret',
  'token',
  'authorization',
  'cookie',
  'set-cookie',
  'x-csrf-token',
  'session_secret',
  'jwt_secret',
  'app_master_key',
  'payoutaccountnumber',
  'payout_account_number',
]);

export function redactSensitiveObject(input: unknown): unknown {
  if (input === null || input === undefined) return input;
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.map((v) => redactSensitiveObject(v));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const lk = k.toLowerCase();
    if (
      REDACT_KEYS.has(lk) ||
      lk.includes('password') ||
      lk.includes('secret') ||
      lk.includes('apikey') ||
      lk.includes('api_key') ||
      lk.includes('token')
    ) {
      out[k] = '[REDACTED]';
    } else if (typeof v === 'object' && v !== null) {
      out[k] = redactSensitiveObject(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Neutralizes CSV formula injection (Excel / LibreOffice DDE attacks)
 * and safely RFC-4180 quotes values.
 */
export function sanitizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function verifyHmacSignature(rawPayload: string, providedSignature: string | undefined, secret: string): boolean {
  if (!providedSignature || !secret) return false;
  const cleaned = providedSignature.replace(/^sha256=/i, '').trim();
  const expected = crypto.createHmac('sha256', secret).update(rawPayload, 'utf8').digest('hex');
  try {
    const a = Buffer.from(cleaned, 'hex');
    const b = Buffer.from(expected, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
