// src/routes/organizations.ts
import { Router } from 'express';
import {
  createOrganization,
  getOrganizations,
  getOrganization,
  updateOrganization,
  deleteOrganization
} from '../controllers/organizations.js';
import { requireBearer } from '../middleware/bearer.js';

const router = Router();

// 所有 organization 端点都需要认证
router.use(requireBearer);

// 2.1 创建组织
router.post('/', createOrganization);

// 2.2 获取用户的所有组织
router.get('/', getOrganizations);

// 2.3 获取单个组织详情
router.get('/:orgId', getOrganization);

// 2.4 更新组织信息
router.put('/:orgId', updateOrganization);

// 2.5 删除组织（软删除）
router.delete('/:orgId', deleteOrganization);

export default router;
