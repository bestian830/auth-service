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
} as const;