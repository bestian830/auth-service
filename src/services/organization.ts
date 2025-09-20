// src/services/organization.ts
import { prisma } from '../src/infra/prisma.js';
import { OrganizationStatus } from '@prisma/client';
import { audit } from '../middleware/audit.js';

export interface CreateOrganizationRequest {
  name: string;
  ownerId: string;
  description?: string;
  location?: string;
  phone?: string;
  email?: string;
}

export class OrganizationService {
  /**
   * 创建新组织
   * Auth-service只负责基础组织管理，不涉及用户角色
   */
  async createOrganization(request: CreateOrganizationRequest) {
    const organization = await prisma.organization.create({
      data: {
        name: request.name,
        ownerId: request.ownerId,
        description: request.description,
        location: request.location,
        phone: request.phone,
        email: request.email,
        status: OrganizationStatus.ACTIVE,
      },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
          }
        }
      }
    });

    audit('organization_created', {
      organizationId: organization.id,
      ownerId: request.ownerId,
      name: request.name,
    });

    return organization;
  }

  /**
   * 获取组织信息
   * 简化版本，不包含用户角色和设备信息（这些由其他微服务管理）
   */
  async getOrganization(organizationId: string) {
    return await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        owner: {
          select: {
            id: true,
            email: true,
            name: true,
          }
        }
      }
    });
  }

  /**
   * 获取用户拥有的组织列表
   * 只返回用户作为owner的组织
   */
  async getUserOrganizations(userId: string) {
    const organizations = await prisma.organization.findMany({
      where: {
        ownerId: userId,
        status: OrganizationStatus.ACTIVE,
      }
    });

    return organizations;
  }

  /**
   * 检查用户对组织的基础访问权限
   * 简化版本：只检查是否为组织owner
   * 详细的角色权限检查由employee-service处理
   */
  async checkUserPermission(userId: string, organizationId: string, requiredRole?: string) {
    // 检查组织是否存在且活跃
    const organization = await prisma.organization.findUnique({
      where: { 
        id: organizationId,
        status: OrganizationStatus.ACTIVE 
      }
    });

    if (!organization) {
      return { hasAccess: false, role: null };
    }

    // 检查是否为组织所有者
    const isOwner = organization.ownerId === userId;
    
    if (!isOwner) {
      return { hasAccess: false, role: null };
    }

    // 如果是owner，具有所有权限
    return { 
      hasAccess: true, 
      role: 'OWNER' 
    };
  }

  /**
   * 更新组织信息
   */
  async updateOrganization(organizationId: string, updates: {
    name?: string;
    description?: string;
    location?: string;
    phone?: string;
    email?: string;
  }) {
    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data: updates,
    });

    audit('organization_updated', {
      organizationId,
      updates,
    });

    return organization;
  }

  /**
   * 暂停组织
   */
  async suspendOrganization(organizationId: string, reason?: string) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        status: OrganizationStatus.SUSPENDED,
      }
    });

    audit('organization_suspended', {
      organizationId,
      reason,
    });
  }

  /**
   * 激活组织
   */
  async activateOrganization(organizationId: string) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        status: OrganizationStatus.ACTIVE,
      }
    });

    audit('organization_activated', {
      organizationId,
    });
  }

  /**
   * 删除组织（软删除）
   */
  async deleteOrganization(organizationId: string) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: {
        status: OrganizationStatus.DELETED,
      }
    });

    audit('organization_deleted', {
      organizationId,
    });
  }

  // ===== 以下功能已移到employee-service =====
  
  /**
   * @deprecated 用户角色管理已移到employee-service
   * 请调用employee-service的API来管理用户角色
   */
  async addUserToOrganization() {
    throw new Error('User role management has been moved to employee-service. Please use employee-service API.');
  }

  /**
   * @deprecated 用户角色管理已移到employee-service  
   * 请调用employee-service的API来管理用户角色
   */
  async removeUserFromOrganization() {
    throw new Error('User role management has been moved to employee-service. Please use employee-service API.');
  }

  /**
   * @deprecated 用户角色管理已移到employee-service
   * 请调用employee-service的API来管理用户角色
   */
  async updateUserRole() {
    throw new Error('User role management has been moved to employee-service. Please use employee-service API.');
  }
}

export const organizationService = new OrganizationService();