// src/services/organization.ts
import { prisma } from '../infra/prisma.js';
import { OrganizationStatus, Role, UserRoleStatus } from '@prisma/client';
import { audit } from '../middleware/audit.js';

export interface CreateOrganizationRequest {
  name: string;
  ownerId: string;
  description?: string;
}

export interface AddUserToOrganizationRequest {
  userId: string;
  organizationId: string;
  role: Role;
}

export class OrganizationService {
  /**
   * 创建新组织
   */
  async createOrganization(request: CreateOrganizationRequest) {
    const organization = await prisma.organization.create({
      data: {
        name: request.name,
        ownerId: request.ownerId,
        description: request.description,
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

    // 自动给创建者添加OWNER角色
    await prisma.userRole.create({
      data: {
        userId: request.ownerId,
        organizationId: organization.id,
        role: Role.OWNER,
        status: UserRoleStatus.ACTIVE,
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
        },
        userRoles: {
          where: {
            status: UserRoleStatus.ACTIVE
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              }
            }
          }
        },
        devices: {
          where: {
            status: 'ACTIVE'
          }
        }
      }
    });
  }

  /**
   * 获取用户的组织列表
   */
  async getUserOrganizations(userId: string) {
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId,
        status: UserRoleStatus.ACTIVE,
      },
      include: {
        organization: true
      }
    });

    return userRoles.filter(ur => ur.organization && ur.organization.status === OrganizationStatus.ACTIVE).map(ur => ({
      organizationId: ur.organizationId,
      organization: ur.organization,
      role: ur.role,
      joinedAt: ur.joinedAt,
    }));
  }

  /**
   * 添加用户到组织
   */
  async addUserToOrganization(request: AddUserToOrganizationRequest) {
    // 检查组织是否存在且激活
    const organization = await prisma.organization.findUnique({
      where: { 
        id: request.organizationId,
        status: OrganizationStatus.ACTIVE 
      }
    });

    if (!organization) {
      throw new Error('Organization not found or inactive');
    }

    // 检查用户是否存在
    const user = await prisma.user.findUnique({
      where: { id: request.userId }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // 检查是否已经存在角色关系
    const existingRole = await prisma.userRole.findUnique({
      where: {
        userId_organizationId: {
          userId: request.userId,
          organizationId: request.organizationId,
        }
      }
    });

    if (existingRole && existingRole.status === UserRoleStatus.ACTIVE) {
      throw new Error('User already has a role in this organization');
    }

    // 创建或更新用户角色
    const userRole = await prisma.userRole.upsert({
      where: {
        userId_organizationId: {
          userId: request.userId,
          organizationId: request.organizationId,
        }
      },
      update: {
        role: request.role,
        status: UserRoleStatus.ACTIVE,
        leftAt: null,
      },
      create: {
        userId: request.userId,
        organizationId: request.organizationId,
        role: request.role,
        status: UserRoleStatus.ACTIVE,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          }
        },
        organization: {
          select: {
            id: true,
            name: true,
          }
        }
      }
    });

    audit('user_added_to_organization', {
      userId: request.userId,
      organizationId: request.organizationId,
      role: request.role,
    });

    return userRole;
  }

  /**
   * 移除用户的组织角色
   */
  async removeUserFromOrganization(userId: string, organizationId: string) {
    const userRole = await prisma.userRole.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        }
      }
    });

    if (!userRole) {
      throw new Error('User role not found');
    }

    // 不能移除组织的拥有者
    if (userRole.role === Role.OWNER) {
      throw new Error('Cannot remove organization owner');
    }

    await prisma.userRole.update({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        }
      },
      data: {
        status: UserRoleStatus.LEFT,
        leftAt: new Date(),
      }
    });

    audit('user_removed_from_organization', {
      userId,
      organizationId,
      role: userRole.role,
    });
  }

  /**
   * 更新用户在组织中的角色
   */
  async updateUserRole(userId: string, organizationId: string, newRole: Role) {
    const userRole = await prisma.userRole.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        }
      }
    });

    if (!userRole || userRole.status !== UserRoleStatus.ACTIVE) {
      throw new Error('User role not found or inactive');
    }

    // 不能修改拥有者角色
    if (userRole.role === Role.OWNER || newRole === Role.OWNER) {
      throw new Error('Cannot modify owner role');
    }

    await prisma.userRole.update({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        }
      },
      data: {
        role: newRole,
      }
    });

    audit('user_role_updated', {
      userId,
      organizationId,
      oldRole: userRole.role,
      newRole,
    });
  }

  /**
   * 检查用户在组织中的权限
   */
  async checkUserPermission(userId: string, organizationId: string, requiredRole?: Role) {
    const userRole = await prisma.userRole.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId,
        }
      },
      include: {
        organization: {
          select: {
            status: true
          }
        }
      }
    });

    if (!userRole || 
        userRole.status !== UserRoleStatus.ACTIVE ||
        userRole.organization?.status !== OrganizationStatus.ACTIVE) {
      return { hasAccess: false, role: null };
    }

    // 如果指定了必需角色，检查权限等级
    if (requiredRole) {
      const roleHierarchy = {
        [Role.EMPLOYEE]: 0,
        [Role.MANAGER]: 1,
        [Role.OWNER]: 2,
      };

      const userLevel = roleHierarchy[userRole.role];
      const requiredLevel = roleHierarchy[requiredRole];

      return { 
        hasAccess: userLevel >= requiredLevel, 
        role: userRole.role 
      };
    }

    return { hasAccess: true, role: userRole.role };
  }

  /**
   * 停用组织
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
}

export const organizationService = new OrganizationService();