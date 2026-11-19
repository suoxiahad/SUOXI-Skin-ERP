import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';

// Load .env if present
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const envSchema = z.object({
  PORT: z
    .string()
    .default('3001')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0 && val <= 65535, {
      message: 'PORT must be a valid port number between 1 and 65535',
    }),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z
    .string()
    .default('3308')
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0 && val <= 65535, {
      message: 'DB_PORT must be a valid port number',
    }),
  DB_USER: z.string().default('suoxi_app'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('suoxi_crm'),
  DB_POOL_MIN: z
    .string()
    .default('2')
    .transform((val) => parseInt(val, 10)),
  DB_POOL_MAX: z
    .string()
    .default('10')
    .transform((val) => parseInt(val, 10)),
  DB_CONNECTION_TIMEOUT_MS: z
    .string()
    .default('5000')
    .transform((val) => parseInt(val, 10)),
  JWT_SECRET: z
    .string()
    .default('suoxi_dev_only_jwt_secret_must_be_min_32_chars_long')
    .refine(
      (val) => process.env.NODE_ENV !== 'production' || val.length >= 32,
      {
        message: 'JWT_SECRET must be at least 32 characters in production',
      }
    ),
  SMS_GATEWAY_API_KEY: z.string().optional(),
  SMS_GATEWAY_SENDER_ID: z.string().default('SUOXI'),
  CORS_ORIGIN: z.string().default('*'),
});

export type AppConfig = z.infer<typeof envSchema>;

export function parseConfig(envInput: Record<string, string | undefined> = process.env): AppConfig {
  return envSchema.parse(envInput);
}

// Redacted config representation for safe logging & health inspections (secrets never shown)
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
    DB_POOL_MIN: config.DB_POOL_MIN,
    DB_POOL_MAX: config.DB_POOL_MAX,
    DB_CONNECTION_TIMEOUT_MS: config.DB_CONNECTION_TIMEOUT_MS,
    JWT_SECRET: '[REDACTED]',
    SMS_GATEWAY_API_KEY: config.SMS_GATEWAY_API_KEY ? '[REDACTED]' : '[UNSET]',
    SMS_GATEWAY_SENDER_ID: config.SMS_GATEWAY_SENDER_ID,
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
