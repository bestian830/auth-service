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
  token?: string;
  url?: string;
  code?: string;
  [key: string]: any; // 可扩展
}

export interface VerifyEmailCodeInput {
  email: string;
  code: string;
}

export interface VerifyEmailCodeResult {
  success: boolean;
  error?: string;
}