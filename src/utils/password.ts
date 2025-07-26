import * as bcrypt from 'bcrypt';
import { env } from '../config';

// 加密密码
export async function hashPassword(password: string): Promise<string> {
  const saltRounds = env.bcryptRounds || 12; // 默认 12
  return bcrypt.hash(password, saltRounds);
}

// 校验密码
export async function comparePassword(password: string, hashed: string): Promise<boolean> {
  return bcrypt.compare(password, hashed);
}

export function validatePasswordStrength(password: string): string[] {
  const errors: string[] = [];
  if (password.length < env.passwordMinLength) errors.push(`Password must be at least ${env.passwordMinLength} characters`);
  if (env.passwordRequireUppercase && !/[A-Z]/.test(password)) errors.push('Password must contain at least one uppercase letter');
  if (env.passwordRequireLowercase && !/[a-z]/.test(password)) errors.push('Password must contain at least one lowercase letter');
  if (env.passwordRequireNumbers && !/[0-9]/.test(password)) errors.push('Password must contain at least one number');
  if (env.passwordRequireSpecialChars && !/[!@#$%^&*()_\-+=<>?]/.test(password)) errors.push('Password must contain at least one special character');
  return errors;
}