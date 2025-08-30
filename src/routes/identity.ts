import { Router } from 'express';
import { 
  register, 
  verifyEmail, 
  resendVerification, 
  forgotPassword, 
  resetPassword, 
  changePassword 
} from '../controllers/identity.js';
import { requireBearer } from '../middleware/bearer.js';

const router = Router();

// 注册新用户
router.post('/register', register);

// 邮箱验证（支持 GET 和 POST）
router.get('/verify', verifyEmail);
router.post('/verify', verifyEmail);

// 重发验证邮件
router.post('/verify/resend', resendVerification);

// 忘记密码
router.post('/forgot-password', forgotPassword);

// 重置密码
router.post('/reset-password', resetPassword);

// 修改密码（需要认证）
router.post('/change-password', requireBearer, changePassword);

export default router;