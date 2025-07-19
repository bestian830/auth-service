> 所有类型定义均放置于 `auth-service/src/types/jwt.ts` 和 `auth-service/src/types/auth.ts`，所有常量放置于 `auth-service/src/constants/jwt.ts`。本文件不定义任何 type 或常量。

// auth-service/src/config/jwt.ts

import jwt from 'jsonwebtoken';
import { config } from './env';
import { JWT_CONFIG } from '../constants/jwt';
import { AuthJwtPayload, TokenGenerationParams } from '../types/jwt';
import { TokenRefreshResult } from '../types/auth';
import {
  addTokenToBlacklist,
  isTokenBlacklisted,
  isUserTokenRevoked
} from '../utils/token-blacklist';

/**
 * 生成 JWT Token
 * @param payload - 业务负载信息，不包含iat、exp、jti等元数据
 * @param type - Token类型：'access' 或 'refresh'
 * @returns JWT字符串
 * 执行逻辑：根据type选择不同的secret和过期时间，附加元数据（iss, aud, jti），生成带签名的token。
 */
export const generateToken = (
  payload: Omit<AuthJwtPayload, 'iat' | 'exp' | 'iss' | 'aud' | 'jti'>,
  type: 'access' | 'refresh' = 'access'
): string => {
  const secret = type === 'access' ? config.jwt.secret : config.jwt.refreshSecret;
  const expiresIn = type === 'access'
    ? JWT_CONFIG.EXPIRY_TIMES.ACCESS_TOKEN
    : JWT_CONFIG.EXPIRY_TIMES.REFRESH_TOKEN;

  return jwt.sign(
    {
      ...payload,
      type,
      iss: JWT_CONFIG.ISSUER,
      aud: JWT_CONFIG.AUDIENCE
    },
    secret,
    {
      algorithm: JWT_CONFIG.ALGORITHM,
      expiresIn,
      jwtid: generateTokenId()
    }
  );
};

/**
 * 验证 Token 合法性
 * @param token - JWT字符串
 * @param type - 类型（access 或 refresh）
 * @returns Promise<AuthJwtPayload>
 * 执行逻辑：验证签名、issuer、audience，并检查 token 类型是否一致，是否被撤销。
 */
export const verifyToken = (
  token: string,
  type: 'access' | 'refresh' = 'access'
): Promise<AuthJwtPayload> => {
  return new Promise(async (resolve, reject) => {
    const secret = type === 'access' ? config.jwt.secret : config.jwt.refreshSecret;

    jwt.verify(token, secret, {
      algorithms: [JWT_CONFIG.ALGORITHM],
      issuer: JWT_CONFIG.ISSUER,
      audience: JWT_CONFIG.AUDIENCE
    }, async (error, decoded) => {
      if (error) return reject(error);

      const payload = decoded as AuthJwtPayload;

      if (payload.type !== type) return reject(new Error('Invalid token type'));
      if (payload.jti && await isTokenBlacklisted(payload.jti)) return reject(new Error('Token has been revoked'));
      if (payload.iat && await isUserTokenRevoked(payload.tenantId, new Date(payload.iat * 1000))) {
        return reject(new Error('Token has been revoked due to security reset'));
      }

      resolve(payload);
    });
  });
};

/**
 * 生成access和refresh token对
 * @param tenantData - 认证用户的身份信息
 * @returns accessToken、refreshToken及其过期时间
 * 执行逻辑：复用payload，分别生成access和refresh token。
 */
export const generateTokenPair = (tenantData: TokenGenerationParams) => {
  const basePayload = {
    tenantId: tenantData.tenantId,
    email: tenantData.email,
    storeName: tenantData.storeName,
    subdomain: tenantData.subdomain,
    subscriptionStatus: tenantData.subscriptionStatus as any,
    subscriptionPlan: tenantData.subscriptionPlan as any,
    emailVerified: tenantData.emailVerified,
    sessionId: tenantData.sessionId
  };

  const accessToken = generateToken({ ...basePayload, type: 'access' }, 'access');
  const refreshToken = generateToken({ ...basePayload, type: 'refresh' }, 'refresh');

  return {
    accessToken,
    refreshToken,
    expiresIn: JWT_CONFIG.EXPIRY_TIMES.ACCESS_TOKEN
  };
};

/**
 * 刷新access token
 * @param refreshToken - 原始refresh token
 * @returns 新的access token（原refresh token保留）
 * 执行逻辑：验证refresh token后生成新的access token返回
 */
export const refreshAccessToken = async (refreshToken: string): Promise<TokenRefreshResult> => {
  try {
    const payload = await verifyToken(refreshToken, 'refresh');
    const newAccessToken = generateToken({
      tenantId: payload.tenantId,
      email: payload.email,
      storeName: payload.storeName,
      subdomain: payload.subdomain,
      subscriptionStatus: payload.subscriptionStatus,
      subscriptionPlan: payload.subscriptionPlan,
      emailVerified: payload.emailVerified,
      sessionId: payload.sessionId,
      type: 'access'
    }, 'access');

    return {
      success: true,
      tokens: {
        accessToken: newAccessToken,
        refreshToken,
        expiresIn: JWT_CONFIG.EXPIRY_TIMES.ACCESS_TOKEN,
        tokenType: 'Bearer'
      }
    };
  } catch {
    return {
      success: false,
      error: 'Invalid refresh token',
      requiresLogin: true
    };
  }
};

/**
 * 撤销指定token（加入黑名单）
 * @param token - 目标token
 * @param reason - 撤销原因（默认：revoked）
 * 执行逻辑：解析token的jti和exp并写入黑名单系统。
 */
export const revokeToken = async (token: string, reason: string = 'revoked'): Promise<void> => {
  try {
    const decoded = jwt.decode(token) as AuthJwtPayload;
    if (decoded?.jti && decoded?.exp) {
      const expiresAt = new Date(decoded.exp * 1000);
      await addTokenToBlacklist(decoded.jti, expiresAt, reason);
    }
  } catch {
    throw new Error('Failed to revoke token');
  }
};

/**
 * 从请求头提取JWT
 * @param authHeader - 形如"Bearer xxx"的Authorization头
 * @returns JWT字符串或null
 */
export const extractTokenFromHeader = (authHeader?: string): string | null => {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
};

/**
 * 生成唯一Token ID
 * @returns 字符串格式的唯一ID
 * 执行逻辑：通过两次随机base36连接生成伪唯一标识符，用于token黑名单识别。
 */
const generateTokenId = (): string => {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
};

/**
 * 生成邮箱验证token
 * @param email - 邮箱地址
 * @param tenantId - 对应租户ID
 * @returns 带有邮箱信息的JWT验证token
 * 执行逻辑：生成一个有效期短的access token，类型为'email_verification'
 */
export const generateEmailVerificationToken = (
  email: string,
  tenantId: string
): string => {
  return jwt.sign(
    {
      email,
      tenantId,
      type: 'email_verification',
      iss: JWT_CONFIG.ISSUER,
      aud: JWT_CONFIG.AUDIENCE
    },
    config.jwt.secret,
    {
      algorithm: JWT_CONFIG.ALGORITHM,
      expiresIn: JWT_CONFIG.EXPIRY_TIMES.EMAIL_VERIFICATION
    }
  );
};

/**
 * 验证邮箱验证token
 * @param token - 待验证的token
 * @returns {email, tenantId} 解析出的payload
 * 执行逻辑：验证token签名及issuer等元数据，并检查type字段为'email_verification'
 */
export const verifyEmailVerificationToken = (
  token: string
): Promise<{ email: string, tenantId: string }> => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, config.jwt.secret, {
      algorithms: [JWT_CONFIG.ALGORITHM],
      issuer: JWT_CONFIG.ISSUER,
      audience: JWT_CONFIG.AUDIENCE
    }, (error, decoded) => {
      if (error) return reject(error);
      const payload = decoded as any;
      if (payload.type !== 'email_verification') {
        return reject(new Error('Invalid token type'));
      }
      resolve({ email: payload.email, tenantId: payload.tenantId });
    });
  });
};

/**
 * 请求认证流程封装
 * @param authHeader - Authorization头部内容
 * @returns 解码后的AuthJwtPayload，失败返回null
 * 执行逻辑：提取access token后调用verifyToken进行解码和合法性验证
 */
export const authenticateRequest = async (
  authHeader?: string
): Promise<AuthJwtPayload | null> => {
  const token = extractTokenFromHeader(authHeader);
  if (!token) return null;

  try {
    return await verifyToken(token, 'access');
  } catch {
    return null;
  }
};
