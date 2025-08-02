// routes/tenantRoutes.ts

import { Router } from 'express';
import {
  updateTenantInfoController,
  checkUniqueFieldsController,
  getTenantByIdController,
  getTenantByEmailController,
  softDeleteTenantController
} from '../controllers';

import { cleanRequestData, cleanQueryParams, extractTenant, globalLimiter, validateTenantUpdate } from '../middleware';

const router = Router();

/**
 * 更新租户信息（需认证）
 * PUT /api/v1/tenant/:tenantId
 */
router.put(
  '/:tenantId',
  cleanRequestData,
  extractTenant,
  validateTenantUpdate,  // 新增验证中间件
  updateTenantInfoController
);

/**✅
 * 检查租户唯一性
 * GET /api/v1/tenant/check-unique?field=email&value=xx
 */
router.get(
  '/check-unique',
  cleanQueryParams,
  globalLimiter,
  checkUniqueFieldsController
);

/**
 * 根据ID查找租户（需认证）
 * GET /api/v1/tenant/:tenantId
 */
router.get(
  '/:tenantId',
  cleanQueryParams,
  extractTenant,
  getTenantByIdController
);

/**
 * 根据邮箱查找租户（需认证）
 * GET /api/v1/tenant/by-email
 */
router.get(
  '/by-email',
  cleanQueryParams,
  extractTenant,
  getTenantByEmailController
);

/**
 * 软删除租户（需认证）
 * DELETE /api/v1/tenant/:tenantId
 */
router.delete(
  '/:tenantId',
  extractTenant,
  softDeleteTenantController
);

export default router;
