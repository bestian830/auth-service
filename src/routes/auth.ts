import { Router } from 'express';
import { requireBearer } from '../middleware/bearer.js';
import { gatewayCheck } from '../controllers/auth.js';

const router = Router();

// Traefik ForwardAuth 鉴权端点
router.get('/gateway-check', requireBearer, gatewayCheck);

export default router;
