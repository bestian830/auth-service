// auth-service/src/config/env.ts
import dotenv from 'dotenv';
import { AppConfig } from '../types';

// 加载环境变量
dotenv.config();

/**
 * 创建并验证 Auth Service 环境配置
 */
export const createConfig = (): AppConfig => {
  // 必需的环境变量
  const requiredEnvVars = [
    'DATABASE_URL',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET'
  ];

  // 验证必需的环境变量
  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => {
      console.error(`  - ${varName}`);
    });
    process.exit(1);
  }

  // 解析数据库URL
  const parseDatabaseUrl = (url: string) => {
    try {
      const dbUrl = new URL(url);
      return {
        host: dbUrl.hostname,
        port: parseInt(dbUrl.port) || 5432,
        name: dbUrl.pathname.slice(1), // 移除开头的 '/'
        user: dbUrl.username,
        password: dbUrl.password
      };
    } catch (error) {
      console.error('❌ DATABASE_URL format error:', error);
      process.exit(1);
    }
  };

  const dbConfig = parseDatabaseUrl(process.env.DATABASE_URL!);

  console.log('✅ All required environment variables are set');

  // 返回完整的配置对象
  return {
    // 应用配置
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInt(process.env.PORT || '3002'), // Auth Service 专用端口

    // 数据库连接信息 (Auth Service 独立数据库)
    database: {
      url: process.env.DATABASE_URL!,
      // 从 DATABASE_URL 解析出的配置
      ...dbConfig,
      // 允许单独的环境变量覆盖
      host: process.env.DB_HOST || dbConfig.host,
      port: parseInt(process.env.DB_PORT || String(dbConfig.port)),
      name: process.env.DB_NAME || dbConfig.name,
      user: process.env.DB_USER || dbConfig.user,
      password: process.env.DB_PASSWORD || dbConfig.password
    },

    // JWT配置 (Auth Service 生成和验证 tokens)
    jwt: {
      secret: process.env.JWT_SECRET!,           // Access Token 密钥
      refreshSecret: process.env.JWT_REFRESH_SECRET!, // Refresh Token 密钥
      accessTokenExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
      refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRY || '7d'
    },

    // 邮件配置 (用于邮箱验证、密码重置等)
    email: {
      smtp: {
        host: process.env.SMTP_HOST || 'mail.tymoe.com', // 🔧 请联系IT部门确认SMTP服务器地址
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'false', // true for 465, false for 587
        user: process.env.SMTP_USER || 'noreply@tymoe.com', // 🔧 请填写发送邮箱地址
        password: process.env.SMTP_PASSWORD || 'your_email_password' // 🔧 请填写邮箱密码
      },
      from: {
        name: process.env.EMAIL_FROM_NAME || 'Tymoe', // 🔧 公司名称
        address: process.env.EMAIL_FROM_ADDRESS || 'noreply@tymoe.com' // 🔧 发送邮箱地址
      },
      // 邮件模板配置 - 用于生成邮件中的链接
      templates: {
        baseUrl: process.env.FRONTEND_URL || 'https://app.tymoe.com', // 🔧 前端应用域名
        verificationPath: process.env.EMAIL_VERIFICATION_PATH || '/verify-email',
        resetPasswordPath: process.env.EMAIL_RESET_PASSWORD_PATH || '/reset-password',
        // 令牌过期时间
        verificationTokenExpiry: process.env.EMAIL_VERIFICATION_TOKEN_EXPIRY || '24h', // 邮箱验证令牌24小时过期
        resetTokenExpiry: process.env.EMAIL_RESET_TOKEN_EXPIRY || '1h' // 密码重置令牌1小时过期
      }
    },

    // 密码配置
    password: {
      bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12'),
      minLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8'),
      requireUppercase: process.env.PASSWORD_REQUIRE_UPPERCASE !== 'false',
      requireLowercase: process.env.PASSWORD_REQUIRE_LOWERCASE !== 'false',
      requireNumbers: process.env.PASSWORD_REQUIRE_NUMBERS !== 'false',
      requireSpecialChars: process.env.PASSWORD_REQUIRE_SPECIAL_CHARS !== 'false'
    },

    // 速率限制配置
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15分钟
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX || '50'), // 认证服务更严格
      loginAttempts: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '5'), // 登录尝试限制
      registrationAttempts: parseInt(process.env.REGISTER_RATE_LIMIT_MAX || '3') // 注册尝试限制
    },

    // 日志配置
    log: {
      level: process.env.LOG_LEVEL || 'info',
      filePath: process.env.LOG_FILE_PATH || './logs'
    },

    // CORS配置
    cors: {
      origin: process.env.CORS_ORIGIN 
        ? process.env.CORS_ORIGIN.split(',').map(url => url.trim())
        : ['http://localhost:5173', 'http://localhost:3000'] // 包含前端和其他服务
    },

    // 安全配置
    security: {
      sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '3600'), // 1小时
      maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5'),
      lockoutDuration: parseInt(process.env.LOCKOUT_DURATION || '1800'), // 30分钟
      requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION !== 'false'
    }
  };
};

// 导出配置实例
export const config = createConfig();