/**
 * 邮件服务相关常量配置
 */

/**
 * SendGrid 邮件服务配置常量
 */
export const EMAIL_CONFIG = {
  // SendGrid 默认配置
  DEFAULT_TIMEOUT: 10000, // 10秒超时
  MAX_RETRIES: 3,
  
  // 邮件类型标识
  EMAIL_TYPES: {
    VERIFICATION: 'email_verification',
    PASSWORD_RESET: 'password_reset',
    SUBSCRIPTION_UPDATE: 'subscription_update',
    NOTIFICATION: 'notification'
  },
  
  // 邮件优先级
  PRIORITY: {
    HIGH: 'high',
    NORMAL: 'normal',
    LOW: 'low'
  }
} as const;

/**
 * 邮件错误类型
 */
export const EMAIL_ERROR_TYPES = {
  INVALID_EMAIL: 'InvalidEmail',
  SEND_FAILED: 'SendFailed',
  TEMPLATE_ERROR: 'TemplateError',
  API_ERROR: 'ApiError',
  TIMEOUT: 'Timeout'
} as const; 