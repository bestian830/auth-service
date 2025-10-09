// src/controllers/organizations.ts
import { Request, Response } from 'express';
import { prisma } from '../infra/prisma.js';
import { audit } from '../middleware/audit.js';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

// 验证邮箱格式
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// 验证组织名称
function validateOrgName(orgName: string): { valid: boolean; error?: string } {
  if (!orgName || orgName.trim().length < 2) {
    return { valid: false, error: 'Organization name must be at least 2 characters' };
  }
  if (orgName.length > 100) {
    return { valid: false, error: 'Organization name must not exceed 100 characters' };
  }
  return { valid: true };
}

// 2.1 创建组织
export async function createOrganization(req: Request, res: Response) {
  const { orgName, orgType, parentOrgId, description, location, phone, email } = req.body;
  const claims = (req as any).claims;
  const userId = claims?.sub;
  const productTypeFromHeader = req.headers['x-product-type'] as string;

  try {
    // 验证请求头
    if (!productTypeFromHeader || !['beauty', 'fb'].includes(productTypeFromHeader)) {
      return res.status(400).json({
        error: 'invalid_request',
        detail: 'X-Product-Type header is required and must be "beauty" or "fb"'
      });
    }

    // 验证 token 中的 productType 与请求头一致
    const productTypeFromToken = claims?.productType;
    if (productTypeFromToken && productTypeFromToken !== productTypeFromHeader) {
      return res.status(400).json({
        error: 'product_type_mismatch',
        detail: 'X-Product-Type header must match the product type in your access token'
      });
    }

    // 验证必填字段
    if (!orgName || !orgType) {
      return res.status(400).json({
        error: 'missing_required_fields',
        detail: 'orgName and orgType are required'
      });
    }

    // 验证 orgType
    if (!['MAIN', 'BRANCH', 'FRANCHISE'].includes(orgType)) {
      return res.status(400).json({
        error: 'invalid_org_type',
        detail: 'orgType must be MAIN, BRANCH, or FRANCHISE'
      });
    }

    // 验证组织名称
    const nameValidation = validateOrgName(orgName);
    if (!nameValidation.valid) {
      return res.status(400).json({
        error: 'invalid_org_name',
        detail: nameValidation.error
      });
    }

    // 验证电话格式
    if (phone) {
      try {
        if (!isValidPhoneNumber(phone)) {
          return res.status(400).json({
            error: 'invalid_phone',
            detail: 'Phone number format is invalid. Please use international format (e.g., +16041234567)'
          });
        }
      } catch (e) {
        return res.status(400).json({
          error: 'invalid_phone',
          detail: 'Phone number format is invalid'
        });
      }
    }

    // 验证邮箱格式
    if (email && !isValidEmail(email)) {
      return res.status(400).json({
        error: 'invalid_email',
        detail: 'Email format is invalid'
      });
    }

    // 根据 orgType 验证 parentOrgId
    if (orgType === 'MAIN') {
      // MAIN 组织不能有父组织
      if (parentOrgId !== null && parentOrgId !== undefined) {
        return res.status(400).json({
          error: 'invalid_parent_org',
          detail: 'MAIN organization cannot have a parent organization'
        });
      }
      // 用户可以拥有多个不同品牌的 MAIN 组织（例如：既是7分甜的老板，又是名创优品的老板）
    } else {
      // BRANCH 或 FRANCHISE 必须有父组织
      if (!parentOrgId) {
        return res.status(400).json({
          error: 'missing_parent_org',
          detail: 'BRANCH and FRANCHISE organizations must have a parent organization'
        });
      }

      // 验证父组织
      const parentOrg = await prisma.organization.findUnique({
        where: { id: parentOrgId }
      });

      if (!parentOrg) {
        return res.status(400).json({
          error: 'invalid_parent_org',
          detail: 'Parent organization not found'
        });
      }

      if (parentOrg.userId !== userId) {
        return res.status(400).json({
          error: 'invalid_parent_org',
          detail: 'Parent organization must belong to you'
        });
      }

      if (parentOrg.orgType !== 'MAIN') {
        return res.status(400).json({
          error: 'invalid_parent_org',
          detail: 'Parent organization must be a MAIN organization'
        });
      }

      if (parentOrg.productType !== productTypeFromHeader) {
        return res.status(400).json({
          error: 'invalid_parent_org',
          detail: 'Parent organization must have matching product type'
        });
      }

      if (parentOrg.status !== 'ACTIVE') {
        return res.status(400).json({
          error: 'invalid_parent_org',
          detail: 'Parent organization must be active'
        });
      }
    }

    // 创建组织
    const organization = await prisma.organization.create({
      data: {
        userId,
        orgName: orgName.trim(),
        orgType: orgType as any,
        productType: productTypeFromHeader as any,
        parentOrgId: parentOrgId || null,
        description: description?.trim() || null,
        location: location?.trim() || null,
        phone: phone || null,
        email: email || null,
        status: 'ACTIVE'
      }
    });

    audit('org_created', {
      userId,
      orgId: organization.id,
      orgType,
      productType: productTypeFromHeader
    });

    return res.status(201).json({
      success: true,
      message: 'Organization created successfully',
      data: {
        id: organization.id,
        orgName: organization.orgName,
        orgType: organization.orgType,
        productType: organization.productType,
        parentOrgId: organization.parentOrgId,
        description: organization.description,
        location: organization.location,
        phone: organization.phone,
        email: organization.email,
        status: organization.status,
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt
      }
    });
  } catch (error) {
    console.error('Create organization error:', error);
    audit('org_create_error', { userId, error: String(error) });
    return res.status(500).json({ error: 'server_error' });
  }
}

// 2.2 获取用户的所有组织
export async function getOrganizations(req: Request, res: Response) {
  const claims = (req as any).claims;
  const userId = claims?.sub;
  const productTypeFromHeader = req.headers['x-product-type'] as string;
  const { orgType, status } = req.query;

  try {
    // 验证请求头
    if (!productTypeFromHeader || !['beauty', 'fb'].includes(productTypeFromHeader)) {
      return res.status(400).json({
        error: 'invalid_request',
        detail: 'X-Product-Type header is required and must be "beauty" or "fb"'
      });
    }

    // 验证 token 中的 productType 与请求头一致
    const productTypeFromToken = claims?.productType;
    if (productTypeFromToken && productTypeFromToken !== productTypeFromHeader) {
      return res.status(400).json({
        error: 'product_type_mismatch',
        detail: 'X-Product-Type header must match the product type in your access token'
      });
    }

    // 构建查询条件
    const where: any = {
      userId,
      productType: productTypeFromHeader
    };

    if (orgType && ['MAIN', 'BRANCH', 'FRANCHISE'].includes(orgType as string)) {
      where.orgType = orgType;
    }

    if (status && ['ACTIVE', 'SUSPENDED', 'DELETED'].includes(status as string)) {
      where.status = status;
    } else {
      // 默认只返回 ACTIVE
      where.status = 'ACTIVE';
    }

    // 查询组织列表
    const organizations = await prisma.organization.findMany({
      where,
      orderBy: [
        { orgType: 'asc' }, // MAIN 优先 (按字母排序 BRANCH < FRANCHISE < MAIN)
        { createdAt: 'asc' }
      ]
    });

    // 获取父组织信息
    const parentOrgIds = organizations
      .map(org => org.parentOrgId)
      .filter((id): id is string => !!id);

    const parentOrgs = parentOrgIds.length > 0
      ? await prisma.organization.findMany({
          where: { id: { in: parentOrgIds } },
          select: { id: true, orgName: true }
        })
      : [];

    const parentOrgMap = new Map(parentOrgs.map(org => [org.id, org.orgName]));

    // 组装响应数据
    const data = organizations.map(org => ({
      id: org.id,
      orgName: org.orgName,
      orgType: org.orgType,
      productType: org.productType,
      parentOrgId: org.parentOrgId,
      ...(org.parentOrgId && { parentOrgName: parentOrgMap.get(org.parentOrgId) }),
      description: org.description,
      location: org.location,
      phone: org.phone,
      email: org.email,
      status: org.status,
      createdAt: org.createdAt
    }));

    return res.json({
      success: true,
      data,
      total: data.length
    });
  } catch (error) {
    console.error('Get organizations error:', error);
    return res.status(500).json({ error: 'server_error' });
  }
}

// 2.3 获取单个组织详情
export async function getOrganization(req: Request, res: Response) {
  const { orgId } = req.params;
  const claims = (req as any).claims;
  const userId = claims?.sub;

  try {
    // 查询组织
    const organization = await prisma.organization.findUnique({
      where: { id: orgId }
    });

    if (!organization) {
      return res.status(404).json({
        error: 'org_not_found',
        detail: 'Organization not found'
      });
    }

    // 检查权限
    if (organization.userId !== userId) {
      return res.status(403).json({
        error: 'access_denied',
        detail: "You don't have permission to access this organization"
      });
    }

    // 查询父组织信息（如果有）
    let parentOrgName: string | undefined;
    if (organization.parentOrgId) {
      const parentOrg = await prisma.organization.findUnique({
        where: { id: organization.parentOrgId },
        select: { orgName: true }
      });
      parentOrgName = parentOrg?.orgName;
    }

    // 统计子组织数量
    let statistics: { branchCount?: number; franchiseCount?: number } | undefined;
    if (organization.orgType === 'MAIN') {
      const [branchCount, franchiseCount] = await Promise.all([
        prisma.organization.count({
          where: {
            parentOrgId: organization.id,
            orgType: 'BRANCH',
            status: 'ACTIVE'
          }
        }),
        prisma.organization.count({
          where: {
            parentOrgId: organization.id,
            orgType: 'FRANCHISE',
            status: 'ACTIVE'
          }
        })
      ]);
      statistics = { branchCount, franchiseCount };
    }

    return res.json({
      success: true,
      data: {
        id: organization.id,
        orgName: organization.orgName,
        orgType: organization.orgType,
        productType: organization.productType,
        parentOrgId: organization.parentOrgId,
        ...(parentOrgName && { parentOrgName }),
        description: organization.description,
        location: organization.location,
        phone: organization.phone,
        email: organization.email,
        status: organization.status,
        createdAt: organization.createdAt,
        updatedAt: organization.updatedAt,
        ...(statistics && { statistics })
      }
    });
  } catch (error) {
    console.error('Get organization error:', error);
    return res.status(500).json({ error: 'server_error' });
  }
}

// 2.4 更新组织信息
export async function updateOrganization(req: Request, res: Response) {
  const { orgId } = req.params;
  const { orgName, description, location, phone, email } = req.body;
  const claims = (req as any).claims;
  const userId = claims?.sub;

  try {
    // 查询组织
    const organization = await prisma.organization.findUnique({
      where: { id: orgId }
    });

    if (!organization) {
      return res.status(404).json({
        error: 'org_not_found',
        detail: 'Organization not found'
      });
    }

    // 检查权限
    if (organization.userId !== userId) {
      return res.status(403).json({
        error: 'access_denied',
        detail: "You don't have permission to update this organization"
      });
    }

    // 验证字段格式
    if (orgName !== undefined) {
      const nameValidation = validateOrgName(orgName);
      if (!nameValidation.valid) {
        return res.status(400).json({
          error: 'invalid_org_name',
          detail: nameValidation.error
        });
      }
    }

    if (phone !== undefined && phone !== null) {
      try {
        if (!isValidPhoneNumber(phone)) {
          return res.status(400).json({
            error: 'invalid_phone',
            detail: 'Phone number format is invalid. Please use international format'
          });
        }
      } catch (e) {
        return res.status(400).json({
          error: 'invalid_phone',
          detail: 'Phone number format is invalid'
        });
      }
    }

    if (email !== undefined && email !== null && !isValidEmail(email)) {
      return res.status(400).json({
        error: 'invalid_email',
        detail: 'Email format is invalid'
      });
    }

    // 构建更新数据
    const updateData: any = {};
    if (orgName !== undefined) updateData.orgName = orgName.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (location !== undefined) updateData.location = location?.trim() || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (email !== undefined) updateData.email = email || null;

    // 更新组织
    const updatedOrg = await prisma.organization.update({
      where: { id: orgId },
      data: updateData
    });

    audit('org_updated', {
      userId,
      orgId,
      updatedFields: Object.keys(updateData)
    });

    return res.json({
      success: true,
      message: 'Organization updated successfully',
      data: {
        id: updatedOrg.id,
        orgName: updatedOrg.orgName,
        orgType: updatedOrg.orgType,
        productType: updatedOrg.productType,
        description: updatedOrg.description,
        location: updatedOrg.location,
        phone: updatedOrg.phone,
        email: updatedOrg.email,
        status: updatedOrg.status,
        createdAt: updatedOrg.createdAt,
        updatedAt: updatedOrg.updatedAt
      }
    });
  } catch (error) {
    console.error('Update organization error:', error);
    return res.status(500).json({ error: 'server_error' });
  }
}

// 2.5 删除组织（软删除）
export async function deleteOrganization(req: Request, res: Response) {
  const { orgId } = req.params;
  const claims = (req as any).claims;
  const userId = claims?.sub;

  try {
    // 查询组织
    const organization = await prisma.organization.findUnique({
      where: { id: orgId }
    });

    if (!organization) {
      return res.status(404).json({
        error: 'org_not_found',
        detail: 'Organization not found'
      });
    }

    // 检查权限
    if (organization.userId !== userId) {
      return res.status(403).json({
        error: 'access_denied',
        detail: "You don't have permission to delete this organization"
      });
    }

    // 检查是否有活跃的子组织
    const activeChildren = await prisma.organization.count({
      where: {
        parentOrgId: orgId,
        status: 'ACTIVE'
      }
    });

    if (activeChildren > 0) {
      return res.status(400).json({
        error: 'has_active_children',
        detail: 'Cannot delete organization with active branches or franchises. Please delete them first.'
      });
    }

    // 检查是否有活跃的账号
    const activeAccounts = await prisma.account.count({
      where: {
        orgId,
        status: 'ACTIVE'
      }
    });

    if (activeAccounts > 0) {
      return res.status(400).json({
        error: 'has_active_accounts',
        detail: 'Cannot delete organization with active accounts. Please delete all accounts first.'
      });
    }

    // 软删除
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        status: 'DELETED'
      }
    });

    audit('org_deleted', { userId, orgId });

    return res.json({
      success: true,
      message: 'Organization deleted successfully'
    });
  } catch (error) {
    console.error('Delete organization error:', error);
    return res.status(500).json({ error: 'server_error' });
  }
}
