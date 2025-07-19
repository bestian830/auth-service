/**
 * 安全策略相关常量配置
 */

/**
 * 安全策略配置常量
 */
export const SECURITY_CONFIG = {
  // Token 黑名单配置
  TOKEN_BLACKLIST_TTL: 24 * 60 * 60 * 1000, // 24小时 (毫秒)
  
  // 登录尝试限制
  MAX_LOGIN_ATTEMPTS_PER_USER: 5, // 每个用户最大登录尝试次数
  MAX_LOGIN_ATTEMPTS_PER_IP: 10, // 每个IP最大登录尝试次数
  LOGIN_LOCKOUT_DURATION: 30 * 60 * 1000, // 登录锁定时长：30分钟 (毫秒)
  
  // 密码策略
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_REQUIRE_NUMBERS: true,
  PASSWORD_REQUIRE_UPPERCASE: true,
  PASSWORD_REQUIRE_LOWERCASE: true,
  PASSWORD_REQUIRE_SPECIAL_CHARS: true,
  
  // 会话管理
  SESSION_IDLE_TIMEOUT: 60 * 60 * 1000, // 会话空闲超时：1小时 (毫秒)
  SESSION_ABSOLUTE_TIMEOUT: 8 * 60 * 60 * 1000, // 会话绝对超时：8小时 (毫秒)
  REVOKE_OLD_SESSION_ON_NEW_LOGIN: true, // 新登录时撤销旧会话
  
  // 邮箱验证和密码重置
  EMAIL_VERIFICATION_EXPIRY: 24 * 60 * 60 * 1000, // 邮箱验证过期时间：24小时 (毫秒)
  PASSWORD_RESET_TOKEN_EXPIRY: 1 * 60 * 60 * 1000, // 密码重置令牌过期时间：1小时 (毫秒)
  
  // Rate Limiting 配置
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 速率限制窗口：15分钟 (毫秒)
  RATE_LIMIT_MAX_REQUESTS: 100, // 窗口内最大请求数
  LOGIN_RATE_LIMIT_MAX: 5, // 登录接口速率限制
  REGISTER_RATE_LIMIT_MAX: 3, // 注册接口速率限制
  
  // 安全头部配置
  SECURITY_HEADERS: {
    HSTS_MAX_AGE: 31536000, // HSTS 最大年龄：1年 (秒)
    CONTENT_SECURITY_POLICY: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
    X_FRAME_OPTIONS: 'DENY',
    X_CONTENT_TYPE_OPTIONS: 'nosniff',
    REFERRER_POLICY: 'strict-origin-when-cross-origin'
  },
  
  // IP 白名单和黑名单
  TRUSTED_IP_RANGES: [
    '127.0.0.1/32', // 本地回环
    '10.0.0.0/8',   // 私有网络
    '172.16.0.0/12', // 私有网络
    '192.168.0.0/16' // 私有网络
  ],
  
  // 安全事件配置
  FAILED_LOGIN_ALERT_THRESHOLD: 3, // 连续失败登录告警阈值
  SUSPICIOUS_ACTIVITY_ALERT_THRESHOLD: 5, // 可疑活动告警阈值
  
  // 数据保护
  DATA_ENCRYPTION_KEY_ROTATION_DAYS: 90, // 加密密钥轮转天数
  AUDIT_LOG_RETENTION_DAYS: 365, // 审计日志保留天数
  
  // API 安全
  API_REQUEST_SIZE_LIMIT: 1024 * 1024, // API 请求大小限制：1MB (字节)
  API_TIMEOUT_MS: 30 * 1000, // API 超时：30秒 (毫秒)
  
  // 跨域配置安全
  CORS_MAX_AGE: 86400, // CORS 预检请求缓存时间：24小时 (秒)
  
  // 二次验证配置
  TWO_FACTOR_CODE_LENGTH: 6, // 两步验证码长度
  TWO_FACTOR_CODE_EXPIRY: 5 * 60 * 1000, // 两步验证码过期时间：5分钟 (毫秒)
  TWO_FACTOR_BACKUP_CODES_COUNT: 10 // 备用验证码数量
} as const;

/**
 * 安全等级枚举
 */
export const SECURITY_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
} as const;

/**
 * 安全事件类型
 */
export const SECURITY_EVENT_TYPES = {
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  LOGIN_LOCKED: 'login_locked',
  PASSWORD_CHANGED: 'password_changed',
  PASSWORD_RESET_REQUESTED: 'password_reset_requested',
  PASSWORD_RESET_COMPLETED: 'password_reset_completed',
  EMAIL_VERIFIED: 'email_verified',
  SESSION_CREATED: 'session_created',
  SESSION_EXPIRED: 'session_expired',
  SESSION_REVOKED: 'session_revoked',
  TOKEN_BLACKLISTED: 'token_blacklisted',
  SUSPICIOUS_ACTIVITY: 'suspicious_activity',
  SECURITY_POLICY_VIOLATION: 'security_policy_violation',
  TWO_FACTOR_ENABLED: 'two_factor_enabled',
  TWO_FACTOR_DISABLED: 'two_factor_disabled',
  API_RATE_LIMIT_EXCEEDED: 'api_rate_limit_exceeded'
} as const;

/**
 * 安全策略违规类型
 */
export const SECURITY_VIOLATION_TYPES = {
  WEAK_PASSWORD: 'weak_password',
  BRUTE_FORCE_ATTACK: 'brute_force_attack',
  SESSION_HIJACKING: 'session_hijacking',
  TOKEN_ABUSE: 'token_abuse',
  UNAUTHORIZED_ACCESS: 'unauthorized_access',
  SUSPICIOUS_IP: 'suspicious_ip',
  MALFORMED_REQUEST: 'malformed_request',
  RATE_LIMIT_EXCEEDED: 'rate_limit_exceeded'
} as const; 