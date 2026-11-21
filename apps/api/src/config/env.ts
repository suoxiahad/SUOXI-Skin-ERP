import crypto from 'node:crypto';
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const DEV_ONLY_JWT_PLACEHOLDER = 'suoxi_dev_only_jwt_secret_must_be_min_32_chars_long';
const EPHEMERAL_CLOUD_RUN_JWT_SECRET = crypto.randomBytes(32).toString('hex');

function isManagedCloudRunWithoutDb(envInput: Record<string, string | undefined>): boolean {
  const isCloudRun = Boolean(
    (envInput.K_SERVICE || envInput.K_REVISION || envInput.K_CONFIGURATION || '').trim()
  );
  const hasDb = Boolean(
    (envInput.DATABASE_URL || '').trim() ||
      (envInput.PGHOST && envInput.PGDATABASE && envInput.PGUSER)
  );
  return isCloudRun && !hasDb && envInput.REQUIRE_AUTH !== 'true';
}

export const envSchema = z
  .object({
    PORT: z
      .string()
      .default('3001')
      .transform((val) => parseInt(val, 10))
      .refine((val) => !isNaN(val) && val > 0 && val <= 65535, {
        message: 'PORT must be a valid port number between 1 and 65535',
      }),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    DATABASE_URL: z.string().optional(),
    DB_HOST: z.string().default('127.0.0.1'),
    DB_PORT: z
      .string()
      .default('5432')
      .transform((val) => parseInt(val, 10))
      .refine((val) => !isNaN(val) && val > 0 && val <= 65535, {
        message: 'DB_PORT must be a valid port number',
      }),
    DB_USER: z.string().default('suoxi_app'),
    DB_PASSWORD: z.string().default(''),
    DB_NAME: z.string().default('suoxi_erp'),
    DB_POOL_MIN: z
      .string()
      .default('2')
      .transform((val) => parseInt(val, 10)),
    DB_POOL_MAX: z
      .string()
      .default('20')
      .transform((val) => parseInt(val, 10)),
    DB_CONNECTION_TIMEOUT_MS: z
      .string()
      .default('5000')
      .transform((val) => parseInt(val, 10)),
    REDIS_URL: z.string().optional(),
    JWT_SECRET: z.string().default(DEV_ONLY_JWT_PLACEHOLDER),
    APP_MASTER_KEY: z.string().optional(),
    SMS_GATEWAY_API_KEY: z.string().optional(),
    SMS_GATEWAY_SENDER_ID: z.string().default('SUOXI'),
    SMS_WEBHOOK_SECRET: z.string().optional(),
    CORS_ORIGIN: z.string().default('*'),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === 'production') {
      if (!data.JWT_SECRET || data.JWT_SECRET.length < 32 || data.JWT_SECRET === DEV_ONLY_JWT_PLACEHOLDER) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'JWT_SECRET must be at least 32 characters and non-default in production',
        });
      }
      if (data.DATABASE_URL && data.DATABASE_URL.startsWith('mysql://')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATABASE_URL'],
          message: 'MySQL is unsupported. DATABASE_URL must use postgresql://',
        });
      }
    }
  });

export type AppConfig = z.infer<typeof envSchema>;

export function parseConfig(envInput: Record<string, string | undefined> = process.env): AppConfig {
  const normalized: Record<string, string | undefined> = { ...envInput };
  const rawJwt = (normalized.JWT_SECRET || '').trim();
  const rawSession = (normalized.SESSION_SECRET || '').trim();

  if ((!rawJwt || rawJwt === DEV_ONLY_JWT_PLACEHOLDER) && rawSession.length >= 32) {
    normalized.JWT_SECRET = rawSession;
  } else if (
    normalized.NODE_ENV === 'production' &&
    isManagedCloudRunWithoutDb(normalized) &&
    (!rawJwt || rawJwt.length < 32 || rawJwt === DEV_ONLY_JWT_PLACEHOLDER)
  ) {
    normalized.JWT_SECRET = EPHEMERAL_CLOUD_RUN_JWT_SECRET;
  }

  return envSchema.parse(normalized);
}

export function getRedactedConfig(config: AppConfig): Record<string, unknown> {
  return {
    PORT: config.PORT,
    NODE_ENV: config.NODE_ENV,
    DB_HOST: config.DB_HOST,
    DB_PORT: config.DB_PORT,
    DB_USER: config.DB_USER,
    DB_PASSWORD: config.DB_PASSWORD ? '[REDACTED]' : '[UNSET]',
    DB_NAME: config.DB_NAME,
    DATABASE_URL: config.DATABASE_URL ? '[REDACTED_URL]' : '[UNSET]',
    REDIS_URL: config.REDIS_URL ? '[REDACTED_URL]' : '[UNSET]',
    DB_POOL_MIN: config.DB_POOL_MIN,
    DB_POOL_MAX: config.DB_POOL_MAX,
    DB_CONNECTION_TIMEOUT_MS: config.DB_CONNECTION_TIMEOUT_MS,
    JWT_SECRET: '[REDACTED]',
    APP_MASTER_KEY: config.APP_MASTER_KEY ? '[REDACTED]' : '[UNSET]',
    SMS_GATEWAY_API_KEY: config.SMS_GATEWAY_API_KEY ? '[REDACTED]' : '[UNSET]',
    SMS_GATEWAY_SENDER_ID: config.SMS_GATEWAY_SENDER_ID,
    SMS_WEBHOOK_SECRET: config.SMS_WEBHOOK_SECRET ? '[REDACTED]' : '[UNSET]',
    CORS_ORIGIN: config.CORS_ORIGIN,
  };
}

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = parseConfig();
  }
  return cachedConfig;
}

export function resetConfigCache(): void {
  cachedConfig = null;
}
