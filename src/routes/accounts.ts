import { Router } from 'express';
import { loginBackend, loginPOS, logout, me, createAccount, listAccounts, getAccount, updateAccount, deleteAccount, resetAccountPassword, resetAccountPin, changeOwnPassword } from '../controllers/account.js';
import { requireBearer } from '../middleware/bearer.js';

const router = Router();

// 登录（无需认证）
router.post('/login', loginBackend);
router.post('/login-pos', loginPOS);

// 登出（需要认证）
router.post('/logout', requireBearer, logout);

// 我的信息（需要认证）
router.get('/me', requireBearer, me);

// 账号管理（需要认证）
router.post('/', requireBearer, createAccount);
router.get('/', requireBearer, listAccounts);
router.get('/:accountId', requireBearer, getAccount);
router.patch('/:accountId', requireBearer, updateAccount);
router.delete('/:accountId', requireBearer, deleteAccount);

// 密码/PIN管理
router.post('/change-password', requireBearer, changeOwnPassword);
router.post('/:accountId/reset-password', requireBearer, resetAccountPassword);
router.post('/:accountId/reset-pin', requireBearer, resetAccountPin);

export default router;


