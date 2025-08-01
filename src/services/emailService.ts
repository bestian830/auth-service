import { sendEmail } from '../config';
import { EMAIL_SUBJECTS } from '../constants';
import { renderEmailTemplate, buildResetPasswordUrl } from '../utils';
import { generatePasswordResetToken } from '../config';
import { PrismaClient } from '../../generated/prisma';

const prisma = new PrismaClient();

/**
 * 发送邮箱验证邮件
 */
export async function sendVerificationEmail(email: string, tenantId?: string) {
  let verificationCode: string;

  if (tenantId) {
    // 从数据库获取验证码（用于注册时）
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { email_verification_code: true }
    });

    if (!tenant || !tenant.email_verification_code) {
      throw new Error('Verification code not found');
    }
    verificationCode = tenant.email_verification_code;
  } else {
    // 从数据库获取验证码（用于重发时）
    const tenant = await prisma.tenant.findFirst({
      where: { email },
      select: { email_verification_code: true }
    });

    if (!tenant || !tenant.email_verification_code) {
      throw new Error('Verification code not found');
    }
    verificationCode = tenant.email_verification_code;
  }

  // 2. 渲染模板
  const html = renderEmailTemplate('verify-email', { 
    email, 
    code: verificationCode 
  });
  const subject = EMAIL_SUBJECTS.VERIFY_EMAIL;

  // 3. 发送邮件
  await sendEmail(email, subject, html);
}

/**
 * 发送密码重置邮件
 */
export async function sendResetPasswordEmail(email: string, tenantId: string) {
  const token = generatePasswordResetToken(email, tenantId);
  const url = buildResetPasswordUrl(token, email);

  const html = renderEmailTemplate('reset-password', { email, token, url });
  const subject = EMAIL_SUBJECTS.RESET_PASSWORD;

  await sendEmail(email, subject, html);
}

/**
 * 通用邮件
 */
export async function sendNotificationEmail(email: string, subject: string, html: string, text?: string) {
  await sendEmail(email, subject, html, text);
}