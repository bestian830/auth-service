import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '../../generated/prisma';
import { logger } from '../utils';

const prisma = new PrismaClient();

/**
 * 验证邮箱状态中间件
 * 检查邮箱是否已验证或已删除，只有未验证且未删除的邮箱才能调用相关接口
 */
export async function validateEmailStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // 查询邮箱状态
    const tenant = await prisma.tenant.findFirst({
      where: { email },
      select: {
        id: true,
        email_verified_at: true,
        deleted_at: true
      }
    });

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // 检查是否已删除
    if (tenant.deleted_at) {
      logger.warn('Attempted to access deleted tenant email', { email });
      return res.status(400).json({
        success: false,
        error: 'User account has been deleted'
      });
    }

    // 检查是否已验证
    if (tenant.email_verified_at) {
      logger.warn('Attempted to verify already verified email', { email });
      return res.status(400).json({
        success: false,
        error: 'Email has already been verified'
      });
    }

    // 验证通过，继续执行
    next();
  } catch (error) {
    logger.error('Email status validation failed', { error });
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
} 