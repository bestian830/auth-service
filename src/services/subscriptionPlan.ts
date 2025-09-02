// src/services/subscriptionPlan.ts
import { env } from '../config/env.js';
import { prisma } from '../infra/prisma.js';
import { audit } from '../middleware/audit.js';
import type { SubscriptionPlan } from '../middleware/subscription.js';
import type { ProductType } from '../config/products.js';

/**
 * 获取组织的有效订阅计划
 * 
 * 查找优先级：
 * 1. 订阅服务 API（如果配置了 SUBS_SERVICE_URL）
 * 2. 本地数据库 Tenant/User 表的 plan 字段
 * 3. 环境变量默认计划
 */
export async function getEffectivePlanForOrg(
  orgId: string, 
  product: ProductType, 
  locationId?: string
): Promise<SubscriptionPlan> {
  
  // 1. 优先尝试订阅服务 API
  if (env.subsServiceUrl) {
    try {
      const plan = await fetchPlanFromSubscriptionService(orgId, product, locationId);
      if (plan) return plan;
    } catch (error: any) {
      console.warn('Subscription service call failed, falling back to local plan:', error.message);
    }
  }
  
  // 2. 从本地数据库读取
  try {
    const plan = await getLocalPlan(orgId, product, locationId);
    if (plan) return plan;
  } catch (error: any) {
    console.warn('Failed to get local plan:', error.message);
  }
  
  // 3. 回退到环境变量默认值
  return getDefaultPlan(product);
}

/**
 * 从订阅服务获取计划（预留接口）
 */
async function fetchPlanFromSubscriptionService(
  orgId: string, 
  product: ProductType, 
  locationId?: string
): Promise<SubscriptionPlan | null> {
  
  if (!env.subsServiceUrl) return null;
  
  try {
    const url = new URL('/api/subscription/plan', env.subsServiceUrl);
    url.searchParams.set('orgId', orgId);
    url.searchParams.set('product', product);
    if (locationId) url.searchParams.set('locationId', locationId);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${env.subsServiceToken || ''}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Subscription service returned ${response.status}`);
    }
    
    const data = await response.json();
    const plan = data.plan;
    
    if (isValidPlan(plan)) {
      // 成功从远程获取
      audit('plan_fetch_remote_ok', { orgId, product, plan, locationId });
      return plan;
    }
    
    throw new Error(`Invalid plan returned: ${plan}`);
  } catch (error: any) {
    // 记录远程获取失败
    const reason = error.name === 'AbortError' ? 'timeout' : 'error';
    audit('plan_fetch_remote_fail', { 
      orgId, 
      product, 
      reason, 
      error: error.message,
      locationId 
    });
    
    console.error('Subscription service error:', error);
    return null;
  }
}

/**
 * 从本地数据库获取计划
 */
async function getLocalPlan(
  orgId: string, 
  product: ProductType, 
  locationId?: string
): Promise<SubscriptionPlan | null> {
  
  try {
    // 方案1：尝试从 User 表查找 org 拥有者的计划（假设 roles 包含 'owner'）
    const owner = await prisma.user.findFirst({
      where: {
        tenantId: orgId,
        roles: { hasSome: ['owner', 'admin'] }
      },
      select: { id: true }
    });
    
    if (owner) {
      // 检查是否有 plan 相关字段（动态查询避免字段不存在的错误）
      try {
        const planData = await prisma.$queryRaw`
          SELECT 
            CASE 
              WHEN EXISTS(SELECT 1 FROM information_schema.columns 
                         WHERE table_name = 'User' AND column_name = 'plan') 
              THEN (SELECT plan FROM "User" WHERE id = ${owner.id})
              ELSE NULL 
            END as user_plan,
            CASE 
              WHEN EXISTS(SELECT 1 FROM information_schema.columns 
                         WHERE table_name = 'User' AND column_name = ${'plan_' + product}) 
              THEN (SELECT ${'plan_' + product} FROM "User" WHERE id = ${owner.id})
              ELSE NULL 
            END as product_plan
        ` as Array<{user_plan: string | null, product_plan: string | null}>;
        
        if (planData.length > 0) {
          const plan = planData[0].product_plan || planData[0].user_plan;
          if (plan && isValidPlan(plan)) {
            return plan as SubscriptionPlan;
          }
        }
      } catch (error: any) {
        console.warn('Failed to query plan from User table:', error.message);
      }
    }
    
    // 方案2：尝试从组织配置表（如果存在）
    try {
      const orgConfig = await prisma.$queryRaw`
        SELECT 
          CASE 
            WHEN EXISTS(SELECT 1 FROM information_schema.tables 
                       WHERE table_name = 'Organization') 
            THEN (SELECT plan FROM "Organization" WHERE id = ${orgId} LIMIT 1)
            ELSE NULL 
          END as org_plan
      ` as Array<{org_plan: string | null}>;
      
      if (orgConfig.length > 0 && orgConfig[0].org_plan) {
        const plan = orgConfig[0].org_plan;
        if (isValidPlan(plan)) {
          return plan as SubscriptionPlan;
        }
      }
    } catch (error: any) {
      // Organization 表不存在是正常的，忽略错误
    }
    
  } catch (error: any) {
    console.warn('Error querying local plan:', error);
  }
  
  return null;
}

/**
 * 获取产品默认计划
 */
function getDefaultPlan(product: ProductType): SubscriptionPlan {
  switch (product) {
    case 'mopai':
      return (env.defaultPlanMopai || 'standard') as SubscriptionPlan;
    case 'ploml':
      return (env.defaultPlanPloml || 'basic') as SubscriptionPlan;
    default:
      return 'basic';
  }
}

/**
 * 验证计划名称是否有效
 */
function isValidPlan(plan: any): boolean {
  const validPlans = ['trial', 'basic', 'standard', 'pro', 'professor'];
  return typeof plan === 'string' && validPlans.includes(plan);
}

/**
 * 批量获取多个组织的计划（用于性能优化）
 */
export async function getEffectivePlansForOrgs(
  requests: Array<{orgId: string, product: ProductType, locationId?: string}>
): Promise<Map<string, SubscriptionPlan>> {
  const results = new Map<string, SubscriptionPlan>();
  
  // 简单实现：逐个查询（未来可优化为批量查询）
  for (const request of requests) {
    const key = `${request.orgId}:${request.product}:${request.locationId || ''}`;
    try {
      const plan = await getEffectivePlanForOrg(request.orgId, request.product, request.locationId);
      results.set(key, plan);
    } catch (error: any) {
      console.warn(`Failed to get plan for ${key}:`, error);
      results.set(key, getDefaultPlan(request.product));
    }
  }
  
  return results;
}

/**
 * 清除计划缓存（当订阅状态变化时调用）
 */
export async function clearPlanCache(orgId?: string): Promise<void> {
  // 预留：如果有缓存机制，在这里清除
  console.log('Plan cache cleared for org:', orgId || 'all');
}