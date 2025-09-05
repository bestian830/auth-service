// src/config/env.validate.ts
import { z } from 'zod';

const envSchema = z.object({
  // 基础配置
  NODE_ENV: z.enum(['development', 'production', 'test']).optional(),
  PORT: z.string().regex(/^\d+$/).optional(),
  
  // OAuth2/OIDC 配置
  ISSUER_URL: z.string().url(),
  
  // Token 配置
  ACCESS_TOKEN_TTL_SECONDS: z.string().regex(/^\d+$/).optional(),
  REFRESH_TOKEN_TTL_SECONDS: z.string().regex(/^\d+$/).optional(),
  
  // 受众配置
  DEFAULT_AUD_PREFIX: z.string().optional(),
  
  // 安全配置
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  KEYSTORE_ENC_KEY: z.string().min(44, 'KEYSTORE_ENC_KEY must be base64 encoded 32-byte key'),
  
  // CORS 配置
  ALLOWED_ORIGINS: z.string(),
  COOKIE_SAMESITE: z.enum(['lax', 'none', 'strict']).optional(),
  
  // 速率限制
  RATE_LOGIN_PER_MIN: z.string().regex(/^\d+$/).optional(),
  RATE_TOKEN_PER_MIN: z.string().regex(/^\d+$/).optional(),
  
  // 监控配置
  METRICS_TOKEN: z.string().min(16, 'METRICS_TOKEN must be at least 16 characters'),
  
  // 审计配置
  AUDIT_TO_FILE: z.enum(['true', 'false']).optional(),
  AUDIT_FILE_PATH: z.string().optional(),
  
  // JWKS 缓存配置
  JWKS_MAX_AGE_SEC: z.string().regex(/^\d+$/).optional(),
  
  // 身份验证配置
  PASSWORD_HASH_ROUNDS: z.string().regex(/^\d+$/).optional(),
  
  // 邮件配置
  MAIL_TRANSPORT: z.enum(['CONSOLE', 'SMTP']).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().regex(/^\d+$/).optional(),
  SMTP_SECURE: z.enum(['true', 'false']).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().email().optional(),
  
  // 验证码配置
  SIGNUP_CODE_TTL_SEC: z.string().regex(/^\d+$/).optional(),
  RESET_CODE_TTL_SEC: z.string().regex(/^\d+$/).optional(),
  CODE_ATTEMPT_MAX: z.string().regex(/^\d+$/).optional(),
  
  // 登录安全配置
  LOGIN_CAPTCHA_THRESHOLD: z.string().regex(/^\d+$/).optional(),
  LOGIN_LOCK_THRESHOLD: z.string().regex(/^\d+$/).optional(),
  LOGIN_LOCK_MINUTES: z.string().regex(/^\d+$/).optional(),
  
  // Redis 配置
  REDIS_URL: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().regex(/^\d+$/).optional(),
  REDIS_NAMESPACE: z.string().optional(),
  REDIS_CONNECT_TIMEOUT: z.string().regex(/^\d+$/).optional(),
  REDIS_COMMAND_TIMEOUT: z.string().regex(/^\d+$/).optional(),
  REDIS_MAX_RETRIES: z.string().regex(/^\d+$/).optional(),
  
  // 设备认证配置
  DEVICE_SECRET_LENGTH: z.string().regex(/^\d+$/).optional(),
  
  // CAPTCHA 配置
  CAPTCHA_ENABLED: z.enum(['true', 'false']).optional(),
  CAPTCHA_SITE_KEY: z.string().optional(),
  CAPTCHA_SECRET_KEY: z.string().optional(),
  CAPTCHA_VERIFY_URL: z.string().url().optional(),
  
  // Client 认证配置
  INTROSPECT_CLIENT_ID: z.string().optional(),
  INTROSPECT_CLIENT_SECRET: z.string().optional(),
  
  // 数据库配置
  DATABASE_URL: z.string().url(),
});

// 验证环境变量
const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('❌ Invalid environment variables:');
  result.error.issues.forEach((issue) => {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

console.log('✅ Environment variables validated successfully');