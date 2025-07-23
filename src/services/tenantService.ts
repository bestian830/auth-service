import { hashPassword, comparePassword } from '../utils';
import { TENANT_UNIQUE_FIELDS, TENANT_ERRORS } from '../constants';
import {
  RegisterTenantInput,
  UpdateTenantInput,
  ChangeTenantPasswordInput,
  TenantInfo,
  TenantField
} from '../types';
import { logger } from '../utils';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * 注册新租户
 */
export async function registerTenant(input: RegisterTenantInput): Promise<TenantInfo> {
  // 批量唯一性校验（只查一次库）
  const conflict = await prisma.tenant.findFirst({
    where: {
      OR: [
        { email: input.email },
        { subdomain: input.subdomain }
      ]
    }
  });
  if (conflict) {
    if (conflict.email === input.email) throw new Error(TENANT_ERRORS.EMAIL_EXISTS);
    if (conflict.subdomain === input.subdomain) throw new Error(TENANT_ERRORS.SUBDOMAIN_EXISTS);
  }
  const passwordHash = await hashPassword(input.password);
  const tenant = await prisma.tenant.create({
    data: {
      email: input.email,
      phone: input.phone,
      password_hash: passwordHash,
      store_name: input.storeName,
      subdomain: input.subdomain,
      address: input.address,
      email_verified_at: null
    }
  });
  logger.info('Tenant registered', { tenantId: tenant.id });
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
  ].filter(Boolean); // 去除 undefined

  if (orConditions.length > 0) {
    const conflict = await prisma.tenant.findFirst({
      where: {
        id: { not: input.tenantId },
        OR: orConditions
      }
    });
    if (conflict) {
      if (input.email && conflict.email === input.email) throw new Error(TENANT_ERRORS.EMAIL_EXISTS);
      if (input.subdomain && conflict.subdomain === input.subdomain) throw new Error(TENANT_ERRORS.SUBDOMAIN_EXISTS);
    }
  }

  const tenant = await prisma.tenant.update({
    where: { id: input.tenantId },
    data: {
      store_name: input.storeName,
      subdomain: input.subdomain,
      phone: input.phone,
      address: input.address,
      email: input.email
    }
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
  const exist = await prisma.tenant.findFirst({ where: { [field]: value } });
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
 * 邮箱验证激活
 */
export async function verifyEmail(tenantId: string): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { email_verified_at: new Date() }
  });
  logger.info('Tenant email verified', { tenantId });
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