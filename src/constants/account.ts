/**
 * 账号服务常量定义
 * 所有账号相关的常量统一在此文件中定义
 */

// ================================
// Token 相关常量
// ================================

/**
 * Token 有效期配置（单位：分钟）
 */
export const TOKEN_EXPIRY = {
  EMAIL_VERIFICATION: 30,   // 邮箱验证 token 30分钟有效
  PASSWORD_RESET: 15,       // 密码重置 token 15分钟有效
} as const;

/**
 * Token 类型常量
 */
export const TOKEN_TYPE = {
  EMAIL_VERIFICATION: 'email_verification',
  PASSWORD_RESET: 'password_reset',
} as const;

// ================================
// 账号配置常量
// ================================

/**
 * 账号配置常量
 */
export const ACCOUNT_CONFIG = {
  MIN_PASSWORD_LENGTH: 8,                  // 最小密码长度
} as const;

// ================================
// 消息常量
// ================================



/**
 * 错误消息
 */
export const ERROR_MESSAGES = {
  EMAIL_ALREADY_REGISTERED: '该邮箱已被注册。',
  SUBDOMAIN_ALREADY_EXISTS: '该子域名已被使用。',
  INVALID_EMAIL_FORMAT: '邮箱格式不正确。',
  INVALID_SUBDOMAIN_FORMAT: '子域名格式不正确。',
  PASSWORD_TOO_SHORT: `密码长度不能少于 ${ACCOUNT_CONFIG.MIN_PASSWORD_LENGTH} 位。`,
  INVALID_TOKEN: '验证链接无效或已过期。',
  TENANT_NOT_FOUND: '账号不存在。',
  ACCOUNT_NOT_FOUND: '账号不存在。',
} as const;

// ================================
// 业务规则常量
// ================================

/**
 * 子域名验证规则
 */
export const SUBDOMAIN_RULES = {
  MIN_LENGTH: 3,
  MAX_LENGTH: 63,
  PATTERN: /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,  // 字母数字开头结尾，中间可有连字符
  RESERVED_NAMES: [
    'www', 'api', 'admin', 'app', 'mail', 'ftp', 'blog', 'forum',
    'shop', 'store', 'help', 'support', 'docs', 'dev', 'test',
    'staging', 'demo', 'beta', 'alpha', 'cdn', 'static', 'assets'
  ],
} as const;

// ================================
// 日志相关常量
// ================================

/**
 * 日志事件类型
 */
export const LOG_EVENTS = {
  ACCOUNT_REGISTRATION: 'account.registration',
  EMAIL_VERIFICATION: 'account.email_verification',
  PASSWORD_RESET_INITIATED: 'account.password_reset_initiated',
  PASSWORD_RESET_COMPLETED: 'account.password_reset_completed',
} as const; 