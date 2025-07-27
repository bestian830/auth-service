import { Request, Response, NextFunction } from 'express';
import { authenticateRequest, getRedisClient } from '../config';

// 检查 token 是否撤销
async function isTokenRevoked(jti?: string): Promise<boolean> {
  if (!jti) return false;
  const redis = getRedisClient();
  const result = await redis.get(`jwt:blacklist:${jti}`);
  return result === 'true';
}

/**
 * JWT+租户认证中间件
 */
export const extractTenant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.headers.authorization;
    const payload = await authenticateRequest(token);
    if (!payload) {
      return res.status(401).json({ success: false, error: 'Invalid or expired authentication token' });
    }
    if (!payload.tenantId) {
      return res.status(400).json({ success: false, error: 'Missing tenant information in token' });
    }
    // 校验订阅状态
    if (!['ACTIVE', 'TRIAL'].includes(payload.subscriptionStatus || '')) {
      return res.status(403).json({ success: false, error: 'Subscription inactive, please renew your plan' });
    }
    if (await isTokenRevoked(payload.jti)) {
      return res.status(401).json({ success: false, error: 'Authentication token has been revoked' });
    }
    // 挂载租户上下文
    req.tenantId = payload.tenantId;
    req.tenant = { tenantId: payload.tenantId };
    req.jwtPayload = payload;
    next();
  } catch (err) {
    res.status(401).json({ success: false, error: 'Token verification failed' });
  }
};
