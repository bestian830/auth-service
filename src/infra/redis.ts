import Redis from 'ioredis';
import { env } from '../config/env.js';

let redis: Redis | null = null;

export async function getRedisClient(): Promise<Redis> {
  if (!redis) {
    redis = new Redis(env.redisUrl, {
      password: env.redisPassword || undefined,
      db: env.redisDb,
      connectTimeout: env.redisConnectTimeout,
      commandTimeout: env.redisCommandTimeout,
      maxRetriesPerRequest: env.redisMaxRetries,
      lazyConnect: true
    });

    // Set up event handlers
    redis.on('connect', () => {
      console.log('Redis connected successfully');
    });
    
    redis.on('error', (err: any) => {
      console.error('Redis connection error:', err);
    });
    
    redis.on('reconnecting', () => {
      console.log('Redis reconnecting...');
    });

    try {
      await redis.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      redis = null;
      throw error;
    }
  }

  return redis;
}

export async function closeRedisConnection(): Promise<void> {
  if (redis) {
    await redis.disconnect();
    redis = null;
  }
}

export function isRedisConnected(): boolean {
  return redis?.status === 'ready';
}

// Rate limiting specific Redis operations
export class RedisRateLimiter {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async checkLimit(key: string, maxRequests: number, windowSeconds: number): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const windowStart = now - windowMs;

    const pipeline = this.redis.pipeline();
    
    // Remove expired entries
    pipeline.zremrangebyscore(key, '-inf', windowStart);
    
    // Count current requests
    pipeline.zcard(key);
    
    // Add current request
    pipeline.zadd(key, now, now);
    
    // Set expiry for cleanup
    pipeline.expire(key, windowSeconds);
    
    const results = await pipeline.exec();
    
    if (!results) {
      throw new Error('Redis pipeline execution failed');
    }

    const currentCount = (results[1][1] as number) + 1; // +1 for the request we just added
    
    return {
      allowed: currentCount <= maxRequests,
      remaining: Math.max(0, maxRequests - currentCount),
      resetTime: now + windowMs
    };
  }

  async isUserLocked(userId: string): Promise<{
    locked: boolean;
    until?: number;
    reason?: string;
  }> {
    const lockKey = `user_lock:${userId}`;
    const lockData = await this.redis.hgetall(lockKey);
    
    if (!lockData.until) {
      return { locked: false };
    }
    
    const until = parseInt(lockData.until);
    const now = Date.now();
    
    if (now >= until) {
      // Lock expired, clean up
      await this.redis.del(lockKey);
      return { locked: false };
    }
    
    return {
      locked: true,
      until,
      reason: lockData.reason
    };
  }

  async lockUser(userId: string, durationMs: number, reason: string): Promise<void> {
    const lockKey = `user_lock:${userId}`;
    const until = Date.now() + durationMs;
    
    await this.redis.hset(lockKey, {
      until: until.toString(),
      reason,
      lockedAt: Date.now().toString()
    });
    
    await this.redis.expire(lockKey, Math.ceil(durationMs / 1000));
  }

  async unlockUser(userId: string): Promise<void> {
    const lockKey = `user_lock:${userId}`;
    await this.redis.del(lockKey);
  }

  async getLoginFailureCount(userId: string): Promise<number> {
    const failureKey = `login_failures:${userId}`;
    const count = await this.redis.get(failureKey);
    return count ? parseInt(count) : 0;
  }

  async incrementLoginFailures(userId: string, windowSeconds: number = 1800): Promise<number> {
    const failureKey = `login_failures:${userId}`;
    const count = await this.redis.incr(failureKey);
    
    if (count === 1) {
      await this.redis.expire(failureKey, windowSeconds);
    }
    
    return count;
  }

  async resetLoginFailures(userId: string): Promise<void> {
    const failureKey = `login_failures:${userId}`;
    await this.redis.del(failureKey);
  }
}

export async function createRateLimiter(): Promise<RedisRateLimiter> {
  const redis = await getRedisClient();
  return new RedisRateLimiter(redis);
}

// v0.2.8: JTI Cache for device proof replay protection
export class JTICache {
  private redis: Redis;
  private keyPrefix: string;

  constructor(redis: Redis, keyPrefix: string = 'jti') {
    this.redis = redis;
    this.keyPrefix = keyPrefix;
  }

  private getKey(jti: string): string {
    return `${env.redisNamespace}:${this.keyPrefix}:${jti}`;
  }

  async set(jti: string, value: string, ttlSeconds: number): Promise<void> {
    const key = this.getKey(jti);
    await this.redis.setex(key, ttlSeconds, value);
  }

  async exists(jti: string): Promise<boolean> {
    const key = this.getKey(jti);
    const result = await this.redis.exists(key);
    return result === 1;
  }

  async get(jti: string): Promise<string | null> {
    const key = this.getKey(jti);
    return await this.redis.get(key);
  }

  async delete(jti: string): Promise<void> {
    const key = this.getKey(jti);
    await this.redis.del(key);
  }

  async cleanup(): Promise<number> {
    const pattern = `${env.redisNamespace}:${this.keyPrefix}:*`;
    const keys = await this.redis.keys(pattern);
    
    if (keys.length === 0) {
      return 0;
    }
    
    return await this.redis.del(...keys);
  }
}

export async function createJTICache(): Promise<JTICache> {
  const redis = await getRedisClient();
  return new JTICache(redis);
}

// Export singleton instance for device proof JTI caching
export const jtiCache = new JTICache({} as Redis);

// Initialize jtiCache with Redis connection
getRedisClient().then(redis => {
  (jtiCache as any).redis = redis;
}).catch(console.error);