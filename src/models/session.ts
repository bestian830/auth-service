/**
 * Session Model - 会话数据访问层
 * 职责：纯数据库CRUD操作，基础查询，数据聚合
 */

import prisma from '../config/database';
import { 
  SessionEntity,
  SessionCreateData,
  SessionUpdateData,
  AuthRequestContext,
  DatabaseResult
} from '../types';
import { PaginationResult } from '../types/api';

/**
 * 会话数据访问对象
 * 处理会话相关的数据库操作，确保多租户数据隔离
 */
export class SessionModel {

  /**
   * 转换数据库记录为实体对象
   */
  private static mapToEntity(session: any): SessionEntity {
    return {
      ...session,
      createdAt: session.created_at,
      updatedAt: session.updated_at
    } as SessionEntity;
  }

  /**
   * 创建新会话
   * @param context 请求上下文
   * @param sessionData 会话创建数据
   * @returns 创建的会话记录
   */
  static async create(context: AuthRequestContext, sessionData: SessionCreateData): Promise<SessionEntity> {
    const session = await prisma.session.create({
      data: {
        tenant_id: sessionData.tenant_id,
        token_hash: sessionData.token_hash,
        refresh_token: sessionData.refresh_token,
        user_agent: sessionData.user_agent?.trim(),
        ip_address: sessionData.ip_address?.trim(),
        expires_at: sessionData.expires_at
      }
    });

    return this.mapToEntity(session);
  }

  /**
   * 根据ID查找会话
   * @param context 请求上下文
   * @param sessionId 会话ID
   * @returns 会话记录或null
   */
  static async findById(context: AuthRequestContext, sessionId: string): Promise<SessionEntity | null> {
    const session = await prisma.session.findFirst({
      where: { 
        id: sessionId,
        deleted_at: null // 只查询未删除的会话
      }
    });

    return session ? this.mapToEntity(session) : null;
  }

  /**
   * 根据令牌哈希查找会话
   * @param context 请求上下文
   * @param tokenHash 令牌哈希
   * @returns 会话记录或null
   */
  static async findByTokenHash(context: AuthRequestContext, tokenHash: string): Promise<SessionEntity | null> {
    const session = await prisma.session.findFirst({
      where: { 
        token_hash: tokenHash,
        deleted_at: null,
        expires_at: {
          gt: new Date() // 只查询未过期的会话
        }
      }
    });

    return session ? this.mapToEntity(session) : null;
  }

  /**
   * 根据刷新令牌查找会话
   * @param context 请求上下文
   * @param refreshToken 刷新令牌
   * @returns 会话记录或null
   */
  static async findByRefreshToken(context: AuthRequestContext, refreshToken: string): Promise<SessionEntity | null> {
    const session = await prisma.session.findFirst({
      where: { 
        refresh_token: refreshToken,
        deleted_at: null,
        expires_at: {
          gt: new Date() // 只查询未过期的会话
        }
      }
    });

    return session ? this.mapToEntity(session) : null;
  }

  /**
   * 根据租户ID查找所有会话
   * @param context 请求上下文
   * @param tenantId 租户ID
   * @param includeDeleted 是否包含已删除的会话
   * @returns 会话列表
   */
  static async findByTenantId(
    context: AuthRequestContext, 
    tenantId: string, 
    includeDeleted: boolean = false
  ): Promise<SessionEntity[]> {
    const sessions = await prisma.session.findMany({
      where: {
        tenant_id: tenantId,
        ...(includeDeleted ? {} : { deleted_at: null })
      },
      orderBy: { created_at: 'desc' }
    });

    return sessions.map(session => this.mapToEntity(session));
  }

  /**
   * 分页查询会话列表
   * @param context 请求上下文
   * @param page 页码（从1开始）
   * @param limit 每页数量
   * @param filters 查询过滤条件
   * @returns 分页会话结果
   */
  static async findWithPagination(
    context: AuthRequestContext,
    page: number = 1,
    limit: number = 20,
    filters: Partial<any> = {} // Assuming SessionFilter is no longer needed or replaced
  ): Promise<PaginationResult<SessionEntity>> {
    const skip = (page - 1) * limit;

    // 构建查询条件
    const whereConditions: any = {
      deleted_at: null // 默认只查询未删除的会话
    };

    if (filters.tenant_id) {
      whereConditions.tenant_id = filters.tenant_id;
    }

    if (filters.ip_address) {
      whereConditions.ip_address = filters.ip_address;
    }

    if (filters.user_agent) {
      whereConditions.user_agent = {
        contains: filters.user_agent,
        mode: 'insensitive'
      };
    }

    if (filters.expires_after || filters.expires_before) {
      whereConditions.expires_at = {};
      if (filters.expires_after) {
        whereConditions.expires_at.gte = filters.expires_after;
      }
      if (filters.expires_before) {
        whereConditions.expires_at.lte = filters.expires_before;
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

    if (filters.is_active !== undefined) {
      if (filters.is_active) {
        whereConditions.expires_at = {
          ...whereConditions.expires_at,
          gt: new Date()
        };
      } else {
        whereConditions.expires_at = {
          ...whereConditions.expires_at,
          lte: new Date()
        };
      }
    }

    // 执行查询
    const [sessions, total] = await Promise.all([
      prisma.session.findMany({
        where: whereConditions,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' }
      }),
      prisma.session.count({ where: whereConditions })
    ]);

    return {
      data: sessions.map(session => this.mapToEntity(session)),
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
   * 查找活跃会话（未过期且未删除）
   * @param context 请求上下文
   * @param tenantId 租户ID（可选）
   * @returns 活跃会话列表
   */
  static async findActiveSessions(context: AuthRequestContext, tenantId?: string): Promise<SessionEntity[]> {
    const whereConditions: any = {
      deleted_at: null,
      expires_at: {
        gt: new Date()
      }
    };

    if (tenantId) {
      whereConditions.tenant_id = tenantId;
    }

    const sessions = await prisma.session.findMany({
      where: whereConditions,
      orderBy: { created_at: 'desc' }
    });

    return sessions.map(session => this.mapToEntity(session));
  }

  /**
   * 查找过期会话
   * @param context 请求上下文
   * @param tenantId 租户ID（可选）
   * @returns 过期会话列表
   */
  static async findExpiredSessions(context: AuthRequestContext, tenantId?: string): Promise<SessionEntity[]> {
    const whereConditions: any = {
      deleted_at: null,
      expires_at: {
        lte: new Date()
      }
    };

    if (tenantId) {
      whereConditions.tenant_id = tenantId;
    }

    const sessions = await prisma.session.findMany({
      where: whereConditions,
      orderBy: { expires_at: 'asc' }
    });

    return sessions.map(session => this.mapToEntity(session));
  }

  /**
   * 更新会话信息
   * @param context 请求上下文
   * @param sessionId 会话ID
   * @param updateData 更新数据
   * @returns 更新后的会话记录或null
   */
  static async updateById(
    context: AuthRequestContext,
    sessionId: string,
    updateData: SessionUpdateData
  ): Promise<SessionEntity | null> {
    const result = await prisma.session.updateMany({
      where: {
        id: sessionId,
        deleted_at: null
      },
      data: {
        ...updateData,
        user_agent: updateData.user_agent?.trim(),
        ip_address: updateData.ip_address?.trim(),
        updated_at: new Date()
      }
    });

    if (result.count === 0) {
      return null;
    }

    return this.findById(context, sessionId);
  }

  /**
   * 刷新会话过期时间
   * @param context 请求上下文
   * @param sessionId 会话ID
   * @param newExpiresAt 新的过期时间
   * @returns 更新后的会话记录或null
   */
  static async refreshExpiration(
    context: AuthRequestContext,
    sessionId: string,
    newExpiresAt: Date
  ): Promise<SessionEntity | null> {
    const result = await prisma.session.updateMany({
      where: {
        id: sessionId,
        deleted_at: null
      },
      data: {
        expires_at: newExpiresAt,
        updated_at: new Date()
      }
    });

    if (result.count === 0) {
      return null;
    }

    return this.findById(context, sessionId);
  }

  /**
   * 软删除会话
   * @param context 请求上下文
   * @param sessionId 会话ID
   * @returns 是否删除成功
   */
  static async softDelete(context: AuthRequestContext, sessionId: string): Promise<boolean> {
    const result = await prisma.session.updateMany({
      where: { 
        id: sessionId,
        deleted_at: null
      },
      data: { 
        deleted_at: new Date(),
        updated_at: new Date()
      }
    });

    return result.count > 0;
  }

  /**
   * 硬删除会话（物理删除）
   * @param context 请求上下文
   * @param sessionId 会话ID
   * @returns 是否删除成功
   */
  static async hardDelete(context: AuthRequestContext, sessionId: string): Promise<boolean> {
    const result = await prisma.session.deleteMany({
      where: {
        id: sessionId
      }
    });

    return result.count > 0;
  }

  /**
   * 检查会话是否存在
   * @param context 请求上下文
   * @param sessionId 会话ID
   * @returns 是否存在
   */
  static async exists(context: AuthRequestContext, sessionId: string): Promise<boolean> {
    const count = await prisma.session.count({
      where: {
        id: sessionId,
        deleted_at: null
      }
    });

    return count > 0;
  }

  /**
   * 检查会话是否有效（存在且未过期）
   * @param context 请求上下文
   * @param sessionId 会话ID
   * @returns 是否有效
   */
  static async isValid(context: AuthRequestContext, sessionId: string): Promise<boolean> {
    const count = await prisma.session.count({
      where: {
        id: sessionId,
        deleted_at: null,
        expires_at: {
          gt: new Date()
        }
      }
    });

    return count > 0;
  }

  /**
   * 获取租户的会话总数
   * @param context 请求上下文
   * @param tenantId 租户ID
   * @param includeDeleted 是否包含已删除的会话
   * @returns 会话总数
   */
  static async getTotalCount(
    context: AuthRequestContext, 
    tenantId?: string, 
    includeDeleted: boolean = false
  ): Promise<number> {
    const whereConditions: any = {
      ...(includeDeleted ? {} : { deleted_at: null })
    };

    if (tenantId) {
      whereConditions.tenant_id = tenantId;
    }

    return await prisma.session.count({
      where: whereConditions
    });
  }

  // ===== 批量操作方法 =====

  /**
   * 批量软删除会话
   * @param context 请求上下文
   * @param sessionIds 会话ID列表
   * @returns 操作结果
   */
  static async softDeleteMultiple(
    context: AuthRequestContext,
    sessionIds: string[]
  ): Promise<DatabaseResult<null>> {
    try {
      const result = await prisma.session.updateMany({
        where: {
          id: { in: sessionIds },
          deleted_at: null
        },
        data: {
          deleted_at: new Date(),
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
   * 批量硬删除会话
   * @param context 请求上下文
   * @param sessionIds 会话ID列表
   * @returns 操作结果
   */
  static async hardDeleteMultiple(
    context: AuthRequestContext,
    sessionIds: string[]
  ): Promise<DatabaseResult<null>> {
    try {
      const result = await prisma.session.deleteMany({
        where: {
          id: { in: sessionIds }
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
   * 软删除租户的所有会话
   * @param context 请求上下文
   * @param tenantId 租户ID
   * @returns 操作结果
   */
  static async softDeleteByTenantId(
    context: AuthRequestContext,
    tenantId: string
  ): Promise<DatabaseResult<null>> {
    try {
      const result = await prisma.session.updateMany({
        where: {
          tenant_id: tenantId,
          deleted_at: null
        },
        data: {
          deleted_at: new Date(),
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
   * 清理过期会话（软删除）
   * @param context 请求上下文
   * @param beforeDate 过期时间早于此日期的会话
   * @returns 操作结果
   */
  static async cleanupExpiredSessions(
    context: AuthRequestContext,
    beforeDate: Date = new Date()
  ): Promise<DatabaseResult<null>> {
    try {
      const result = await prisma.session.updateMany({
        where: {
          expires_at: {
            lte: beforeDate
          },
          deleted_at: null
        },
        data: {
          deleted_at: new Date(),
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
   * 物理删除已软删除的会话（清理垃圾数据）
   * @param context 请求上下文
   * @param beforeDate 删除时间早于此日期的已软删除会话
   * @returns 操作结果
   */
  static async purgeDeletedSessions(
    context: AuthRequestContext,
    beforeDate: Date
  ): Promise<DatabaseResult<null>> {
    try {
      const result = await prisma.session.deleteMany({
        where: {
          deleted_at: {
            lte: beforeDate
          }
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

  // ===== 统计查询方法 =====

  /**
   * 统计活跃会话数量
   * @param context 请求上下文
   * @param tenantId 租户ID（可选）
   * @returns 活跃会话数量
   */
  static async getActiveSessionCount(context: AuthRequestContext, tenantId?: string): Promise<number> {
    const whereConditions: any = {
      deleted_at: null,
      expires_at: {
        gt: new Date()
      }
    };

    if (tenantId) {
      whereConditions.tenant_id = tenantId;
    }

    return await prisma.session.count({
      where: whereConditions
    });
  }

  /**
   * 按日期统计会话创建数量
   * @param context 请求上下文
   * @param startDate 开始日期
   * @param endDate 结束日期
   * @param tenantId 租户ID（可选）
   * @returns 按日期分组的统计结果
   */
  static async getSessionStatsByDate(
    context: AuthRequestContext,
    startDate: Date,
    endDate: Date,
    tenantId?: string
  ): Promise<Array<{ date: string; count: number }>> {
    const whereConditions: any = {
      created_at: {
        gte: startDate,
        lte: endDate
      }
    };

    if (tenantId) {
      whereConditions.tenant_id = tenantId;
    }

    const sessions = await prisma.session.findMany({
      where: whereConditions,
      select: {
        created_at: true
      }
    });

    // 按日期分组统计
    const dailyMap = new Map<string, number>();
    
    sessions.forEach(session => {
      const dateKey = session.created_at.toISOString().split('T')[0];
      dailyMap.set(dateKey, (dailyMap.get(dateKey) || 0) + 1);
    });

    return Array.from(dailyMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
} 