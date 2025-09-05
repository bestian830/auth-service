import { Router } from 'express';
import { unlockUser, healthCheck } from '../controllers/admin.js';
import { requireBearer } from '../middleware/bearer.js';
import { requireAdmin } from '../middleware/roles.js';

const router = Router();

// All admin routes require Bearer token and admin role
router.use(requireBearer);
router.use(requireAdmin);

// User security management (v0.2.6)
router.patch('/users/:userId/unlock', unlockUser);

// System monitoring (v0.2.8-p2)
router.get('/health', healthCheck);

export default router;