import { getRedisClient } from '../config';
import { withRedisPrefix } from './redis-prefix';

/**
 * 设置带有key前缀和可选过期时间的缓存
 */
export async function setCache(key: string, value: string, expiresSeconds?: number): Promise<void> {
  const redis = getRedisClient();
  const fullKey = withRedisPrefix(key);
  if (expiresSeconds) {
    await redis.set(fullKey, value, { EX: expiresSeconds });
  } else {
    await redis.set(fullKey, value);
  }
}

/**
 * 获取带前缀的缓存
 */
export async function getCache(key: string): Promise<string | null> {
  const redis = getRedisClient();
  const fullKey = withRedisPrefix(key);
  return await redis.get(fullKey);
}

/**
 * 删除带前缀的缓存
 */
export async function delCache(key: string): Promise<void> {
  const redis = getRedisClient();
  const fullKey = withRedisPrefix(key);
  await redis.del(fullKey);
}

/**
 * 递增计数器
 */
export async function incrementCounter(key: string, expiresSeconds?: number): Promise<number> {
  const redis = getRedisClient();
  const fullKey = withRedisPrefix(key);
  const result = await redis.incr(fullKey);
  
  // 如果是第一次设置，添加过期时间
  if (result === 1 && expiresSeconds) {
    await redis.expire(fullKey, expiresSeconds);
  }
  
  return result;
}

/**
 * 获取计数器值
 */
export async function getCounter(key: string): Promise<number> {
  const redis = getRedisClient();
  const fullKey = withRedisPrefix(key);
  const value = await redis.get(fullKey);
  return value ? parseInt(value, 10) : 0;
}

/**
 * 重置计数器
 */
export async function resetCounter(key: string): Promise<void> {
  const redis = getRedisClient();
  const fullKey = withRedisPrefix(key);
  await redis.del(fullKey);
}

