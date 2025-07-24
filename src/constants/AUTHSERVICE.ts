export const AUTH_ERRORS = {
  INVALID_CREDENTIALS: 'Email or password is incorrect',
  EMAIL_NOT_VERIFIED: 'Email not verified yet',
  ACCOUNT_LOCKED: 'Account\'s status is abnormal, please try again later',
  IP_LOCKED: 'Current IP login failed too many times, has been banned',
};

export const LOGIN_LIMIT = {
  EMAIL_FAIL_MAX: 10,            // 1小时10次失败锁15分钟
  EMAIL_LOCK_MINUTES: 15,
  IP_FAIL_MAX: 100,              // 3天100次失败
  IP_LOCK_MINUTES: 60 * 24 * 3,
  EMAIL_COUNT_EXPIRE: 60 * 60,   // 1小时内累计
  IP_COUNT_EXPIRE: 60 * 60 * 24, // 24小时累计
};