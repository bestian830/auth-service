// controllers/tenantController.ts

import { Request, Response } from 'express';
import { 
  updateTenantInfo, 
  changeTenantPassword, 
  checkUniqueFields, 
  getTenantById, 
  getTenantByEmail, 
  softDeleteTenant, 
  verifyEmail,
} from '../services';
import { logger } from '../utils';

/**
 * 更新租户信息
 */
export async function updateTenantInfoController(req: Request, res: Response) {
  try {
    const input = { ...req.body, tenantId: req.params.tenantId || req.body.tenantId };
    const result = await updateTenantInfo(input);
    return res.json({ success: true, data: result });
  } catch (error: any) {
    logger.error('Update tenant info failed', { error });
    return res.status(400).json({ success: false, error: error.message });
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
    logger.error('Change tenant password failed', { error });
    return res.status(400).json({ success: false, error: error.message });
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
    logger.error('Check unique field failed', { error });
    return res.status(400).json({ success: false, error: error.message });
  }
}

/**
 * 根据ID查找租户
 */
export async function getTenantByIdController(req: Request, res: Response) {
  try {
    const { tenantId } = req.params;
    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Missing tenantId' });
    }
    const data = await getTenantById(tenantId);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }
    return res.json({ success: true, data });
  } catch (error: any) {
    logger.error('Get tenant by id failed', { error });
    return res.status(400).json({ success: false, error: error.message });
  }
}

/**
 * 根据邮箱查找租户
 */
export async function getTenantByEmailController(req: Request, res: Response) {
  try {
    const { email } = req.query;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Missing email' });
    }
    const data = await getTenantByEmail(email as string);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }
    return res.json({ success: true, data });
  } catch (error: any) {
    logger.error('Get tenant by email failed', { error });
    return res.status(400).json({ success: false, error: error.message });
  }
}

/**
 * 软删除租户
 */
export async function softDeleteTenantController(req: Request, res: Response) {
  try {
    const { tenantId } = req.params;
    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Missing tenantId' });
    }
    await softDeleteTenant(tenantId);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error('Soft delete tenant failed', { error });
    return res.status(400).json({ success: false, error: error.message });
  }
}

/**
 * 邮箱验证激活
 */
export async function verifyEmailController(req: Request, res: Response) {
  try {
    const { tenantId } = req.params;
    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Missing tenantId' });
    }
    await verifyEmail(tenantId);
    return res.json({ success: true });
  } catch (error: any) {
    logger.error('Verify email failed', { error });
    return res.status(400).json({ success: false, error: error.message });
  }
}
