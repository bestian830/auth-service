import crypto from 'crypto';

/**
 * 生成6位随机数字验证码
 */
export function generateVerificationCode(): string {
  return crypto.randomInt(100000, 999999).toString();
} 