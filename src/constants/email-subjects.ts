/**✅
 * 邮件主题配置常量
 */
export const EMAIL_SUBJECTS = {
  verification: 'Confirm your email address',
  resetPassword: 'Reset your password',
  subscription: {
    activated: 'Subscription activated successfully',
    cancelled: 'Subscription cancelled',
    renewed: 'Subscription renewed successfully',
    expired: 'Subscription is about to expire'
  }
} as const;

/**
 * 邮件主题类型（从常量推导）
 */
export type EmailSubjectType = typeof EMAIL_SUBJECTS; 