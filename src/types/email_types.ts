// types/email.ts
export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export type EmailType = 'verify-email' | 'password-reset-code' | 'custom';

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

export interface EmailVerificationResult {
  success: boolean;
  error?: string;
}

export interface ResendVerificationCodeResult {
  success: boolean;
  error?: string;
  message?: string;
}

export interface VerificationCodeInfo {
  code: string;
  expiresAt: Date;
  isExpired: boolean;
}

export interface RedisKeyPatterns {
  verifyFailCount: (email: string) => string;
  dailyResendCount: (email: string, date: string) => string;
} 