/**
 * Token 黑名单服务 - 基于数据库实现
 * 用于撤销已签发的JWT token
 */

import { logger } from './logger';
import { withRedisPrefix } from './redis-prefix';
import { getRedisClient } from '../config';

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
  const redis = getRedisClient();
  const key = withRedisPrefix(`token:blacklist:${jti}`);
  const ttlSeconds = Math.ceil((expiresAt.getTime() - Date.now()) / 1000);

  try {
    await redis.set(key, reason, { EX: ttlSeconds > 0 ? ttlSeconds : 1 });
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
  const redis = getRedisClient();
  const key = withRedisPrefix(`token:blacklist:${jti}`);
  try {
    const result = await redis.get(key);
    return !!result;
  } catch (error) {
    logger.error('Failed to check token blacklist', { jti, error });
    // 查询失败默认token有效（可根据业务改为默认无效）
    return false;
  }
};

/**
 * 撤销用户所有token（如密码重置后，批量撤销）
 * 实现为：记录一个特殊租户全局撤销时间点
 * @param tenantId 租户ID
 * @param reason 撤销原因
 */
export const revokeAllUserTokens = async (
  tenantId: string,
  reason: string = 'security_reset'
): Promise<void> => {
  const redis = getRedisClient();
  const key = withRedisPrefix(`token:user_revoke:${tenantId}`);
  const now = Date.now();
  // 推荐 30 天后过期（access token 最长不应超过这个）
  const ttlSeconds = 30 * 24 * 60 * 60;
  try {
    // 用当前时间作为revoke_before
    await redis.set(key, now.toString(), { EX: ttlSeconds });
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
 * @returns 是否被全局撤销
 */
export const isUserTokenRevoked = async (
  tenantId: string,
  tokenIssuedAt: Date
): Promise<boolean> => {
  const redis = getRedisClient();
  const key = withRedisPrefix(`token:user_revoke:${tenantId}`);
  try {
    const revokeTimestampStr = await redis.get(key);
    if (!revokeTimestampStr) return false;
    const revokeBefore = parseInt(revokeTimestampStr, 10);
    return tokenIssuedAt.getTime() <= revokeBefore;
  } catch (error) {
    logger.error('Failed to check user token revocation', { tenantId, error });
    // 查询失败默认未撤销
    return false;
  }
};