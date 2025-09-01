import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../infra/prisma.js';
import { env } from '../config/env.js';
import { audit } from '../middleware/audit.js';
import { IdentityService } from '../services/identity.js';
import { revokeFamily } from '../services/token.js';
import { createRateLimiter, isRedisConnected } from '../infra/redis.js';
import { verifyCaptcha } from '../middleware/captcha.js';
import type { RefreshFamilyRow } from '../types/prisma.js';

const identityService = new IdentityService();

export async function register(req: Request, res: Response) {
  const { email, password, subdomain, phone, address } = req.body;

  // Always return success to prevent enumeration attacks
  const sendSuccessResponse = () => res.json({ ok: true });

  try {
    if (!email || !password) {
      audit('register_invalid_request', { ip: req.ip, email: email || 'missing' });
      return sendSuccessResponse();
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser && existingUser.emailVerifiedAt) {
      // User exists and verified - audit but don't send email
      audit('register_conflict', { ip: req.ip, email, verified: true });
      return sendSuccessResponse();
    }

    // Create or reuse user and send verification email
    const { user } = await identityService.createOrReuseUserForSignup({
      email,
      password,
      tenantId: env.defaultTenantId,
      subdomain,
      phone,
      address
    });

    await identityService.issueEmailVerification(
      user.id,
      'signup',
      email,
      user.tenantId
    );

    audit('register_requested', { 
      ip: req.ip, 
      email, 
      userId: user.id,
      tenantId: user.tenantId
    });

    return sendSuccessResponse();
  } catch (error: any) {
    if (error.message === 'subdomain_taken') {
      audit('register_subdomain_conflict', { ip: req.ip, email, subdomain });
      return res.status(409).json({ error: 'subdomain_taken' });
    }

    audit('register_error', { ip: req.ip, email, error: error.message });
    return res.status(500).json({ error: 'server_error' });
  }
}

export async function verify(req: Request, res: Response) {
  const { email, code } = req.body;

  try {
    if (!email || !code) {
      audit('verify_invalid_request', { ip: req.ip, email: email || 'missing' });
      return res.status(400).json({ error: 'invalid_request' });
    }

    // Parse code (selector.token format)
    const codeParts = code.split('.');
    if (codeParts.length !== 2) {
      audit('verify_invalid_format', { ip: req.ip, email });
      return res.status(400).json({ error: 'invalid_code' });
    }

    const [selector, token] = codeParts;
    
    const user = await identityService.consumeEmailVerification(selector, token);

    audit('email_verified', { 
      ip: req.ip, 
      email, 
      userId: user.id 
    });

    res.json({ ok: true });
  } catch (error: any) {
    const errorMap: Record<string, { status: number; error: string }> = {
      'invalid_code': { status: 400, error: 'invalid_code' },
      'code_already_used': { status: 400, error: 'code_already_used' },
      'code_expired': { status: 400, error: 'code_expired' },
      'too_many_attempts': { status: 429, error: 'too_many_attempts' }
    };

    const errorInfo = errorMap[error.message] || { status: 500, error: 'server_error' };
    
    audit('verify_failed', { 
      ip: req.ip, 
      email, 
      reason: error.message 
    });

    res.status(errorInfo.status).json({ error: errorInfo.error });
  }
}

export async function login(req: Request, res: Response) {
  const { email, password, captcha } = req.body;
  const ip = req.ip || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';

  try {
    if (!email || !password) {
      audit('login_invalid_request', { ip, email: email || 'missing' });
      return res.status(400).json({ error: 'invalid_request' });
    }

    // Check for user existence first
    const user = await prisma.user.findUnique({
      where: { email }
    });

    // Always record login attempt for tracking
    const loginAttemptData: {
      userId?: string;
      email: any;
      tenantId: string;
      ipAddress: string;
      userAgent: string;
      success: boolean;
      failureReason: string | null;
      captchaUsed: boolean;
    } = {
      email,
      tenantId: user?.tenantId || env.defaultTenantId,
      ipAddress: ip,
      userAgent,
      success: false,
      failureReason: null,
      captchaUsed: !!captcha
    };

    // Check account lock status if user exists and Redis is available
    if (user && isRedisConnected()) {
      try {
        const rateLimiter = await createRateLimiter();
        const lockStatus = await rateLimiter.isUserLocked(user.id);
        
        if (lockStatus.locked) {
          loginAttemptData.failureReason = 'account_locked';
          await prisma.loginAttempt.create({
            data: { ...loginAttemptData, userId: user.id }
          });
          
          audit('login_fail', { 
            ip, 
            email, 
            userId: user.id, 
            reason: 'account_locked',
            lockReason: lockStatus.reason,
            lockUntil: lockStatus.until
          });
          
          return res.status(423).json({ 
            error: 'account_locked', 
            locked_until: lockStatus.until,
            reason: lockStatus.reason
          });
        }

        // Check if CAPTCHA is required based on failure count
        const failureCount = await rateLimiter.getLoginFailureCount(user.id);
        if (env.captchaEnabled && failureCount >= env.loginCaptchaThreshold) {
          if (!captcha) {
            loginAttemptData.failureReason = 'captcha_required';
            await prisma.loginAttempt.create({
              data: { ...loginAttemptData, userId: user.id }
            });
            
            audit('login_fail', { 
              ip, 
              email, 
              userId: user.id, 
              reason: 'captcha_required',
              failureCount
            });
            
            return res.status(400).json({ 
              error: 'captcha_required',
              failure_count: failureCount,
              captcha_site_key: env.captchaSiteKey
            });
          }

          // Verify CAPTCHA
          const captchaValid = await verifyCaptcha(captcha, ip);
          if (!captchaValid) {
            loginAttemptData.failureReason = 'captcha_failed';
            await prisma.loginAttempt.create({
              data: { ...loginAttemptData, userId: user.id }
            });
            
            audit('login_fail', { 
              ip, 
              email, 
              userId: user.id, 
              reason: 'captcha_failed',
              failureCount
            });
            
            return res.status(400).json({ 
              error: 'captcha_invalid'
            });
          }
        }
      } catch (redisError) {
        console.error('Redis error during login check:', redisError);
        // Continue without Redis-based checks
      }
    }

    // Check user existence and verification
    if (!user || !user.emailVerifiedAt) {
      loginAttemptData.failureReason = 'user_not_found_or_unverified';
      await prisma.loginAttempt.create({ data: loginAttemptData });
      
      audit('login_fail', { ip, email, reason: 'user_not_found_or_unverified' });
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    // Check database-level user lock (fallback if Redis is unavailable)
    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      loginAttemptData.failureReason = 'account_locked';
      loginAttemptData.userId = user.id;
      await prisma.loginAttempt.create({ data: loginAttemptData });
      
      audit('login_fail', { 
        ip, 
        email, 
        userId: user.id, 
        reason: 'account_locked_db',
        lockUntil: user.lockedUntil.getTime(),
        lockReason: user.lockReason
      });
      
      return res.status(423).json({ 
        error: 'account_locked',
        locked_until: user.lockedUntil.getTime(),
        reason: user.lockReason
      });
    }

    // Validate password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      loginAttemptData.failureReason = 'invalid_password';
      loginAttemptData.userId = user.id;
      await prisma.loginAttempt.create({ data: loginAttemptData });
      
      // Increment failure tracking
      if (isRedisConnected()) {
        try {
          const rateLimiter = await createRateLimiter();
          const failureCount = await rateLimiter.incrementLoginFailures(user.id);
          
          // Update database failure count
          await prisma.user.update({
            where: { id: user.id },
            data: {
              loginFailureCount: failureCount,
              lastLoginFailureAt: now
            }
          });
          
          // Lock account if max failures reached
          if (failureCount >= env.loginMaxFailures) {
            const lockDurationMs = env.loginLockoutDurationSec * 1000;
            await rateLimiter.lockUser(user.id, lockDurationMs, 'max_failures');
            
            // Also update database
            await prisma.user.update({
              where: { id: user.id },
              data: {
                lockedUntil: new Date(now.getTime() + lockDurationMs),
                lockReason: 'max_failures'
              }
            });
            
            audit('user_locked', {
              ip,
              userId: user.id,
              email,
              reason: 'max_failures',
              failureCount,
              lockDuration: env.loginLockoutDurationSec
            });
          }
        } catch (redisError) {
          console.error('Redis error during failure tracking:', redisError);
        }
      }
      
      audit('login_fail', { ip, email, userId: user.id, reason: 'invalid_password' });
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    // Successful login - reset failure counters
    loginAttemptData.success = true;
    loginAttemptData.userId = user.id;
    await prisma.loginAttempt.create({ data: loginAttemptData });

    if (isRedisConnected()) {
      try {
        const rateLimiter = await createRateLimiter();
        await rateLimiter.resetLoginFailures(user.id);
        await rateLimiter.unlockUser(user.id);
      } catch (redisError) {
        console.error('Redis error during success cleanup:', redisError);
      }
    }

    // Reset database failure tracking
    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginFailureCount: 0,
        lastLoginFailureAt: null,
        lockedUntil: null,
        lockReason: null
      }
    });

    // Store user info in session for OIDC flow
    req.session = req.session || {};
    req.session.userId = user.id;
    req.session.tenantId = user.tenantId;
    req.session.email = user.email;
    req.session.roles = user.roles;
    
    audit('login_success', { 
      ip, 
      email, 
      userId: user.id, 
      tenantId: user.tenantId,
      captchaUsed: !!captcha
    });
    
    res.json({ ok: true });
  } catch (error: any) {
    audit('login_error', { ip, email, error: error.message });
    res.status(500).json({ error: 'server_error' });
  }
}

// New endpoint to check if CAPTCHA is required for a user
export async function captchaStatus(req: Request, res: Response) {
  const { email } = req.query;
  const ip = req.ip || 'unknown';

  try {
    if (!email || typeof email !== 'string') {
      return res.json({
        captcha_required: false,
        captcha_site_key: null,
        threshold: env.loginCaptchaThreshold
      });
    }

    let captchaRequired = false;
    
    if (env.captchaEnabled && isRedisConnected()) {
      try {
        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true }
        });

        if (user) {
          const rateLimiter = await createRateLimiter();
          const failureCount = await rateLimiter.getLoginFailureCount(user.id);
          captchaRequired = failureCount >= env.loginCaptchaThreshold;
        }
      } catch (redisError) {
        console.error('Redis error during CAPTCHA status check:', redisError);
      }
    }

    audit('captcha_status_check', {
      ip,
      email,
      captchaRequired
    });

    res.json({
      captcha_required: captchaRequired,
      captcha_site_key: env.captchaEnabled ? env.captchaSiteKey : null,
      threshold: env.loginCaptchaThreshold
    });
  } catch (error: any) {
    console.error('CAPTCHA status error:', error);
    audit('captcha_status_error', {
      ip,
      email: email as string,
      error: error.message
    });
    
    res.json({
      captcha_required: false,
      captcha_site_key: null,
      threshold: env.loginCaptchaThreshold
    });
  }
}

export async function logout(req: Request, res: Response) {
  try {
    const session = req.session;
    const userId = session?.userId;

    if (userId) {
      // Get all active refresh tokens for this user
      const userTokens = await prisma.refreshToken.findMany({
        where: {
          subjectUserId: userId,
          status: 'active'
        },
        select: { familyId: true }
      }) as RefreshFamilyRow[];

      // Revoke all refresh token families for this user (using service layer)
      const uniqueFamilies: string[] = Array.from(
        new Set(userTokens.map((t: RefreshFamilyRow) => t.familyId).filter(Boolean))
      );

      for (const familyId of uniqueFamilies) {
        await revokeFamily(familyId, 'logout');
      }

      audit('logout', {
        ip: req.ip,
        userId,
        revokedFamilies: uniqueFamilies.length
      });
    }

    // Clear session/cookies
    req.session = null;

    res.json({ ok: true });
  } catch (err) {
    const error = err as Error;
    audit('logout_error', { ip: req.ip, error: (error && error.message) || String(err) });
    res.status(500).json({ error: 'server_error' });
  }
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body;

  // Always return success to prevent enumeration
  const sendSuccessResponse = () => res.json({ ok: true });

  try {
    if (!email) {
      audit('reset_invalid_request', { ip: req.ip });
      return sendSuccessResponse();
    }

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user || !user.emailVerifiedAt) {
      // User doesn't exist or not verified - audit but still return success
      audit('reset_requested_nonexistent', { ip: req.ip, email });
      return sendSuccessResponse();
    }

    await identityService.issuePasswordReset(user.id, email, user.tenantId);

    audit('reset_requested', { 
      ip: req.ip, 
      email, 
      userId: user.id 
    });

    return sendSuccessResponse();
  } catch (error: any) {
    audit('reset_error', { ip: req.ip, email, error: error.message });
    return sendSuccessResponse(); // Still return success to prevent info disclosure
  }
}

export async function resetPassword(req: Request, res: Response) {
  const { selector, token, password } = req.body;

  try {
    if (!selector || !token || !password) {
      audit('password_reset_invalid_request', { ip: req.ip });
      return res.status(400).json({ error: 'invalid_request' });
    }

    const user = await identityService.consumePasswordReset(selector, token, password);

    audit('password_reset', { 
      ip: req.ip, 
      userId: user.id 
    });

    res.json({ ok: true });
  } catch (error: any) {
    const errorMap: Record<string, { status: number; error: string }> = {
      'invalid_code': { status: 400, error: 'invalid_code' },
      'code_already_used': { status: 400, error: 'code_already_used' },
      'code_expired': { status: 400, error: 'code_expired' },
      'too_many_attempts': { status: 429, error: 'too_many_attempts' }
    };

    const errorInfo = errorMap[error.message] || { status: 500, error: 'server_error' };
    
    audit('password_reset_failed', { 
      ip: req.ip, 
      reason: error.message 
    });

    res.status(errorInfo.status).json({ error: errorInfo.error });
  }
}

export async function getProfile(req: Request, res: Response) {
  try {
    const userId = (req as any).claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        subdomain: true,
        phone: true,
        address: true,
        storeType: true,
        emailVerifiedAt: true,
        createdAt: true,
        roles: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    res.json(user);
  } catch (error: any) {
    audit('profile_fetch_error', { 
      ip: req.ip, 
      userId: (req as any).claims?.sub, 
      error: error.message 
    });
    res.status(500).json({ error: 'server_error' });
  }
}

export async function updateProfile(req: Request, res: Response) {
  try {
    const userId = (req as any).claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const { email, subdomain, phone, address } = req.body;
    
    const updatedUser = await identityService.updateUserProfile(userId, {
      email,
      subdomain,
      phone,
      address
    });

    audit('profile_updated', { 
      ip: req.ip, 
      userId,
      changes: { email, subdomain, phone: !!phone, address: !!address }
    });

    // Return updated profile (excluding sensitive fields)
    const profile = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        subdomain: true,
        phone: true,
        address: true,
        storeType: true,
        emailVerifiedAt: true,
        createdAt: true,
        roles: true
      }
    });

    res.json(profile);
  } catch (error: any) {
    const errorMap: Record<string, { status: number; error: string }> = {
      'email_taken': { status: 409, error: 'email_taken' },
      'subdomain_taken': { status: 409, error: 'subdomain_taken' }
    };

    const errorInfo = errorMap[error.message] || { status: 500, error: 'server_error' };
    
    audit('profile_update_failed', { 
      ip: req.ip, 
      userId: (req as any).claims?.sub,
      reason: error.message 
    });

    res.status(errorInfo.status).json({ error: errorInfo.error });
  }
}

export async function changePassword(req: Request, res: Response) {
  try {
    const userId = (req as any).claims?.sub;
    if (!userId) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      audit('change_password_invalid_request', { ip: req.ip, userId });
      return res.status(400).json({ error: 'invalid_request' });
    }

    await identityService.changePassword(userId, currentPassword, newPassword);

    audit('password_changed', { 
      ip: req.ip, 
      userId 
    });

    res.json({ ok: true });
  } catch (error: any) {
    const errorMap: Record<string, { status: number; error: string }> = {
      'user_not_found': { status: 404, error: 'user_not_found' },
      'invalid_current_password': { status: 400, error: 'invalid_current_password' }
    };

    const errorInfo = errorMap[error.message] || { status: 500, error: 'server_error' };
    
    audit('change_password_failed', { 
      ip: req.ip, 
      userId: (req as any).claims?.sub,
      reason: error.message 
    });

    res.status(errorInfo.status).json({ error: errorInfo.error });
  }
}