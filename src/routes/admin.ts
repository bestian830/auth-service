import { Router } from 'express';
import {
  healthCheck,
  getSystemStats,
  getSystemConfig,
  getAuditLogs,
  forceLogoutUser,
  forceLogoutAccount,
  unlockUser,
  clearCache,
  getActiveTokens,
  forceLogoutDevice,
  rotateJwtKey
} from '../controllers/admin.js';
import { requireAdmin } from '../middleware/adminAuth.js';

const router = Router();

// All admin routes require X-Admin-Key header authentication
router.use(requireAdmin);

// 6.1 系统健康检查
router.get('/health', healthCheck);

// 6.2 系统统计信息
router.get('/stats', getSystemStats);

// 6.3 系统配置信息
router.get('/config', getSystemConfig);

// 6.4 查询审计日志
router.get('/audit-logs', getAuditLogs);

// 6.5 强制登出 User
router.post('/users/:userId/force-logout', forceLogoutUser);

// 6.6 强制登出 Account
router.post('/accounts/:accountId/force-logout', forceLogoutAccount);

// 6.7 解锁 User 账号
router.post('/users/:userId/unlock', unlockUser);

// 6.8 清除缓存
router.post('/cache/clear', clearCache);

// 6.9 查看活跃 Token
router.get('/tokens/active', getActiveTokens);

// 6.10 强制注销 Device
router.post('/devices/:deviceId/force-logout', forceLogoutDevice);

// 6.11 轮换 JWT 签名密钥
router.post('/keys/rotate', rotateJwtKey);

export default router;