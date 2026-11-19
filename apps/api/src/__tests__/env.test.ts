import { parseConfig, getRedactedConfig } from '../config/env.js';
import { ZodError } from 'zod';

export async function runEnvTests(): Promise<void> {
  console.log('[TEST-SUITE] Running Environment Validation Tests...');

  // 1. Valid default parsing
  const config = parseConfig({
    PORT: '4000',
    NODE_ENV: 'test',
    DB_HOST: '127.0.0.1',
    DB_PORT: '3306',
    DB_NAME: 'suoxi_crm_test',
  });

  if (config.PORT !== 4000) {
    throw new Error(`Expected PORT 4000, got ${config.PORT}`);
  }
  if (config.NODE_ENV !== 'test') {
    throw new Error(`Expected NODE_ENV 'test', got ${config.NODE_ENV}`);
  }
  console.log('  ✓ Environment parses valid options and coerces types');

  // 2. Invalid port fails validation
  try {
    parseConfig({ PORT: '999999' });
    throw new Error('Expected invalid port to throw validation error');
  } catch (err) {
    if (!(err instanceof ZodError)) {
      throw new Error(`Expected ZodError, got ${err}`);
    }
    console.log('  ✓ Invalid port rejects with Zod validation error');
  }

  // 3. Secret redaction check
  const sensitiveConfig = parseConfig({
    PORT: '3001',
    DB_PASSWORD: 'super_secret_database_password_123',
    DATABASE_URL: 'mysql://user:super_secret_pw@localhost:3308/db',
    JWT_SECRET: 'a_long_super_secret_key_that_is_32_characters_minimum',
    SMS_GATEWAY_API_KEY: 'sms_secret_gateway_key_999',
  });

  const redacted = getRedactedConfig(sensitiveConfig);

  if (JSON.stringify(redacted).includes('super_secret_database_password_123')) {
    throw new Error('Database password was not redacted!');
  }
  if (JSON.stringify(redacted).includes('super_secret_pw')) {
    throw new Error('Database URL secret was not redacted!');
  }
  if (JSON.stringify(redacted).includes('a_long_super_secret_key_that_is_32_characters_minimum')) {
    throw new Error('JWT secret was not redacted!');
  }
  if (JSON.stringify(redacted).includes('sms_secret_gateway_key_999')) {
    throw new Error('SMS Gateway API Key was not redacted!');
  }
  if (redacted.DB_PASSWORD !== '[REDACTED]' || redacted.JWT_SECRET !== '[REDACTED]') {
    throw new Error('Expected masked [REDACTED] value');
  }
  console.log('  ✓ getRedactedConfig successfully masks all passwords, tokens, and secrets');
}
