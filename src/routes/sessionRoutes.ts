// routes/sessionRoutes.ts

import { Router } from 'express';
import {
  invalidateSessionController,
  invalidateAllSessionsForTenantController,
} from '../controllers/sessionController';
import { cleanRequestData, extractTenant, globalLimiter } from '../middleware';

const router = Router();

/**
 * 失效当前 session（用户主动登出）
 * POST /api/v1/session/invalidate
 */
router.post(
  '/invalidate',
  cleanRequestData,
  extractTenant,
  invalidateSessionController
);

/**
 * 失效租户所有 session（用户主动登出所有设备）
 * POST /api/v1/session/invalidate-all
 */
router.post(
  '/invalidate-all',
  cleanRequestData,
  extractTenant,
  invalidateAllSessionsForTenantController
);

export default router;
