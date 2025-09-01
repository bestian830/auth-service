import { prisma } from '../infra/prisma.js';
import { env } from '../config/env.js';

export interface TenantAuthContext {
  clientId: string;
  tenantId: string;
  requestedScopes: string[];
  requestedAud?: string;
}

export interface ValidatedTenantAuth {
  tenantId: string;
  allowedScopes: string[];
  finalAud: string;
}

/**
 * R5: 多租户强隔离验证
 */
export async function validateTenantAuthorization(context: TenantAuthContext): Promise<ValidatedTenantAuth> {
  // 1. 查找客户端的租户配置
  const tenantClient = await prisma.tenantClient.findUnique({
    where: {
      clientId_tenantId: {
        clientId: context.clientId,
        tenantId: context.tenantId
      }
    }
  });

  if (!tenantClient) {
    throw new Error('unauthorized_tenant');
  }

  // 2. 验证 scope 权限
  const requestedScopes = context.requestedScopes;
  const allowedScopes = tenantClient.allowedScopes;
  
  // 检查请求的 scope 是否都在允许范围内
  const unauthorizedScopes = requestedScopes.filter(scope => !allowedScopes.includes(scope));
  if (unauthorizedScopes.length > 0) {
    throw new Error(`unauthorized_scope: ${unauthorizedScopes.join(', ')}`);
  }

  // 3. 验证和构造 audience
  let finalAud: string;

  if (context.requestedAud) {
    // 显式为 string[]，容错空值
    const prefixes: string[] = Array.isArray(tenantClient.allowedAudPrefixes)
      ? (tenantClient.allowedAudPrefixes as string[])
      : [];

    const isAllowed: boolean = prefixes.length === 0
      ? true
      : prefixes.some((prefix: string) => context.requestedAud!.startsWith(prefix));
    
    if (!isAllowed) {
      throw new Error('unauthorized_audience');
    }
    
    // 确保 aud 包含租户 ID
    if (!context.requestedAud.includes(`:${context.tenantId}`)) {
      throw new Error('audience_missing_tenant');
    }
    
    finalAud = context.requestedAud;
  } else {
    // 使用默认 aud
    if (tenantClient.defaultAud) {
      finalAud = tenantClient.defaultAud;
    } else {
      // 构造默认格式：prefix:tenant_id
      const defaultPrefix = tenantClient.allowedAudPrefixes[0] || env.defaultAudPrefix;
      finalAud = `${defaultPrefix}:${context.tenantId}`;
    }
  }

  // 4. 如果启用了严格 audience 验证
  if (env.tenantEnforceAud) {
    if (!finalAud.includes(`:${context.tenantId}`)) {
      throw new Error('audience_tenant_mismatch');
    }
  }

  return {
    tenantId: context.tenantId,
    allowedScopes: requestedScopes, // 返回验证通过的 scope
    finalAud
  };
}

/**
 * 获取用户可用的租户和权限
 */
export async function getUserTenantScopes(userId: string, clientId: string): Promise<string[]> {
  // 获取用户信息
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true, roles: true }
  });

  if (!user) {
    return [];
  }

  // 获取该客户端在用户租户下的配置
  const tenantClient = await prisma.tenantClient.findUnique({
    where: {
      clientId_tenantId: {
        clientId: clientId,
        tenantId: user.tenantId
      }
    }
  });

  if (!tenantClient) {
    return [];
  }

  let availableScopes: string[] = Array.isArray(tenantClient.allowedScopes)
    ? (tenantClient.allowedScopes as string[])
    : [];

  // 示例：管理员角色可以访问所有 scope；普通用户去掉 admin / manage 相关
  if (!user.roles?.includes('admin')) {
    availableScopes = availableScopes.filter((scope: string) => {
      return !scope.includes('admin') && !scope.includes('manage');
    });
  }

  return availableScopes;
}

/**
 * 创建或更新租户客户端配置
 */
export async function createTenantClient(config: {
  clientId: string;
  tenantId: string;
  allowedAudPrefixes: string[];
  allowedScopes: string[];
  defaultAud?: string;
}) {
  return await prisma.tenantClient.upsert({
    where: {
      clientId_tenantId: {
        clientId: config.clientId,
        tenantId: config.tenantId
      }
    },
    create: config,
    update: {
      allowedAudPrefixes: config.allowedAudPrefixes,
      allowedScopes: config.allowedScopes,
      defaultAud: config.defaultAud
    }
  });
}

/**
 * 验证客户端是否有权访问指定租户
 */
export async function validateClientTenantAccess(clientId: string, tenantId: string): Promise<boolean> {
  const count = await prisma.tenantClient.count({
    where: {
      clientId,
      tenantId
    }
  });
  
  return count > 0;
}