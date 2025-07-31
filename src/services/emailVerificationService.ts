import { PrismaClient } from '../../generated/prisma';
import { logger } from '../utils';
import { VerifyEmailCodeInput, VerifyEmailCodeResult } from '../types';

const prisma = new PrismaClient();

/**
 * 验证邮箱验证码
 */
export async function verifyEmailCode(input: VerifyEmailCodeInput): Promise<VerifyEmailCodeResult> {
  try {
    // 查询用户
    const tenant = await prisma.tenant.findFirst({
      where: {
        email: input.email,
        deleted_at: null
      }
    });

    if (!tenant) {
      return {
        success: false,
        error: 'User not found'
      };
    }

    // 检查验证码是否存在
    if (!tenant.email_verification_code || !tenant.email_verification_code_expires_at) {
      return {
        success: false,
        error: 'Verification code invalid or expired'
      };
    }

    // 检查验证码是否过期
    if (new Date() > tenant.email_verification_code_expires_at) {
      return {
        success: false,
        error: 'Verification code invalid or expired'
      };
    }

    // 检查验证码是否匹配
    if (tenant.email_verification_code !== input.code) {
      return {
        success: false,
        error: 'Verification code invalid or expired'
      };
    }

    // 验证成功，更新邮箱验证状态并清空验证码
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        email_verified_at: new Date(),
        email_verification_code: null,
        email_verification_code_expires_at: null,
      }
    });

    logger.info('Email verified successfully', { tenantId: tenant.id, email: input.email });

    return {
      success: true
    };
  } catch (error) {
    logger.error('Email verification failed', { error, email: input.email });
    return {
      success: false,
      error: 'Verification code invalid or expired'
    };
  }
} 