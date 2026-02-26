import { getRedisClient } from '@/lib/redis';

type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetInMs: number;
};

class RedisRateLimiter {
  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const redis = getRedisClient();
    const redisKey = `chat:rate:${key}`;
    const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, windowSeconds);
    }

    const ttlSeconds = await redis.ttl(redisKey);
    const resetInMs = (typeof ttlSeconds === 'number' && ttlSeconds > 0 ? ttlSeconds : windowSeconds) * 1000;

    if (count > limit) {
      return {
        ok: false,
        remaining: 0,
        resetInMs
      };
    }

    return {
      ok: true,
      remaining: Math.max(0, limit - count),
      resetInMs
    };
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __redisRateLimiter: RedisRateLimiter | undefined;
}

export const rateLimiter = globalThis.__redisRateLimiter ?? (globalThis.__redisRateLimiter = new RedisRateLimiter());