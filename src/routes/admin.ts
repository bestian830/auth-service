import { Router } from 'express';
import { setStoreType } from '../controllers/admin.js';
import { requireBearer } from '../middleware/bearer.js';
import { requireAdmin } from '../middleware/roles.js';

const router = Router();

// All admin routes require Bearer token and admin role
router.use(requireBearer);
router.use(requireAdmin);

// Admin endpoints - middleware ensures admin role check
router.patch('/users/:id/store-type', setStoreType);

export default router;