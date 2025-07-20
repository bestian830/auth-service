/**
 * 账号服务类型定义
 * 所有账号相关的类型统一在此文件中定义
 */

// ================================
// 注册账号相关类型
// ================================

/**
 * 账号注册请求数据
 */
export interface RegisterAccountData {
  email: string;
  password: string;
  storeName: string;
  subdomain: string;
}

/**
 * 邮箱验证请求数据
 */
export interface VerifyEmailData {
  token: string;
}

/**
 * 登录账号请求数据
 */
export interface LoginAccountData {
  email: string;
  password: string;
}

/**
 * 发起密码重置请求数据
 */
export interface InitiatePasswordResetData {
  email: string;
}

/**
 * 重置密码请求数据
 */
export interface ResetPasswordData {
  token: string;
  newPassword: string;
}

// ================================
// 响应结果类型
// ================================

/**
 * 登录成功响应
 */
export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * 注册成功响应
 */
export interface RegisterSuccessResponse {
  success: true;
  account: {
    id: string;
    email: string;
    storeName: string;
    subdomain: string;
    emailVerified: boolean;
  };
}

// ================================
// 内部业务类型
// ================================

// ================================
// 向后兼容类型（保留原有类型名）
// ================================

/**
 * @deprecated 使用 RegisterAccountData 替代
 */
export type RegisterTenantAccountData = RegisterAccountData;

/**
 * @deprecated 使用 VerifyEmailData 替代
 */
export type VerifyEmailTokenData = VerifyEmailData; 