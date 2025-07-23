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