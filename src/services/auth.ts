/**
 * 认证服务 - 处理JWT令牌生成、验证、刷新等认证相关业务逻辑
 */

import { 
  TokenRefreshResult,
  DecodedToken,
  AuthResult,
  AuthRequestContext
} from '../types/auth';
import { TenantEntity } from '../types/entities';
import { AuthError } from '../types/common';
import { RequestContext } from '../types/api';
import { generateToken, verifyToken as jwtVerifyToken, refreshAccessToken, extractTokenFromHeader } from '../config/jwt';
import { SessionModel } from '../models/session';
import { TenantModel } from '../models/tenant';
import { SUBSCRIPTION_STATUS } from '../constants/subscription-status';
import { generateRandomToken } from '../utils/crypto';
import { PLAN_SERVICE_PERMISSIONS } from '../constants/subscription-plans';
import { logger } from '../utils/logger';

/**
 * 生成访问令牌
 * @param user 用户实体
 * @param payload 额外载荷数据
 * @returns 访问令牌
 */
export async function generateAccessToken(user: TenantEntity, payload?: any): Promise<string> {
  try {
    // 构建JWT载荷
    const tokenPayload = {
      tenantId: user.id,
      email: user.email,
      storeName: user.store_name,
      subdomain: user.subdomain,
      subscriptionStatus: user.subscription_status,
      subscriptionPlan: user.subscription_plan,
      emailVerified: !!user.email_verified_at,
      ...payload
    };

    // 生成访问令牌
    const accessToken = generateToken(tokenPayload, 'access');
    
    return accessToken;
  } catch (error) {
    throw new AuthError('TOKEN_GENERATION_FAILED', 'Failed to generate access token');
  }
}

/**
 * 生成刷新令牌
 * @param user 用户实体
 * @param payload 额外载荷数据
 * @returns 刷新令牌
 */
export async function generateRefreshToken(user: TenantEntity, payload?: any): Promise<string> {
  try {
    // 构建刷新令牌载荷
    const tokenPayload = {
      tenantId: user.id,
      email: user.email,
      storeName: user.store_name,
      subdomain: user.subdomain,
      subscriptionStatus: user.subscription_status,
      subscriptionPlan: user.subscription_plan,
      emailVerified: !!user.email_verified_at,
      ...payload
    };

    // 生成刷新令牌
    const refreshToken = generateToken(tokenPayload, 'refresh');
    
    return refreshToken;
  } catch (error) {
    throw new AuthError('TOKEN_GENERATION_FAILED', 'Failed to generate refresh token');
  }
}

/**
 * 验证令牌
 * @param token 待验证令牌
 * @returns 解码结果
 */
export async function verifyToken(token: string): Promise<DecodedToken | null> {
  try {
    // 解码JWT令牌
    const payload = await jwtVerifyToken(token, 'access');
    
    return {
      payload,
      isValid: true,
      isExpired: false
    };
  } catch (error: any) {
    // 检查是否是过期错误
    const isExpired = error.name === 'TokenExpiredError';
    
    return {
      payload: null,
      isValid: false,
      isExpired
    };
  }
}

/**
 * 刷新令牌对
 * @param refreshToken 刷新令牌
 * @returns 新的令牌对
 */
export async function refreshTokens(refreshToken: string): Promise<TokenRefreshResult> {
  try {
    // 使用JWT配置中的刷新令牌方法
    const result = await refreshAccessToken(refreshToken);
    
    return result;
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to refresh tokens',
      requiresLogin: true
    };
  }
}

/**
 * 认证请求
 * @param context 请求上下文
 * @returns 认证结果
 */
export async function authenticateRequest(context: AuthRequestContext): Promise<AuthResult> {
  try {
    // 提取Authorization头部
    const token = extractTokenFromHeader(context.authorization);
    
    if (!token) {
      return {
        isAuthenticated: false,
        error: 'No authorization token provided'
      };
    }

    // 验证令牌有效性
    const decodedToken = await verifyToken(token);
    
    if (!decodedToken || !decodedToken.isValid) {
      return {
        isAuthenticated: false,
        error: decodedToken?.isExpired ? 'Token expired' : 'Invalid token'
      };
    }

    // 构建请求上下文
    const requestContext: RequestContext = {
      requestId: generateRandomToken(16),
      timestamp: new Date(),
      method: 'AUTH',
      path: '/authenticate',
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    };

    // 获取用户信息
    const tenant = await TenantModel.findById(requestContext, decodedToken.payload.tenantId);
    
    if (!tenant) {
      return {
        isAuthenticated: false,
        error: 'Tenant not found'
      };
    }

    // 验证会话状态（如果提供了sessionId）
    if (context.sessionId) {
      const session = await SessionModel.findById(requestContext, context.sessionId);
      if (!session || new Date() > session.expires_at) {
        return {
          isAuthenticated: false,
          error: 'Invalid session'
        };
      }
    }

    return {
      isAuthenticated: true,
      tenant,
      sessionId: context.sessionId
    };
  } catch (error: any) {
    return {
      isAuthenticated: false,
      error: error.message || 'Authentication failed'
    };
  }
}

/**
 * 检查用户权限
 * @param user 用户实体
 * @param action 操作类型
 * @param service 服务名称 (如: 'booking', 'staff', 'profile' 等)
 * @param resource 资源对象
 * @returns 是否有权限
 */
export async function requirePermissions(
  user: TenantEntity, 
  action: string, 
  service?: string,
  resource?: any
): Promise<boolean> {
  try {
    // 1. 检查用户订阅状态
    if (user.subscription_status === SUBSCRIPTION_STATUS.EXPIRED || 
        user.subscription_status === SUBSCRIPTION_STATUS.CANCELED) {
      return false;
    }

    // 2. 验证邮箱是否已验证（对于某些操作）
    const requiresEmailVerification = ['create', 'update', 'delete'].includes(action);
    if (requiresEmailVerification && !user.email_verified_at) {
      return false;
    }

    // 3. 检查服务访问权限（基于订阅计划）
    if (service) {
      const userPlan = user.subscription_plan;
      const allowedServices = PLAN_SERVICE_PERMISSIONS[userPlan] || [];
      
      if (!allowedServices.includes(service)) {
        logger.warn('Service access denied', {
          tenantId: user.id,
          userPlan,
          requestedService: service,
          allowedServices
        });
        return false;
      }
    }

    // 4. 基本权限检查通过
    return true;
  } catch (error) {
    logger.error('Permission check failed', {
      tenantId: user.id,
      action,
      service,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
} 