import { Request, Response } from 'express';
import { prisma } from '../infra/prisma.js';
import { audit } from '../middleware/audit.js';
import { createRateLimiter, isRedisConnected } from '../infra/redis.js';


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