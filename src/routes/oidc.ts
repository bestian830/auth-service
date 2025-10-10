import { Router } from 'express';
import { jwks, token, userinfo, checkBlacklist } from '../controllers/oidc.js';
import { requireBearer } from '../middleware/bearer.js';
import { limitToken } from '../middleware/rate.js';

const r = Router();

// 5.1 获取 JWT 公钥 (JWKS)
r.get('/jwks.json', jwks);

// OAuth Token 端点 (已在第一、三部分实现)
r.post('/oauth/token', limitToken, token);

// 5.2 获取当前用户信息
r.get('/userinfo', requireBearer, userinfo);

// 5.3 检查 Token 黑名单（内部服务专用）
r.post('/api/auth-service/v1/internal/token/check-blacklist', checkBlacklist);

export default r;