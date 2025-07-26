// controllers/subscriptionController.ts

import { Request, Response } from 'express';
import { getSubscriptionInfo } from '../services';
import { logger } from '../utils';

/**
 * 查询当前租户的订阅状态（可用于前端账户页、业务校验等场景）
 * GET /api/subscription/:tenantId
 */
export async function getSubscriptionInfoController(req: Request, res: Response) {
  try {
    const { tenantId } = req.params;
    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Missing tenantId' });
    }
    const info = await getSubscriptionInfo(tenantId);
    return res.json({ success: true, data: info });
  } catch (error: any) {
    logger.error('Get subscription info failed', { error });
    return res.status(400).json({
      success: false,
      error: error.message || 'Failed to fetch subscription info'
    });
  }
}
