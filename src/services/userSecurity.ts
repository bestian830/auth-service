import { prisma } from '../infra/prisma.js';
import { createRateLimiter, isRedisConnected } from '../infra/redis.js';
import { env } from '../config/env.js';
import { audit } from '../middleware/audit.js';
import type { LoginAttemptRow } from '../types/prisma.js';

export interface UserLockStatus {
  locked: boolean;
  until?: number;
  reason?: string;
  failureCount?: number;
}

export interface LoginAttemptSummary {
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  recentFailures: number;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
}

export class UserSecurityService {
  
  async getUserLockStatus(userId: string): Promise<UserLockStatus> {
    try {
      // Check Redis first if available
      if (isRedisConnected()) {
        const rateLimiter = await createRateLimiter();
        const redisLock = await rateLimiter.isUserLocked(userId);
        
        if (redisLock.locked) {
          return {
            locked: true,
            until: redisLock.until,
            reason: redisLock.reason,
            failureCount: await rateLimiter.getLoginFailureCount(userId)
          };
        }
      }

      // Check database fallback
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          lockedUntil: true,
          lockReason: true,
          loginFailureCount: true,
          lastLoginFailureAt: true
        }
      });

      if (!user) {
        return { locked: false };
      }

      const now = new Date();
      const locked = user.lockedUntil && user.lockedUntil > now;

      return {
        locked: !!locked,
        until: user.lockedUntil?.getTime(),
        reason: user.lockReason || undefined,
        failureCount: user.loginFailureCount
      };
    } catch (error: any) {
      console.error('Error checking user lock status:', error);
      audit('user_security_error', {
        operation: 'get_lock_status',
        userId,
        error: error.message
      });
      return { locked: false };
    }
  }

  async lockUser(userId: string, durationMs: number, reason: string, adminUserId?: string): Promise<void> {
    const until = Date.now() + durationMs;
    
    try {
      // Lock in Redis if available
      if (isRedisConnected()) {
        const rateLimiter = await createRateLimiter();
        await rateLimiter.lockUser(userId, durationMs, reason);
      }

      // Always lock in database for persistence
      await prisma.user.update({
        where: { id: userId },
        data: {
          lockedUntil: new Date(until),
          lockReason: reason
        }
      });

      audit('user_locked', {
        userId,
        reason,
        durationMs,
        until,
        adminUserId,
        automated: !adminUserId
      });

    } catch (error: any) {
      console.error('Error locking user:', error);
      audit('user_security_error', {
        operation: 'lock_user',
        userId,
        reason,
        error: error.message
      });
      throw error;
    }
  }

  async unlockUser(userId: string, adminUserId?: string): Promise<void> {
    try {
      // Unlock in Redis if available
      if (isRedisConnected()) {
        const rateLimiter = await createRateLimiter();
        await rateLimiter.unlockUser(userId);
        await rateLimiter.resetLoginFailures(userId);
      }

      // Unlock in database
      await prisma.user.update({
        where: { id: userId },
        data: {
          lockedUntil: null,
          lockReason: null,
          loginFailureCount: 0,
          lastLoginFailureAt: null
        }
      });

      audit('user_unlocked', {
        userId,
        adminUserId,
        manual: !!adminUserId
      });

    } catch (error: any) {
      console.error('Error unlocking user:', error);
      audit('user_security_error', {
        operation: 'unlock_user',
        userId,
        error: error.message
      });
      throw error;
    }
  }

  async getLoginAttemptSummary(userId: string, windowHours: number = 24): Promise<LoginAttemptSummary> {
    try {
      const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

      const attempts = await prisma.loginAttempt.findMany({
        where: {
          userId,
          attemptAt: { gte: windowStart }
        },
        select: { success: true, attemptAt: true },
        orderBy: { attemptAt: 'desc' }
      }) as LoginAttemptRow[];

      const totalAttempts = attempts.length;
      const successfulAttempts = attempts.filter((a: LoginAttemptRow) => a.success).length;
      const failedAttempts = totalAttempts - successfulAttempts;
      const lastAttempt = attempts[0] ?? null;
      const lastSuccess = attempts.find((a: LoginAttemptRow) => a.success) || null;

      // Count recent consecutive failures (since last success)
      let recentFailures = 0;
      for (const attempt of attempts) {
        if (attempt.success) break;
        recentFailures++;
      }

      return {
        totalAttempts,
        successfulAttempts,
        failedAttempts,
        recentFailures,
        lastAttemptAt: lastAttempt?.attemptAt ?? null,
        lastSuccessAt: lastSuccess?.attemptAt ?? null,
      };

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('Error getting login attempt summary:', msg);
      audit('user_security_error', { operation: 'get_attempt_summary', userId, error: msg });
      
      return {
        totalAttempts: 0,
        successfulAttempts: 0,
        failedAttempts: 0,
        recentFailures: 0,
        lastAttemptAt: null,
        lastSuccessAt: null
      };
    }
  }

  async getTopFailedLoginIPs(limit: number = 10, windowHours: number = 24): Promise<Array<{
    ipAddress: string;
    failureCount: number;
    lastFailure: Date;
    affectedEmails: string[];
  }>> {
    try {
      const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

      const failedAttempts = await prisma.loginAttempt.findMany({
        where: {
          success: false,
          attemptAt: { gte: windowStart }
        },
        select: {
          ipAddress: true,
          email: true,
          attemptAt: true
        },
        orderBy: { attemptAt: 'desc' }
      });

      // Group by IP address
      const ipMap = new Map<string, {
        count: number;
        lastFailure: Date;
        emails: Set<string>;
      }>();

      for (const attempt of failedAttempts) {
        const existing = ipMap.get(attempt.ipAddress);
        if (existing) {
          existing.count++;
          existing.emails.add(attempt.email);
          if (attempt.attemptAt > existing.lastFailure) {
            existing.lastFailure = attempt.attemptAt;
          }
        } else {
          ipMap.set(attempt.ipAddress, {
            count: 1,
            lastFailure: attempt.attemptAt,
            emails: new Set([attempt.email])
          });
        }
      }

      // Convert to array and sort by failure count
      return Array.from(ipMap.entries())
        .map(([ipAddress, data]) => ({
          ipAddress,
          failureCount: data.count,
          lastFailure: data.lastFailure,
          affectedEmails: Array.from(data.emails)
        }))
        .sort((a, b) => b.failureCount - a.failureCount)
        .slice(0, limit);

    } catch (error: any) {
      console.error('Error getting top failed login IPs:', error);
      return [];
    }
  }

  async cleanupExpiredLocks(): Promise<{ cleaned: number }> {
    try {
      const now = new Date();
      
      // Clean up database locks
      const result = await prisma.user.updateMany({
        where: {
          lockedUntil: { lte: now }
        },
        data: {
          lockedUntil: null,
          lockReason: null
        }
      });

      audit('cleanup_expired_locks', {
        cleanedCount: result.count,
        cleanupTime: now.toISOString()
      });

      return { cleaned: result.count };

    } catch (error: any) {
      console.error('Error cleaning up expired locks:', error);
      audit('user_security_error', {
        operation: 'cleanup_expired_locks',
        error: error.message
      });
      return { cleaned: 0 };
    }
  }

  async resetUserFailures(userId: string, adminUserId?: string): Promise<void> {
    try {
      // Reset in Redis if available
      if (isRedisConnected()) {
        const rateLimiter = await createRateLimiter();
        await rateLimiter.resetLoginFailures(userId);
      }

      // Reset in database
      await prisma.user.update({
        where: { id: userId },
        data: {
          loginFailureCount: 0,
          lastLoginFailureAt: null
        }
      });

      audit('user_failures_reset', {
        userId,
        adminUserId,
        manual: !!adminUserId
      });

    } catch (error: any) {
      console.error('Error resetting user failures:', error);
      audit('user_security_error', {
        operation: 'reset_failures',
        userId,
        error: error.message
      });
      throw error;
    }
  }
}

// Singleton instance
export const userSecurityService = new UserSecurityService();