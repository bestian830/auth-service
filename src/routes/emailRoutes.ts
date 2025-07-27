// routes/emailRoutes.ts

import { Router } from 'express';
import {
  sendVerificationEmailController,
  sendResetPasswordEmailController,
  sendNotificationEmailController,
} from '../controllers';
import { cleanRequestData, globalLimiter } from '../middleware';

const router = Router();

/**
 * 发送邮箱验证邮件
 * POST /api/v1/email/send-verification
 * body: { email, tenantId }
 */
router.post(
  '/send-verification',
  cleanRequestData,
  globalLimiter,
  sendVerificationEmailController
);

/**
 * 发送密码重置邮件
 * POST /api/v1/email/send-reset
 * body: { email, tenantId }
 */
router.post(
  '/send-reset',
  cleanRequestData,
  globalLimiter,
  sendResetPasswordEmailController
);

/**
 * 发送通用通知邮件
 * POST /api/v1/email/send-notification
 * body: { email, subject, html, text }
 */
router.post(
  '/send-notification',
  cleanRequestData,
  globalLimiter,
  sendNotificationEmailController
);

export default router;
