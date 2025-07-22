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