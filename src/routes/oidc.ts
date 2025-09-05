import { Router } from 'express';
import { discovery, jwks, token, revoke, userinfo, getAuthorize, getLogin, postLogin, logout, introspect } from '../controllers/oidc.js';
import { requireBearer } from '../middleware/bearer.js';
import { limitLogin, limitToken } from '../middleware/rate.js';
import { csrfProtection } from '../infra/csrf.js';

const r = Router();

r.get('/.well-known/openid-configuration', discovery);
r.get('/jwks.json', jwks);

// R4: 浏览器流 + CSRF 保护
r.get('/oauth/authorize', getAuthorize);
r.get('/login', csrfProtection, getLogin);
r.post('/login', limitLogin, csrfProtection, postLogin);
r.get('/logout', logout);

// R4: Token/撤销 + 速率限制
r.post('/oauth/token', limitToken, token);
r.post('/oauth/revoke', limitToken, revoke);

// R4: Token Introspection
r.post('/oauth/introspect', limitToken, introspect);

// Userinfo 需要 Bearer
r.get('/userinfo', requireBearer, userinfo);

export default r;