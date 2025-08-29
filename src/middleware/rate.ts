import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

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