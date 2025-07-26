// controllers/sessionController.ts

import { Request, Response } from 'express';
import {
  createSession,
  isSessionActive,
  invalidateSession,
  invalidateAllSessionsForTenant,
  refreshSessionExpiry,
} from '../services';
import { logger } from '../utils';

/**
 * 创建新会话
 */
export async function createSessionController(req: Request, res: Response) {
  try {
    const { tenantId, userAgent, ip, deviceType, refreshToken } = req.body;
    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Missing tenantId' });
    }
    const input = { tenantId, userAgent, ip, deviceType, refreshToken };
    const result = await createSession(input);
    return res.json(result);
  } catch (error: any) {
    logger.error('Create session failed', { error });
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 校验 session 是否有效
 */
export async function isSessionActiveController(req: Request, res: Response) {
  try {
    const sessionId = req.params.sessionId || req.body.sessionId;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Missing sessionId' });
    }
    const active = await isSessionActive(sessionId);
    return res.json({ success: true, sessionId, active });
  } catch (error: any) {
    logger.error('Check session active failed', { error });
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 失效当前 session
 */
export async function invalidateSessionController(req: Request, res: Response) {
  try {
    const sessionId = req.body.sessionId || req.params.sessionId;
    const tokenExp = req.body.tokenExp ? new Date(req.body.tokenExp) : new Date();
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Missing sessionId' });
    }
    const result = await invalidateSession(sessionId, tokenExp);
    return res.json(result);
  } catch (error: any) {
    logger.error('Invalidate session failed', { error });
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 失效租户所有 session
 */
export async function invalidateAllSessionsForTenantController(req: Request, res: Response) {
  try {
    const tenantId = req.body.tenantId || req.params.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Missing tenantId' });
    }
    const result = await invalidateAllSessionsForTenant(tenantId);
    return res.json(result);
  } catch (error: any) {
    logger.error('Invalidate all sessions for tenant failed', { error });
    return res.status(500).json({ success: false, error: error.message });
  }
}

/**
 * 刷新 session 过期时间
 */
export async function refreshSessionExpiryController(req: Request, res: Response) {
  try {
    const sessionId = req.body.sessionId || req.params.sessionId;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Missing sessionId' });
    }
    const result = await refreshSessionExpiry(sessionId);
    return res.json(result);
  } catch (error: any) {
    logger.error('Refresh session expiry failed', { error });
    return res.status(500).json({ success: false, error: error.message });
  }
}
