// services/subscriptionService.ts

import axios from 'axios';
import { getRedisClient, env } from '../config';
import { logger } from '../utils';
import { SUBSCRIPTION_CONFIG, SUBSCRIPTION_ERRORS } from '../constants';
import type { SubscriptionInfo } from '../types';

export async function getSubscriptionInfo(tenantId: string): Promise<SubscriptionInfo> {
  const redis = getRedisClient();
  const cacheKey = SUBSCRIPTION_CONFIG.CACHE_PREFIX + tenantId;

  // 1. 查询缓存
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      const info: SubscriptionInfo = JSON.parse(cached);
      // 如果缓存为ACTIVE或TRIAL，直接返回
      if (['ACTIVE', 'TRIAL'].includes(info.status)) {
        return info;
      }
      // 其他状态 fall through
    }
  } catch (e) {
    logger.warn('Redis error, fallback to service', { tenantId, error: e });
  }

  // 2. 查询订阅微服务
  try {
    const url = `${env.subscriptionServiceBaseUrl}/api/subscriptions/${tenantId}`;
    const { data } = await axios.get<SubscriptionInfo>(url);
    // 3. 更新缓存
    await redis.set(cacheKey, JSON.stringify(data), { EX: SUBSCRIPTION_CONFIG.CACHE_TTL_SECONDS });
    return data;
  } catch (error) {
    logger.error('Failed to fetch subscription from service', { tenantId, error });
    // 降级：返回默认订阅状态，不影响登录
    return {
      tenantId,
      status: 'UNSUBSCRIBE',
      plan: 'BASIC',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30天后
    };
  }
}