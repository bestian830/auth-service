/**
 * 租户服务 - 处理租户管理相关业务逻辑
 */

import { 
  TenantEntity, 
  TenantCreateData, 
  TenantUpdateData,
} from '../types/entities';
import { RequestContext } from '../types/api';
import { AuthError } from '../types/common';
import { TenantModel } from '../models/tenant';
import { SessionModel } from '../models/session';
import { hashPassword } from '../utils/password';
import { generateRandomToken } from '../utils/crypto';
import { generateEmailVerificationToken } from '../config/jwt';
import { sendVerificationEmail } from './email';
import { SUBSCRIPTION_STATUS } from '../constants/subscription-status';

/**
 * 注册租户
 * @param data 租户创建数据
 * @param context 请求上下文
 * @returns 租户实体
 */
export async function registerTenant(
  data: TenantCreateData, 
  context?: Partial<RequestContext>
): Promise<TenantEntity> {
  try {
    // 构建请求上下文
    const requestContext: RequestContext = {
      requestId: generateRandomToken(16),
      timestamp: new Date(),
      method: 'POST',
      path: '/auth/tenant/register',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent
    };

    // 验证邮箱唯一性
    const existingEmailTenant = await TenantModel.findByEmail(requestContext, data.email);
    if (existingEmailTenant) {
      throw new AuthError('EMAIL_ALREADY_EXISTS', 'Email already registered');
    }

    // 验证子域名唯一性
    const existingSubdomainTenant = await TenantModel.findBySubdomain(requestContext, data.subdomain);
    if (existingSubdomainTenant) {
      throw new AuthError('SUBDOMAIN_ALREADY_EXISTS', 'Subdomain already taken');
    }

    // 生成密码哈希
    const passwordHash = await hashPassword(data.password);

    // 生成邮箱验证令牌
    const emailVerificationToken = generateEmailVerificationToken(data.email, generateRandomToken(16));

    // 创建租户记录
    const tenantData = {
      email: data.email.toLowerCase().trim(),
      password: data.password, // 使用原始密码，让模型层处理哈希
      store_name: data.store_name,
      subdomain: data.subdomain.toLowerCase().trim(),
      phone: data.phone,
      address: data.address
    };

    const tenant = await TenantModel.create(requestContext, tenantData);

    // 发送邮箱验证邮件
    await sendVerificationEmail(data.email, emailVerificationToken);

    return tenant;
  } catch (error: any) {
    throw new AuthError('TENANT_REGISTER_FAILED', error.message || 'Failed to register tenant');
  }
}

/**
 * 更新租户资料
 * @param tenantId 租户ID
 * @param profileData 更新数据
 * @param context 请求上下文
 * @returns 更新后的租户实体
 */
export async function updateTenantProfile(
  tenantId: string, 
  profileData: TenantUpdateData, 
  context?: Partial<RequestContext>
): Promise<TenantEntity> {
  try {
    // 构建请求上下文
    const requestContext: RequestContext = {
      requestId: generateRandomToken(16),
      timestamp: new Date(),
      method: 'PUT',
      path: '/auth/tenant/profile',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent
    };

    // 验证租户存在
    const existingTenant = await TenantModel.findById(requestContext, tenantId);
    if (!existingTenant) {
      throw new AuthError('TENANT_NOT_FOUND', 'Tenant not found');
    }

    // 验证更新权限（检查租户状态）
    if (existingTenant.subscription_status === SUBSCRIPTION_STATUS.CANCELED) {
      throw new AuthError('TENANT_DISABLED', 'Tenant account is disabled');
    }

    // 更新租户信息
    const updatedTenant = await TenantModel.updateById(requestContext, tenantId, profileData);
    
    if (!updatedTenant) {
      throw new AuthError('TENANT_UPDATE_FAILED', 'Failed to update tenant profile');
    }

    return updatedTenant;
  } catch (error: any) {
    throw new AuthError('TENANT_UPDATE_FAILED', error.message || 'Failed to update tenant profile');
  }
}

/**
 * 获取租户信息
 * @param tenantId 租户ID
 * @param context 请求上下文
 * @returns 租户实体
 */
export async function getTenantInfo(
  tenantId: string, 
  context?: Partial<RequestContext>
): Promise<TenantEntity> {
  try {
    // 构建请求上下文
    const requestContext: RequestContext = {
      requestId: generateRandomToken(16),
      timestamp: new Date(),
      method: 'GET',
      path: '/auth/tenant/info',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent
    };

    // 验证租户存在
    const tenant = await TenantModel.findById(requestContext, tenantId);
    if (!tenant) {
      throw new AuthError('TENANT_NOT_FOUND', 'Tenant not found');
    }

    return tenant;
  } catch (error: any) {
    throw new AuthError('TENANT_FETCH_FAILED', error.message || 'Failed to fetch tenant info');
  }
}

/**
 * 禁用租户
 * @param tenantId 租户ID
 * @param context 请求上下文
 */
export async function disableTenant(
  tenantId: string, 
  context?: Partial<RequestContext>
): Promise<void> {
  try {
    // 构建请求上下文
    const requestContext: RequestContext = {
      requestId: generateRandomToken(16),
      timestamp: new Date(),
      method: 'POST',
      path: '/auth/tenant/disable',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent
    };

    // 验证租户存在
    const tenant = await TenantModel.findById(requestContext, tenantId);
    if (!tenant) {
      throw new AuthError('TENANT_NOT_FOUND', 'Tenant not found');
    }

    // 更新租户状态为已取消
    const updateData = {
      subscription_status: SUBSCRIPTION_STATUS.CANCELED,
      subscription_ends_at: new Date()
    };

    await TenantModel.updateSubscription(requestContext, tenantId, updateData);

    // 使所有会话失效
    await SessionModel.softDeleteByTenantId(requestContext, tenantId);

  } catch (error: any) {
    throw new AuthError('TENANT_DISABLE_FAILED', error.message || 'Failed to disable tenant');
  }
} 