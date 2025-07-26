import { env } from '../config';
import type { EmailTemplateParams, EmailType } from '../types';

export function buildVerificationUrl(token: string, email: string): string {
  return `${env.email.baseUrl}${env.email.verificationPath}?token=${token}&email=${encodeURIComponent(email)}`;
}
export function buildResetPasswordUrl(token: string, email: string): string {
  return `${env.email.baseUrl}${env.email.resetPasswordPath}?token=${token}&email=${encodeURIComponent(email)}`;
}

export function renderEmailTemplate(type: EmailType, params: EmailTemplateParams): string {
  // 你可以用 pug/ejs/nunjucks，也可以直接内联字符串
  if (type === 'verify-email') {
    return `
      <div>
        <h2>Welcome to Tymoe! Please click the link below to verify your email</h2>
        <a href="${params.url}">${params.url}</a>
      </div>
    `;
  }
  if (type === 'reset-password') {
    return `
      <div>
        <h2>Reset password request</h2>
        <p>Click the link below to reset your password:</p>
        <a href="${params.url}">${params.url}</a>
      </div>
    `;
  }
  return params.html || '';
}
