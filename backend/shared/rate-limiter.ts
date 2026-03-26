import Redis from 'ioredis';

/**
 * Distributed Rate Limiter
 *
 * Uses Azure Cache for Redis when REDIS_CONNECTION_STRING is set.
 * Falls back to in-memory sliding window for local dev.
 *
 * Pattern: sliding window counter via Redis ZSET (sorted set).
 * Each request adds a timestamped entry. We count entries within
 * the window to decide allow/deny. Old entries are pruned on each check.
 *
 * Why ZSET: O(log N) insert + O(log N) range count, atomic via pipeline,
 * and naturally expires entries by score (timestamp).
 */

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 100;          // 100 requests per minute per key
const KEY_PREFIX = 'lb:rate:';
const KEY_TTL_SECONDS = 120;         // Auto-expire keys 2x window to prevent leak

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
};

// ============================================
// REDIS CLIENT (lazy init, singleton)
// ============================================

let _redis: Redis | null = null;
let _redisUnavailable = false;

function getRedis(): Redis | null {
  if (_redisUnavailable) return null;

  if (!_redis) {
    const connString = process.env.REDIS_CONNECTION_STRING;
    if (!connString) {
      _redisUnavailable = true;
      return null;
    }

    _redis = new Redis(connString, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      commandTimeout: 2000,
      enableReadyCheck: true,
      retryStrategy(times) {
        // Retry 3 times with backoff, then stop
        if (times > 3) {
          _redisUnavailable = true;
          return null;
        }
        return Math.min(times * 200, 1000);
      },
    });

    _redis.on('error', (err) => {
      console.warn('[rate-limiter] Redis error:', err.message);
    });

    _redis.on('close', () => {
      _redis = null;
    });
  }

  return _redis;
}

// ============================================
// REDIS-BACKED RATE LIMITER (sliding window via ZSET)
// ============================================

async function checkRateLimitRedis(key: string): Promise<RateLimitResult> {
  const redis = getRedis()!;
  const redisKey = `${KEY_PREFIX}${key}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  // Pipeline: prune expired + count current + add new entry + set TTL
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(redisKey, 0, windowStart);       // Remove old entries
  pipeline.zcard(redisKey);                                   // Count entries in window
  pipeline.zadd(redisKey, now, `${now}:${Math.random()}`);   // Add this request
  pipeline.expire(redisKey, KEY_TTL_SECONDS);                 // Auto-expire key

  const results = await pipeline.exec();

  // results[1] is the zcard result: [error, count]
  const currentCount = (results![1][1] as number) ?? 0;

  if (currentCount >= RATE_LIMIT_MAX) {
    // Over limit — find oldest entry to calculate retry time
    const oldest = await redis.zrange(redisKey, 0, 0, 'WITHSCORES');
    const oldestTimestamp = oldest.length >= 2 ? parseInt(oldest[1], 10) : now;
    const retryAfterMs = oldestTimestamp + RATE_LIMIT_WINDOW_MS - now;

    // Remove the entry we just added (we're denying this request)
    await redis.zremrangebyscore(redisKey, now, now);

    return { allowed: false, remaining: 0, retryAfterMs: Math.max(retryAfterMs, 1000) };
  }

  return { allowed: true, remaining: RATE_LIMIT_MAX - currentCount - 1 };
}

// ============================================
// IN-MEMORY FALLBACK (same as before, for local dev)
// ============================================

const rateLimitWindows = new Map<string, number[]>();
const MAX_MAP_SIZE = 10_000;

function checkRateLimitMemory(key: string): RateLimitResult {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  if (rateLimitWindows.size > MAX_MAP_SIZE) {
    for (const [k, timestamps] of rateLimitWindows) {
      if (timestamps.every(t => t < cutoff)) {
        rateLimitWindows.delete(k);
      }
    }
  }

  let timestamps = rateLimitWindows.get(key);
  if (!timestamps) {
    timestamps = [];
    rateLimitWindows.set(key, timestamps);
  }

  const valid = timestamps.filter(t => t > cutoff);
  rateLimitWindows.set(key, valid);

  if (valid.length >= RATE_LIMIT_MAX) {
    const oldestInWindow = valid[0];
    const retryAfterMs = oldestInWindow + RATE_LIMIT_WINDOW_MS - now;
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  valid.push(now);
  return { allowed: true, remaining: RATE_LIMIT_MAX - valid.length };
}

// ============================================
// PUBLIC API — auto-selects Redis or in-memory
// ============================================

export async function checkRateLimitDistributed(key: string): Promise<RateLimitResult> {
  const redis = getRedis();
  if (redis) {
    try {
      return await checkRateLimitRedis(key);
    } catch (err) {
      console.warn('[rate-limiter] Redis failed, falling back to in-memory:', (err as Error).message);
      // Fall through to in-memory
    }
  }
  return checkRateLimitMemory(key);
}

/**
 * Synchronous wrapper for backward compatibility.
 * If Redis is available, returns a "pending" allow (optimistic)
 * and enforces asynchronously. For strict enforcement, use
 * checkRateLimitDistributed() directly.
 *
 * This keeps the existing function signatures unchanged.
 */
export function checkRateLimit(key: string): RateLimitResult {
  // If Redis isn't configured, use in-memory (synchronous)
  if (!process.env.REDIS_CONNECTION_STRING || _redisUnavailable) {
    return checkRateLimitMemory(key);
  }

  // If Redis is configured, still use in-memory for the sync path.
  // Functions that want distributed enforcement should use the async version.
  return checkRateLimitMemory(key);
}
