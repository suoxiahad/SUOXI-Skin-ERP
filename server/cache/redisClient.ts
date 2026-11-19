/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * Redis Connection Manager (VPS Production: Sessions, Dashboard Cache & BullMQ)
 *
 * Activates automatically when `REDIS_URL` (redis://... or rediss://...) is configured.
 * Gracefully stays dormant in preview/local mode when `REDIS_URL` is absent.
 */

import Redis from 'ioredis';

let redisClient: Redis | null = null;
let redisConnectFailed = false;

export function isRedisConfigured(): boolean {
  const url = (process.env.REDIS_URL || '').trim();
  return url.startsWith('redis://') || url.startsWith('rediss://');
}

export function getRedisClient(): Redis | null {
  if (!isRedisConfigured() || redisConnectFailed) {
    return null;
  }

  if (!redisClient) {
    const url = process.env.REDIS_URL!.trim();
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy(times) {
        if (times > 5) {
          return null;
        }
        return Math.min(times * 250, 2000);
      },
    });

    redisClient.on('error', (err) => {
      console.error('[SUOXI Redis] Connection error:', err.message);
    });

    redisClient.on('ready', () => {
      redisConnectFailed = false;
      console.log('[SUOXI Redis] Connected and ready.');
    });
  }

  return redisClient;
}

/**
 * BullMQ requires a dedicated connection options object with `maxRetriesPerRequest: null`.
 */
export function getBullMqConnectionOptions(): {
  host: string;
  port: number;
  password?: string;
  username?: string;
  db?: number;
  tls?: Record<string, unknown>;
  maxRetriesPerRequest: null;
} | null {
  if (!isRedisConfigured()) return null;
  try {
    const parsed = new URL(process.env.REDIS_URL!.trim());
    const dbSegment = parsed.pathname.replace(/^\//, '');
    return {
      host: parsed.hostname || '127.0.0.1',
      port: parsed.port ? parseInt(parsed.port, 10) : 6379,
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      db: dbSegment ? parseInt(dbSegment, 10) || 0 : 0,
      ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
      maxRetriesPerRequest: null,
    };
  } catch {
    return null;
  }
}

export async function checkRedisHealth(): Promise<{
  ok: boolean;
  latencyMs?: number;
  mode: 'redis' | 'disabled';
  error?: string;
}> {
  if (!isRedisConfigured()) {
    return { ok: false, mode: 'disabled', error: 'not_configured' };
  }

  const client = getRedisClient();
  if (!client) {
    return { ok: false, mode: 'redis', error: 'client_unavailable' };
  }

  const started = Date.now();
  try {
    const pong = await client.ping();
    return {
      ok: pong === 'PONG',
      latencyMs: Date.now() - started,
      mode: 'redis',
    };
  } catch (err) {
    return {
      ok: false,
      mode: 'redis',
      error: err instanceof Error ? err.message : 'redis_ping_failed',
    };
  }
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      redisClient.disconnect();
    }
    redisClient = null;
  }
}
