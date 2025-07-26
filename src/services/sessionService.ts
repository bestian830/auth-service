/**
 * Session Service Module
 * Handles user session management after login
 * 
 * Implements functions according to SESSION_DESIGN.md:
 * 1. createSession - Create new session
 * 2. validateSession - Validate session
 * 3. invalidateSession - Invalidate specific session
 * 4. invalidateAllSessionsForUser - Invalidate all sessions for user
 * 5. refreshSession - Refresh session
 */
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { SESSION_ERRORS, SESSION_CONFIG } from '../constants';
import type {
  CreateSessionInput,
  SessionResult,
  InvalidateSessionResult,
  RefreshSessionResult,
} from '../types';
import { logger, addTokenToBlacklist } from '../utils';

const prisma = new PrismaClient();

/**
 * 创建会话
 */
export async function createSession(input: CreateSessionInput): Promise<SessionResult> {
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + SESSION_CONFIG.SESSION_EXPIRES_IN_MS);

  await prisma.session.create({
    data: {
      id: sessionId,
      tenant_id: input.tenantId,
      token_jti: sessionId,
      refresh_token: input.refreshToken,
      user_agent: input.userAgent,
      ip_address: input.ip,
      device_type: input.deviceType || 'web',
      expires_at: expiresAt,
    },
  });

  logger.info('Session created', { sessionId, tenantId: input.tenantId, expiresAt });

  return {
    sessionId,
    expiresAt,
    success: true,
  };
}

/**
 * 刷新会话过期时间（refresh token 时调用）
 */
export async function refreshSessionExpiry(sessionId: string): Promise<RefreshSessionResult> {
  const newExpiresAt = new Date(Date.now() + SESSION_CONFIG.SESSION_EXPIRES_IN_MS);

  const updated = await prisma.session.updateMany({
    where: { id: sessionId },
    data: { expires_at: newExpiresAt },
  });

  if (updated.count === 0) {
    return { success: false, sessionId, message: SESSION_ERRORS.SESSION_NOT_FOUND };
  }
  return {
    success: true,
    sessionId,
    newExpiresAt,
  };
}

/**
 * 失效会话（登出/下线当前会话，同时 jti 加入黑名单，tokenExp 由外部 decode 提供）
 */
export async function invalidateSession(sessionId: string, tokenExp: Date): Promise<InvalidateSessionResult> {
  // 数据库立即过期
  await prisma.session.updateMany({
    where: { id: sessionId },
    data: { expires_at: new Date() },
  });

  // jti 加入黑名单
  await addTokenToBlacklist(sessionId, tokenExp, 'logout');

  logger.info('Session invalidated & blacklisted', { sessionId });
  return { success: true, sessionId };
}

/**
 * 失效租户所有会话（只数据库过期，不强制全黑名单）
 */
export async function invalidateAllSessionsForTenant(tenantId: string): Promise<{ success: boolean; count: number }> {
  const now = new Date();
  const res = await prisma.session.updateMany({
    where: { tenant_id: tenantId, expires_at: { gt: now } },
    data: { expires_at: now },
  });
  return { success: true, count: res.count };
}

/**
 * 校验 session 是否有效
 */
export async function isSessionActive(sessionId: string): Promise<boolean> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });
  if (!session) return false;
  return session.expires_at > new Date();
}