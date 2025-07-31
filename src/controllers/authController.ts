// controllers/authController.ts

import { Request, Response } from 'express';
import { registerTenant, 
    login, 
    logout, 
    refresh, 
    changePassword, 
    initiateResetPassword, 
    resetPassword, 
    sendVerificationEmail } from '../services';
import { logger } from '../utils/logger';

/**
 * 注册
 */
export async function register(req: Request, res: Response) {
  try {
    const tenant = await registerTenant(req.body);
    // 注册成功自动发邮箱验证邮件
    await sendVerificationEmail(tenant.email, tenant.id);
    return res.status(201).json({ success: true, tenant });
  } catch (error: any) {
    logger.error('Register failed', { error });
    return res.status(400).json({ success: false, error: error.message });
  }
}

/**
 * 登录
 */
export async function loginController(req: Request, res: Response) {
  try {
    const input = {
      ...req.body,
      ip: req.ip,
      userAgent: req.get('user-agent') || '',
      deviceType: req.body.deviceType,
    };
    const result = await login(input);
    if (!result.success) {
      return res.status(401).json(result);
    }
    return res.json(result);
  } catch (error: any) {
    logger.error('Login failed', { error });
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 登出
 */
export async function logoutController(req: Request, res: Response) {
  try {
    const token = req.headers['authorization']?.replace('Bearer ', '') || '';
    const result = await logout({ token });
    return res.json(result);
  } catch (error: any) {
    logger.error('Logout failed', { error });
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 刷新 token
 */
export async function refreshTokenController(req: Request, res: Response) {
  try {
    const refreshToken = req.body.refreshToken || req.headers['refresh-token'];
    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'Missing refresh token' });
    }
    const result = await refresh({ refreshToken });
    if (!result.success) {
      return res.status(401).json(result);
    }
    return res.json(result);
  } catch (error: any) {
    logger.error('Refresh token failed', { error });
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 发起密码重置
 */
export async function initiateResetPasswordController(req: Request, res: Response) {
  // 这里简单校验 email 即可
  const { email, tenantId } = req.body;
  if (!email || !tenantId) {
    return res.status(400).json({ success: false, error: 'Missing email or tenantId' });
  }

  try {
    const result = await initiateResetPassword({ email, tenantId });
    return res.json(result);
  } catch (error: any) {
    logger.error('Initiate reset password failed', { error });
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 重置密码
 */
export async function resetPasswordController(req: Request, res: Response) {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ success: false, error: 'Missing token or new password' });
  }

  try {
    const result = await resetPassword({ token, newPassword });
    return res.json(result);
  } catch (error: any) {
    logger.error('Reset password failed', { error });
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 登录态下修改密码
 */
export async function changePasswordController(req: Request, res: Response) {
  const { oldPassword, newPassword } = req.body;
  const tenantId = req.body.tenantId || (req as any).tenantId;
  if (!tenantId || !oldPassword || !newPassword) {
    return res.status(400).json({ success: false, error: 'Missing parameters' });
  }

  try {
    const result = await changePassword({ tenantId, oldPassword, newPassword });
    return res.json(result);
  } catch (error: any) {
    logger.error('Change password failed', { error });
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 重发邮箱验证邮件（可选）
 */
export async function resendVerificationEmailController(req: Request, res: Response) {
  const { email, tenantId } = req.body;
  if (!email || !tenantId) {
    return res.status(400).json({ success: false, error: 'Missing email or tenantId' });
  }

  try {
    await sendVerificationEmail(email, tenantId);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error('Resend verification email failed', { error });
    return res.status(500).json({ success: false, error: error.message });
  }
}
