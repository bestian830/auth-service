// controllers/tenantController.ts

import { Request, Response } from 'express';
import { 
  updateTenantInfo, 
  changeTenantPassword, 
  checkUniqueFields, 
  getTenantById, 
  getTenantByEmail, 
  softDeleteTenant,
} from '../services';
import { logger } from '../utils';

/**
 * 统一错误处理函数
 */
function handleError(error: any, res: Response, operation: string) {
  logger.error(`${operation} failed`, { error });
  
  // Prisma 错误处理
  if (error.code === 'P2025') {
    return res.status(404).json({ success: false, error: 'Tenant not found' });
  }
  
  if (error.code === 'P2002') {
    return res.status(400).json({ success: false, error: 'Duplicate field value' });
  }
  
  // 业务错误直接返回
  if (error.message && !error.stack) {
    return res.status(400).json({ success: false, error: error.message });
  }
  
  // 系统错误不泄露详情
  return res.status(500).json({ success: false, error: 'Internal server error' });
}

/**
 * 更新租户信息
 */
export async function updateTenantInfoController(req: Request, res: Response) {
  try {
    // 使用 JWT 中的 tenantId，确保数据隔离
    const input = { ...req.body, tenantId: req.tenantId };
    const result = await updateTenantInfo(input);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    return handleError(error, res, 'Update tenant info');
  }
}

/**
 * 修改租户密码
 */
export async function changeTenantPasswordController(req: Request, res: Response) {
  try {
    const input = req.body;
    await changeTenantPassword(input);
    return res.json({ success: true });
  } catch (error: any) {
    return handleError(error, res, 'Change tenant password');
  }
}

/**
 * 检查字段唯一性
 */
export async function checkUniqueFieldsController(req: Request, res: Response) {
  try {
    const { field, value } = req.query;
    if (!field || !value) {
      return res.status(400).json({ success: false, error: 'Missing field or value' });
    }
    const unique = await checkUniqueFields(field as any, value as string);
    return res.json({ success: true, unique });
  } catch (error: any) {
    return handleError(error, res, 'Check unique field');
  }
}

/**
 * 根据ID查找租户
 */
export async function getTenantByIdController(req: Request, res: Response) {
  try {
    // 使用 JWT 中的 tenantId，确保数据隔离
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Missing tenantId' });
    }
    // 传递请求者ID进行权限验证
    const data = await getTenantById(tenantId, tenantId);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(error, res, 'Get tenant by id');
  }
}

/**
 * 根据邮箱查找租户
 */
export async function getTenantByEmailController(req: Request, res: Response) {
  try {
    // 使用 JWT 中的邮箱，确保数据隔离
    const email = req.jwtPayload?.email;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Missing email' });
    }
    // 传递请求者邮箱进行权限验证
    const data = await getTenantByEmail(email, email);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(error, res, 'Get tenant by email');
  }
}

/**
 * 软删除租户
 */
export async function softDeleteTenantController(req: Request, res: Response) {
  try {
    // 使用 JWT 中的 tenantId，确保数据隔离
    const tenantId = req.tenantId;
    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Missing tenantId' });
    }
    await softDeleteTenant(tenantId);
    return res.json({ success: true });
  } catch (error: any) {
    return handleError(error, res, 'Soft delete tenant');
  }
}


