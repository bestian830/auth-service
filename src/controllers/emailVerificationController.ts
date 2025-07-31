import { Request, Response } from 'express';
import { verifyEmailCode } from '../services/emailVerificationService';
import { logger } from '../utils/logger';

/**
 * 验证邮箱验证码
 */
export async function verifyEmailCodeController(req: Request, res: Response) {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and verification code are required' 
      });
    }

    const result = await verifyEmailCode({ email, code });
    
    if (result.success) {
      return res.json({ success: true });
    } else {
      return res.status(400).json({ 
        success: false, 
        error: result.error 
      });
    }
  } catch (error: any) {
    logger.error('Email verification controller failed', { error });
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
} 