// src/services/organization.ts
import { prisma } from '../infra/prisma.js';
import { audit } from '../middleware/audit.js';

export interface CreateOrganizationRequest {
  userId: string; // 所有者(老板)
  orgName: string;
  productType: 'beauty' | 'fb';
  orgType: 'MAIN' | 'BRANCH' | 'FRANCHISE';
  parentOrgId?: string; // MAIN 必须为空；BRANCH/FRANCHISE 必须提供 MAIN 父组织
  description?: string;
  location?: string;
  phone?: string;
  email?: string;
}

export class OrganizationService {
  /**
   * 验证父组织是否合法
   * - MAIN: 不允许 parentOrgId
   * - BRANCH/FRANCHISE: 必须存在且为当前 userId 拥有的 MAIN 组织，且 productType 匹配、状态 ACTIVE
   */
  async validateParentOrg(params: {
    userId: string;
    productType: 'beauty' | 'fb';
    orgType: 'MAIN' | 'BRANCH' | 'FRANCHISE';
    parentOrgId?: string;
  }): Promise<{ ok: boolean; error?: string }> {
    const { userId, productType, orgType, parentOrgId } = params;
    if (orgType === 'MAIN') {
      if (parentOrgId) return { ok: false, error: 'main_org_must_not_have_parent' };
      return { ok: true };
    }

    if (!parentOrgId) return { ok: false, error: 'parent_org_required' };

    const parent = await prisma.organization.findFirst({
      where: {
        id: parentOrgId,
        userId,
        orgType: 'MAIN',
        productType,
        status: 'ACTIVE',
      },
      select: { id: true },
    });

    if (!parent) return { ok: false, error: 'invalid_parent_org' };
    return { ok: true };
  }

  /**
   * 创建新组织（支持产品隔离与层级）
   */
  async createOrganization(request: CreateOrganizationRequest) {
    const validation = await this.validateParentOrg({
      userId: request.userId,
      productType: request.productType,
      orgType: request.orgType,
      parentOrgId: request.parentOrgId,
    });
    if (!validation.ok) {
      throw new Error(validation.error);
    }

    const organization = await prisma.organization.create({
      data: {
        userId: request.userId,
        orgName: request.orgName,
        orgType: request.orgType as any,
        productType: request.productType as any,
        parentOrgId: request.orgType === 'MAIN' ? null : request.parentOrgId!,
        description: request.description,
        location: request.location,
        phone: request.phone,
        email: request.email,
        status: 'ACTIVE',
      },
    });

    audit('org_created', {
      organizationId: organization.id,
      userId: request.userId,
      orgType: request.orgType,
      productType: request.productType,
      parentOrgId: organization.parentOrgId,
    });

    return organization;
  }

  /** 获取组织信息 */
  async getOrganization(organizationId: string) {
    return await prisma.organization.findUnique({ where: { id: organizationId } });
  }

  /**
   * 获取用户拥有的组织列表(按 productType 过滤)
   */
  async getUserOrganizations(userId: string, productType?: 'beauty' | 'fb') {
    const organizations = await prisma.organization.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        ...(productType ? { productType: productType as any } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
    return organizations;
  }

  /**
   * 基础权限检查（考虑组织存在/状态/所有者/可选的组织类型）
   */
  async checkUserPermission(params: {
    userId: string;
    organizationId: string;
    requiredOrgType?: 'MAIN' | 'BRANCH' | 'FRANCHISE';
  }): Promise<{ hasAccess: boolean; reason?: string }> {
    const { userId, organizationId, requiredOrgType } = params;
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) return { hasAccess: false, reason: 'org_not_found' };
    if (org.status !== 'ACTIVE') return { hasAccess: false, reason: 'org_not_active' };
    if (org.userId !== userId) return { hasAccess: false, reason: 'access_denied' };
    if (requiredOrgType && org.orgType !== requiredOrgType) {
      return { hasAccess: false, reason: 'org_type_mismatch' };
    }
    return { hasAccess: true };
  }

  /** 更新组织信息 */
  async updateOrganization(organizationId: string, updates: {
    orgName?: string;
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

  /** 暂停组织 */
  async suspendOrganization(organizationId: string, reason?: string) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { status: 'SUSPENDED' },
    });
    audit('organization_suspended', { organizationId, reason });
  }

  /** 激活组织 */
  async activateOrganization(organizationId: string) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { status: 'ACTIVE' },
    });
    audit('organization_activated', { organizationId });
  }

  /** 删除组织（软删除） */
  async deleteOrganization(organizationId: string) {
    await prisma.organization.update({
      where: { id: organizationId },
      data: { status: 'DELETED' },
    });
    audit('organization_deleted', { organizationId });
  }
}

export const organizationService = new OrganizationService();