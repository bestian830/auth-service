import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { audit } from './audit.js';
import { createRateLimiter, isRedisConnected } from '../src/infra/redis.js';

interface CaptchaVerificationResult {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

export async function verifyCaptcha(captchaResponse: string, remoteip?: string): Promise<boolean> {
  if (!env.captchaEnabled || !env.captchaSecretKey) {
    return true; // Skip if CAPTCHA is not enabled
  }

  try {
    const params = new URLSearchParams({
      secret: env.captchaSecretKey,
      response: captchaResponse
    });

    if (remoteip) {
      params.append('remoteip', remoteip);
    }

    const response = await fetch(env.captchaVerifyUrl, {
      method: 'POST',
      body: params,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!response.ok) {
      throw new Error(`CAPTCHA verification request failed: ${response.status}`);
    }

    const result: CaptchaVerificationResult = await response.json();
    
    if (!result.success && result['error-codes']) {
      console.warn('CAPTCHA verification failed:', result['error-codes']);
    }

    return result.success;
  } catch (error: any) {
    console.error('CAPTCHA verification error:', error);
    // Log error but don't block request to avoid DoS
    audit('captcha_verification_error', {
      error: error.message,
      remoteip
    });
    return false;
  }
}

export function requireCaptcha(skipCheck?: (req: Request) => boolean) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip if CAPTCHA is not enabled
      if (!env.captchaEnabled) {
        return next();
      }

      // Allow custom skip logic
      if (skipCheck && skipCheck(req)) {
        return next();
      }

      const captchaResponse = req.body?.captcha || req.body?.['g-recaptcha-response'];
      
      if (!captchaResponse) {
        audit('captcha_missing', {
          ip: req.ip,
          email: req.body?.email
        });
        return res.status(400).json({
          error: 'captcha_required',
          detail: 'CAPTCHA response is required'
        });
      }

      const isValid = await verifyCaptcha(captchaResponse, req.ip);
      
      if (!isValid) {
        audit('captcha_invalid', {
          ip: req.ip,
          email: req.body?.email
        });
        return res.status(400).json({
          error: 'captcha_invalid',
          detail: 'CAPTCHA verification failed'
        });
      }

      // CAPTCHA is valid, proceed
      next();
    } catch (error: any) {
      console.error('CAPTCHA middleware error:', error);
      audit('captcha_middleware_error', {
        ip: req.ip,
        email: req.body?.email,
        error: error.message
      });
      res.status(500).json({ error: 'server_error' });
    }
  };
}

// Conditional CAPTCHA middleware that checks login failure count
export function conditionalCaptcha() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip if CAPTCHA is not enabled
      if (!env.captchaEnabled || !isRedisConnected()) {
        return next();
      }

      const email = req.body?.email;
      if (!email) {
        return next();
      }

      const rateLimiter = await createRateLimiter();
      const failureCount = await rateLimiter.getLoginFailureCount(`user:${email}`);

      // Require CAPTCHA if failure count exceeds threshold
      if (failureCount >= env.loginCaptchaThreshold) {
        return requireCaptcha()(req, res, next);
      }

      // Below threshold, proceed without CAPTCHA
      next();
    } catch (error: any) {
      console.error('Conditional CAPTCHA middleware error:', error);
      audit('conditional_captcha_error', {
        ip: req.ip,
        email: req.body?.email,
        error: error.message
      });
      // Continue without CAPTCHA on error to avoid blocking
      next();
    }
  };
}

// Middleware to provide CAPTCHA requirement status to client
export function captchaStatus() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      let captchaRequired = false;
      
      if (env.captchaEnabled && isRedisConnected()) {
        const email = req.query.email as string;
        if (email) {
          const rateLimiter = await createRateLimiter();
          const failureCount = await rateLimiter.getLoginFailureCount(`user:${email}`);
          captchaRequired = failureCount >= env.loginCaptchaThreshold;
        }
      }

      res.json({
        captcha_required: captchaRequired,
        captcha_site_key: env.captchaEnabled ? env.captchaSiteKey : null,
        threshold: env.loginCaptchaThreshold
      });
    } catch (error: any) {
      console.error('CAPTCHA status error:', error);
      audit('captcha_status_error', {
        ip: req.ip,
        email: req.query.email as string,
        error: error.message
      });
      
      res.json({
        captcha_required: false,
        captcha_site_key: null,
        threshold: env.loginCaptchaThreshold
      });
    }
  };
}