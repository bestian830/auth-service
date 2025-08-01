import { PrismaClient } from '../../generated/prisma';
import { hashPassword, comparePassword, validatePasswordStrength, revokeAllUserTokens, logger } from '../utils';
import { PASSWORD_ERRORS } from '../constants';
import { sendResetPasswordEmail } from './emailService';
import { generatePasswordResetToken, verifyPasswordResetToken } from '../config';
import type { ChangePasswordInput, ResetPasswordInput, InitiateResetInput, PasswordResetResult } from '../types';

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
 * 发起密码重置流程（发邮件）
 */
export async function initiateResetPassword(input: InitiateResetInput): Promise<PasswordResetResult> {
  const tenant = await prisma.tenant.findFirst({ where: { email: input.email, id: input.tenantId } });
  if (!tenant) return { success: false, message: 'Email not found' };

  // 生成token并发邮件
  const token = generatePasswordResetToken(input.email, input.tenantId);
  await sendResetPasswordEmail(input.email, token);
  logger.info('Reset password email sent', { tenantId: input.tenantId });

  return { success: true };
}

/**
 * 重置密码（通过邮件token）
 */
export async function resetPassword(input: ResetPasswordInput): Promise<PasswordResetResult> {
  let email, tenantId;
  try {
    const result = await verifyPasswordResetToken(input.token);
    email = result.email;
    tenantId = result.tenantId;
  } catch {
    return { success: false, message: PASSWORD_ERRORS.TOKEN_INVALID };
  }

  const tenant = await prisma.tenant.findFirst({ where: { email, id: tenantId } });
  if (!tenant) return { success: false, message: '账号不存在' };

  const errors = validatePasswordStrength(input.newPassword);
  if (errors.length) return { success: false, message: errors.join('、') };

  const hash = await hashPassword(input.newPassword);
  await prisma.tenant.update({ where: { id: tenantId }, data: { password_hash: hash } });

  await revokeAllUserTokens(tenantId, 'password_reset');
  logger.info('Password reset, all sessions revoked', { tenantId });

  return { success: true };
}