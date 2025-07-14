/**
 * Tenant Model - 租户数据访问层
 * 职责：纯数据库CRUD操作，基础查询，数据聚合
 */

import prisma from '../config/database';
import { 
  TenantEntity,
  TenantCreateData,
  TenantUpdateData,
  TenantFilter,
  AuthRequestContext,
  DatabaseResult
} from '../types';
import { PaginationResult } from '../types/api';
import { SubscriptionStatus, SubscriptionPlan, PaymentProvider } from '../../generated/prisma';
import { logger } from '../utils/logger';

/**
 * 租户数据访问对象
 * 处理租户相关的数据库操作，确保多租户数据隔离
 */
export class TenantModel {

  /**
   * 转换数据库记录为实体对象
   */
  private static mapToEntity(tenant: any): TenantEntity {
    return {
      ...tenant,
      createdAt: tenant.created_at,
      updatedAt: tenant.updated_at
    } as TenantEntity;
  }

  /**
   * 创建新租户
   * @param context 请求上下文
   * @param tenantData 租户创建数据
   * @returns 创建的租户记录
   */
  static async create(context: AuthRequestContext, tenantData: TenantCreateData): Promise<TenantEntity> {
    const tenant = await prisma.tenant.create({
      data: {
        email: tenantData.email.toLowerCase().trim(),
        password_hash: tenantData.password, // 注意：这里应该是已经哈希过的密码
        store_name: tenantData.store_name.trim(),
        subdomain: tenantData.subdomain.toLowerCase().trim(),
        phone: tenantData.phone?.trim(),
        address: tenantData.address?.trim(),
        subscription_status: 'TRIAL',
        subscription_plan: 'BASIC',
        trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30天试用期
      }
    });

    return this.mapToEntity(tenant);
  }

  /**
   * 根据ID查找租户
   * @param context 请求上下文
   * @param tenantId 租户ID
   * @returns 租户记录或null
   */
  static async findById(context: AuthRequestContext, tenantId: string): Promise<TenantEntity | null> {
    const tenant = await prisma.tenant.findFirst({
      where: { 
        id: tenantId
      },
      include: {
        sessions: {
          where: {
            deleted_at: null
          }
        }
      }
    });

    return tenant ? this.mapToEntity(tenant) : null;
  }

  /**
   * 根据邮箱查找租户
   * @param context 请求上下文
   * @param email 邮箱地址
   * @returns 租户记录或null
   */
  static async findByEmail(context: AuthRequestContext, email: string): Promise<TenantEntity | null> {
    const tenant = await prisma.tenant.findFirst({
      where: { 
        email: email.toLowerCase().trim()
      },
      include: {
        sessions: {
          where: {
            deleted_at: null
          }
        }
      }
    });

    return tenant ? this.mapToEntity(tenant) : null;
  }

  /**
   * 根据子域名查找租户
   * @param context 请求上下文
   * @param subdomain 子域名
   * @returns 租户记录或null
   */
  static async findBySubdomain(context: AuthRequestContext, subdomain: string): Promise<TenantEntity | null> {
    const tenant = await prisma.tenant.findFirst({
      where: { 
        subdomain: subdomain.toLowerCase().trim()
      },
      include: {
        sessions: {
          where: {
            deleted_at: null
          }
        }
      }
    });

    return tenant ? this.mapToEntity(tenant) : null;
  }

  /**
   * 分页查询租户列表
   * @param context 请求上下文
   * @param page 页码（从1开始）
   * @param limit 每页数量
   * @param filters 查询过滤条件
   * @returns 分页租户结果
   */
  static async findWithPagination(
    context: AuthRequestContext,
    page: number = 1,
    limit: number = 20,
    filters: Partial<TenantFilter> = {}
  ): Promise<PaginationResult<TenantEntity>> {
    const skip = (page - 1) * limit;

    // 构建查询条件
    const whereConditions: any = {};

    if (filters.email) {
      whereConditions.email = {
        contains: filters.email.toLowerCase(),
        mode: 'insensitive'
      };
    }

    if (filters.store_name) {
      whereConditions.store_name = {
        contains: filters.store_name,
        mode: 'insensitive'
      };
    }

    if (filters.subdomain) {
      whereConditions.subdomain = {
        contains: filters.subdomain.toLowerCase(),
        mode: 'insensitive'
      };
    }

    if (filters.subscription_status) {
      whereConditions.subscription_status = Array.isArray(filters.subscription_status) 
        ? { in: filters.subscription_status }
        : filters.subscription_status;
    }

    if (filters.subscription_plan) {
      whereConditions.subscription_plan = Array.isArray(filters.subscription_plan) 
        ? { in: filters.subscription_plan }
        : filters.subscription_plan;
    }

    if (filters.payment_provider) {
      whereConditions.payment_provider = filters.payment_provider;
    }

    if (filters.email_verified !== undefined) {
      if (filters.email_verified) {
        whereConditions.email_verified_at = { not: null };
      } else {
        whereConditions.email_verified_at = null;
      }
    }

    if (filters.created_after || filters.created_before) {
      whereConditions.created_at = {};
      if (filters.created_after) {
        whereConditions.created_at.gte = filters.created_after;
      }
      if (filters.created_before) {
        whereConditions.created_at.lte = filters.created_before;
      }
    }

    if (filters.trial_ending_before) {
      whereConditions.trial_ends_at = {
        lte: filters.trial_ending_before
      };
    }

    if (filters.subscription_ending_before) {
      whereConditions.subscription_ends_at = {
        lte: filters.subscription_ending_before
      };
    }

    // 执行查询
    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where: whereConditions,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          sessions: {
            where: {
              deleted_at: null
            }
          }
        }
      }),
      prisma.tenant.count({ where: whereConditions })
    ]);

    return {
      data: tenants.map(tenant => this.mapToEntity(tenant)),
      pagination: {
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
        currentPage: page,
        pageSize: limit
      }
    };
  }

  /**
   * 更新租户信息
   * @param context 请求上下文
   * @param tenantId 租户ID
   * @param updateData 更新数据
   * @returns 更新后的租户记录或null
   */
  static async updateById(
    context: AuthRequestContext,
    tenantId: string,
    updateData: TenantUpdateData
  ): Promise<TenantEntity | null> {
    const result = await prisma.tenant.updateMany({
      where: {
        id: tenantId
      },
      data: {
        ...updateData,
        store_name: updateData.store_name?.trim(),
        phone: updateData.phone?.trim(),
        address: updateData.address?.trim(),
        updated_at: new Date()
      }
    });

    if (result.count === 0) {
      return null;
    }

    return this.findById(context, tenantId);
  }

  /**
   * 更新租户订阅信息
   * @param context 请求上下文
   * @param tenantId 租户ID
   * @param subscriptionData 订阅数据
   * @returns 更新后的租户记录或null
   */
  static async updateSubscription(
    context: AuthRequestContext,
    tenantId: string,
    subscriptionData: {
      subscription_status?: SubscriptionStatus;
      subscription_plan?: SubscriptionPlan;
      subscription_starts_at?: Date;
      subscription_ends_at?: Date;
      trial_ends_at?: Date;
      payment_provider?: PaymentProvider;
      payment_customer_id?: string;
      payment_subscription_id?: string;
    }
  ): Promise<TenantEntity | null> {
    const result = await prisma.tenant.updateMany({
      where: {
        id: tenantId
      },
      data: {
        ...subscriptionData,
        updated_at: new Date()
      }
    });

    if (result.count === 0) {
      return null;
    }

    return this.findById(context, tenantId);
  }

  /**
   * 更新邮箱验证状态
   * @param context 请求上下文
   * @param tenantId 租户ID
   * @param isVerified 是否已验证
   * @returns 更新后的租户记录或null
   */
  static async updateEmailVerification(
    context: AuthRequestContext,
    tenantId: string,
    isVerified: boolean
  ): Promise<TenantEntity | null> {
    const result = await prisma.tenant.updateMany({
      where: {
        id: tenantId
      },
      data: {
        email_verified_at: isVerified ? new Date() : null,
        email_verification_token: isVerified ? null : undefined,
        updated_at: new Date()
      }
    });

    if (result.count === 0) {
      return null;
    }

    return this.findById(context, tenantId);
  }

  /**
   * 软删除租户（暂时停用）
   * 注意：这里使用 subscription_status 来标记取消
   * @param context 请求上下文
   * @param tenantId 租户ID
   * @returns 是否删除成功
   */
  static async softDelete(context: AuthRequestContext, tenantId: string): Promise<boolean> {
    const result = await prisma.tenant.updateMany({
      where: {
        id: tenantId
      },
      data: {
        subscription_status: 'CANCELED',
        updated_at: new Date()
      }
    });

    return result.count > 0;
  }

  /**
   * 硬删除租户（危险操作，一般不使用）
   * @param context 请求上下文
   * @param tenantId 租户ID
   * @returns 是否删除成功
   */
  static async hardDelete(context: AuthRequestContext, tenantId: string): Promise<boolean> {
    const result = await prisma.tenant.deleteMany({
      where: {
        id: tenantId
      }
    });

    return result.count > 0;
  }

  /**
   * 检查租户是否存在
   * @param context 请求上下文
   * @param tenantId 租户ID
   * @returns 是否存在
   */
  static async exists(context: AuthRequestContext, tenantId: string): Promise<boolean> {
    const count = await prisma.tenant.count({
      where: {
        id: tenantId
      }
    });

    return count > 0;
  }

  /**
   * 检查邮箱是否已被使用
   * @param context 请求上下文
   * @param email 邮箱地址
   * @param excludeTenantId 排除的租户ID（用于更新时检查）
   * @returns 是否已存在
   */
  static async emailExists(context: AuthRequestContext, email: string, excludeTenantId?: string): Promise<boolean> {
    const whereCondition: any = {
      email: email.toLowerCase().trim()
    };

    if (excludeTenantId) {
      whereCondition.id = { not: excludeTenantId };
    }

    const count = await prisma.tenant.count({
      where: whereCondition
    });

    return count > 0;
  }

  /**
   * 检查子域名是否已被使用
   * @param context 请求上下文
   * @param subdomain 子域名
   * @param excludeTenantId 排除的租户ID（用于更新时检查）
   * @returns 是否已存在
   */
  static async subdomainExists(context: AuthRequestContext, subdomain: string, excludeTenantId?: string): Promise<boolean> {
    const whereCondition: any = {
      subdomain: subdomain.toLowerCase().trim()
    };

    if (excludeTenantId) {
      whereCondition.id = { not: excludeTenantId };
    }

    const count = await prisma.tenant.count({
      where: whereCondition
    });

    return count > 0;
  }

  /**
   * 获取租户总数
   * @param context 请求上下文
   * @returns 租户总数
   */
  static async getTotalCount(context: AuthRequestContext): Promise<number> {
    return await prisma.tenant.count();
  }

  // ===== 统计查询方法 =====

  /**
   * 按订阅状态统计租户数量
   * @param context 请求上下文
   * @returns 按状态分组的统计结果
   */
  static async getCountBySubscriptionStatus(context: AuthRequestContext): Promise<Record<string, number>> {
    const result = await prisma.tenant.groupBy({
      by: ['subscription_status'],
      _count: {
        id: true
      }
    });

    return result.reduce((acc, item) => {
      acc[item.subscription_status] = item._count.id;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * 按订阅计划统计租户数量
   * @param context 请求上下文
   * @returns 按计划分组的统计结果
   */
  static async getCountBySubscriptionPlan(context: AuthRequestContext): Promise<Record<string, number>> {
    const result = await prisma.tenant.groupBy({
      by: ['subscription_plan'],
      _count: {
        id: true
      }
    });

    return result.reduce((acc, item) => {
      acc[item.subscription_plan] = item._count.id;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * 获取即将到期的试用账户
   * @param context 请求上下文
   * @param daysBeforeExpiry 到期前几天
   * @returns 即将到期的租户列表
   */
  static async getTrialExpiringSoon(
    context: AuthRequestContext,
    daysBeforeExpiry: number = 3
  ): Promise<TenantEntity[]> {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + daysBeforeExpiry);

    const tenants = await prisma.tenant.findMany({
      where: {
        subscription_status: 'TRIAL',
        trial_ends_at: {
          lte: expiryDate
        }
      },
      orderBy: { trial_ends_at: 'asc' }
    });

    return tenants.map(tenant => this.mapToEntity(tenant));
  }

  // ===== 批量操作方法 =====

  /**
   * 批量更新订阅状态
   * @param context 请求上下文
   * @param tenantIds 租户ID列表
   * @param subscriptionStatus 新的订阅状态
   * @returns 操作结果
   */
  static async updateMultipleSubscriptionStatus(
    context: AuthRequestContext,
    tenantIds: string[],
    subscriptionStatus: 'TRIAL' | 'ACTIVE' | 'EXPIRED' | 'CANCELED'
  ): Promise<DatabaseResult<null>> {
    try {
      const result = await prisma.tenant.updateMany({
        where: {
          id: { in: tenantIds }
        },
        data: { 
          subscription_status: subscriptionStatus,
          updated_at: new Date()
        }
      });

      return {
        success: true,
        affectedRows: result.count
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 批量软删除租户
   * @param context 请求上下文
   * @param tenantIds 租户ID列表
   * @returns 操作结果
   */
  static async softDeleteMultiple(
    context: AuthRequestContext,
    tenantIds: string[]
  ): Promise<DatabaseResult<null>> {
    try {
      const result = await prisma.tenant.updateMany({
        where: {
          id: { in: tenantIds }
        },
        data: {
          subscription_status: 'CANCELED',
          updated_at: new Date()
        }
      });

      return {
        success: true,
        affectedRows: result.count
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}