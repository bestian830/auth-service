import { Router } from 'express';
import { discovery, jwks, token, revoke, userinfo, introspect } from '../controllers/oidc.js';
import { requireBearer } from '../middleware/bearer.js';
import { limitToken } from '../middleware/rate.js';

const r = Router();

// 标准OIDC端点（第三方集成可能需要）
r.get('/.well-known/openid-configuration', discovery);
r.get('/jwks.json', jwks);

// Token管理（仅API模式）
r.post('/oauth/token', limitToken, token);
r.post('/oauth/revoke', limitToken, revoke);
r.post('/oauth/introspect', limitToken, introspect);

// 用户信息
r.get('/userinfo', requireBearer, userinfo);

export default r;