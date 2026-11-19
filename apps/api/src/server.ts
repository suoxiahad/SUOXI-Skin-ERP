import { createApiApp } from './app.js';
import { getConfig, getRedactedConfig } from './config/env.js';
import { logger } from './logger/logger.js';
import { closeDbPool } from './db/pool.js';

const config = getConfig();
const app = createApiApp();

logger.info(
  { config: getRedactedConfig(config) },
  'Starting SUOXI Skin Care & Aesthetic Center CRM API Server'
);

const server = app.listen(config.PORT, '0.0.0.0', () => {
  logger.info(`SUOXI CRM API Server listening on http://0.0.0.0:${config.PORT}`);
});

async function handleShutdown(signal: string) {
  logger.info(`Received ${signal}. Gracefully terminating server...`);
  server.close(async () => {
    logger.info('HTTP server closed. Terminating database connections...');
    await closeDbPool();
    logger.info('Graceful shutdown completed.');
    process.exit(0);
  });

  // Force shutdown after 10s if graceful close stalls
  setTimeout(() => {
    logger.error('Forced shutdown due to timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

export { server };
