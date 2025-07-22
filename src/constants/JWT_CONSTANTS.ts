export const JWT_CONFIG = {
  ISSUER: 'tymoe',
  AUDIENCE: 'tymoe_tenant',
  ALGORITHM: 'HS256',
  EXPIRY_TIMES: {
    ACCESS_TOKEN: process.env.JWT_EXPIRES_IN || '15m',               // 支持 '15m' 或秒字符串
    REFRESH_TOKEN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    EMAIL_VERIFICATION: process.env.EMAIL_VERIFICATION_TOKEN_EXPIRY || '24h',
    PASSWORD_RESET: process.env.EMAIL_RESET_TOKEN_EXPIRY || '1h'
  }
};