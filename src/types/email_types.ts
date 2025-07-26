// types/email.ts
export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export type EmailType = 'verify-email' | 'reset-password' | 'notification' | 'custom';

export interface EmailTemplateParams {
  email: string;
  token: string;
  url: string;
  [key: string]: any; // 可扩展
}
