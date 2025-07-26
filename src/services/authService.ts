// services/authService.ts

import { PrismaClient } from '@prisma/client';
import { LoginInput, AuthResult, LogoutInput, RefreshInput } from '../types';
import { AUTH_ERRORS } from '../constants';
import { comparePassword, logger, checkLoginLock, recordLoginFail, clearLoginFail } from '../utils';
import { generateTokenPair, revokeToken, refreshAccessToken, verifyToken } from '../config';
import { createSession } from './sessionService';
import { getSubscriptionInfo } from './subscriptionService';

// 初始化 Prisma
const prisma = new PrismaClient();

/**
 * 用户登录
 */
export async function login(input: LoginInput): Promise<AuthResult> {
  // 检查锁定（IP/邮箱）
  const lock = await checkLoginLock(input.email, input.ip);
  if (lock.isLocked) {
    return {
      success: false,
      error: lock.reason === 'IP' ? AUTH_ERRORS.IP_LOCKED : AUTH_ERRORS.ACCOUNT_LOCKED,
      lockReason: lock.reason,
      lockRemainSeconds: lock.ttl,
    };
  }

  // 查找租户（软删除不可登录）
  const tenant = await prisma.tenant.findFirst({
    where: {
      email: input.email,
      deleted_at: null
    }
  });

  if (!tenant) {
    await recordLoginFail(input.email, input.ip);
    return { success: false, error: AUTH_ERRORS.INVALID_CREDENTIALS };
  }

  // 检查邮箱是否已验证
  if (!tenant.email_verified_at) {
    await recordLoginFail(input.email, input.ip);
    return { success: false, error: AUTH_ERRORS.EMAIL_NOT_VERIFIED };
  }

  const ok = await comparePassword(input.password, tenant.password_hash);
  if (!ok) {
    await recordLoginFail(input.email, input.ip);
    return { success: false, error: AUTH_ERRORS.INVALID_CREDENTIALS };
  }

  // 登录成功，清除计数
  await clearLoginFail(input.email, input.ip);

  // === 1. 生成 Session，获得 sessionId ===
  const sessionResult = await createSession({
    tenantId: tenant.id,
    refreshToken: undefined,      // 先填 undefined，token 对生成后可补写进 session 表（如需保存的话）
    userAgent: input.userAgent,   // 用户请求头传入
    ip: input.ip,
    deviceType: input.deviceType, // 可选
  });

  const sub = await getSubscriptionInfo(tenant.id);

  // === 2. 用 sessionId 生成 Token 对 ===
  const tokens = generateTokenPair({
    tenantId: tenant.id,
    email: tenant.email,
    storeName: tenant.store_name,
    subdomain: tenant.subdomain,
    subscriptionStatus: sub.status,
    subscriptionPlan: sub.plan,
    emailVerified: !!tenant.email_verified_at,
    sessionId: sessionResult.sessionId, // 用 sessionId 作 jti
  });

  logger.info('User login', { tenantId: tenant.id, sessionId: sessionResult.sessionId });

  return {
    success: true,
    tenantId: tenant.id,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    sessionId: sessionResult.sessionId,
    emailVerified: !!tenant.email_verified_at,
  };
}


/**
 * 用户登出（access token 加入黑名单）
 */
export async function logout(input: LogoutInput): Promise<{ success: boolean }> {
  await revokeToken(input.token, 'logout');
  return { success: true };
}

/**
 * refresh token换取access token
 */
export async function refresh(input: RefreshInput): Promise<AuthResult> {
  return await refreshAccessToken(input.refreshToken);
}

/**
 * 校验token（如登录态校验）
 */
export async function verifyAccessToken(token: string): Promise<boolean> {
  try {
    await verifyToken(token, 'access');
    return true;
  } catch {
    return false;
  }
}