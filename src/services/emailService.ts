import { sendEmail } from '../config';
import { EMAIL_SUBJECTS } from '../constants';
import { renderEmailTemplate, buildVerificationUrl, buildResetPasswordUrl } from '../utils';
import { generateEmailVerificationToken, generatePasswordResetToken } from '../config';

/**
 * 发送邮箱验证邮件
 */
export async function sendVerificationEmail(email: string, tenantId: string) {
  // 1. 生成token和url
  const token = generateEmailVerificationToken(email, tenantId);
  const url = buildVerificationUrl(token, email);

  // 2. 渲染模板
  const html = renderEmailTemplate('verify-email', { email, token, url });
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