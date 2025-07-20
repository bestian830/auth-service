/**
 * Account Service Module
 * Handles core business logic for account registration, login, email verification, password reset
 * 
 * Implements functions according to ACCOUNT_DESIGN.md:
 * 1. registerAccount - Register new account with email verification
 * 2. verifyEmail - Verify email verification link
 * 3. loginAccount - Login account and generate tokens
 * 4. initiatePasswordReset - Initiate password reset process
 * 5. resetPassword - Reset password with token
 */

import prisma from '../config/database';
import { env } from '../config/env';
import { sendEmail } from '../config/email';
import { 
  generateEmailVerificationToken, 
  verifyEmailVerificationToken,
  generateTokenPair,
  generatePasswordResetToken,
  verifyPasswordResetToken
} from '../config/jwt';
import { hashPassword, comparePassword } from '../utils/password';
import { addTokenToBlacklist } from '../utils/token-blacklist';
import { logger } from '../utils/logger';
import validator from 'validator';
import { PugEmailTemplateRenderer } from '../utils/email-template-renderer';
import type { VerificationEmailData, ResetPasswordEmailData } from '../types/email';
import jwt from 'jsonwebtoken';

// Import types and constants
import type {
  RegisterAccountData,
  VerifyEmailData,
  LoginAccountData,
  InitiatePasswordResetData,
  ResetPasswordData,
  LoginResponse,
  RegisterSuccessResponse
} from '../types/account';

import {
  ACCOUNT_CONFIG,
  ERROR_MESSAGES,
  SUBDOMAIN_RULES,
  LOG_EVENTS
} from '../constants/account';
import { JWT_CONFIG } from '../constants/jwt';

// ================================
// Helper Functions
// ================================

// Initialize email template renderer
const emailRenderer = new PugEmailTemplateRenderer();

/**
 * Validate email format using validator
 */
const validateEmail = (email: string): boolean => {
  return validator.isEmail(email);
};

/**
 * Validate subdomain format
 */
const validateSubdomain = (subdomain: string): boolean => {
  const normalized = subdomain.toLowerCase();
  
  // Check length
  if (normalized.length < SUBDOMAIN_RULES.MIN_LENGTH || 
      normalized.length > SUBDOMAIN_RULES.MAX_LENGTH) {
    return false;
  }
  
  // Check format
  if (!SUBDOMAIN_RULES.PATTERN.test(normalized)) {
    return false;
  }
  
  // Check reserved names
  if (SUBDOMAIN_RULES.RESERVED_NAMES.includes(normalized as any)) {
    return false;
  }
  
  return true;
};

/**
 * Check if email already exists
 */
const checkEmailExists = async (email: string): Promise<boolean> => {
  const existingTenant = await prisma.tenant.findUnique({
    where: { email: email.toLowerCase() }
  });
  return !!existingTenant;
};

/**
 * Check if subdomain already exists
 */
const checkSubdomainExists = async (subdomain: string): Promise<boolean> => {
  const existingTenant = await prisma.tenant.findUnique({
    where: { subdomain: subdomain.toLowerCase() }
  });
  return !!existingTenant;
};



// ================================
// Main Business Functions
// ================================

/**
 * 注册新账号（带邮箱验证）
 * 
 * Input:
 * - email: 用户邮箱地址
 * - password: 用户密码（明文）
 * - storeName: 商店名称
 * - subdomain: 子域名
 * 
 * Output:
 * - 成功: { success: true, account: Account }
 * - 失败: 抛出异常
 * 
 * 执行逻辑：
 * 1. 使用 validator.isEmail 校验邮箱格式
 * 2. 判断邮箱和子域名是否重复（通过 repository 检查）
 * 3. 哈希密码并写入账户表
 * 4. 创建初始租户记录、默认订阅记录
 * 5. 生成邮箱验证 Token，发送验证邮件（使用 verification.pug 模板）
 */
export const registerAccount = async (
  data: RegisterAccountData
): Promise<RegisterSuccessResponse> => {
  try {
    const { email, password, storeName, subdomain } = data;
    
    // 1. Validate email format using validator
    const normalizedEmail = email.toLowerCase();
    if (!validateEmail(normalizedEmail)) {
      throw new Error(ERROR_MESSAGES.INVALID_EMAIL_FORMAT);
    }
    
    // 2. Validate subdomain format
    const normalizedSubdomain = subdomain.toLowerCase();
    if (!validateSubdomain(normalizedSubdomain)) {
      throw new Error(ERROR_MESSAGES.INVALID_SUBDOMAIN_FORMAT);
    }
    
    // 3. Check password length
    if (password.length < ACCOUNT_CONFIG.MIN_PASSWORD_LENGTH) {
      throw new Error(ERROR_MESSAGES.PASSWORD_TOO_SHORT);
    }
    
    // 4. Check if email already exists
    if (await checkEmailExists(normalizedEmail)) {
      logger.warn('Registration attempted with existing email', { email: normalizedEmail });
      throw new Error(ERROR_MESSAGES.EMAIL_ALREADY_REGISTERED);
    }
    
    // 5. Check if subdomain already exists
    if (await checkSubdomainExists(normalizedSubdomain)) {
      logger.warn('Registration attempted with existing subdomain', { subdomain: normalizedSubdomain });
      throw new Error(ERROR_MESSAGES.SUBDOMAIN_ALREADY_EXISTS);
    }
    
    // 6. Hash password
    const hashedPassword = await hashPassword(password);
    
    // 7. Create tenant (no subscription created during registration)
    const tenant = await prisma.tenant.create({
      data: {
        email: normalizedEmail,
        password_hash: hashedPassword,
        store_name: storeName,
        subdomain: normalizedSubdomain,
        phone: '',  // Required field, temporarily empty
        email_verified_at: null,
        created_at: new Date(),
        updated_at: new Date()
      }
    });
    
    // 8. Generate email verification token
    const verificationToken = generateEmailVerificationToken(normalizedEmail, tenant.id);
    
    // 9. Send verification email using pug template
    try {
      const verificationUrl = `${env.email.baseUrl}${env.email.verificationPath}?token=${verificationToken}`;
      
      const emailData: VerificationEmailData = {
        companyName: env.email.fromName,
        verificationUrl
      };
      
      const htmlContent = emailRenderer.renderHtml('verification', emailData);
      const textContent = emailRenderer.renderText('verification', emailData);
      
      await sendEmail(normalizedEmail, 'Verify Your Email Address', htmlContent, textContent);
    } catch (error) {
      logger.error('Verification email send failed', { email: normalizedEmail, error });
      // Registration success but email send failed, don't treat as overall failure
    }
    
    logger.info('Account registration successful', { 
      tenantId: tenant.id, 
      email: normalizedEmail,
      subdomain: normalizedSubdomain,
      event: LOG_EVENTS.ACCOUNT_REGISTRATION 
    });
    
    return { 
      success: true, 
      account: {
        id: tenant.id,
        email: normalizedEmail,
        storeName,
        subdomain: normalizedSubdomain,
        emailVerified: false
      }
    };
    
  } catch (error) {
    logger.error('Account registration failed', { error, data });
    throw error;
  }
};

/**
 * 验证邮箱验证链接
 * 
 * Input:
 * - token: 邮箱验证JWT token字符串
 * 
 * Output:
 * - 成功: { success: true }
 * - 失败: 抛出异常
 * 
 * 执行逻辑：
 * 1. 使用 JWT 工具验证 token 是否合法，是否类型为 email_verification
 * 2. 通过 token 中的 email 和 tenantId 更新数据库中邮箱验证状态为 true
 */
export const verifyEmail = async (
  data: VerifyEmailData
): Promise<{ success: true }> => {
  try {
    const { token } = data;
    
    // 1. Verify token
    let tokenPayload: { email: string, tenantId: string };
    try {
      tokenPayload = await verifyEmailVerificationToken(token);
    } catch (error) {
      logger.warn('Email verification token validation failed', { token, error });
      throw new Error(ERROR_MESSAGES.INVALID_TOKEN);
    }
    
    // 2. Find tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tokenPayload.tenantId }
    });
    
    if (!tenant) {
      logger.warn('Tenant not found for email verification', { tenantId: tokenPayload.tenantId });
      throw new Error(ERROR_MESSAGES.TENANT_NOT_FOUND);
    }
    
    // 3. Check email match
    if (tenant.email !== tokenPayload.email) {
      logger.warn('Email mismatch in verification token', { 
        tenantEmail: tenant.email, 
        tokenEmail: tokenPayload.email 
      });
      throw new Error(ERROR_MESSAGES.INVALID_TOKEN);
    }
    
    // 4. Update email verification status
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { 
        email_verified_at: new Date(),
        updated_at: new Date()
      }
    });
    
    logger.info('Email verification successful', { 
      tenantId: tenant.id, 
      email: tenant.email,
      event: LOG_EVENTS.EMAIL_VERIFICATION 
    });
    
    return { success: true };
    
  } catch (error) {
    logger.error('Email verification failed', { error, data });
    throw error;
  }
};

/**
 * 登录账号
 * 
 * Input:
 * - email: 用户邮箱地址
 * - password: 用户密码（明文）
 * 
 * Output:
 * - 成功: { accessToken, refreshToken, expiresIn }
 * - 失败: 抛出异常
 * 
 * 执行逻辑：
 * 1. 使用 validator.isEmail 校验邮箱格式
 * 2. 通过 email 获取账户记录，校验密码哈希
 * 3. 判断账户是否已验证邮箱
 * 4. 创建 sessionId，生成 token pair
 */
export const loginAccount = async (
  data: LoginAccountData
): Promise<LoginResponse> => {
  try {
    const { email, password } = data;
    const normalizedEmail = email.toLowerCase();
    
    // 1. Validate email format using validator
    if (!validateEmail(normalizedEmail)) {
      throw new Error(ERROR_MESSAGES.INVALID_EMAIL_FORMAT);
    }
    
    // 2. Find tenant by email
    const tenant = await prisma.tenant.findUnique({
      where: { email: normalizedEmail }
    });
    
    if (!tenant) {
      throw new Error(ERROR_MESSAGES.ACCOUNT_NOT_FOUND);
    }
    
    // 3. Verify password
    const isPasswordValid = await comparePassword(password, tenant.password_hash);
    if (!isPasswordValid) {
      throw new Error(ERROR_MESSAGES.ACCOUNT_NOT_FOUND);
    }
    
    // 4. Check if email is verified
    if (!tenant.email_verified_at) {
      throw new Error('Email not verified');
    }
    
    // 5. Generate token pair
    const tokenPair = generateTokenPair({
      tenantId: tenant.id,
      email: tenant.email,
      storeName: tenant.store_name,
      subdomain: tenant.subdomain,
      subscriptionStatus: 'NONE', // No subscription created during registration
      subscriptionPlan: 'NONE',
      emailVerified: !!tenant.email_verified_at
    });
    
    logger.info('Account login successful', { 
      tenantId: tenant.id, 
      email: tenant.email,
      event: 'account.login'
    });
    
    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresIn: JWT_CONFIG.EXPIRY_TIMES.ACCESS_TOKEN
    };
    
  } catch (error) {
    logger.error('Account login failed', { error, data });
    throw error;
  }
};

/**
 * 发起密码重置流程
 * 
 * Input:
 * - email: 用户邮箱地址
 * 
 * Output:
 * - 成功: { success: true }
 * - 失败: 抛出异常
 * 
 * 执行逻辑：
 * 1. 使用 validator.isEmail 校验邮箱格式
 * 2. 若用户存在，则生成密码重置 token
 * 3. 通过 reset-password.pug 模板发送重置邮件
 */
export const initiatePasswordReset = async (
  data: InitiatePasswordResetData
): Promise<{ success: true }> => {
  try {
    const { email } = data;
    const normalizedEmail = email.toLowerCase();
    
    // 1. Validate email format using validator
    if (!validateEmail(normalizedEmail)) {
      throw new Error(ERROR_MESSAGES.INVALID_EMAIL_FORMAT);
    }
    
    // 2. Find tenant
    const tenant = await prisma.tenant.findUnique({
      where: { email: normalizedEmail }
    });
    
    if (!tenant) {
      // For security, don't reveal whether account exists
      return { success: true };
    }
    
    // 3. Generate password reset token
    const resetToken = generatePasswordResetToken(normalizedEmail, tenant.id);
    
    // 4. Send reset email using pug template
    try {
      const resetUrl = `${env.email.baseUrl}${env.email.resetPasswordPath}?token=${resetToken}`;
      
      const emailData: ResetPasswordEmailData = {
        companyName: env.email.fromName,
        resetUrl
      };
      
      const htmlContent = emailRenderer.renderHtml('reset-password', emailData);
      const textContent = emailRenderer.renderText('reset-password', emailData);
      
      await sendEmail(normalizedEmail, 'Reset Your Password', htmlContent, textContent);
      
      logger.info('Password reset initiated', { 
        tenantId: tenant.id, 
        email: normalizedEmail,
        event: LOG_EVENTS.PASSWORD_RESET_INITIATED 
      });
      
    } catch (error) {
      logger.error('Password reset email send failed', { email: normalizedEmail, error });
      // Don't expose email send failure, continue returning success
    }
    
    return { success: true };
    
  } catch (error) {
    logger.error('Initiate password reset failed', { error, data });
    throw error;
  }
};

/**
 * 使用token重置密码
 * 
 * Input:
 * - token: 密码重置JWT token字符串
 * - newPassword: 新密码（明文）
 * 
 * Output:
 * - 成功: { success: true }
 * - 失败: 抛出异常
 * 
 * 执行逻辑：
 * 1. 验证 token 类型为 password_reset 且未过期
 * 2. 查找对应账户并更新新密码
 */
export const resetPassword = async (
  data: ResetPasswordData
): Promise<{ success: true }> => {
  try {
    const { token, newPassword } = data;
    
    // 1. Basic password validation
    if (newPassword.length < ACCOUNT_CONFIG.MIN_PASSWORD_LENGTH) {
      throw new Error(ERROR_MESSAGES.PASSWORD_TOO_SHORT);
    }
    
    // 2. Verify token
    let tokenPayload: { email: string, tenantId: string };
    try {
      tokenPayload = await verifyPasswordResetToken(token);
    } catch (error) {
      logger.warn('Password reset token validation failed', { token, error });
      throw new Error(ERROR_MESSAGES.INVALID_TOKEN);
    }
    
    // 3. Find tenant
    const tenant = await prisma.tenant.findUnique({
      where: { id: tokenPayload.tenantId }
    });
    
    if (!tenant) {
      logger.warn('Tenant not found for password reset', { tenantId: tokenPayload.tenantId });
      throw new Error(ERROR_MESSAGES.TENANT_NOT_FOUND);
    }
    
    // 4. Check email match
    if (tenant.email !== tokenPayload.email) {
      logger.warn('Email mismatch in password reset token', { 
        tenantEmail: tenant.email, 
        tokenEmail: tokenPayload.email 
      });
      throw new Error(ERROR_MESSAGES.INVALID_TOKEN);
    }
    
    // 5. Hash password
    const hashedPassword = await hashPassword(newPassword);
    
    // 6. Update password and add token to blacklist
    await prisma.$transaction(async (prisma) => {
      // Update password
      await prisma.tenant.update({
        where: { id: tenant.id },
        data: { 
          password_hash: hashedPassword,
          updated_at: new Date()
        }
      });
     
      // Add token to blacklist
      const decoded = jwt.decode(token) as any;
      if (decoded && decoded.jti) {
        const expiresAt = new Date(decoded.exp * 1000);
        await addTokenToBlacklist(decoded.jti, expiresAt, 'password_reset_used');
      }
    });
    
    logger.info('Password reset successful', { 
      tenantId: tenant.id, 
      email: tenant.email,
      event: LOG_EVENTS.PASSWORD_RESET_COMPLETED 
    });
    
    return { success: true };
    
  } catch (error) {
    logger.error('Password reset failed', { error, data });
    throw error;
  }
}; 