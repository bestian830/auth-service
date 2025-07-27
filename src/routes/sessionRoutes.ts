// routes/sessionRoutes.ts

import { Router } from 'express';
import {
  createSessionController,
  isSessionActiveController,
  invalidateSessionController,
  invalidateAllSessionsForTenantController,
  refreshSessionExpiryController,
} from '../controllers/sessionController';
import { cleanRequestData, cleanQueryParams, extractTenant, globalLimiter } from '../middleware';

const router = Router();

/**
 * 创建新会话
 * POST /api/v1/session
 */
router.post(
  '/',
  cleanRequestData,
  globalLimiter,
  createSessionController
);

/**
 * 校验 session 是否有效
 * GET /api/v1/session/:sessionId/active
 */
router.get(
  '/:sessionId/active',
  cleanQueryParams,
  globalLimiter,
  isSessionActiveController
);

/**
 * 失效当前 session
 * POST /api/v1/session/invalidate
 */
router.post(
  '/invalidate',
  cleanRequestData,
  extractTenant,
  invalidateSessionController
);

/**
 * 失效租户所有 session
 * POST /api/v1/session/invalidate-all
 */
router.post(
  '/invalidate-all',
  cleanRequestData,
  extractTenant,
  invalidateAllSessionsForTenantController
);

/**
 * 刷新 session 过期时间
 * POST /api/v1/session/refresh-expiry
 */
router.post(
  '/refresh-expiry',
  cleanRequestData,
  extractTenant,
  refreshSessionExpiryController
);

export default router;
