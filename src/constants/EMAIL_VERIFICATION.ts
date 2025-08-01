/**
 * 邮箱验证码相关常量
 */
export const EMAIL_VERIFICATION = {
  // 验证码有效期（分钟）
  CODE_EXPIRY_MINUTES: 10,
  
  // 最大错误次数
  MAX_ERROR_COUNT: 10,
  
  // 每日最大重发次数
  MAX_DAILY_RESEND_COUNT: 10,
  
  // Redis Key 前缀
  REDIS_KEYS: {
    VERIFY_FAIL_COUNT: 'email_verify_fail_count',
    DAILY_RESEND_COUNT: 'email_resend_count'
  }
} as const; 