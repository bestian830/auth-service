// routes/authRoutes.ts

import { Router } from 'express';
import {
  register,
  loginController,
  logoutController,
  refreshTokenController,
  changePasswordController,
  initiateResetPasswordController,
  verifyResetCodeController,
  resetPasswordController,
  verifyEmailCodeController,
  resendVerificationEmailController,
} from '../controllers';
import {
  cleanRequestData,
  extractTenant,
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  validateRegisterInput,
  validateLoginInput,
  validateEmailStatus
} from '../middleware';

const router = Router();

/**✅
 * 注册
 * POST /api/v1/auth/register
 */
router.post(
  '/register',
  cleanRequestData,
  registerLimiter,
  validateRegisterInput,
  register
);

/**✅
 * 登录
 * POST /api/v1/auth/login
 */
router.post(
  '/login',
  cleanRequestData,
  loginLimiter,
  validateLoginInput,
  loginController
);

/**✅
 * 刷新 Token
 * POST /api/v1/auth/refresh
 */
router.post(
  '/refresh',
  cleanRequestData,
  refreshTokenController
);

/**✅
 * 登出
 * POST /api/v1/auth/logout
 */
router.post(
  '/logout',
  extractTenant,
  logoutController
);

/**✅
 * 登录态下修改密码
 * PUT /api/v1/auth/password
 */
router.put(
  '/password',
  extractTenant,
  cleanRequestData,
  changePasswordController
);

/**
 * 发起密码重置（发送验证码）
 * POST /api/v1/auth/initiate-reset
 */
router.post(
  '/initiate-reset',
  cleanRequestData,
  passwordResetLimiter,
  initiateResetPasswordController
);

/**
 * 验证密码重置验证码
 * POST /api/v1/auth/verify-reset-code
 */
router.post(
  '/verify-reset-code',
  cleanRequestData,
  verifyResetCodeController
);

/**
 * 重置密码（通过验证码token）
 * POST /api/v1/auth/reset-password
 */
router.post(
  '/reset-password',
  cleanRequestData,
  resetPasswordController
);

/**✅
 * 重发邮箱验证邮件
 * POST /api/v1/auth/resend-verification
 */
router.post(
  '/resend-verification',
  cleanRequestData,
  validateEmailStatus,
  resendVerificationEmailController
);

/**✅
 * 验证邮箱验证码
 * POST /api/v1/auth/verify-email
 */
router.post(
  '/verify-email',
  cleanRequestData,
  validateEmailStatus,
  verifyEmailCodeController
);

export default router;
