import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

// Generic rate limiter creator
export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message?: any;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: options.message || { error: 'too_many_requests' },
  });
}

export const limitLogin = rateLimit({
  windowMs: 60_000, // 1 minute
  max: env.rateLoginPerMin,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', detail: 'Login rate limit exceeded' },
});

export const limitToken = rateLimit({
  windowMs: 60_000, // 1 minute  
  max: env.rateTokenPerMin,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', detail: 'Token rate limit exceeded' },
});

// Identity-specific rate limiters using environment configuration
export const limitRegister = createRateLimiter({
  windowMs: env.rateWindowSec * 1000,
  max: env.rateMaxRegister,
  message: { error: 'too_many_requests', detail: 'Registration rate limit exceeded' }
});

export const limitReset = createRateLimiter({
  windowMs: env.rateWindowSec * 1000,
  max: env.rateMaxReset,
  message: { error: 'too_many_requests', detail: 'Password reset rate limit exceeded' }
});

export const limitIdentityLogin = createRateLimiter({
  windowMs: env.rateWindowSec * 1000,
  max: env.rateMaxLogin,
  message: { error: 'too_many_requests', detail: 'Login rate limit exceeded' }
});