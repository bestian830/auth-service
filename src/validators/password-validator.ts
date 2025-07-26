/**
 * Password Validator - 密码相关数据校验
 * 职责：校验密码格式、强度、确认等
 */

import { env } from '../config';
import { PasswordValidationResult } from '../types';

/**
 * 检查密码强度，返回所有不满足的规则
 */
export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < env.passwordMinLength) {
    errors.push(`Password must be at least ${env.passwordMinLength} characters`);
  }
  if (env.passwordRequireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain uppercase letters');
  }
  if (env.passwordRequireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain lowercase letters');
  }
  if (env.passwordRequireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain numbers');
  }
  if (env.passwordRequireSpecialChars && !/[!@#$%^&*()_+\-=[\]{};':",.<>/?\\|]/.test(password)) {
    errors.push('Password must contain special characters');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}