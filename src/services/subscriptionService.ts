import { getRedisClient } from '../infra/redis.js';
import { env } from '../config/env.js';

const SUBSCRIPTION_SERVICE_URL = env.subscriptionServiceUrl || process.env.SUBSCRIPTION_SERVICE_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const QUOTA_CACHE_TTL = 600; // 10 分钟

interface ModuleQuota {
  moduleKey: string;
  purchasedCount: number;
  allowMultiple: boolean;
  source: 'plan_included' | 'addon';
}

interface QuotaResponse {
  orgId: string;
  subscriptionStatus: string;
  planKey: string | null;
  quotas: ModuleQuota[];
}

/**
 * 获取组织模块配额（带缓存）
 */
export async function getModuleQuotas(orgId: string): Promise<QuotaResponse | null> {
  const cacheKey = `quota:${orgId}`;
  
  try {
    // 1. 先查 Redis 缓存
    const redis = await getRedisClient();
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`[Subscription] 配额缓存命中: ${orgId}`);
      return JSON.parse(cached);
    }
    
    // 2. 缓存未命中，调用 subscription-service
    console.log(`[Subscription] 配额缓存未命中，调用 subscription-service: ${orgId}`);
    
    const response = await fetch(
      `${SUBSCRIPTION_SERVICE_URL}/internal/org/${orgId}/module-quotas`,
      {
        headers: {
          'X-Service-API-Key': INTERNAL_API_KEY || ''
        },
        signal: AbortSignal.timeout(5000) // 5 秒超时
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    const quotaData = result.data;
    
    // 3. 缓存结果
    await redis.set(cacheKey, JSON.stringify(quotaData), 'EX', QUOTA_CACHE_TTL);
    
    console.log(`[Subscription] 获取配额成功: ${orgId}, 模块数: ${quotaData.quotas.length}`);
    
    return quotaData;
    
  } catch (error: any) {
    console.error(`[Subscription] 获取配额失败: ${orgId}`, {
      error: error.message
    });
    return null;
  }
}

/**
 * 检查特定模块的配额
 * @returns hasQuota: 是否有配额, purchasedCount: 购买数量, subscriptionStatus: 订阅状态
 */
export async function checkModuleQuota(
  orgId: string,
  moduleKey: string
): Promise<{ hasQuota: boolean; purchasedCount: number; subscriptionStatus: string }> {
  const quotaData = await getModuleQuotas(orgId);
  
  if (!quotaData) {
    // subscription-service 不可用
    return { hasQuota: false, purchasedCount: 0, subscriptionStatus: 'unknown' };
  }
  
  // 检查订阅状态
  if (quotaData.subscriptionStatus !== 'active' && quotaData.subscriptionStatus !== 'trialing') {
    return {
      hasQuota: false,
      purchasedCount: 0,
      subscriptionStatus: quotaData.subscriptionStatus
    };
  }
  
  // 查找对应的模块配额
  const quota = quotaData.quotas.find((q: ModuleQuota) => q.moduleKey === moduleKey);
  
  if (!quota) {
    // 未订阅该模块
    return {
      hasQuota: false,
      purchasedCount: 0,
      subscriptionStatus: quotaData.subscriptionStatus
    };
  }
  
  return {
    hasQuota: true,
    purchasedCount: quota.purchasedCount,
    subscriptionStatus: quotaData.subscriptionStatus
  };
}

/**
 * 清除组织配额缓存
 * 用于配额变更时强制刷新
 */
export async function clearQuotaCache(orgId: string): Promise<void> {
  try {
    const redis = await getRedisClient();
    await redis.del(`quota:${orgId}`);
    console.log(`[Subscription] 清除配额缓存: ${orgId}`);
  } catch (error) {
    console.error(`[Subscription] 清除缓存失败: ${orgId}`, error);
  }
}
