// src/middleware/subscription.ts
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { prisma } from '../infra/prisma.js';

/**
 * v0.2.8: Subscription quota enforcement (临时本地硬限制)
 * 
 * 实现本地配额校验，后续版本将对接订阅服务API
 */

export type SubscriptionPlan = 'trial' | 'basic' | 'standard' | 'pro' | 'professor';

export interface SubscriptionTier {
  name: SubscriptionPlan;
  features: string[];
  limits: {
    plomlStaff?: number;
    mopaiDevice?: number;
  };
}

export interface SubscriptionStatus {
  tenantId: string;
  orgId: string;
  tier: SubscriptionTier;
  isActive: boolean;
  usage: {
    plomlStaff: number;
    mopaiDevice: number;
  };
}

/**
 * 获取配额限制
 */
function getQuotaLimit(plan: SubscriptionPlan, type: 'ploml_staff' | 'mopai_device'): number {
  if (type === 'ploml_staff') {
    switch (plan) {
      case 'trial': return env.quotaPlomlStaffTrial;
      case 'basic': return env.quotaPlomlStaffBasic;
      case 'standard': return env.quotaPlomlStaffStandard;
      case 'pro': return env.quotaPlomlStaffPro;
      case 'professor': return env.quotaPlomlStaffProfessor;
      default: return 0;
    }
  } else if (type === 'mopai_device') {
    switch (plan) {
      case 'trial': return 0; // Trial 无设备配额
      case 'basic': return env.quotaMopaiDeviceBasic;
      case 'standard': return env.quotaMopaiDeviceStandard;
      case 'pro': return env.quotaMopaiDevicePro;
      case 'professor': return env.quotaMopaiDeviceProfessor;
      default: return 0;
    }
  }
  return 0;
}

/**
 * 校验是否可以添加员工
 */
export async function assertCanAddStaff(orgId: string, plan: SubscriptionPlan): Promise<void> {
  if (!env.subsEnableLocalQuotaEnforce) {
    return; // 配额控制未启用
  }

  const limit = getQuotaLimit(plan, 'ploml_staff');
  const currentCount = await prisma.user.count({
    where: { 
      tenantId: orgId,
      roles: { hasSome: ['staff', 'admin'] } // 员工和管理员都算在配额内
    }
  });

  if (currentCount >= limit) {
    const error = new Error(`Staff quota exceeded. Plan: ${plan}, Limit: ${limit}, Current: ${currentCount}`);
    (error as any).code = 'QUOTA_EXCEEDED';
    (error as any).status = 422;
    throw error;
  }
}

/**
 * 校验是否可以添加设备
 */
export async function assertCanAddDevice(orgId: string, plan: SubscriptionPlan): Promise<void> {
  if (!env.subsEnableLocalQuotaEnforce) {
    return; // 配额控制未启用
  }

  const limit = getQuotaLimit(plan, 'mopai_device');
  const currentCount = await prisma.device.count({
    where: { 
      orgId,
      status: 'active' // 只算活跃设备
    }
  });

  if (currentCount >= limit) {
    const error = new Error(`Device quota exceeded. Plan: ${plan}, Limit: ${limit}, Current: ${currentCount}`);
    (error as any).code = 'QUOTA_EXCEEDED';
    (error as any).status = 422;
    throw error;
  }
}

/**
 * 中间件：校验员工配额
 */
export function checkStaffQuota(plan: SubscriptionPlan) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 从请求中提取 orgId（可能来自 body 或 JWT）
      const orgId = req.body?.orgId || req.body?.tenantId || (req as any).user?.tenant_id;
      
      if (!orgId) {
        return res.status(400).json({ error: 'Missing orgId for quota validation' });
      }

      await assertCanAddStaff(orgId, plan);
      next();
    } catch (error: any) {
      if (error.code === 'QUOTA_EXCEEDED') {
        return res.status(error.status || 422).json({ 
          error: 'quota_exceeded',
          message: error.message,
          type: 'staff_quota'
        });
      }
      next(error);
    }
  };
}

/**
 * 中间件：校验设备配额
 */
export function checkDeviceQuota(plan: SubscriptionPlan) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // 从请求中提取 orgId
      const orgId = req.body?.orgId || (req as any).user?.tenant_id;
      
      if (!orgId) {
        return res.status(400).json({ error: 'Missing orgId for quota validation' });
      }

      await assertCanAddDevice(orgId, plan);
      next();
    } catch (error: any) {
      if (error.code === 'QUOTA_EXCEEDED') {
        return res.status(error.status || 422).json({ 
          error: 'quota_exceeded',
          message: error.message,
          type: 'device_quota'
        });
      }
      next(error);
    }
  };
}

/**
 * 获取订阅状态（临时实现）
 */
export async function getSubscriptionStatus(orgId: string, plan: SubscriptionPlan = 'basic'): Promise<SubscriptionStatus> {
  const [plomlStaffCount, mopaiDeviceCount] = await Promise.all([
    prisma.user.count({
      where: { 
        tenantId: orgId,
        roles: { hasSome: ['staff', 'admin'] }
      }
    }),
    prisma.device.count({
      where: { 
        orgId,
        status: 'active'
      }
    })
  ]);

  return {
    tenantId: orgId,
    orgId,
    tier: {
      name: plan,
      features: ['*'],
      limits: {
        plomlStaff: getQuotaLimit(plan, 'ploml_staff'),
        mopaiDevice: getQuotaLimit(plan, 'mopai_device'),
      }
    },
    isActive: true,
    usage: {
      plomlStaff: plomlStaffCount,
      mopaiDevice: mopaiDeviceCount
    }
  };
}

/**
 * Middleware for tracking API usage
 * Currently a no-op - to be implemented
 */
export function trackUsage() {
  return (req: Request, res: Response, next: NextFunction) => {
    // TODO: Implement usage tracking in future version
    next();
  };
}

/**
 * 检查功能访问权限
 */
export async function hasFeatureAccess(orgId: string, feature: string, plan: SubscriptionPlan = 'basic'): Promise<boolean> {
  // 临时实现：所有计划都有基本功能
  if (feature === 'basic_auth') return true;
  if (feature === 'device_management' && plan !== 'trial') return true;
  if (feature === 'multi_tenant' && ['standard', 'pro', 'professor'].includes(plan)) return true;
  
  return false;
}