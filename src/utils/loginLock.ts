// utils/loginLock.ts

import { getRedisClient } from '../config';
import { LOGIN_LIMIT } from '../constants';

// 登录失败计数Key
function emailFailKey(email: string) { return `login:fail:email:${email}`; }
function emailLockKey(email: string) { return `login:lock:email:${email}`; }
function ipFailKey(ip: string) { return `login:fail:ip:${ip}`; }
function ipLockKey(ip: string) { return `login:lock:ip:${ip}`; }

// 检查是否锁定
export async function checkLoginLock(email: string, ip: string) {
  const redis = getRedisClient();
  // 优先检查IP锁
  const ipLock = await redis.ttl(ipLockKey(ip));
  if (ipLock > 0) {
    return { isLocked: true, reason: 'IP', ttl: ipLock * 1 };
  }
  // 再检查邮箱锁
  const emailLock = await redis.ttl(emailLockKey(email));
  if (emailLock > 0) {
    return { isLocked: true, reason: 'EMAIL', ttl: emailLock * 1 };
  }
  return { isLocked: false };
}

// 记录登录失败
export async function recordLoginFail(email: string, ip: string) {
  const redis = getRedisClient();

  // 邮箱失败计数
  const emailFails = await redis.incr(emailFailKey(email));
  if (emailFails === 1) await redis.expire(emailFailKey(email), LOGIN_LIMIT.EMAIL_COUNT_EXPIRE);
  if (emailFails % LOGIN_LIMIT.EMAIL_FAIL_MAX === 0) {
    await redis.set(emailLockKey(email), '1', { EX: LOGIN_LIMIT.EMAIL_LOCK_MINUTES * 60 });
  }

  // IP失败计数
  const ipFails = await redis.incr(ipFailKey(ip));
  if (ipFails === 1) await redis.expire(ipFailKey(ip), LOGIN_LIMIT.IP_COUNT_EXPIRE);
  if (ipFails % LOGIN_LIMIT.IP_FAIL_MAX === 0) {
    await redis.set(ipLockKey(ip), '1', { EX: LOGIN_LIMIT.IP_LOCK_MINUTES * 60 });
  }
}

// 清除登录失败计数
export async function clearLoginFail(email: string, ip: string) {
  const redis = getRedisClient();
  await Promise.all([
    redis.del(emailFailKey(email)),
    redis.del(emailLockKey(email)),
    redis.del(ipFailKey(ip)),
    redis.del(ipLockKey(ip))
  ]);
}

// 管理后台强制解锁
export async function unlockUserOrIp(email?: string, ip?: string) {
  const redis = getRedisClient();
  if (email) await Promise.all([
    redis.del(emailFailKey(email)),
    redis.del(emailLockKey(email))
  ]);
  if (ip) await Promise.all([
    redis.del(ipFailKey(ip)),
    redis.del(ipLockKey(ip))
  ]);
}