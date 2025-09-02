// src/config/env.validate.ts
import { z } from 'zod';

const envSchema = z.object({
  // Core configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(8080),
  ISSUER_URL: z.string().url('ISSUER_URL must be a valid URL'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // Token configuration
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().min(60).default(1800),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().min(3600).default(2592000),
  
  // Redis configuration  
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().min(0).max(15).default(0),
  REDIS_NAMESPACE: z.string().min(1).default('authsvc'),
  REDIS_CONNECT_TIMEOUT: z.coerce.number().min(1000).default(5000),
  REDIS_COMMAND_TIMEOUT: z.coerce.number().min(1000).default(3000),
  REDIS_MAX_RETRIES: z.coerce.number().min(0).default(3),
  
  // Product configuration
  PRODUCT_CLIENT_MAP: z.string().default('web-ploml:ploml,web-mopai:mopai'),
  UNKNOWN_PRODUCT_STRATEGY: z.enum(['ploml', 'mopai', 'reject']).default('ploml'),
  DEFAULT_PLAN_MOPAI: z.enum(['trial', 'basic', 'standard', 'pro', 'professor']).default('standard'),
  DEFAULT_PLAN_PLOML: z.enum(['trial', 'basic', 'standard', 'pro', 'professor']).default('basic'),
  
  // CAPTCHA configuration
  CAPTCHA_ENABLED: z.string().transform(val => val === 'true').default('false'),
  CAPTCHA_VERIFY_URL: z.string().url().default('https://www.google.com/recaptcha/api/siteverify'),
  CAPTCHA_SITE_KEY: z.string().optional(),
  CAPTCHA_SECRET_KEY: z.string().optional(),
  
  // SMTP configuration
  MAIL_TRANSPORT: z.enum(['CONSOLE', 'SMTP']).default('CONSOLE'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().min(1).max(65535).optional(),
  SMTP_SECURE: z.string().transform(val => val === 'true').default('false'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  
  // Mopai refresh strategy (days/hours)
  MOPAI_REFRESH_SLIDING_DAYS: z.coerce.number().min(1).default(30),
  MOPAI_ROTATE_THRESHOLD_HOURS: z.coerce.number().min(1).default(360),
  MOPAI_INACTIVITY_LOGOUT_DAYS: z.coerce.number().min(1).default(30),
  
  // Ploml refresh strategy (days/hours)  
  PLOML_REFRESH_SLIDING_DAYS: z.coerce.number().min(1).default(15),
  PLOML_ROTATE_THRESHOLD_HOURS: z.coerce.number().min(1).default(180),
  PLOML_REFRESH_HARD_LIMIT_DAYS: z.coerce.number().min(1).default(365),
  
  // Rate limiting
  RATE_MAX_LOGIN_PER_HR: z.coerce.number().min(1).default(10),
  RATE_MAX_REGISTER_PER_HR: z.coerce.number().min(1).default(10),
  RATE_MAX_VERIFY_PER_HR: z.coerce.number().min(1).default(10),
  RATE_MAX_RESET_PER_HR: z.coerce.number().min(1).default(10),
  
  // Login failure thresholds
  LOGIN_CAPTCHA_THRESHOLD: z.coerce.number().min(1).default(3),
  LOGIN_LOCK_THRESHOLD: z.coerce.number().min(1).default(10),
  LOGIN_LOCK_MINUTES: z.coerce.number().min(1).default(30),
  
  // Subscription quota
  SUBS_ENABLE_LOCAL_QUOTA_ENFORCE: z.string().transform(val => val === 'true').default('true'),
  QUOTA_PLOML_STAFF_TRIAL: z.coerce.number().min(0).default(3),
  QUOTA_PLOML_STAFF_BASIC: z.coerce.number().min(0).default(3),
  QUOTA_PLOML_STAFF_STANDARD: z.coerce.number().min(0).default(5),
  QUOTA_PLOML_STAFF_PRO: z.coerce.number().min(0).default(10),
  QUOTA_PLOML_STAFF_PROFESSOR: z.coerce.number().min(0).default(18),
  QUOTA_MOPAI_DEVICE_BASIC: z.coerce.number().min(0).default(0),
  QUOTA_MOPAI_DEVICE_STANDARD: z.coerce.number().min(0).default(1),
  QUOTA_MOPAI_DEVICE_PRO: z.coerce.number().min(0).default(3),
  QUOTA_MOPAI_DEVICE_PROFESSOR: z.coerce.number().min(0).default(5),
  
  // Verification code encryption
  VERIFICATION_CODE_ENC_KEY: z.string().optional(),
  
  // Session and security
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters').default('dev-session-secret-key'),
  DEFAULT_TENANT_ID: z.string().min(1).default('tenant-dev'),
  PASSWORD_HASH_ROUNDS: z.coerce.number().min(4).max(15).default(10),
  
  // Subscription service (optional)
  SUBS_SERVICE_URL: z.string().url().optional().or(z.literal('')),
  SUBS_SERVICE_TOKEN: z.string().optional(),
  
  // v0.2.9 Security enhancements
  ALLOWED_ORIGINS: z.string().min(1, 'ALLOWED_ORIGINS is required'),
  METRICS_TOKEN: z.string().min(16, 'METRICS_TOKEN must be at least 16 characters'),
  KEYSTORE_ENC_KEY: z.string().min(44, 'KEYSTORE_ENC_KEY must be base64 encoded 32-byte key'),
  COOKIE_SAMESITE: z.enum(['lax', 'none', 'strict']).optional(),
});

// Validate environment variables at module load time
export const validatedEnv = (() => {
  try {
    console.log('🔍 Validating environment configuration...');
    const result = envSchema.parse(process.env);
    
    // Additional validation logic
    if (result.CAPTCHA_ENABLED && (!result.CAPTCHA_SITE_KEY || !result.CAPTCHA_SECRET_KEY)) {
      throw new Error('CAPTCHA is enabled but CAPTCHA_SITE_KEY or CAPTCHA_SECRET_KEY is missing');
    }
    
    if (result.MAIL_TRANSPORT === 'SMTP' && (!result.SMTP_HOST || !result.SMTP_USER)) {
      throw new Error('SMTP transport requires SMTP_HOST and SMTP_USER to be configured');
    }
    
    // Validate PRODUCT_CLIENT_MAP format
    const clientMap = result.PRODUCT_CLIENT_MAP;
    if (clientMap) {
      const pairs = clientMap.split(',');
      for (const pair of pairs) {
        const [clientId, product] = pair.split(':');
        if (!clientId || !product || !['mopai', 'ploml'].includes(product)) {
          throw new Error(`Invalid PRODUCT_CLIENT_MAP format: "${pair}". Expected format: "clientId:product"`);
        }
      }
    }
    
    console.log('✅ Environment validation passed');
    return result;
  } catch (error) {
    console.error('❌ Environment validation failed:');
    
    if (error instanceof z.ZodError) {
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    } else {
      console.error(`  - ${(error as Error).message}`);
    }
    
    if (process.env.NODE_ENV === 'production') {
      console.error('🚨 Exiting due to configuration errors in production mode');
      process.exit(1);
    } else {
      console.warn('⚠️ Continuing in development mode despite configuration errors');
      return process.env; // Return raw env in development
    }
  }
})();

export type ValidatedEnv = z.infer<typeof envSchema>;