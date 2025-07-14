/**
 * 密码服务 - 处理密码重置、修改等业务逻辑
 */

import { 
  PasswordResetResult, 
  PasswordChangeResult 
} from '../types/auth';
import { TenantEntity } from '../types/entities';
import { AuthRequestContext } from '../types/auth';
import { TenantModel } from '../models/tenant';
import { SessionModel } from '../models/session';
import { hashPassword, comparePassword } from '../utils/password';
import { generateRandomToken } from '../utils/crypto';
import { sendResetPasswordEmail } from './email';
import { JWT_CONFIG } from '../constants/jwt';

/**
 * 请求密码重置
 * @param email 邮箱地址
 * @param context 请求上下文
 */
export async function requestReset(email: string, context?: Partial<AuthRequestContext>): Promise<PasswordResetResult> {
  try {
    // 构建请求上下文
    const requestContext: AuthRequestContext = {
      requestId: generateRandomToken(16),
      timestamp: new Date(),
      method: 'POST',
      path: '/auth/password/reset-request',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent
    };

    // 查找租户账户
    const tenant = await TenantModel.findByEmail(requestContext, email);
    
    if (!tenant) {
      // 为了安全，即使邮箱不存在也返回成功
      return {
        success: true,
        message: 'If the email exists, a password reset link has been sent.'
      };
    }

    // 检查账户状态
    if (tenant.subscription_status === 'CANCELED') {
      return {
        success: false,
        error: 'Account is deactivated. Please contact support.'
      };
    }

    // 生成重置令牌
    const resetToken = generateRandomToken(32);
    const resetExpiresAt = new Date(Date.now() + JWT_CONFIG.EXPIRY_TIMES.PASSWORD_RESET * 1000);

    // 保存令牌到数据库
    const updateData = {
      password_reset_token: resetToken,
      password_reset_expires_at: resetExpiresAt
    };

    await TenantModel.updateById(requestContext, tenant.id, updateData);

    // 发送重置邮件
    await sendResetPasswordEmail(email, resetToken);

    return {
      success: true,
      message: 'Password reset link has been sent to your email.'
    };

  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to process password reset request'
    };
  }
}

/**
 * 执行密码重置
 * @param token 重置令牌
 * @param newPassword 新密码
 * @param context 请求上下文
 */
export async function resetPassword(
  token: string, 
  newPassword: string, 
  context?: Partial<AuthRequestContext>
): Promise<PasswordResetResult> {
  try {
    // 构建请求上下文
    const requestContext: AuthRequestContext = {
      requestId: generateRandomToken(16),
      timestamp: new Date(),
      method: 'POST',
      path: '/auth/password/reset',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent
    };

    // 查找所有租户，然后过滤出匹配的重置令牌
    // 这不是最优解，但可以绕过 findByResetToken 的问题
    const tenantsResult = await TenantModel.findWithPagination(requestContext, 1, 1000);
    const tenant = tenantsResult.data.find((t: TenantEntity) => 
      t.password_reset_token === token && 
      t.password_reset_expires_at && 
      new Date() <= t.password_reset_expires_at
    );
    
    if (!tenant) {
      return {
        success: false,
        error: 'Invalid or expired reset token',
        tokenValid: false
      };
    }

    // 生成新密码哈希
    const newPasswordHash = await hashPassword(newPassword);

    // 更新密码并清除重置令牌
    const updateData = {
      password_hash: newPasswordHash,
      password_reset_token: null,
      password_reset_expires_at: null
    };

    await TenantModel.updateById(requestContext, tenant.id, updateData);

    // 使所有会话失效
    await SessionModel.softDeleteByTenantId(requestContext, tenant.id);

    return {
      success: true,
      message: 'Password has been reset successfully'
    };

  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to reset password'
    };
  }
}

/**
 * 修改密码
 * @param userId 用户ID
 * @param oldPassword 旧密码
 * @param newPassword 新密码
 * @param context 请求上下文
 */
export async function changePassword(
  userId: string, 
  oldPassword: string, 
  newPassword: string,
  context?: Partial<AuthRequestContext> & { sessionId?: string }
): Promise<PasswordChangeResult> {
  try {
    // 构建请求上下文
    const requestContext: AuthRequestContext = {
      requestId: generateRandomToken(16),
      timestamp: new Date(),
      method: 'POST',
      path: '/auth/password/change',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent
    };

    // 获取用户信息
    const tenant = await TenantModel.findById(requestContext, userId);
    
    if (!tenant) {
      return {
        success: false,
        error: 'User not found'
      };
    }

    // 验证旧密码
    const isOldPasswordValid = await comparePassword(oldPassword, tenant.password_hash);
    
    if (!isOldPasswordValid) {
      return {
        success: false,
        error: 'Current password is incorrect'
      };
    }

    // 检查新密码是否与旧密码相同
    const isSamePassword = await comparePassword(newPassword, tenant.password_hash);
    
    if (isSamePassword) {
      return {
        success: false,
        error: 'New password must be different from current password'
      };
    }

    // 生成新密码哈希
    const newPasswordHash = await hashPassword(newPassword);

    // 更新密码
    const updateData = {
      password_hash: newPasswordHash
    };

    await TenantModel.updateById(requestContext, userId, updateData);

    // 使其他会话失效（保留当前会话）
    const currentSessionId = context?.sessionId;
    if (currentSessionId) {
      const allSessions = await SessionModel.findByTenantId(requestContext, userId);
      const otherSessionIds = allSessions
        .filter(session => session.id !== currentSessionId)
        .map(session => session.id);
      
      if (otherSessionIds.length > 0) {
        await SessionModel.softDeleteMultiple(requestContext, otherSessionIds);
      }
    } else {
      // 如果没有当前会话ID，使所有会话失效
      await SessionModel.softDeleteByTenantId(requestContext, userId);
    }

    return {
      success: true,
      message: 'Password has been changed successfully'
    };

  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to change password'
    };
  }
}