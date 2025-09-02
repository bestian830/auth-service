import { Router } from 'express';
import { 
  register, 
  verify, 
  login, 
  logout,
  forgotPassword, 
  resetPassword, 
  getProfile,
  updateProfile,
  changePassword,
  captchaStatus
} from '../controllers/identity.js';
import { requireBearer } from '../middleware/bearer.js';
import { createRateLimiter } from '../middleware/rate.js';
import { 
  dualLoginRateLimit, 
  dualRegistrationRateLimit, 
  dualPasswordResetRateLimit,
  dualVerificationRateLimit,
  markSuccessfulRequest
} from '../middleware/redisRate.js';
import { conditionalCaptcha } from '../middleware/captcha.js';
import { productHint } from '../middleware/productHint.js';
import { env } from '../config/env.js';

const router = Router();

// Rate limiters for identity endpoints using env configuration
const registerLimiter = createRateLimiter({
  windowMs: env.rateWindowSec * 1000,
  max: env.rateMaxRegister,
  message: { error: 'too_many_requests', detail: 'Registration rate limit exceeded' }
});

const resetLimiter = createRateLimiter({
  windowMs: env.rateWindowSec * 1000,
  max: env.rateMaxReset,
  message: { error: 'too_many_requests', detail: 'Password reset rate limit exceeded' }
});

const loginLimiter = createRateLimiter({
  windowMs: env.rateWindowSec * 1000,
  max: env.rateMaxLogin,
  message: { error: 'too_many_requests', detail: 'Login rate limit exceeded' }
});

// Identity management endpoints

// CAPTCHA status check (before login form)
router.get('/captcha-status', captchaStatus);

// Registration and verification (enhanced with dual rate limiting)
router.post('/register', productHint(), dualRegistrationRateLimit, markSuccessfulRequest, register);
router.post('/verify', productHint(), dualVerificationRateLimit, markSuccessfulRequest, verify);

// Authentication (enhanced with CAPTCHA and dual rate limiting)  
router.post('/login', productHint(), dualLoginRateLimit, conditionalCaptcha(), markSuccessfulRequest, login);
router.post('/logout', logout);

// Password reset (enhanced with dual rate limiting)
router.post('/forgot-password', dualPasswordResetRateLimit, markSuccessfulRequest, forgotPassword);
router.post('/reset-password', resetPassword);

// Profile management (requires authentication)
router.get('/me', requireBearer, getProfile);
router.patch('/me', requireBearer, updateProfile);

// Password change (requires authentication)
router.post('/change-password', requireBearer, changePassword);

export default router;