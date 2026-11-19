/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * Dashboard & Analytics Cache Layer (Redis-backed on VPS, TTL memory fallback in dev)
 */

import { getRedisClient } from './redisClient.ts';

interface MemoryCacheEntry {
  value: string;
  expiresAt: number;
}

const CACHE_PREFIX = 'suoxi:cache:';
const memoryFallback = new Map<string, MemoryCacheEntry>();

export async function getCachedValue<T>(key: string): Promise<T | null> {
  const fullKey = `${CACHE_PREFIX}${key}`;
  const redis = getRedisClient();

  if (redis) {
    try {
      const raw = await redis.get(fullKey);
      if (raw) return JSON.parse(raw) as T;
    } catch (err) {
      console.warn('[SUOXI Cache] Redis get fallback:', err instanceof Error ? err.message : err);
    }
  }

  const mem = memoryFallback.get(fullKey);
  if (mem && mem.expiresAt > Date.now()) {
    return JSON.parse(mem.value) as T;
  }
  if (mem) {
    memoryFallback.delete(fullKey);
  }
  return null;
}

export async function setCachedValue<T>(key: string, value: T, ttlSeconds = 45): Promise<void> {
  const fullKey = `${CACHE_PREFIX}${key}`;
  const serialized = JSON.stringify(value);
  const redis = getRedisClient();

  if (redis) {
    try {
      await redis.set(fullKey, serialized, 'EX', Math.max(5, ttlSeconds));
      return;
    } catch (err) {
      console.warn('[SUOXI Cache] Redis set fallback:', err instanceof Error ? err.message : err);
    }
  }

  memoryFallback.set(fullKey, {
    value: serialized,
    expiresAt: Date.now() + Math.max(5, ttlSeconds) * 1000,
  });
}

export async function getOrSetCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<{ data: T; cacheHit: boolean }> {
  const cached = await getCachedValue<T>(key);
  if (cached !== null) {
    return { data: cached, cacheHit: true };
  }

  const fresh = await fetcher();
  await setCachedValue(key, fresh, ttlSeconds);
  return { data: fresh, cacheHit: false };
}

export async function invalidateCachePrefixes(prefixes: string[]): Promise<number> {
  let deleted = 0;
  const redis = getRedisClient();

  for (const prefix of prefixes) {
    const fullPrefix = `${CACHE_PREFIX}${prefix}`;

    // Always clean local memory fallback
    for (const k of memoryFallback.keys()) {
      if (k.startsWith(fullPrefix)) {
        memoryFallback.delete(k);
        deleted++;
      }
    }

    if (redis) {
      try {
        let cursor = '0';
        do {
          const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${fullPrefix}*`, 'COUNT', 100);
          cursor = nextCursor;
          if (keys.length > 0) {
            deleted += await redis.del(...keys);
          }
        } while (cursor !== '0');
      } catch (err) {
        console.warn('[SUOXI Cache] Redis invalidation warning:', err instanceof Error ? err.message : err);
      }
    }
  }

  return deleted;
}
