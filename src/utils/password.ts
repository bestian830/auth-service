import bcrypt from 'bcrypt';
import { config } from '../config/env';

/**
 * 对明文密码进行加密哈希（注册/重置密码时用）
 * @param password 明文密码
 * @param rounds 加密轮数（默认用配置，也可手动传）
 */
export async function hashPassword(password: string, rounds?: number): Promise<string> {
  const saltRounds = rounds ?? config.password.bcryptRounds ?? 12;
  return bcrypt.hash(password, saltRounds);
}

/**
 * 验证明文密码和 hash 是否一致（登录时用）
 * @param password 明文密码
 * @param hash 数据库存的加密 hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * 判断 hash 是否需要升级（比如你加大了加密轮数时）
 * 可选，后续你想升级 hash 时可以用
 * @param hash 已有密码 hash
 * @param currentRounds 当前配置轮数
 */
export function needsRehash(hash: string, currentRounds: number): boolean {
  // bcrypt hash格式: $2b$12$......
  const rounds = parseInt(hash.split('$')[2], 10);
  return rounds !== currentRounds;
}
