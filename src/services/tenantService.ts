import { hashPassword, comparePassword, generateVerificationCode } from '../utils';
import { TENANT_UNIQUE_FIELDS, TENANT_ERRORS } from '../constants';
import {
  RegisterTenantInput,
  UpdateTenantInput,
  ChangeTenantPasswordInput,
  TenantInfo,
  TenantField
} from '../types';
import { logger, cleanNullableField } from '../utils';
import { PrismaClient } from '../../generated/prisma';
const prisma = new PrismaClient();

/**
 * 注册新租户
 */
export async function registerTenant(input: RegisterTenantInput): Promise<TenantInfo> {
  const cleanedInput = {
    ...input,
    storeName: cleanNullableField(input.storeName),
    subdomain: cleanNullableField(input.subdomain),
    phone: cleanNullableField(input.phone),
    address: cleanNullableField(input.address),
  }

  // 构造 OR 查询条件数组
  const orConditions: any[] = [{ email: cleanedInput.email }];
  if (cleanedInput.subdomain) {
    orConditions.push({ subdomain: cleanedInput.subdomain });
  }

  // 一次性查询所有冲突的租户（包括已删除和未删除的）
  const allConflicts = await prisma.tenant.findMany({
    where: {
      OR: orConditions
    },
    select: {
      id: true,
      email: true,
      subdomain: true,
      deleted_at: true
    }
  });

  // 检查是否有未删除的冲突租户
  const activeConflicts = allConflicts.filter(t => t.deleted_at === null);
  if (activeConflicts.length > 0) {
    // 优先检查邮箱冲突（邮箱优先级更高）
    const emailConflict = activeConflicts.find(t => t.email === cleanedInput.email);
    if (emailConflict) {
      throw new Error(TENANT_ERRORS.EMAIL_EXISTS);
    }
    
    // 检查子域名冲突（仅有填写时检查）
    if (cleanedInput.subdomain) {
      const subdomainConflict = activeConflicts.find(t => t.subdomain === cleanedInput.subdomain);
      if (subdomainConflict) {
        throw new Error(TENANT_ERRORS.SUBDOMAIN_EXISTS);
      }
    }
  }

  // 查找软删除的账号（用于恢复）
  // 优先选择邮箱匹配的软删除账号，如果没有则选择子域名匹配的
  const deletedTenants = allConflicts.filter(t => t.deleted_at !== null);
  const deletedTenant = deletedTenants.find(t => t.email === cleanedInput.email) || 
                       (cleanedInput.subdomain ? deletedTenants.find(t => t.subdomain === cleanedInput.subdomain) : null);

  const passwordHash = await hashPassword(cleanedInput.password);

  let tenant;
  if (deletedTenant) {
    // 账号恢复
    tenant = await prisma.tenant.update({
      where: { id: deletedTenant.id },
      data: {
        password_hash: passwordHash,
        store_name: cleanedInput.storeName,
        subdomain: cleanedInput.subdomain,
        address: cleanedInput.address,
        phone: cleanedInput.phone,
        deleted_at: null,
        email_verified_at: null,
        updated_at: new Date()
      }
    });
    logger.info('Tenant restored (soft undelete)', { tenantId: tenant.id });
  } else {
    // 新建账号
    tenant = await prisma.tenant.create({
      data: {
        email: cleanedInput.email,
        phone: cleanedInput.phone,
        password_hash: passwordHash,
        store_name: cleanedInput.storeName,
        subdomain: cleanedInput.subdomain,
        address: cleanedInput.address,
        email_verified_at: null
      }
    });
    logger.info('Tenant registered', { tenantId: tenant.id });
  }

  // 生成邮箱验证码和过期时间（10分钟）
  const verificationCode = generateVerificationCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      email_verification_code: verificationCode,
      email_verification_code_expires_at: expiresAt,
    }
  });

  return mapTenantInfo(tenant);
}

/**
 * 更新租户信息
 */
export async function updateTenantInfo(input: UpdateTenantInput): Promise<TenantInfo> {
  // 仅校验要更新的字段 & 排除自己
  const orConditions = [
    input.email ? { email: input.email } : undefined,
    input.subdomain ? { subdomain: input.subdomain } : undefined,
  ].filter(Boolean) as any[];

  if (orConditions.length > 0) {
    const conflict = await prisma.tenant.findFirst({
      where: {
        id: { not: input.tenantId },
        deleted_at: null,  // 排除软删除的记录
        OR: orConditions
      }
    });
    if (conflict) {
      if (input.email && conflict.email === input.email) throw new Error(TENANT_ERRORS.EMAIL_EXISTS);
      if (input.subdomain && conflict.subdomain === input.subdomain) throw new Error(TENANT_ERRORS.SUBDOMAIN_EXISTS);
    }
  }

  // 查询现有tenant信息（用于对比email是否变更）
  const oldTenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
  if (!oldTenant) throw new Error(TENANT_ERRORS.TENANT_NOT_FOUND);

  const updateData: any = {
    store_name: input.storeName,
    subdomain: input.subdomain,
    phone: input.phone,
    address: input.address,
    email: input.email,
  };

  // ⚠️ 邮箱变更才重置邮箱验证状态
  if (input.email && input.email !== oldTenant.email) {
    updateData.email_verified_at = null;
  }

  const tenant = await prisma.tenant.update({
    where: { id: input.tenantId },
    data: updateData,
  });

  logger.info('Tenant updated', { tenantId: tenant.id });
  return mapTenantInfo(tenant);
}

/**
 * 修改密码
 */
export async function changeTenantPassword(input: ChangeTenantPasswordInput): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: input.tenantId } });
  if (!tenant) throw new Error(TENANT_ERRORS.TENANT_NOT_FOUND);

  const ok = await comparePassword(input.oldPassword, tenant.password_hash);
  if (!ok) throw new Error(TENANT_ERRORS.INVALID_PASSWORD);

  const newHash = await hashPassword(input.newPassword);
  await prisma.tenant.update({
    where: { id: input.tenantId },
    data: { password_hash: newHash }
  });
  logger.info('Tenant password changed', { tenantId: input.tenantId });
}

/**
 * 检查唯一性
 */
export async function checkUniqueFields(field: TenantField, value: string): Promise<boolean> {
  if (!TENANT_UNIQUE_FIELDS.includes(field)) throw new Error('Invalid check field');
  const exist = await prisma.tenant.findFirst({ 
    where: { 
      [field]: value,
      deleted_at: null  // 排除软删除的记录
    } 
  });
  return !exist;
}

/**
 * 查找租户
 */
export async function getTenantById(tenantId: string): Promise<TenantInfo | null> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  return tenant ? mapTenantInfo(tenant) : null;
}
export async function getTenantByEmail(email: string): Promise<TenantInfo | null> {
  const tenant = await prisma.tenant.findUnique({ where: { email } });
  return tenant ? mapTenantInfo(tenant) : null;
}

/**
 * 软删除租户
 */
export async function softDeleteTenant(tenantId: string): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { deleted_at: new Date() }
  });
  logger.info('Tenant soft deleted', { tenantId });
}



/**
 * tenant -> TenantInfo 映射
 */
function mapTenantInfo(tenant: any): TenantInfo {
  return {
    id: tenant.id,
    email: tenant.email,
    phone: tenant.phone,
    storeName: tenant.store_name,
    subdomain: tenant.subdomain,
    address: tenant.address,
    emailVerified: !!tenant.email_verified_at,
    createdAt: tenant.created_at,
    updatedAt: tenant.updated_at
  };
}