import { createClient, RedisClientType } from 'redis';
import { REDIS_CONFIG } from '../constants';
import { logger } from '../utils';

let redisClient: RedisClientType | null = null;

/**
 * 创建Redis客户端
 */
const createRedisClient = (): RedisClientType => {
  return createClient({
    url: REDIS_CONFIG.url,
    socket: {
      connectTimeout: REDIS_CONFIG.connectTimeout,
      reconnectStrategy: (retries) => {
        if (retries > REDIS_CONFIG.maxRetries) {
          return new Error('Retry limit exceeded for Redis');
        }
        return REDIS_CONFIG.retryDelay;
      }
    },
  });
};

/**
 * 初始化Redis连接
 */
export const initRedis = async (): Promise<void> => {
  if (!redisClient) {
    redisClient = createRedisClient();
    redisClient.on('error', (err) => {
      logger.error('❌ Redis error:', err);
    });
    try {
      await redisClient.connect();
      logger.info('✅ Redis connected successfully');
    } catch (error) {
      logger.error('❌ Redis connect failed:', error);
      throw error;
    }
  }
};

/**
 * 关闭Redis连接
 */
export const closeRedis = async (): Promise<void> => {
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('✅ Redis connection closed');
    } catch (error) {
      logger.error('❌ Failed to close Redis:', error);
    }
  }
};

/**
 * 获取Redis客户端（供业务层直接使用）
 */
export const getRedisClient = (): RedisClientType => {
  if (!redisClient) {
    throw new Error('Redis client is not initialized. Call initRedis() first.');
  }
  return redisClient;
};

export default redisClient;