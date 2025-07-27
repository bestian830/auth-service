import { env } from '../config';
import type { EmailTemplateParams, EmailType } from '../types';
import pug from 'pug';
import path from 'path';

export function buildVerificationUrl(token: string, email: string): string {
  return `${env.email.baseUrl}${env.email.verificationPath}?token=${token}&email=${encodeURIComponent(email)}`;
}
export function buildResetPasswordUrl(token: string, email: string): string {
  return `${env.email.baseUrl}${env.email.resetPasswordPath}?token=${token}&email=${encodeURIComponent(email)}`;
}

export function renderEmailTemplate(type: EmailType, params: EmailTemplateParams): string {
  if (type === 'verify-email') {
    // 渲染 verification.pug 模板
    const templatePath = path.join(__dirname, 'verification.pug');
    return pug.renderFile(templatePath, params);
  } else if (type === 'reset-password') {
    // 渲染 reset-password.pug 模板
    const templatePath = path.join(__dirname, 'reset-password.pug');
    return pug.renderFile(templatePath, params);
  } else if (type === 'notification') {
    // 渲染 subscription.pug 模板（notification 类型邮件）
    const templatePath = path.join(__dirname, 'subscription.pug');
    return pug.renderFile(templatePath, params);
  }
  // 其他类型（如 'custom'）直接返回传入的 HTML 字符串
  return params.html || '';
}