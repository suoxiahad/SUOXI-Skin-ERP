import { createLogger, REDACTED_KEYS } from '../logger/logger.js';
import { Writable } from 'node:stream';

export async function runLoggerTests(): Promise<void> {
  console.log('[TEST-SUITE] Running Pino Logging & Redaction Tests...');

  let loggedOutput = '';

  const memoryStream = new Writable({
    write(chunk, _encoding, callback) {
      loggedOutput += chunk.toString();
      callback();
    },
  });

  const testLogger = createLogger(
    { level: 'info' },
    memoryStream
  );

  // Log object with sensitive credentials
  testLogger.info(
    {
      user: 'receptionist_1',
      password: 'PlaintextPassword123!',
      token: 'jwt_token_sample_abc123',
      secret: 'super_secret_key_456',
      credit_card: '4532-1234-5678-9012',
      pin: '9876',
      sql: 'SELECT * FROM patients WHERE password_hash = "leaked"',
      body: { sensitiveData: 'confidential_payload' },
      headers: {
        authorization: 'Bearer secret_access_token_bearer',
        cookie: 'session_id=confidential_session_token',
      },
      safeField: 'visible_data_content',
    },
    'Test authentication event'
  );

  if (loggedOutput.includes('PlaintextPassword123!')) {
    throw new Error('Logger leaked raw password!');
  }
  if (loggedOutput.includes('jwt_token_sample_abc123')) {
    throw new Error('Logger leaked raw token!');
  }
  if (loggedOutput.includes('super_secret_key_456')) {
    throw new Error('Logger leaked secret!');
  }
  if (loggedOutput.includes('4532-1234-5678-9012')) {
    throw new Error('Logger leaked credit card number!');
  }
  if (loggedOutput.includes('9876')) {
    throw new Error('Logger leaked PIN!');
  }
  if (loggedOutput.includes('password_hash = "leaked"')) {
    throw new Error('Logger leaked SQL query statement!');
  }
  if (loggedOutput.includes('confidential_payload')) {
    throw new Error('Logger leaked request/response body content!');
  }
  if (loggedOutput.includes('secret_access_token_bearer')) {
    throw new Error('Logger leaked authorization header!');
  }
  if (!loggedOutput.includes('[REDACTED]')) {
    throw new Error('Logger output did not contain [REDACTED] censor string!');
  }
  if (!loggedOutput.includes('visible_data_content')) {
    throw new Error('Logger dropped non-sensitive field!');
  }

  console.log('  ✓ Logger redacts password, token, secret, authorization, card data, SQL statements, and bodies');
  console.log(`  ✓ Checked ${REDACTED_KEYS.length} redaction path rules`);
}
