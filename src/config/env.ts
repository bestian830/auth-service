import dotenv from 'dotenv';
import { EnvConfig } from '../types';

// 加载环境变量
dotenv.config();

/**
 * 获取必需的环境变量，如果缺失则抛出错误
 */
const required = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

/**
 * 获取布尔值环境变量
 */
const getBoolean = (key: string, defaultValue: boolean = false): boolean => {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
};

/**
 * 获取数字环境变量
 */
const getNumber = (key: string, defaultValue: number): number => {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a valid number`);
  }
  return parsed;
};

/**
 * 获取数组环境变量（逗号分隔）
 */
const getArray = (key: string, defaultValue: string[] = []): string[] => {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.split(',').map(item => item.trim());
};

/**
 * 环境变量配置对象
 */
export const env: EnvConfig = {
  // 基础配置
  nodeEnv: process.env.NODE_ENV || 'development',
  port: getNumber('PORT', 3002),

  // 数据库配置
  databaseUrl: required('DATABASE_URL'),

  // Redis 配置
  redisUrl: required('REDIS_URL'),

  // JWT 配置
  jwtSecret: required('JWT_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // SMTP 邮件配置
  smtpHost: required('SMTP_HOST'),
  smtpPort: getNumber('SMTP_PORT', 587),
  smtpSecure: getBoolean('SMTP_SECURE', false),
  smtpUser: required('SMTP_USER'),
  smtpPass: required('SMTP_PASS'),

  // 邮件模板配置
  email: {
    fromName: process.env.EMAIL_FROM_NAME || 'Tymoe',
    baseUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
    verificationPath: process.env.EMAIL_VERIFICATION_PATH || '/verify-email',
    resetPasswordPath: process.env.EMAIL_RESET_PASSWORD_PATH || '/reset-password',
    verificationTokenExpiry: process.env.EMAIL_VERIFICATION_TOKEN_EXPIRY || '24h',
    resetTokenExpiry: process.env.EMAIL_RESET_TOKEN_EXPIRY || '1h',
  },

  // 密码配置
  bcryptRounds: getNumber('BCRYPT_ROUNDS', 12),
  passwordMinLength: getNumber('PASSWORD_MIN_LENGTH', 8),
  passwordRequireUppercase: getBoolean('PASSWORD_REQUIRE_UPPERCASE', true),
  passwordRequireLowercase: getBoolean('PASSWORD_REQUIRE_LOWERCASE', true),
  passwordRequireNumbers: getBoolean('PASSWORD_REQUIRE_NUMBERS', true),
  passwordRequireSpecialChars: getBoolean('PASSWORD_REQUIRE_SPECIAL_CHARS', true),

  // 速率限制配置
  rateLimitWindowMs: getNumber('RATE_LIMIT_WINDOW_MS', 900000), // 15分钟
  rateLimitMax: getNumber('RATE_LIMIT_MAX', 100),
  rateLimitSkipSuccessfulRequests: getBoolean('RATE_LIMIT_SKIP_SUCCESSFUL_REQUESTS', false),
  loginAttempts: getNumber('LOGIN_RATE_LIMIT_MAX', 5),
  registrationAttempts: getNumber('REGISTER_RATE_LIMIT_MAX', 3),

  // 日志配置
  logLevel: process.env.LOG_LEVEL || 'info',
  logFilePath: process.env.LOG_FILE_PATH || './logs',

  // CORS 配置
  corsOrigin: getArray('CORS_ORIGIN', ['http://localhost:3000', 'http://localhost:5173']),

  // 安全配置
  sessionTimeout: getNumber('SESSION_TIMEOUT', 360000), // 1小时
  maxLoginAttempts: getNumber('MAX_LOGIN_ATTEMPTS', 5),
  lockoutDuration: getNumber('LOCKOUT_DURATION', 180000), // 30分钟
  requireEmailVerification: getBoolean('REQUIRE_EMAIL_VERIFICATION', true),

  // 订阅服务配置
  subscriptionServiceBaseUrl: required('SUBSCRIPTION_SERVICE_BASE_URL'),

  corsMethods: getArray('CORS_METHODS', ['GET','POST','PUT','DELETE','OPTIONS']),
  corsAllowedHeaders: getArray('CORS_ALLOWED_HEADERS', ['Content-Type','Authorization']),
};