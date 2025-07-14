/**
 * 会话服务 - 处理会话管理相关业务逻辑
 */

import { 
  SessionEntity, 
  SessionMetadata, 
} from '../types/entities';
import { RequestContext } from '../types/api';
import { AuthError } from '../types/common';
import { SessionModel } from '../models/session';
import { TenantModel } from '../models/tenant';
import { generateRandomToken } from '../utils/crypto';
import { hashPassword } from '../utils/password';

/**
 * 创建会话
 * @param userId 用户ID
 * @param meta 会话元数据
 * @param context 请求上下文
 * @returns 会话实体
 */
export async function createSession(
  userId: string, 
  meta: SessionMetadata, 
  context?: Partial<RequestContext>
): Promise<SessionEntity> {
  try {
    // 构建请求上下文
    const requestContext: RequestContext = {
      requestId: generateRandomToken(16),
      timestamp: new Date(),
      method: 'POST',
      path: '/auth/session/create',
      ipAddress: context?.ipAddress || meta.ipAddress,
      userAgent: context?.userAgent || meta.userAgent
    };

    // 验证租户存在
    const tenant = await TenantModel.findById(requestContext, userId);
    if (!tenant) {
      throw new AuthError('TENANT_NOT_FOUND', 'User not found');
    }

    // 生成会话ID和令牌
    const sessionId = generateRandomToken(32);
    const tokenHash = await hashPassword(sessionId);
    const refreshToken = generateRandomToken(64);

    // 设置过期时间（7天）
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // 创建会话记录
    const sessionData = {
      tenant_id: userId,
      token_hash: tokenHash,
      refresh_token: refreshToken,
      user_agent: meta.userAgent,
      ip_address: meta.ipAddress,
      expires_at: expiresAt
    };

    const session = await SessionModel.create(requestContext, sessionData);

    // 清理过期会话
    await SessionModel.cleanupExpiredSessions(requestContext);

    return session;
  } catch (error: any) {
    throw new AuthError('SESSION_CREATE_FAILED', error.message || 'Failed to create session');
  }
}

/**
 * 使会话失效
 * @param sessionId 会话ID
 * @param context 请求上下文
 */
export async function invalidateSession(
  sessionId: string, 
  context?: Partial<RequestContext>
): Promise<void> {
  try {
    // 构建请求上下文
    const requestContext: RequestContext = {
      requestId: generateRandomToken(16),
      timestamp: new Date(),
      method: 'POST',
      path: '/auth/session/invalidate',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent
    };

    // 验证会话存在
    const session = await SessionModel.findById(requestContext, sessionId);
    if (!session) {
      throw new AuthError('SESSION_NOT_FOUND', 'Session not found');
    }

    // 标记会话为失效
    await SessionModel.softDelete(requestContext, sessionId);

  } catch (error: any) {
    throw new AuthError('SESSION_INVALIDATE_FAILED', error.message || 'Failed to invalidate session');
  }
}

/**
 * 使用户所有会话失效
 * @param userId 用户ID
 * @param context 请求上下文
 */
export async function invalidateAllSessions(
  userId: string, 
  context?: Partial<RequestContext>
): Promise<void> {
  try {
    // 构建请求上下文
    const requestContext: RequestContext = {
      requestId: generateRandomToken(16),
      timestamp: new Date(),
      method: 'POST',
      path: '/auth/session/invalidate-all',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent
    };

    // 查找用户所有活跃会话
    const sessions = await SessionModel.findByTenantId(requestContext, userId);
    
    if (sessions.length === 0) {
      return;
    }

    // 批量使会话失效
    await SessionModel.softDeleteByTenantId(requestContext, userId);

  } catch (error: any) {
    throw new AuthError('SESSION_INVALIDATE_ALL_FAILED', error.message || 'Failed to invalidate all sessions');
  }
}

/**
 * 刷新会话
 * @param sessionId 会话ID
 * @param context 请求上下文
 * @returns 刷新后的会话实体
 */
export async function refreshSession(
  sessionId: string, 
  context?: Partial<RequestContext>
): Promise<SessionEntity> {
  try {
    // 构建请求上下文
    const requestContext: RequestContext = {
      requestId: generateRandomToken(16),
      timestamp: new Date(),
      method: 'POST',
      path: '/auth/session/refresh',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent
    };

    // 验证会话存在且有效
    const session = await SessionModel.findById(requestContext, sessionId);
    if (!session) {
      throw new AuthError('SESSION_NOT_FOUND', 'Session not found');
    }

    // 检查会话是否过期
    if (new Date() > session.expires_at) {
      throw new AuthError('SESSION_EXPIRED', 'Session has expired');
    }

    // 延长过期时间（7天）
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // 更新会话记录
    const updatedSession = await SessionModel.refreshExpiration(requestContext, sessionId, newExpiresAt);
    
    if (!updatedSession) {
      throw new AuthError('SESSION_REFRESH_FAILED', 'Failed to refresh session');
    }

    return updatedSession;
  } catch (error: any) {
    throw new AuthError('SESSION_REFRESH_FAILED', error.message || 'Failed to refresh session');
  }
}

/**
 * 获取用户活跃会话
 * @param userId 用户ID
 * @param context 请求上下文
 * @returns 会话实体列表
 */
export async function getActiveSessions(
  userId: string, 
  context?: Partial<RequestContext>
): Promise<SessionEntity[]> {
  try {
    // 构建请求上下文
    const requestContext: RequestContext = {
      requestId: generateRandomToken(16),
      timestamp: new Date(),
      method: 'GET',
      path: '/auth/session/active',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent
    };

    // 查询用户所有活跃会话
    const sessions = await SessionModel.findActiveSessions(requestContext, userId);
    
    // 按最后活动时间排序
    return sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  } catch (error: any) {
    throw new AuthError('SESSION_FETCH_FAILED', error.message || 'Failed to fetch active sessions');
  }
} 