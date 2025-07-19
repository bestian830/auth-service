/**
 * 安全策略配置模块
 * 职责：统一管理与应用安全相关的策略和默认值，用于防御会话劫持、令牌滥用、暴力破解等行为。
 * 
 * 输入：无主动输入，供系统中各模块调用配置。
 * 输出：提供默认安全参数（如 session 有效期、密码策略、登录重试限制、黑名单缓存时间等）。
 * 
 * 执行逻辑：
 * 1. 所有安全相关的配置项集中维护，便于运营团队或安全团队快速审查；
 * 2. 所有字段均来自 constants/security.ts；
 * 3. 类型结构声明放入 types/security.ts，避免 config 文件直接定义类型；
 * 4. 支持以下安全策略场景：
 *    - Token黑名单有效期（用于 jti 驱动的 token 撤销）；
 *    - 租户会话撤销策略（例如登录后撤销旧会话）；
 *    - 密码策略（最小长度、是否必须包含数字/大写字母）；
 *    - 登录尝试限制策略（同IP或同用户连续登录失败限制）；
 *    - 认证失败惩罚冷却机制（如30分钟内失败5次则锁定）；
 *    - 邮箱验证码或短链验证的默认有效期；
 * 
 * 设计要求：
 * 所有策略常量定义于 constants/security.ts；
 * 所有策略类型定义于 types/security.ts；
 * 所有策略在 config/security.ts 暴露为 config.security.xxx 统一导出；
 */

import { SECURITY_CONFIG } from '../constants/security';
import type { SecurityStrategyConfig } from '../types/security';

export const security: SecurityStrategyConfig = {
  tokenBlacklistTTL: SECURITY_CONFIG.TOKEN_BLACKLIST_TTL,
  maxLoginAttemptsPerUser: SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS_PER_USER,
  maxLoginAttemptsPerIP: SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS_PER_IP,
  loginLockoutDuration: SECURITY_CONFIG.LOGIN_LOCKOUT_DURATION,
  passwordPolicy: {
    minLength: SECURITY_CONFIG.PASSWORD_MIN_LENGTH,
    requireNumbers: SECURITY_CONFIG.PASSWORD_REQUIRE_NUMBERS,
    requireUppercase: SECURITY_CONFIG.PASSWORD_REQUIRE_UPPERCASE
  },
  session: {
    idleTimeout: SECURITY_CONFIG.SESSION_IDLE_TIMEOUT,
    absoluteTimeout: SECURITY_CONFIG.SESSION_ABSOLUTE_TIMEOUT,
    revokeOnNewLogin: SECURITY_CONFIG.REVOKE_OLD_SESSION_ON_NEW_LOGIN
  },
  emailVerificationExpiry: SECURITY_CONFIG.EMAIL_VERIFICATION_EXPIRY,
  passwordResetTokenExpiry: SECURITY_CONFIG.PASSWORD_RESET_TOKEN_EXPIRY
};
