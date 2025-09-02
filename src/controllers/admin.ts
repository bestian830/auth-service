import { Request, Response } from 'express';
import { prisma } from '../infra/prisma.js';
import { audit } from '../middleware/audit.js';
import { createRateLimiter, isRedisConnected } from '../infra/redis.js';
import { refreshProductClientMap } from '../middleware/productHint.js';
import { checkQuotaUsage } from '../services/quota.js';
import type { ProductType } from '../config/products.js';

export async function setStoreType(req: Request, res: Response) {
  try {
    const userId = req.params.id;
    const { storeType } = req.body;
    const adminUserId = (req as any).claims?.sub;
    const adminRoles = (req as any).claims?.roles || [];

    // Verify admin role (this should be checked by middleware, but double-check)
    if (!adminRoles.includes('admin')) {
      audit('admin_unauthorized', { 
        ip: req.ip, 
        adminUserId, 
        targetUserId: userId 
      });
      return res.status(403).json({ error: 'insufficient_permissions' });
    }

    if (!userId || !storeType) {
      audit('admin_set_store_type_invalid_request', { 
        ip: req.ip, 
        adminUserId, 
        targetUserId: userId 
      });
      return res.status(400).json({ error: 'invalid_request' });
    }

    // Validate storeType enum value
    const validStoreTypes = ['UNKNOWN', 'FRANCHISE', 'BRANCH', 'DIRECT'];
    if (!validStoreTypes.includes(storeType)) {
      audit('admin_set_store_type_invalid_type', { 
        ip: req.ip, 
        adminUserId, 
        targetUserId: userId,
        storeType 
      });
      return res.status(400).json({ error: 'invalid_store_type' });
    }

    // Check if target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!targetUser) {
      audit('admin_set_store_type_user_not_found', { 
        ip: req.ip, 
        adminUserId, 
        targetUserId: userId 
      });
      return res.status(404).json({ error: 'user_not_found' });
    }

    // Update store type
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { storeType }
    });

    audit('storeType_changed', {
      ip: req.ip,
      adminUserId,
      targetUserId: userId,
      targetEmail: targetUser.email,
      oldStoreType: targetUser.storeType,
      newStoreType: storeType
    });

    // Return updated user info (excluding sensitive fields)
    res.json({
      id: updatedUser.id,
      email: updatedUser.email,
      storeType: updatedUser.storeType,
      subdomain: updatedUser.subdomain,
      updatedAt: updatedUser.updatedAt
    });

  } catch (error: any) {
    audit('admin_set_store_type_error', {
      ip: req.ip,
      adminUserId: (req as any).claims?.sub,
      targetUserId: req.params.id,
      error: error.message
    });
    res.status(500).json({ error: 'server_error' });
  }
}

// v0.2.6: 管理员手动解锁用户接口
export async function unlockUser(req: Request, res: Response) {
  const { userId } = req.params;
  const adminUserId = (req as any).claims?.sub;
  const adminRoles = (req as any).claims?.roles || [];

  try {
    // Verify admin role (middleware should check, but double-check)
    if (!adminRoles.includes('admin')) {
      audit('admin_unlock_unauthorized', { 
        ip: req.ip, 
        adminUserId, 
        targetUserId: userId 
      });
      return res.status(403).json({ error: 'insufficient_permissions' });
    }

    if (!userId) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { 
        id: true, 
        email: true, 
        loginFailureCount: true,
        lockedUntil: true,
        lockReason: true
      }
    });

    if (!user) {
      audit('admin_unlock_user_not_found', { 
        ip: req.ip, 
        adminUserId, 
        targetUserId: userId 
      });
      return res.status(404).json({ error: 'user_not_found' });
    }

    // Clear Redis failure counters if available
    if (isRedisConnected()) {
      try {
        const rateLimiter = await createRateLimiter();
        await rateLimiter.resetLoginFailures(userId);
        await rateLimiter.unlockUser(userId);
      } catch (redisError) {
        console.error('Redis error during admin unlock:', redisError);
        audit('admin_unlock_redis_error', {
          ip: req.ip,
          adminUserId,
          targetUserId: userId,
          error: (redisError as any).message
        });
      }
    }

    // Clear database failure tracking and lock
    await prisma.user.update({
      where: { id: userId },
      data: {
        loginFailureCount: 0,
        lastLoginFailureAt: null,
        lockedUntil: null,
        lockReason: null
      }
    });

    audit('admin_unlock_user', {
      ip: req.ip,
      adminUserId,
      targetUserId: userId,
      userEmail: user.email,
      previousFailureCount: user.loginFailureCount,
      wasLocked: !!user.lockedUntil,
      previousLockReason: user.lockReason
    });

    res.json({ 
      ok: true,
      userId: user.id,
      email: user.email,
      unlockedAt: new Date().toISOString(),
      previousFailureCount: user.loginFailureCount,
      wasLocked: !!user.lockedUntil
    });

  } catch (error: any) {
    audit('admin_unlock_user_error', {
      ip: req.ip,
      adminUserId,
      targetUserId: userId,
      error: error.message
    });
    res.status(500).json({ error: 'server_error' });
  }
}

/**
 * v0.2.8-p2: 重新加载产品客户端映射配置
 */
export async function reloadProductMap(req: Request, res: Response) {
  const adminUserId = (req as any).claims?.sub;
  const adminRoles = (req as any).claims?.roles || [];

  try {
    // Verify admin role
    if (!adminRoles.includes('admin')) {
      audit('admin_config_reload_unauthorized', {
        ip: req.ip,
        adminUserId,
        endpoint: 'product_map'
      });
      return res.status(403).json({ error: 'insufficient_permissions' });
    }

    // 记录操作审计
    audit('admin_config_reload_request', {
      ip: req.ip,
      adminUserId,
      userAgent: req.get('user-agent'),
      endpoint: 'product_map'
    });
    
    // 重新加载配置
    const newMapping = await refreshProductClientMap();
    
    audit('admin_config_reload_success', {
      ip: req.ip,
      adminUserId,
      endpoint: 'product_map',
      newMapping: Object.fromEntries(newMapping)
    });
    
    res.json({
      success: true,
      message: 'Product client mapping reloaded successfully',
      mapping: Object.fromEntries(newMapping),
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    audit('admin_config_reload_fail', {
      ip: req.ip,
      adminUserId,
      endpoint: 'product_map', 
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: 'config_reload_failed',
      message: error.message
    });
  }
}

/**
 * v0.2.8-p2: 获取组织配额使用情况（管理接口）
 */
export async function getOrgQuotaUsage(req: Request, res: Response) {
  const adminUserId = (req as any).claims?.sub;
  const adminRoles = (req as any).claims?.roles || [];

  try {
    // Verify admin role
    if (!adminRoles.includes('admin')) {
      audit('admin_quota_query_unauthorized', {
        ip: req.ip,
        adminUserId,
        orgId: req.params.orgId
      });
      return res.status(403).json({ error: 'insufficient_permissions' });
    }

    const { orgId } = req.params;
    const { product = 'ploml', locationId } = req.query;
    
    if (!orgId) {
      return res.status(400).json({
        success: false,
        error: 'missing_org_id',
        message: 'Organization ID is required'
      });
    }
    
    const quotaResult = await checkQuotaUsage(
      orgId, 
      product as ProductType, 
      locationId as string | undefined
    );
    
    audit('admin_quota_query', {
      adminUserId,
      orgId,
      product,
      locationId,
      ip: req.ip
    });
    
    res.json({
      success: true,
      data: quotaResult,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    audit('admin_quota_query_fail', {
      adminUserId,
      orgId: req.params.orgId,
      product: req.query.product,
      locationId: req.query.locationId,
      error: error.message,
      ip: req.ip
    });
    
    res.status(500).json({
      success: false,
      error: 'quota_query_failed',
      message: error.message
    });
  }
}

/**
 * v0.2.8-p2: 系统健康检查（管理接口）
 */
export async function healthCheck(req: Request, res: Response) {
  try {
    // 基本健康检查指标
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '0.2.8-p2',
      node: process.version
    };
    
    audit('admin_health_check', {
      ip: req.ip,
      userAgent: req.get('user-agent'),
      status: health.status
    });
    
    res.json({
      success: true,
      data: health
    });
  } catch (error: any) {
    audit('admin_health_check_fail', {
      ip: req.ip,
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      error: 'health_check_failed',
      message: error.message
    });
  }
}