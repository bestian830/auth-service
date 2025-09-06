import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../infra/prisma.js';
import { env } from '../config/env.js';
import { getMailer } from './mailer.js';
import { Templates } from './templates.js';
import { audit } from '../middleware/audit.js';
import { revokeFamily, revokeAllUserTokens } from './token.js';
import { encryptShortLived, decryptShortLived, isEncKeyAvailable } from '../utils/crypto.js';

interface CreateUserArgs {
  email: string;
  password: string;
  name?: string;
  phone?: string;
  address?: string;
  organizationName?: string;
}

interface UpdateProfileArgs {
  email?: string;
  name?: string;
  phone?: string;
  address?: string;
}

export class IdentityService {
  private mailer = getMailer();

  /**
   * Validate password strength
   * Requirements: min 8 chars, uppercase, lowercase, digit
   */
  validatePassword(password: string): { valid: boolean; error?: string } {
    if (!password) {
      return { valid: false, error: 'password_required' };
    }

    if (password.length < 8) {
      return { valid: false, error: 'password_too_short' };
    }

    if (password.length > 128) {
      return { valid: false, error: 'password_too_long' };
    }

    // Check for at least one uppercase letter
    if (!/[A-Z]/.test(password)) {
      return { valid: false, error: 'password_needs_uppercase' };
    }

    // Check for at least one lowercase letter
    if (!/[a-z]/.test(password)) {
      return { valid: false, error: 'password_needs_lowercase' };
    }

    // Check for at least one digit
    if (!/\d/.test(password)) {
      return { valid: false, error: 'password_needs_digit' };
    }

    // Common weak passwords
    const weakPasswords = ['password', '12345678', 'qwerty123', 'Password123'];
    if (weakPasswords.includes(password.toLowerCase().replace(/\d/g, ''))) {
      return { valid: false, error: 'password_too_common' };
    }

    return { valid: true };
  }

  async createOrReuseUserForSignup(args: CreateUserArgs) {
    // Validate password strength
    const passwordValidation = this.validatePassword(args.password);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.error);
    }

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
          name: args.name,
          phone: args.phone,
          address: args.address,
        }
      });
      return { user: updatedUser, created: false };
    }

    // Create new user
    const newUser = await prisma.user.create({
      data: {
        email: args.email,
        passwordHash,
        name: args.name,
        phone: args.phone,
        address: args.address,
      }
    });

    // Create organization if provided
    if (args.organizationName && args.organizationName.trim()) {
      const organization = await prisma.organization.create({
        data: {
          name: args.organizationName.trim(),
          ownerId: newUser.id,
          description: `${args.organizationName.trim()} organization`
        }
      });

      // Add user as OWNER to the organization
      await prisma.userRole.create({
        data: {
          userId: newUser.id,
          organizationId: organization.id,
          role: 'OWNER'
        }
      });
    }

    return { user: newUser, created: true };
  }

  // v0.2.7: short-lived encrypted code reuse
  async issueEmailVerification(userId: string, purpose: string, sentTo: string) {
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
    let willResend = true;
    let reused = false;

    if (existingVerification) {
      // Reuse existing code - try to decrypt same verification code
      selector = existingVerification.selector;
      let code: string | null = null;
      
      if (existingVerification.tokenEnc && existingVerification.iv && existingVerification.tag && isEncKeyAvailable()) {
        try {
          code = decryptShortLived(existingVerification.tokenEnc, existingVerification.iv, existingVerification.tag);
        } catch (err) {
          // Decryption failed, can't reuse
          console.warn('Failed to decrypt existing verification code:', err);
        }
      }
      
      if (code) {
        token = code;
        willResend = true;
        
        audit('verification_reuse_resend', {
          userId,
          selector: existingVerification.selector,
          purpose,
          sentTo,
          resendCount: existingVerification.resendCount + 1
        });
      } else {
        token = '******'; // Can't decrypt - show already sent
        willResend = false;
        
        // 复用窗口内无法解密原码，仅返回 OK 不发信
        audit('verification_reuse_nosend', {
          userId,
          selector: existingVerification.selector,
          purpose,
          sentTo,
          resendCount: existingVerification.resendCount + 1
        });
      }
      
      // Update resend tracking
      await prisma.emailVerification.update({
        where: { id: existingVerification.id },
        data: {
          resendCount: existingVerification.resendCount + 1,
          lastSentAt: now
        }
      });
      
      reused = true;
    } else {
      // Generate new selector and 6-digit numeric token
      selector = crypto.randomBytes(12).toString('hex');
      // Generate 6-digit numeric code (100000-999999)
      const numericCode = Math.floor(Math.random() * 900000) + 100000;
      token = numericCode.toString();
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const expiresAt = new Date(Date.now() + env.signupCodeTtlSec * 1000);
      const reuseWindowExpiresAt = new Date(Date.now() + env.verificationCodeReuseWindowSec * 1000);

      // v0.2.7: encrypt token for reuse if key available
      let encData: { enc: string; iv: string; tag: string } | null = null;
      if (isEncKeyAvailable()) {
        try {
          encData = encryptShortLived(token);
        } catch (err) {
          console.warn('Failed to encrypt verification code:', err);
        }
      }

      // Store in database
      await prisma.emailVerification.create({
        data: {
          userId,
          selector,
          tokenHash,
          purpose,
          sentTo,
          expiresAt,
          reuseWindowExpiresAt,
          lastSentAt: now,
          resendCount: 0,
          tokenEnc: encData?.enc || null,
          iv: encData?.iv || null,
          tag: encData?.tag || null
        }
      });
      
      audit('email_verification_created', {
        userId,
        selector,
        purpose,
        sentTo,
        expiresAt: expiresAt.toISOString(),
        reuseWindowExpiresAt: reuseWindowExpiresAt.toISOString(),
        encrypted: !!encData
      });
    }

    // Send email if willing to resend
    if (willResend) {
      const template = purpose === 'change_email' 
        ? Templates.changeEmail 
        : Templates.signupCode;
      
      // Calculate actual remaining minutes from expiry time
      let expiresAt: Date;
      if (reused && existingVerification) {
        expiresAt = existingVerification.expiresAt;
      } else {
        expiresAt = new Date(Date.now() + env.signupCodeTtlSec * 1000);
      }
      const remainingSec = Math.max(0, (expiresAt.getTime() - Date.now()) / 1000);
      const remainingMinutes = Math.max(1, Math.ceil(remainingSec / 60));
      
      const { subject, html } = template({
        brand: 'Tymoe',
        email: sentTo,
        selector,
        token,
        minutes: remainingMinutes
      });

      await this.mailer.send(sentTo, subject, html);
    }

    return { 
      selector, 
      token: willResend ? token : '******',
      reused,
      willResend,
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
      }),
      // v0.2.7: 批量失效同类未使用的验证码（避免旧码误用）
      prisma.emailVerification.updateMany({
        where: { 
          userId: verification.userId,
          purpose: verification.purpose,
          consumedAt: null,
          id: { not: verification.id } // 排除当前已消费的
        },
        data: { 
          consumedAt: new Date(),
          attempts: 999, // 标记为已清理
          tokenEnc: null, // 清除加密密文
          iv: null,
          tag: null
        }
      })
    ]);

    audit('email_verification_batch_sweep', {
      userId: verification.userId,
      purpose: verification.purpose,
      consumedSelector: verification.selector
    });

    return verification.user;
  }

  // v0.2.7: short-lived encrypted code reuse  
  async issuePasswordReset(userId: string, sentTo: string) {
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
    let willResend = true;
    let reused = false;

    if (existingReset) {
      // Reuse existing code - try to decrypt same reset code
      selector = existingReset.selector;
      let code: string | null = null;
      
      if (existingReset.tokenEnc && existingReset.iv && existingReset.tag && isEncKeyAvailable()) {
        try {
          code = decryptShortLived(existingReset.tokenEnc, existingReset.iv, existingReset.tag);
        } catch (err) {
          console.warn('Failed to decrypt existing reset code:', err);
        }
      }
      
      if (code) {
        token = code;
        willResend = true;
        
        audit('verification_reuse_resend', {
          userId,
          selector: existingReset.selector,
          purpose: 'password_reset',
          sentTo,
          resendCount: existingReset.resendCount + 1
        });
      } else {
        token = '******';
        willResend = false;
        
        // 复用窗口内无法解密原码，仅返回 OK 不发信
        audit('verification_reuse_nosend', {
          userId,
          selector: existingReset.selector,
          purpose: 'password_reset',
          sentTo,
          resendCount: existingReset.resendCount + 1
        });
      }
      
      // Update resend tracking
      await prisma.passwordReset.update({
        where: { id: existingReset.id },
        data: {
          resendCount: existingReset.resendCount + 1,
          lastSentAt: now
        }
      });
      
      reused = true;
    } else {
      // Generate new selector and 6-digit numeric token
      selector = crypto.randomBytes(12).toString('hex');
      // Generate 6-digit numeric code (100000-999999)
      const numericCode = Math.floor(Math.random() * 900000) + 100000;
      token = numericCode.toString();
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const expiresAt = new Date(Date.now() + env.resetCodeTtlSec * 1000);
      const reuseWindowExpiresAt = new Date(Date.now() + env.verificationCodeReuseWindowSec * 1000);

      // v0.2.7: encrypt token for reuse if key available
      let encData: { enc: string; iv: string; tag: string } | null = null;
      if (isEncKeyAvailable()) {
        try {
          encData = encryptShortLived(token);
        } catch (err) {
          console.warn('Failed to encrypt reset code:', err);
        }
      }

      // Store in database
      await prisma.passwordReset.create({
        data: {
          userId,
          selector,
          tokenHash,
          sentTo,
          expiresAt,
          reuseWindowExpiresAt,
          lastSentAt: now,
          resendCount: 0,
          tokenEnc: encData?.enc || null,
          iv: encData?.iv || null,
          tag: encData?.tag || null
        }
      });
      
      audit('password_reset_created', {
        userId,
        selector,
        sentTo,
        expiresAt: expiresAt.toISOString(),
        reuseWindowExpiresAt: reuseWindowExpiresAt.toISOString(),
        encrypted: !!encData
      });
    }

    // Send email if willing to resend
    if (willResend) {
      // Calculate actual remaining minutes from expiry time
      let expiresAt: Date;
      if (reused && existingReset) {
        expiresAt = existingReset.expiresAt;
      } else {
        expiresAt = new Date(Date.now() + env.resetCodeTtlSec * 1000);
      }
      const remainingSec = Math.max(0, (expiresAt.getTime() - Date.now()) / 1000);
      const remainingMinutes = Math.max(1, Math.ceil(remainingSec / 60));
      
      const { subject, html } = Templates.resetCode({
        brand: 'Tymoe',
        email: sentTo,
        selector,
        token,
        minutes: remainingMinutes
      });

      await this.mailer.send(sentTo, subject, html);
    }

    return { 
      selector, 
      token: willResend ? token : '******',
      reused,
      willResend,
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

    // Mark reset as consumed, update password, and batch sweep other resets
    await prisma.$transaction([
      prisma.passwordReset.update({
        where: { id: reset.id },
        data: { consumedAt: new Date() }
      }),
      prisma.user.update({
        where: { id: reset.userId },
        data: { passwordHash }
      }),
      // v0.2.7: 批量失效同用户其他未使用的重置码（避免旧码误用）
      prisma.passwordReset.updateMany({
        where: { 
          userId: reset.userId,
          consumedAt: null,
          id: { not: reset.id } // 排除当前已消费的
        },
        data: { 
          consumedAt: new Date(),
          attempts: 999, // 标记为已清理
          tokenEnc: null, // 清除加密密文
          iv: null,
          tag: null
        }
      })
    ]);

    audit('password_reset_batch_sweep', {
      userId: reset.userId,
      consumedSelector: reset.selector
    });

    // Revoke all refresh token families for this user
    await this.revokeAllUserTokens(reset.userId, 'password_reset');

    return reset.user;
  }

  async updateUserProfile(userId: string, patch: UpdateProfileArgs) {
    const updates: any = {};

    // Handle regular fields
    if (patch.phone !== undefined) updates.phone = patch.phone;
    if (patch.address !== undefined) updates.address = patch.address;

    // Note: subdomain functionality removed in simplified architecture

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
        await this.issueEmailVerification(userId, 'change_email', patch.email);
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

    // Validate new password strength
    const passwordValidation = this.validatePassword(newPassword);
    if (!passwordValidation.valid) {
      throw new Error(passwordValidation.error);
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