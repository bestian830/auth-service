// 环境变量类型定义
export interface EnvConfig {
  // 基础配置
  nodeEnv: string;
  port: number;
  
  // 数据库配置
  databaseUrl: string;
  
  // JWT 配置
  jwtSecret: string;
  jwtRefreshSecret: string;
  jwtExpiresIn: string;
  jwtRefreshExpiresIn: string;
  
  // Stripe 支付配置
  stripeSecretKey?: string;
  stripeWebhookSecret?: string;
  
  // 邮件配置
  email: {
    smtpHost?: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser?: string;
    smtpPass?: string;
    fromName: string;
    fromAddress: string;
    baseUrl: string;
    verificationPath: string;
    resetPasswordPath: string;
    verificationTokenExpiry: string;
    resetTokenExpiry: string;
  };
  
  // 密码配置
  bcryptRounds: number;
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireNumbers: boolean;
  passwordRequireSpecialChars: boolean;
  
  // 速率限制配置
  rateLimitWindowMs: number;
  rateLimitMax: number;
  loginAttempts: number;
  registrationAttempts: number;
  
  // 日志配置
  logLevel: string;
  logFilePath: string;
  
  // CORS 配置
  corsOrigin: string[];
  
  // 安全配置
  sessionTimeout: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
  requireEmailVerification: boolean;
} 