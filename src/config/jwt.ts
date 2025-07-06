import jwt from 'jsonwebtoken';
import { config } from './env';
import { JWT_CONFIG } from '../constants/jwt';
import { AuthJwtPayload, TokenGenerationParams } from '../types/jwt';
import { TokenRefreshResult } from '../types/auth';

/**
 * 生成JWT Token
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
      jwtid: generateTokenId() // 保留jti用于后续黑名单服务
    }
  );
};

/**
 * 验证JWT Token
 * TODO: 后续需要集成独立的黑名单服务进行token撤销验证
 */
export const verifyToken = (
  token: string, 
  type: 'access' | 'refresh' = 'access'
): Promise<AuthJwtPayload> => {
  return new Promise((resolve, reject) => {
    const secret = type === 'access' ? config.jwt.secret : config.jwt.refreshSecret;
    
    jwt.verify(token, secret, {
      algorithms: [JWT_CONFIG.ALGORITHM],
      issuer: JWT_CONFIG.ISSUER,
      audience: JWT_CONFIG.AUDIENCE
    }, (error, decoded) => {
      if (error) {
        reject(error);
        return;
      }
      
      const payload = decoded as AuthJwtPayload;
      
      // 检查token类型
      if (payload.type !== type) {
        reject(new Error('Invalid token type'));
        return;
      }
      
      // TODO: 后续需要调用黑名单服务检查token是否被撤销
      // if (payload.jti && await blacklistService.isBlacklisted(payload.jti)) {
      //   reject(new Error('Token has been revoked'));
      //   return;
      // }
      
      resolve(payload);
    });
  });
};

/**
 * 生成Access和Refresh Token对
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

  const accessToken = generateToken({
    ...basePayload,
    type: 'access'
  }, 'access');
  
  const refreshToken = generateToken({
    ...basePayload,
    type: 'refresh'
  }, 'refresh');
  
  return {
    accessToken,
    refreshToken,
    expiresIn: JWT_CONFIG.EXPIRY_TIMES.ACCESS_TOKEN // 让前端知道token的过期时间: 15分钟
  };
};

/**
 * 刷新Token
 */
export const refreshAccessToken = async (refreshToken: string): Promise<TokenRefreshResult> => {
  try {
    // 验证refresh token
    const payload = await verifyToken(refreshToken, 'refresh');
    
    // 生成新的access token
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
        refreshToken: refreshToken, // 保持原refresh token
        expiresIn: JWT_CONFIG.EXPIRY_TIMES.ACCESS_TOKEN,
        tokenType: 'Bearer'
      }
    };
  } catch (error) {
    return {
      success: false,
      error: 'Invalid refresh token',
      requiresLogin: true
    };
  }
};

/**
 * 撤销Token（预留接口，后续集成黑名单服务）
 * TODO: 需要调用独立的黑名单服务
 */
export const revokeToken = (token: string): void => {
  try {
    const decoded = jwt.decode(token) as AuthJwtPayload;
    if (decoded?.jti) {
      // TODO: 调用黑名单服务
      // await blacklistService.addToBlacklist(decoded.jti, remainingTime);
      console.log(`TODO: Token ${decoded.jti} should be added to blacklist service`);
    }
  } catch (error) {
    // 忽略解码错误，可能是无效token
  }
};

/**
 * 从Authorization头中提取token
 */
export const extractTokenFromHeader = (authHeader?: string): string | null => {
  if (!authHeader) return null;
  
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }
  
  return parts[1];
};

/**
 * 生成唯一的Token ID
 */
const generateTokenId = (): string => {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
};

/**
 * 生成邮箱验证Token
 */
export const generateEmailVerificationToken = (email: string, tenantId: string): string => {
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
 * 验证邮箱验证Token
 */
export const verifyEmailVerificationToken = (token: string): Promise<{email: string, tenantId: string}> => {
  return new Promise((resolve, reject) => {
    jwt.verify(token, config.jwt.secret, {
      algorithms: [JWT_CONFIG.ALGORITHM],
      issuer: JWT_CONFIG.ISSUER,
      audience: JWT_CONFIG.AUDIENCE
    }, (error, decoded) => {
      if (error) {
        reject(error);
        return;
      }
      
      const payload = decoded as any;
      if (payload.type !== 'email_verification') {
        reject(new Error('Invalid token type'));
        return;
      }
      
      resolve({
        email: payload.email,
        tenantId: payload.tenantId
      });
    });
  });
};

/**
 * 完整的请求认证流程
 * TODO: 后续需要集成黑名单服务进行token撤销验证
 */
export const authenticateRequest = async (authHeader?: string): Promise<AuthJwtPayload | null> => {
  // 1. 从请求头提取token
  const token = extractTokenFromHeader(authHeader);
  if (!token) return null;
  
  // 2. 验证access token并获取租户信息
  try {
    return await verifyToken(token, 'access');
  } catch {
    return null;
  }
}; 