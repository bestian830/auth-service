import { PrismaClient } from '../../generated/prisma';
import { logger } from '../utils';
import { EMAIL_VERIFICATION } from '../constants';
import { incrementCounter, getCounter, resetCounter } from '../utils';
import type { EmailVerificationResult, VerifyEmailCodeInput } from '../types';
import { sendVerificationEmail } from './emailService';

const prisma = new PrismaClient();

/**
 * 验证邮箱验证码
 */
export async function verifyEmailCode(input: VerifyEmailCodeInput): Promise<EmailVerificationResult> {
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

    // 检查错误次数限制
    const failCountKey = `${EMAIL_VERIFICATION.REDIS_KEYS.VERIFY_FAIL_COUNT}:${input.email}`;
    const currentFailCount = await getCounter(failCountKey);
    
    if (currentFailCount >= EMAIL_VERIFICATION.MAX_ERROR_COUNT) {
      // 达到最大错误次数，清空验证码
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          email_verification_code: null,
          email_verification_code_expires_at: null,
        }
      });
      
      logger.warn('Email verification code invalidated due to too many errors', { 
        email: input.email, 
        failCount: currentFailCount 
      });
      
      return {
        success: false,
        error: 'Too many errors, please request a new verification code'
      };
    }

    // 检查验证码是否匹配
    if (tenant.email_verification_code !== input.code) {
      // 验证码错误，增加错误计数
      const remainingSeconds = Math.ceil((tenant.email_verification_code_expires_at.getTime() - Date.now()) / 1000);
      await incrementCounter(failCountKey, remainingSeconds);
      
      logger.warn('Email verification code mismatch', { 
        email: input.email, 
        failCount: currentFailCount + 1 
      });
      
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

    // 清除错误计数
    await resetCounter(failCountKey);

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

/**
 * 重发验证码
 */
export async function resendVerificationCode(email: string): Promise<EmailVerificationResult> {
  try {
    // 查询用户
    const tenant = await prisma.tenant.findFirst({
      where: {
        email: email,
        deleted_at: null
      }
    });

    if (!tenant) {
      return {
        success: false,
        error: 'User not found'
      };
    }

    // 检查每日重发次数限制
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const resendCountKey = `${EMAIL_VERIFICATION.REDIS_KEYS.DAILY_RESEND_COUNT}:${email}:${today}`;
    const currentResendCount = await getCounter(resendCountKey);
    
    if (currentResendCount >= EMAIL_VERIFICATION.MAX_DAILY_RESEND_COUNT) {
      logger.warn('Daily resend limit reached', { email, resendCount: currentResendCount });
      return {
        success: false,
        error: 'Daily send limit reached'
      };
    }

    // 检查当前验证码是否过期
    const isCurrentCodeExpired = !tenant.email_verification_code_expires_at || 
                                new Date() > tenant.email_verification_code_expires_at;

    if (!isCurrentCodeExpired) {
      // 当前验证码未过期，直接重发，不更新数据库
      await incrementCounter(resendCountKey, getRemainingSecondsOfDay());
      
      // 发送邮件
      await sendVerificationEmail(email);
      
      logger.info('Resending existing verification code', { email, tenantId: tenant.id });
      return {
        success: true
      };
    }

    // 生成新验证码
    const { generateVerificationCode } = await import('../utils/crypto');
    const verificationCode = generateVerificationCode();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION.CODE_EXPIRY_MINUTES * 60 * 1000);

    // 更新数据库
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        email_verification_code: verificationCode,
        email_verification_code_expires_at: expiresAt,
      }
    });

    // 增加重发计数
    await incrementCounter(resendCountKey, getRemainingSecondsOfDay());

    // 重置错误计数
    const failCountKey = `${EMAIL_VERIFICATION.REDIS_KEYS.VERIFY_FAIL_COUNT}:${email}`;
    await resetCounter(failCountKey);

    // 发送邮件
    await sendVerificationEmail(email);

    logger.info('New verification code generated and sent', { email, tenantId: tenant.id });

    return {
      success: true
    };
  } catch (error) {
    logger.error('Resend verification code failed', { error, email });
    return {
      success: false,
      error: 'Failed to resend verification code'
    };
  }
}

/**
 * 获取当天剩余秒数
 */
function getRemainingSecondsOfDay(): number {
  const now = new Date();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return Math.ceil((endOfDay.getTime() - now.getTime()) / 1000);
} 