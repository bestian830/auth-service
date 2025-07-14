/**
 * Token 黑名单服务 - 基于数据库实现
 * 用于撤销已签发的JWT token
 */

import prisma from '../config/database';
import { logger } from './logger';

/**
 * 添加token到黑名单
 * @param jti JWT ID
 * @param expiresAt token原始过期时间
 * @param reason 撤销原因
 */
export const addTokenToBlacklist = async (
  jti: string, 
  expiresAt: Date, 
  reason: string = 'revoked'
): Promise<void> => {
  try {
    await prisma.tokenBlacklist.create({
      data: {
        jti,
        expires_at: expiresAt,
        reason,
        created_at: new Date()
      }
    });
    
    logger.info('Token added to blacklist', { jti, reason });
  } catch (error) {
    logger.error('Failed to add token to blacklist', { jti, error });
    throw new Error('Failed to revoke token');
  }
};

/**
 * 检查token是否在黑名单中
 * @param jti JWT ID
 * @returns 是否被撤销
 */
export const isTokenBlacklisted = async (jti: string): Promise<boolean> => {
  try {
    const blacklistedToken = await prisma.tokenBlacklist.findFirst({
      where: {
        jti,
        expires_at: {
          gt: new Date() // 只检查未过期的黑名单记录
        }
      }
    });
    
    return !!blacklistedToken;
  } catch (error) {
    logger.error('Failed to check token blacklist', { jti, error });
    // 安全起见，如果查询失败则认为token有效
    return false;
  }
};

/**
 * 清理过期的黑名单记录
 * 定期清理可以减少数据库大小
 */
export const cleanupExpiredBlacklistTokens = async (): Promise<number> => {
  try {
    const result = await prisma.tokenBlacklist.deleteMany({
      where: {
        expires_at: {
          lte: new Date()
        }
      }
    });
    
    logger.info('Cleaned up expired blacklist tokens', { count: result.count });
    return result.count;
  } catch (error) {
    logger.error('Failed to cleanup expired blacklist tokens', { error });
    return 0;
  }
};

/**
 * 撤销用户的所有token（比如密码重置后）
 * @param tenantId 租户ID
 * @param reason 撤销原因
 */
export const revokeAllUserTokens = async (
  tenantId: string, 
  reason: string = 'security_reset'
): Promise<void> => {
  try {
    // 这里我们通过记录一个特殊的黑名单记录来标记
    // 所有在此时间之前签发的token都无效
    await prisma.tokenBlacklist.create({
      data: {
        jti: `user_revoke_${tenantId}_${Date.now()}`,
        tenant_id: tenantId,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30天后过期
        reason,
        revoke_all_before: new Date(),
        created_at: new Date()
      }
    });
    
    logger.info('Revoked all tokens for user', { tenantId, reason });
  } catch (error) {
    logger.error('Failed to revoke all user tokens', { tenantId, error });
    throw new Error('Failed to revoke user tokens');
  }
};

/**
 * 检查用户token是否因为全局撤销而无效
 * @param tenantId 租户ID
 * @param tokenIssuedAt token签发时间
 */
export const isUserTokenRevoked = async (
  tenantId: string, 
  tokenIssuedAt: Date
): Promise<boolean> => {
  try {
    const globalRevoke = await prisma.tokenBlacklist.findFirst({
      where: {
        tenant_id: tenantId,
        revoke_all_before: {
          gte: tokenIssuedAt
        },
        expires_at: {
          gt: new Date()
        }
      },
      orderBy: {
        revoke_all_before: 'desc'
      }
    });
    
    return !!globalRevoke;
  } catch (error) {
    logger.error('Failed to check user token revocation', { tenantId, error });
    return false;
  }
}; 