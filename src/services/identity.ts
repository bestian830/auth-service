import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../infra/prisma.js';
import { env } from '../config/env.js';
import { getMailer } from './mailer.js';
import { Templates } from './templates.js';
import { audit } from '../middleware/audit.js';
import { revokeFamily, revokeAllUserTokens } from './token.js';

interface CreateUserArgs {
  email: string;
  password: string;
  tenantId: string;
  subdomain?: string;
  phone?: string;
  address?: string;
}

interface UpdateProfileArgs {
  email?: string;
  subdomain?: string;
  phone?: string;
  address?: string;
}

export class IdentityService {
  private mailer = getMailer();

  async createOrReuseUserForSignup(args: CreateUserArgs) {
    const existingUser = await prisma.user.findUnique({
      where: { email: args.email }
    });

    if (existingUser && existingUser.emailVerifiedAt) {
      // User exists and is already verified - don't create duplicate
      return { user: existingUser, created: false };
    }

    const passwordHash = await bcrypt.hash(args.password, env.passwordHashRounds);

    if (existingUser && !existingUser.emailVerifiedAt) {
      // Update existing unverified user
      const updatedUser = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          passwordHash,
          tenantId: args.tenantId,
          subdomain: args.subdomain,
          phone: args.phone,
          address: args.address,
        }
      });
      return { user: updatedUser, created: false };
    }

    // Check subdomain uniqueness if provided
    if (args.subdomain) {
      const existingSubdomain = await prisma.user.findUnique({
        where: { subdomain: args.subdomain.toLowerCase() }
      });
      if (existingSubdomain) {
        throw new Error('subdomain_taken');
      }
    }

    // Create new user
    const newUser = await prisma.user.create({
      data: {
        email: args.email,
        passwordHash,
        tenantId: args.tenantId,
        subdomain: args.subdomain?.toLowerCase(),
        phone: args.phone,
        address: args.address,
      }
    });

    return { user: newUser, created: true };
  }

  async issueEmailVerification(userId: string, purpose: string, sentTo: string, tenantId: string) {
    const now = new Date();
    const reuseWindowStart = new Date(now.getTime() - env.verificationCodeReuseWindowSec * 1000);
    
    // Check for existing verification within 10-minute reuse window
    const existingVerification = await prisma.emailVerification.findFirst({
      where: {
        userId,
        purpose,
        sentTo,
        consumedAt: null, // Not consumed
        expiresAt: { gt: now }, // Not expired
        reuseWindowExpiresAt: { gt: now }, // Still within reuse window
        lastSentAt: { gte: reuseWindowStart }
      },
      orderBy: { createdAt: 'desc' }
    });

    let selector: string;
    let token: string;
    let shouldSendEmail = true;

    if (existingVerification) {
      // Reuse existing code - regenerate token from stored hash for response
      selector = existingVerification.selector;
      // For security, we can't retrieve the original token from hash
      // But we need to provide a way for the client to know the code was sent
      // We'll generate a new token but keep the same selector and hash
      // Actually, let's update the approach: we'll increment resend count and reuse
      token = '******'; // Placeholder - code was already sent
      
      // Update resend tracking
      await prisma.emailVerification.update({
        where: { id: existingVerification.id },
        data: {
          resendCount: existingVerification.resendCount + 1,
          lastSentAt: now
        }
      });
      
      shouldSendEmail = false; // Don't send email for reused codes
      
      audit('email_verification_reused', {
        userId,
        selector: existingVerification.selector,
        purpose,
        sentTo,
        resendCount: existingVerification.resendCount + 1,
        originalCreatedAt: existingVerification.createdAt
      });
    } else {
      // Generate new selector and token
      selector = crypto.randomBytes(12).toString('hex');
      token = crypto.randomBytes(16).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const expiresAt = new Date(Date.now() + env.signupCodeTtlSec * 1000);
      const reuseWindowExpiresAt = new Date(Date.now() + env.verificationCodeReuseWindowSec * 1000);

      // Store in database
      await prisma.emailVerification.create({
        data: {
          userId,
          tenantId,
          selector,
          tokenHash,
          purpose,
          sentTo,
          expiresAt,
          reuseWindowExpiresAt,
          lastSentAt: now,
          resendCount: 0
        }
      });
      
      audit('email_verification_created', {
        userId,
        selector,
        purpose,
        sentTo,
        expiresAt: expiresAt.toISOString(),
        reuseWindowExpiresAt: reuseWindowExpiresAt.toISOString()
      });
    }

    // Send email only if not reusing existing code
    if (shouldSendEmail) {
      const template = purpose === 'change_email' 
        ? Templates.changeEmail 
        : Templates.signupCode;
      
      const { subject, html } = template({
        brand: 'Tymoe',
        email: sentTo,
        selector,
        token,
        minutes: Math.floor(env.signupCodeTtlSec / 60)
      });

      await this.mailer.send(sentTo, subject, html);
    }

    return { 
      selector, 
      token: shouldSendEmail ? token : '******', // Hide token for reused codes
      reused: !shouldSendEmail,
      reuseWindowSeconds: env.verificationCodeReuseWindowSec
    };
  }

  async consumeEmailVerification(selector: string, token: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const verification = await prisma.emailVerification.findUnique({
      where: { selector },
      include: { user: true }
    });

    if (!verification) {
      throw new Error('invalid_code');
    }

    if (verification.consumedAt) {
      throw new Error('code_already_used');
    }

    if (verification.expiresAt < new Date()) {
      throw new Error('code_expired');
    }

    if (verification.attempts >= env.codeAttemptMax) {
      throw new Error('too_many_attempts');
    }

    if (verification.tokenHash !== tokenHash) {
      // Increment attempts for invalid token
      await prisma.emailVerification.update({
        where: { id: verification.id },
        data: { attempts: verification.attempts + 1 }
      });
      throw new Error('invalid_code');
    }

    // Mark as consumed and verify user email
    await prisma.$transaction([
      prisma.emailVerification.update({
        where: { id: verification.id },
        data: { consumedAt: new Date() }
      }),
      prisma.user.update({
        where: { id: verification.userId },
        data: { emailVerifiedAt: new Date() }
      })
    ]);

    return verification.user;
  }

  async issuePasswordReset(userId: string, sentTo: string, tenantId: string) {
    const now = new Date();
    const reuseWindowStart = new Date(now.getTime() - env.verificationCodeReuseWindowSec * 1000);
    
    // Check for existing password reset within 10-minute reuse window
    const existingReset = await prisma.passwordReset.findFirst({
      where: {
        userId,
        sentTo,
        consumedAt: null, // Not consumed
        expiresAt: { gt: now }, // Not expired
        reuseWindowExpiresAt: { gt: now }, // Still within reuse window
        lastSentAt: { gte: reuseWindowStart }
      },
      orderBy: { createdAt: 'desc' }
    });

    let selector: string;
    let token: string;
    let shouldSendEmail = true;

    if (existingReset) {
      // Reuse existing code
      selector = existingReset.selector;
      token = '******'; // Placeholder - code was already sent
      
      // Update resend tracking
      await prisma.passwordReset.update({
        where: { id: existingReset.id },
        data: {
          resendCount: existingReset.resendCount + 1,
          lastSentAt: now
        }
      });
      
      shouldSendEmail = false; // Don't send email for reused codes
      
      audit('password_reset_reused', {
        userId,
        selector: existingReset.selector,
        sentTo,
        resendCount: existingReset.resendCount + 1,
        originalCreatedAt: existingReset.createdAt
      });
    } else {
      // Generate new selector and token
      selector = crypto.randomBytes(12).toString('hex');
      token = crypto.randomBytes(16).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const expiresAt = new Date(Date.now() + env.resetCodeTtlSec * 1000);
      const reuseWindowExpiresAt = new Date(Date.now() + env.verificationCodeReuseWindowSec * 1000);

      // Store in database
      await prisma.passwordReset.create({
        data: {
          userId,
          tenantId,
          selector,
          tokenHash,
          sentTo,
          expiresAt,
          reuseWindowExpiresAt,
          lastSentAt: now,
          resendCount: 0
        }
      });
      
      audit('password_reset_created', {
        userId,
        selector,
        sentTo,
        expiresAt: expiresAt.toISOString(),
        reuseWindowExpiresAt: reuseWindowExpiresAt.toISOString()
      });
    }

    // Send email only if not reusing existing code
    if (shouldSendEmail) {
      const { subject, html } = Templates.resetCode({
        brand: 'Tymoe',
        email: sentTo,
        selector,
        token,
        minutes: Math.floor(env.resetCodeTtlSec / 60)
      });

      await this.mailer.send(sentTo, subject, html);
    }

    return { 
      selector, 
      token: shouldSendEmail ? token : '******', // Hide token for reused codes
      reused: !shouldSendEmail,
      reuseWindowSeconds: env.verificationCodeReuseWindowSec
    };
  }

  async consumePasswordReset(selector: string, token: string, newPassword: string) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const reset = await prisma.passwordReset.findUnique({
      where: { selector },
      include: { user: true }
    });

    if (!reset) {
      throw new Error('invalid_code');
    }

    if (reset.consumedAt) {
      throw new Error('code_already_used');
    }

    if (reset.expiresAt < new Date()) {
      throw new Error('code_expired');
    }

    if (reset.attempts >= env.codeAttemptMax) {
      throw new Error('too_many_attempts');
    }

    if (reset.tokenHash !== tokenHash) {
      // Increment attempts for invalid token
      await prisma.passwordReset.update({
        where: { id: reset.id },
        data: { attempts: reset.attempts + 1 }
      });
      throw new Error('invalid_code');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, env.passwordHashRounds);

    // Mark reset as consumed, update password, and revoke all refresh tokens
    await prisma.$transaction([
      prisma.passwordReset.update({
        where: { id: reset.id },
        data: { consumedAt: new Date() }
      }),
      prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash }
      })
    ]);

    // Revoke all refresh token families for this user
    await this.revokeAllUserTokens(reset.userId, 'password_reset');

    return reset.user;
  }

  async updateUserProfile(userId: string, patch: UpdateProfileArgs) {
    const updates: any = {};

    // Handle regular fields
    if (patch.phone !== undefined) updates.phone = patch.phone;
    if (patch.address !== undefined) updates.address = patch.address;

    // Handle subdomain with uniqueness check
    if (patch.subdomain !== undefined) {
      const normalized = patch.subdomain?.toLowerCase();
      if (normalized) {
        const existing = await prisma.user.findFirst({
          where: {
            subdomain: normalized,
            id: { not: userId }
          }
        });
        if (existing) {
          throw new Error('subdomain_taken');
        }
      }
      updates.subdomain = normalized;
    }

    // Handle email change (requires verification)
    if (patch.email !== undefined) {
      const existing = await prisma.user.findFirst({
        where: {
          email: patch.email,
          id: { not: userId }
        }
      });
      if (existing) {
        throw new Error('email_taken');
      }

      // For email changes, issue verification but don't update immediately
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user) {
        await this.issueEmailVerification(userId, 'change_email', patch.email, user.tenantId);
      }
      // Don't include email in updates - it will be updated when verification is consumed
    }

    // Apply other updates
    if (Object.keys(updates).length > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: updates
      });
    }

    return await prisma.user.findUnique({ where: { id: userId } });
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      throw new Error('user_not_found');
    }

    // Verify current password
    const isValidCurrent = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValidCurrent) {
      throw new Error('invalid_current_password');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, env.passwordHashRounds);

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    });

    // Revoke all refresh token families for security
    await this.revokeAllUserTokens(userId, 'password_change');

    return user;
  }

  private async revokeAllUserTokens(userId: string, reason: string) {
    // Use the centralized token service function for better consistency and auditing
    const result = await revokeAllUserTokens(userId, reason);
    
    audit('user_tokens_revoked', {
      userId,
      reason,
      revokedFamilies: result.revokedFamilies,
      revokedTokens: result.revokedTokens
    });

    return result;
  }
}