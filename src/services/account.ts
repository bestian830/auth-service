/**
 * 账户服务 - 处理用户注册、登录、登出等核心业务逻辑
 */

import { 
  RegisterData, 
  LoginCredentials, 
  LoginResult, 
  RegisterResult,
  JwtTokenPair
} from '../types/auth';
import { TenantEntity, TenantCreateData } from '../types/entities';
import { AuthError } from '../types/common';
import { RequestContext } from '../types/api';
import { TenantModel } from '../models/tenant';
import { SessionModel } from '../models/session';
import { hashPassword, comparePassword } from '../utils/password';
import { generateRandomToken } from '../utils/crypto';
import { generateAccessToken, generateRefreshToken } from './auth';
import { sendVerificationEmail } from './email';
import { createSession, invalidateSession } from './session';

/**
 * 用户注册业务逻辑
 * @param data 注册数据
 * @returns 注册结果
 */
export async function register(data: RegisterData): Promise<RegisterResult> {
  const context: RequestContext = {
    requestId: `reg-${Date.now()}`,
    timestamp: new Date(),
    method: 'POST',
    path: '/auth/register',
    ipAddress: undefined,
    userAgent: undefined
  };

  try {
    // 检查邮箱是否已存在
    const existingTenant = await TenantModel.findByEmail(context, data.email);
    if (existingTenant) {
      return {
        success: false,
        error: 'Email address is already registered'
      };
    }

    // 检查子域名是否已被占用
    const existingSubdomain = await TenantModel.findBySubdomain(context, data.subdomain);
    if (existingSubdomain) {
      return {
        success: false,
        error: 'Subdomain is already taken'
      };
    }

    // 创建密码哈希
    const passwordHash = await hashPassword(data.password);

    // 生成邮箱验证令牌
    const verificationToken = generateRandomToken(32);

    // 创建租户记录
    const tenantData: TenantCreateData = {
      email: data.email,
      password: passwordHash,
      store_name: data.storeName,
      subdomain: data.subdomain,
      phone: data.phone,
      address: data.address
    };

    const tenant = await TenantModel.create(context, tenantData);

    // 发送验证邮件
    try {
      await sendVerificationEmail(data.email, verificationToken);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
      // 邮件发送失败不影响注册成功
    }

    // 创建初始会话
    const session = await createSession(tenant.id, {
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    // 生成访问令牌
    const accessToken = await generateAccessToken(tenant);
    const refreshToken = await generateRefreshToken(tenant);

    const tokens: JwtTokenPair = {
      accessToken,
      refreshToken,
      expiresIn: 3600, // 1小时
      tokenType: 'Bearer'
    };

    return {
      success: true,
      tenant: {
        id: tenant.id,
        email: tenant.email,
        storeName: tenant.store_name,
        subdomain: tenant.subdomain
      },
      tokens,
      requiresEmailVerification: true
    };

  } catch (error) {
    console.error('Registration error:', error);
    return {
      success: false,
      error: 'Registration failed. Please try again.'
    };
  }
}

/**
 * 用户登录业务逻辑
 * @param credentials 登录凭据
 * @returns 登录结果
 */
export async function login(credentials: LoginCredentials): Promise<LoginResult> {
  const context: RequestContext = {
    requestId: `login-${Date.now()}`,
    timestamp: new Date(),
    method: 'POST',
    path: '/auth/login',
    ipAddress: undefined,
    userAgent: undefined
  };

  try {
    // 根据邮箱查找租户
    const tenant = await TenantModel.findByEmail(context, credentials.email);
    if (!tenant) {
      return {
        success: false,
        error: 'Invalid email or password'
      };
    }

    // 验证密码
    const isPasswordValid = await comparePassword(credentials.password, tenant.password_hash);
    if (!isPasswordValid) {
      return {
        success: false,
        error: 'Invalid email or password'
      };
    }

    // 创建新会话
    const session = await createSession(tenant.id, {
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    });

    // 生成访问令牌
    const accessToken = await generateAccessToken(tenant);
    const refreshToken = await generateRefreshToken(tenant);

    const tokens: JwtTokenPair = {
      accessToken,
      refreshToken,
      expiresIn: 3600, // 1小时
      tokenType: 'Bearer'
    };

    return {
      success: true,
      tokens,
      tenant: {
        id: tenant.id,
        email: tenant.email,
        storeName: tenant.store_name,
        subdomain: tenant.subdomain,
        emailVerified: !!tenant.email_verified_at
      },
      subscription: {
        status: tenant.subscription_status,
        plan: tenant.subscription_plan,
        trialEndsAt: tenant.trial_ends_at,
        subscriptionEndsAt: tenant.subscription_ends_at
      },
      requiresEmailVerification: !tenant.email_verified_at
    };

  } catch (error) {
    console.error('Login error:', error);
    return {
      success: false,
      error: 'Login failed. Please try again.'
    };
  }
}

/**
 * 用户登出业务逻辑
 * @param sessionId 会话ID
 */
export async function logout(sessionId: string): Promise<void> {
  try {
    const context: RequestContext = {
      requestId: `logout-${Date.now()}`,
      timestamp: new Date(),
      method: 'POST',
      path: '/auth/logout',
      ipAddress: undefined,
      userAgent: undefined
    };

    const session = await SessionModel.findById(context, sessionId);
    if (!session) {
      throw new AuthError('INVALID_SESSION', 'Session not found');
    }

    // 使会话失效
    await invalidateSession(sessionId);

  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
}

/**
 * 激活账户业务逻辑
 * @param token 激活令牌
 */
export async function activateAccount(token: string): Promise<void> {
  const context: RequestContext = {
    requestId: `activate-${Date.now()}`,
    timestamp: new Date(),
    method: 'POST',
    path: '/auth/activate',
    ipAddress: undefined,
    userAgent: undefined
  };

  try {
    // 临时实现 - 需要完善邮箱验证逻辑
    throw new Error('Account activation not yet implemented');

  } catch (error) {
    console.error('Account activation error:', error);
    throw error;
  }
}

/**
 * 重新发送激活邮件业务逻辑
 * @param email 邮箱地址
 */
export async function resendActivation(email: string): Promise<void> {
  const context: RequestContext = {
    requestId: `resend-${Date.now()}`,
    timestamp: new Date(),
    method: 'POST',
    path: '/auth/resend-activation',
    ipAddress: undefined,
    userAgent: undefined
  };

  try {
    // 查找租户
    const tenant = await TenantModel.findByEmail(context, email);
    if (!tenant) {
      throw new AuthError('TENANT_NOT_FOUND', 'Account not found');
    }

    // 检查是否已经激活
    if (tenant.email_verified_at) {
      throw new AuthError('ALREADY_VERIFIED', 'Account is already activated');
    }

    // 生成新的激活令牌
    const verificationToken = generateRandomToken(32);

    // 发送激活邮件
    await sendVerificationEmail(email, verificationToken);

  } catch (error) {
    console.error('Resend activation error:', error);
    throw error;
  }
} 