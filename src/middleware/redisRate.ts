import { Request, Response, NextFunction } from 'express';
import { createRateLimiter, isRedisConnected } from '../infra/redis.js';
import { env } from '../config/env.js';
import { audit } from './audit.js';

interface DualRateLimitOptions {
  emailMax: number;
  emailWindowSec: number;
  ipMax: number;
  ipWindowSec: number;
  keyPrefix?: string;
  skipSuccessfulRequests?: boolean;
}

export function createDualRateLimiter(options: DualRateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Fall back to simple rate limiting if Redis is not available
      if (!isRedisConnected()) {
        console.warn('Redis not connected, skipping dual rate limiting');
        return next();
      }

      const rateLimiter = await createRateLimiter();
      const ip = req.ip || 'unknown';
      const email = req.body?.email || 'unknown';
      const keyPrefix = options.keyPrefix || 'dual_rate';

      // Skip if this is a successful request and option is enabled
      if (options.skipSuccessfulRequests && res.locals.skipRateLimit) {
        return next();
      }

      // Check email-based rate limit
      const emailKey = `${keyPrefix}:email:${email}`;
      const emailLimit = await rateLimiter.checkLimit(
        emailKey,
        options.emailMax,
        options.emailWindowSec
      );

      // Check IP-based rate limit
      const ipKey = `${keyPrefix}:ip:${ip}`;
      const ipLimit = await rateLimiter.checkLimit(
        ipKey,
        options.ipMax,
        options.ipWindowSec
      );

      // Set headers for client awareness
      res.set({
        'X-RateLimit-Email-Limit': options.emailMax.toString(),
        'X-RateLimit-Email-Remaining': emailLimit.remaining.toString(),
        'X-RateLimit-Email-Reset': new Date(emailLimit.resetTime).toISOString(),
        'X-RateLimit-IP-Limit': options.ipMax.toString(),
        'X-RateLimit-IP-Remaining': ipLimit.remaining.toString(),
        'X-RateLimit-IP-Reset': new Date(ipLimit.resetTime).toISOString()
      });

      // Check if either limit is exceeded
      if (!emailLimit.allowed) {
        audit('rate_limit_exceeded', {
          type: 'email',
          email: email !== 'unknown' ? email : undefined,
          ip,
          limit: options.emailMax,
          windowSec: options.emailWindowSec
        });

        return res.status(429).json({
          error: 'too_many_requests',
          detail: 'Email rate limit exceeded'
        });
      }

      if (!ipLimit.allowed) {
        audit('rate_limit_exceeded', {
          type: 'ip',
          email: email !== 'unknown' ? email : undefined,
          ip,
          limit: options.ipMax,
          windowSec: options.ipWindowSec
        });

        return res.status(429).json({
          error: 'too_many_requests',
          detail: 'IP rate limit exceeded'
        });
      }

      next();
    } catch (error: any) {
      console.error('Dual rate limiter error:', error);
      audit('rate_limit_error', {
        ip: req.ip,
        email: req.body?.email,
        error: error.message
      });
      // Continue on error to avoid blocking legitimate requests
      next();
    }
  };
}

// Pre-configured dual rate limiter for login attempts
export const dualLoginRateLimit = createDualRateLimiter({
  emailMax: env.rateLoginEmailMax,
  emailWindowSec: env.rateLoginEmailWindowSec,
  ipMax: env.rateLoginIpMax,
  ipWindowSec: env.rateLoginIpWindowSec,
  keyPrefix: 'login_rate',
  skipSuccessfulRequests: true // Only count failed attempts
});

// Enhanced rate limiting for registration (combines email and IP constraints)
export const dualRegistrationRateLimit = createDualRateLimiter({
  emailMax: env.rateMaxRegister,
  emailWindowSec: env.rateWindowSec,
  ipMax: env.rateMaxRegister * 3, // Allow more per IP for shared networks
  ipWindowSec: env.rateWindowSec,
  keyPrefix: 'registration_rate'
});

// Enhanced rate limiting for password reset
export const dualPasswordResetRateLimit = createDualRateLimiter({
  emailMax: env.rateMaxReset,
  emailWindowSec: env.rateWindowSec,
  ipMax: env.rateMaxReset * 2, // Slightly more lenient for IP
  ipWindowSec: env.rateWindowSec,
  keyPrefix: 'reset_rate'
});

// Middleware to mark successful requests for skipping rate limits
export function markSuccessfulRequest(req: Request, res: Response, next: NextFunction) {
  const originalSend = res.send;
  
  res.send = function(body: any) {
    // Check if response indicates success (status 2xx and no error in body)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      let isError = false;
      try {
        const parsed = typeof body === 'string' ? JSON.parse(body) : body;
        isError = parsed && parsed.error;
      } catch (e) {
        // Not JSON, assume success
      }
      
      if (!isError) {
        res.locals.skipRateLimit = true;
      }
    }
    
    return originalSend.call(this, body);
  };
  
  next();
}