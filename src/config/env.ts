// src/config/env.ts
export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  issuerUrl: process.env.ISSUER_URL ?? 'http://localhost:8080/',
  port: Number(process.env.PORT ?? '8080'),

  // Token TTL（确保为 number）
  accessTtlSec: Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? '1800'),
  refreshTtlSec: Number(process.env.REFRESH_TOKEN_TTL_SECONDS ?? '2592000'), // 30d

  // 多租户 & 受众
  defaultAudPrefix: process.env.DEFAULT_AUD_PREFIX ?? 'tymoe-service', // 兜底前缀
  tenantEnforceAud: process.env.TENANT_ENFORCE_AUD !== 'false',        // 默认启用

  // Rate Limit（保留你现有的值；没有就给默认）
  rateLoginPerMin: Number(process.env.RATE_LOGIN_PER_MIN ?? '5'),
  rateTokenPerMin: Number(process.env.RATE_TOKEN_PER_MIN ?? '25'),

  // Introspection 机密客户端（可放 env 或 DB；这里先放 env 以简化）
  introspectClientId: process.env.INTROSPECT_CLIENT_ID ?? 'gateway',
  introspectClientSecret: process.env.INTROSPECT_CLIENT_SECRET ?? 'gateway-secret',

  // 审计落地（文件或DB，这里两者都开，至少保证有一条线）
  auditToFile: process.env.AUDIT_TO_FILE !== 'false',
  auditFilePath: process.env.AUDIT_FILE_PATH ?? './audit.log',

  // JWKS ETag 缓存
  jwksMaxAgeSec: Number(process.env.JWKS_MAX_AGE_SEC ?? '3600'),

  // Session secret
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-session-secret-key',

  // Legacy JWT key for backwards compatibility
  jwtPrivateKey: process.env.JWT_PRIVATE_KEY ?? '',
  
  // Identity Management
  defaultTenantId: process.env.DEFAULT_TENANT_ID ?? 'tenant-dev',
  passwordHashRounds: parseInt(process.env.PASSWORD_HASH_ROUNDS ?? '10', 10),

  // Email configuration
  mailTransport: process.env.MAIL_TRANSPORT ?? 'CONSOLE',
  smtpHost: process.env.SMTP_HOST ?? 'smtp.example.com',
  smtpPort: Number(process.env.SMTP_PORT ?? '587'),
  smtpSecure: process.env.SMTP_SECURE === 'true',
  smtpUser: process.env.SMTP_USER ?? '',
  smtpPass: process.env.SMTP_PASS ?? '',
  mailFrom: process.env.MAIL_FROM ?? 'Tymoe Auth <no-reply@tymoe.com>',

  // Verification and reset tokens
  signupCodeTtlSec: Number(process.env.SIGNUP_CODE_TTL_SEC ?? '900'),
  resetCodeTtlSec: Number(process.env.RESET_CODE_TTL_SEC ?? '900'),
  codeAttemptMax: Number(process.env.CODE_ATTEMPT_MAX ?? '5'),

  // Rate limiting for identity endpoints
  rateWindowSec: Number(process.env.RATE_WINDOW_SEC ?? '60'),
  rateMaxLogin: Number(process.env.RATE_MAX_LOGIN ?? '5'),
  rateMaxRegister: Number(process.env.RATE_MAX_REGISTER ?? '5'),
  rateMaxReset: Number(process.env.RATE_MAX_RESET ?? '5'),

  // Audience validation
  allowedAudiences: process.env.ALLOWED_AUDIENCES ?? 'tymoe-service',

  // v0.2.6 Redis Configuration
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  redisPassword: process.env.REDIS_PASSWORD ?? '',
  redisDb: Number(process.env.REDIS_DB ?? '0'),
  redisNamespace: process.env.REDIS_NAMESPACE ?? 'authsvc',
  redisConnectTimeout: Number(process.env.REDIS_CONNECT_TIMEOUT ?? '5000'),
  redisCommandTimeout: Number(process.env.REDIS_COMMAND_TIMEOUT ?? '3000'),
  redisMaxRetries: Number(process.env.REDIS_MAX_RETRIES ?? '3'),

  // v0.2.6 Enhanced SMTP
  smtpAuthUser: process.env.SMTP_AUTH_USER ?? process.env.SMTP_USER ?? '',
  smtpAuthPass: process.env.SMTP_AUTH_PASS ?? process.env.SMTP_PASS ?? '',
  mailReplyTo: process.env.MAIL_REPLY_TO ?? '',

  // v0.2.6 新的验证码配置（分钟单位）
  verifyCodeTtlMin: Number(process.env.VERIFY_CODE_TTL_MIN ?? '10'),
  verifyReuseWindowMin: Number(process.env.VERIFY_REUSE_WINDOW_MIN ?? '10'),
  resetCodeTtlMin: Number(process.env.RESET_CODE_TTL_MIN ?? '10'),
  resetReuseWindowMin: Number(process.env.RESET_REUSE_WINDOW_MIN ?? '10'),

  // v0.2.6 新的限流配置（每小时）
  rateMaxRegisterPerHr: Number(process.env.RATE_MAX_REGISTER_PER_HR ?? '10'),
  rateMaxVerifyPerHr: Number(process.env.RATE_MAX_VERIFY_PER_HR ?? '10'),
  rateMaxResetPerHr: Number(process.env.RATE_MAX_RESET_PER_HR ?? '10'),
  rateMaxLoginPerHr: Number(process.env.RATE_MAX_LOGIN_PER_HR ?? '10'),

  // v0.2.6 登录失败阈值（新配置）
  loginCaptchaThreshold: Number(process.env.LOGIN_CAPTCHA_THRESHOLD ?? '3'),
  loginLockThreshold: Number(process.env.LOGIN_LOCK_THRESHOLD ?? '10'),
  loginLockMinutes: Number(process.env.LOGIN_LOCK_MINUTES ?? '30'),

  // 向后兼容的旧配置
  verificationCodeReuseWindowSec: Number(process.env.VERIFICATION_CODE_REUSE_WINDOW_SEC ?? (Number(process.env.VERIFY_REUSE_WINDOW_MIN ?? '10') * 60)),
  rateLoginEmailMax: Number(process.env.RATE_LOGIN_EMAIL_MAX ?? '10'),
  rateLoginEmailWindowSec: Number(process.env.RATE_LOGIN_EMAIL_WINDOW_SEC ?? '3600'),
  rateLoginIpMax: Number(process.env.RATE_LOGIN_IP_MAX ?? '50'),
  rateLoginIpWindowSec: Number(process.env.RATE_LOGIN_IP_WINDOW_SEC ?? '3600'),
  loginMaxFailures: Number(process.env.LOGIN_MAX_FAILURES ?? (process.env.LOGIN_LOCK_THRESHOLD ?? '10')),
  loginLockoutDurationSec: Number(process.env.LOGIN_LOCKOUT_DURATION_SEC ?? (Number(process.env.LOGIN_LOCK_MINUTES ?? '30') * 60)),
  captchaEnabled: process.env.CAPTCHA_ENABLED === 'true',

  // v0.2.6 CAPTCHA Configuration
  captchaSiteKey: process.env.CAPTCHA_SITE_KEY ?? '',
  captchaSecretKey: process.env.CAPTCHA_SECRET_KEY ?? '',
  captchaVerifyUrl: process.env.CAPTCHA_VERIFY_URL ?? 'https://www.google.com/recaptcha/api/siteverify',

  // v0.2.6 Enhanced audit logging
  enhancedAuditLogging: process.env.ENHANCED_AUDIT_LOGGING === 'true',
} as const;