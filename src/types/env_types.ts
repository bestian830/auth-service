// types/env.ts

export interface EmailConfig {
  fromName: string;
  baseUrl: string;
  verificationPath: string;
  resetPasswordPath: string;
  verificationTokenExpiry: string; // e.g., '24h'
  resetTokenExpiry: string;        // e.g., '1h'
}

export interface EnvConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;

  jwtSecret: string;
  jwtRefreshSecret: string;
  jwtExpiresIn: string;
  jwtRefreshExpiresIn: string;

  sendgridApiKey: string;
  emailSenderAddress: string;
  email: EmailConfig;

  bcryptRounds: number;
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireNumbers: boolean;
  passwordRequireSpecialChars: boolean;

  rateLimitWindowMs: number;
  rateLimitMax: number;
  loginAttempts: number;
  registrationAttempts: number;

  logLevel: string;
  logFilePath: string;

  corsOrigin: string[];
  sessionTimeout: number;
  maxLoginAttempts: number;
  lockoutDuration: number;
  requireEmailVerification: boolean;

  subscriptionServiceBaseUrl: string;
}
