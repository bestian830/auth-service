// src/services/quota.ts
import { env } from '../config/env.js';
import { prisma } from '../infra/prisma.js';
import { audit } from '../middleware/audit.js';
import { getEffectivePlanForOrg } from './subscriptionPlan.js';
import type { SubscriptionPlan } from '../middleware/subscription.js';
import type { ProductType } from '../config/products.js';

/**
 * 获取计划的配额限制
 */
export function getPlanQuotas(plan: SubscriptionPlan, product: ProductType): QuotaLimits {
  if (product === 'ploml') {
    // 员工账号配额
    switch (plan) {
      case 'trial': return { staff: env.quotaPlomlStaffTrial, devices: 0 };
      case 'basic': return { staff: env.quotaPlomlStaffBasic, devices: 0 };
      case 'standard': return { staff: env.quotaPlomlStaffStandard, devices: 0 };
      case 'pro': return { staff: env.quotaPlomlStaffPro, devices: 0 };
      case 'professor': return { staff: env.quotaPlomlStaffProfessor, devices: 0 };
      default: return { staff: 3, devices: 0 };
    }
  } else if (product === 'mopai') {
    // 设备配额（员工数量不限制）
    switch (plan) {
      case 'trial': return { staff: -1, devices: 0 }; // trial 无设备
      case 'basic': return { staff: -1, devices: env.quotaMopaiDeviceBasic };
      case 'standard': return { staff: -1, devices: env.quotaMopaiDeviceStandard };
      case 'pro': return { staff: -1, devices: env.quotaMopaiDevicePro };
      case 'professor': return { staff: -1, devices: env.quotaMopaiDeviceProfessor };
      default: return { staff: -1, devices: 1 };
    }
  }
  
  return { staff: 0, devices: 0 };
}

/**
 * 检查组织的配额使用情况
 */
export async function checkQuotaUsage(
  orgId: string, 
  product: ProductType, 
  locationId?: string
): Promise<QuotaUsageResult> {
  try {
    // 获取有效计划
    const plan = await getEffectivePlanForOrg(orgId, product, locationId);
    const quotas = getPlanQuotas(plan, product);
    
    // 查询当前使用量
    const usage = await getCurrentUsage(orgId);
    
    const result: QuotaUsageResult = {
      orgId,
      product,
      locationId,
      plan,
      quotas,
      usage,
      staffExceeded: quotas.staff > 0 && usage.staff > quotas.staff,
      devicesExceeded: quotas.devices > 0 && usage.devices > quotas.devices
    };
    
    // 记录配额检查事件
    audit('quota_check', {
      orgId,
      product,
      locationId,
      plan,
      quotas,
      usage,
      exceeded: result.staffExceeded || result.devicesExceeded
    });
    
    return result;
  } catch (error: any) {
    audit('quota_check_fail', {
      orgId,
      product,
      locationId,
      error: error.message
    });
    
    throw error;
  }
}

/**
 * 获取组织当前使用量
 */
async function getCurrentUsage(orgId: string): Promise<UsageStats> {
  try {
    // 查询员工数量（User表）
    const staffCount = await prisma.user.count({
      where: {
        tenantId: orgId,
        // 排除已删除的用户（如果有软删除字段的话）
      }
    });
    
    // 查询设备数量（如果有Device表的话）
    let deviceCount = 0;
    try {
      const deviceResult = await prisma.$queryRaw<Array<{count: bigint}>>`
        SELECT COUNT(*) as count
        FROM "Device" 
        WHERE "orgId" = ${orgId} 
          AND "status" = 'active'
      `;
      deviceCount = Number(deviceResult[0]?.count || 0);
    } catch {
      // Device表不存在时忽略错误
    }
    
    return {
      staff: staffCount,
      devices: deviceCount
    };
  } catch (error) {
    console.warn('Failed to get usage stats:', error);
    return { staff: 0, devices: 0 };
  }
}

/**
 * 强制配额检查中间件（用于注册等场景）
 */
export async function enforceQuotaLimit(
  orgId: string,
  product: ProductType, 
  type: 'staff' | 'device',
  locationId?: string
): Promise<boolean> {
  if (!env.subsEnableLocalQuotaEnforce) {
    return true; // 未启用配额强制时直接通过
  }
  
  try {
    const quotaResult = await checkQuotaUsage(orgId, product, locationId);
    
    if (type === 'staff' && quotaResult.staffExceeded) {
      audit('quota_enforce_block', {
        orgId,
        product,
        locationId,
        type: 'staff',
        current: quotaResult.usage.staff,
        limit: quotaResult.quotas.staff,
        plan: quotaResult.plan
      });
      return false;
    }
    
    if (type === 'device' && quotaResult.devicesExceeded) {
      audit('quota_enforce_block', {
        orgId,
        product,
        locationId, 
        type: 'device',
        current: quotaResult.usage.devices,
        limit: quotaResult.quotas.devices,
        plan: quotaResult.plan
      });
      return false;
    }
    
    return true;
  } catch (error: any) {
    // 配额检查失败时的策略：记录错误但允许通过
    audit('quota_enforce_error', {
      orgId,
      product,
      locationId,
      type,
      error: error.message
    });
    
    console.warn('Quota enforcement failed, allowing operation:', error.message);
    return true;
  }
}

// 类型定义
export interface QuotaLimits {
  staff: number;  // -1 表示无限制，0 表示不允许
  devices: number;
}

export interface UsageStats {
  staff: number;
  devices: number;
}

export interface QuotaUsageResult {
  orgId: string;
  product: ProductType;
  locationId?: string;
  plan: SubscriptionPlan;
  quotas: QuotaLimits;
  usage: UsageStats;
  staffExceeded: boolean;
  devicesExceeded: boolean;
}