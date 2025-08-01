// controllers/emailController.ts

import { Request, Response } from 'express';
import { sendVerificationEmail, sendNotificationEmail } from '../services';
import { logger } from '../utils';

/**
 * 发送邮箱验证邮件
 * POST /api/email/send-verification
 * body: { email, tenantId }
 */
export async function sendVerificationEmailController(req: Request, res: Response) {
  try {
    const { email, tenantId } = req.body;
    if (!email || !tenantId) {
      return res.status(400).json({ success: false, error: 'Missing email or tenantId' });
    }
    await sendVerificationEmail(email, tenantId);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error('Send verification email failed', { error });
    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to send verification email'
    });
  }
}

/**
 * 发送通用通知邮件
 * POST /api/email/send-notification
 * body: { email, subject, html, text }
 */
export async function sendNotificationEmailController(req: Request, res: Response) {
  try {
    const { email, subject, html, text } = req.body;
    if (!email || !subject || !html) {
      return res.status(400).json({ success: false, error: 'Missing email, subject or html' });
    }
    await sendNotificationEmail(email, subject, html, text);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error('Send notification email failed', { error });
    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to send notification email'
    });
  }
}
