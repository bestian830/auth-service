import { Router } from 'express';
import { setStoreType, unlockUser } from '../controllers/admin.js';
import { requireBearer } from '../middleware/bearer.js';
import { requireAdmin } from '../middleware/roles.js';

const router = Router();

// All admin routes require Bearer token and admin role
router.use(requireBearer);
router.use(requireAdmin);

// Admin endpoints - middleware ensures admin role check
router.patch('/users/:id/store-type', setStoreType);

// User security management (v0.2.6)
router.patch('/users/:userId/unlock', unlockUser);

export default router;