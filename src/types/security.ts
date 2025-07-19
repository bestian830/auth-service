/**
 * 安全策略相关类型定义
 */

import { 
  SECURITY_LEVELS, 
  SECURITY_EVENT_TYPES, 
  SECURITY_VIOLATION_TYPES 
} from '../constants/security';

/**
 * 安全等级类型
 */
export type SecurityLevel = typeof SECURITY_LEVELS[keyof typeof SECURITY_LEVELS];

/**
 * 安全事件类型
 */
export type SecurityEventType = typeof SECURITY_EVENT_TYPES[keyof typeof SECURITY_EVENT_TYPES];

/**
 * 安全策略违规类型
 */
export type SecurityViolationType = typeof SECURITY_VIOLATION_TYPES[keyof typeof SECURITY_VIOLATION_TYPES];

/**
 * 密码策略配置接口
 */
export interface PasswordPolicyConfig {
  /** 最小长度 */
  minLength: number;
  /** 是否要求数字 */
  requireNumbers: boolean;
  /** 是否要求大写字母 */
  requireUppercase: boolean;
  /** 是否要求小写字母 */
  requireLowercase: boolean;
  /** 是否要求特殊字符 */
  requireSpecialChars: boolean;
}

/**
 * 会话安全配置接口
 */
export interface SessionSecurityConfig {
  /** 空闲超时时间（毫秒） */
  idleTimeout: number;
  /** 绝对超时时间（毫秒） */
  absoluteTimeout: number;
  /** 新登录时是否撤销旧会话 */
  revokeOnNewLogin: boolean;
}

/**
 * 登录安全策略配置接口
 */
export interface LoginSecurityConfig {
  /** 每个用户最大登录尝试次数 */
  maxAttemptsPerUser: number;
  /** 每个IP最大登录尝试次数 */
  maxAttemptsPerIP: number;
  /** 登录锁定时长（毫秒） */
  lockoutDuration: number;
  /** 失败登录告警阈值 */
  failedLoginAlertThreshold: number;
}

/**
 * Rate Limiting 配置接口
 */
export interface RateLimitConfig {
  /** 时间窗口（毫秒） */
  windowMs: number;
  /** 最大请求数 */
  maxRequests: number;
  /** 登录接口限制 */
  loginMax: number;
  /** 注册接口限制 */
  registerMax: number;
}

/**
 * 安全头部配置接口
 */
export interface SecurityHeadersConfig {
  /** HSTS 最大年龄 */
  hstsMaxAge: number;
  /** 内容安全策略 */
  contentSecurityPolicy: string;
  /** X-Frame-Options */
  xFrameOptions: string;
  /** X-Content-Type-Options */
  xContentTypeOptions: string;
  /** Referrer-Policy */
  referrerPolicy: string;
}

/**
 * 两步验证配置接口
 */
export interface TwoFactorConfig {
  /** 验证码长度 */
  codeLength: number;
  /** 验证码过期时间（毫秒） */
  codeExpiry: number;
  /** 备用验证码数量 */
  backupCodesCount: number;
}

/**
 * 数据保护配置接口
 */
export interface DataProtectionConfig {
  /** 加密密钥轮转天数 */
  encryptionKeyRotationDays: number;
  /** 审计日志保留天数 */
  auditLogRetentionDays: number;
}

/**
 * API 安全配置接口
 */
export interface ApiSecurityConfig {
  /** 请求大小限制（字节） */
  requestSizeLimit: number;
  /** API 超时时间（毫秒） */
  timeoutMs: number;
}

/**
 * 安全策略总配置接口
 */
export interface SecurityStrategyConfig {
  /** Token 黑名单 TTL（毫秒） */
  tokenBlacklistTTL: number;
  /** 每个用户最大登录尝试次数 */
  maxLoginAttemptsPerUser: number;
  /** 每个IP最大登录尝试次数 */
  maxLoginAttemptsPerIP: number;
  /** 登录锁定时长（毫秒） */
  loginLockoutDuration: number;
  /** 密码策略 */
  passwordPolicy: PasswordPolicyConfig;
  /** 会话配置 */
  session: SessionSecurityConfig;
  /** 邮箱验证过期时间（毫秒） */
  emailVerificationExpiry: number;
  /** 密码重置令牌过期时间（毫秒） */
  passwordResetTokenExpiry: number;
}

/**
 * 安全事件记录接口
 */
export interface SecurityEvent {
  /** 事件ID */
  id: string;
  /** 事件类型 */
  type: SecurityEventType;
  /** 安全等级 */
  level: SecurityLevel;
  /** 租户ID */
  tenantId?: string;
  /** 用户ID */
  userId?: string;
  /** IP地址 */
  ipAddress?: string;
  /** User Agent */
  userAgent?: string;
  /** 事件描述 */
  description: string;
  /** 事件数据 */
  data?: Record<string, any>;
  /** 事件时间戳 */
  timestamp: Date;
  /** 是否已处理 */
  resolved: boolean;
}

/**
 * 安全策略违规记录接口
 */
export interface SecurityViolation {
  /** 违规ID */
  id: string;
  /** 违规类型 */
  type: SecurityViolationType;
  /** 安全等级 */
  level: SecurityLevel;
  /** 租户ID */
  tenantId?: string;
  /** 用户ID */
  userId?: string;
  /** IP地址 */
  ipAddress: string;
  /** 违规描述 */
  description: string;
  /** 违规数据 */
  data?: Record<string, any>;
  /** 采取的行动 */
  actionTaken?: string;
  /** 违规时间戳 */
  timestamp: Date;
  /** 是否已处理 */
  resolved: boolean;
}

/**
 * 登录尝试记录接口
 */
export interface LoginAttempt {
  /** 尝试ID */
  id: string;
  /** 租户ID或邮箱 */
  identifier: string;
  /** IP地址 */
  ipAddress: string;
  /** User Agent */
  userAgent: string;
  /** 是否成功 */
  success: boolean;
  /** 失败原因 */
  failureReason?: string;
  /** 尝试时间戳 */
  timestamp: Date;
}

/**
 * 会话安全信息接口
 */
export interface SessionSecurity {
  /** 会话ID */
  sessionId: string;
  /** 租户ID */
  tenantId: string;
  /** IP地址 */
  ipAddress: string;
  /** User Agent */
  userAgent: string;
  /** 创建时间 */
  createdAt: Date;
  /** 最后活动时间 */
  lastActivityAt: Date;
  /** 是否被撤销 */
  revoked: boolean;
  /** 撤销原因 */
  revokeReason?: string;
  /** 撤销时间 */
  revokedAt?: Date;
}

/**
 * IP 地址安全信息接口
 */
export interface IpSecurityInfo {
  /** IP地址 */
  ipAddress: string;
  /** 是否受信任 */
  trusted: boolean;
  /** 是否被封禁 */
  blocked: boolean;
  /** 风险等级 */
  riskLevel: SecurityLevel;
  /** 最后活动时间 */
  lastActivityAt: Date;
  /** 登录尝试次数 */
  loginAttempts: number;
  /** 失败登录次数 */
  failedLoginAttempts: number;
  /** 地理位置信息 */
  geoLocation?: {
    country: string;
    region: string;
    city: string;
  };
} 