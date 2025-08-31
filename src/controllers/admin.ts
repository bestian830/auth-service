import { Request, Response } from 'express';
import { prisma } from '../infra/prisma.js';
import { audit } from '../middleware/audit.js';
import { createRateLimiter, isRedisConnected } from '../infra/redis.js';

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