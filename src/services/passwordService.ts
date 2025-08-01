import { PrismaClient } from '../../generated/prisma';
import { hashPassword, comparePassword, validatePasswordStrength, revokeAllUserTokens, logger, generateVerificationCode, renderEmailTemplate } from '../utils';
import { PASSWORD_ERRORS } from '../constants';
import { sendNotificationEmail } from './emailService';
import { generatePasswordResetToken, verifyAndDeleteOneTimePasswordResetToken } from '../config';
import type { ChangePasswordInput, ResetPasswordInput, InitiateResetInput, PasswordResetResult, VerifyResetCodeInput } from '../types';

const prisma = new PrismaClient();

/**
 * 已登录场景下修改密码
 */
export async function changePassword(input: ChangePasswordInput): Promise<PasswordResetResult> {
  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
  if (!tenant) return { success: false, message: PASSWORD_ERRORS.INVALID };

  // 检查邮箱验证状态
  if (!tenant.email_verified_at) {
    return { success: false, message: 'Email not verified yet' };
  }

  const ok = await comparePassword(input.oldPassword, tenant.password_hash);
  if (!ok) return { success: false, message: PASSWORD_ERRORS.INVALID };

  const errors = validatePasswordStrength(input.newPassword);
  if (errors.length) return { success: false, message: errors.join('、') };

  const hash = await hashPassword(input.newPassword);
  await prisma.tenant.update({ where: { id: input.tenantId }, data: { password_hash: hash } });

  await revokeAllUserTokens(input.tenantId, 'password_changed');
  logger.info('Password changed, all sessions revoked', { tenantId: input.tenantId });

  return { success: true };
}

/**
 * 发起密码重置流程（发送验证码）
 */
export async function initiateResetPassword(input: InitiateResetInput): Promise<PasswordResetResult> {
  const tenant = await prisma.tenant.findFirst({ where: { email: input.email } });
  if (!tenant) return { success: false, message: 'Email not found' };

  // 检查邮箱是否已验证
  if (!tenant.email_verified_at) {
    return { success: false, message: 'Email not verified yet' };
  }

  // 生成验证码并刷新字段
  const verificationCode = generateVerificationCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10分钟过期

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      email_verification_code: verificationCode,
      email_verification_code_expires_at: expiresAt,
    }
  });

  // 发送密码重置验证码邮件
  const html = renderEmailTemplate('password-reset-code', { email: input.email, code: verificationCode });
  await sendNotificationEmail(input.email, 'Password Reset Code', html);
  logger.info('Password reset verification code sent', { tenantId: tenant.id });

  return { success: true };
}

/**
 * 验证密码重置验证码
 */
export async function verifyResetCode(input: VerifyResetCodeInput): Promise<PasswordResetResult> {
  const tenant = await prisma.tenant.findFirst({ 
    where: { 
      email: input.email, 
      email_verification_code: input.code,
      email_verification_code_expires_at: { gt: new Date() }
    } 
  });

  if (!tenant) {
    return { success: false, message: 'Invalid or expired verification code' };
  }

  // 生成临时重置token
  const resetToken = generatePasswordResetToken(input.email, tenant.id);
  
  // 清除验证码
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      email_verification_code: null,
      email_verification_code_expires_at: null,
    }
  });

  return { success: true, resetToken };
}

/**
 * 重置密码（通过验证码token）
 */
export async function resetPassword(input: ResetPasswordInput): Promise<PasswordResetResult> {
  let email, tenantId;
  try {
    const result = await verifyAndDeleteOneTimePasswordResetToken(input.token);
    email = result.email;
    tenantId = result.tenantId;
  } catch {
    return { success: false, message: PASSWORD_ERRORS.TOKEN_INVALID };
  }

  const tenant = await prisma.tenant.findFirst({ where: { email, id: tenantId } });
  if (!tenant) return { success: false, message: 'User not found' };

  const errors = validatePasswordStrength(input.newPassword);
  if (errors.length) return { success: false, message: errors.join('、') };

  const hash = await hashPassword(input.newPassword);
  await prisma.tenant.update({ where: { id: tenantId }, data: { password_hash: hash } });

  await revokeAllUserTokens(tenantId, 'password_reset');
  logger.info('Password reset, all sessions revoked', { tenantId });

  return { success: true };
}