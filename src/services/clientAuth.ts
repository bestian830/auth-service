// src/services/clientAuth.ts
import { Request } from 'express';
import * as bcrypt from 'bcryptjs';
import { prisma } from '../infra/prisma.js';

export type ClientType = 'PUBLIC' | 'CONFIDENTIAL';
export type TokenEndpointAuthMethod = 'none' | 'client_secret_basic' | 'client_secret_post';

export interface ClientAuthResult {
  success: boolean;
  clientId?: string;
  clientType?: ClientType;
  error?: string;
}

/**
 * 解析客户端认证信息
 */
function parseClientAuth(req: Request): { clientId: string; clientSecret?: string } | null {
  // 1. 尝试从 Authorization Basic header 解析
  const authHeader = req.get('authorization');
  if (authHeader?.startsWith('Basic ')) {
    try {
      const credentials = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
      const [clientId, clientSecret] = credentials.split(':');
      if (clientId) {
        return { clientId, clientSecret };
      }
    } catch {
      // ignore parse error
    }
  }

  // 2. 尝试从表单参数解析
  const { client_id, client_secret } = req.body;
  if (client_id) {
    return { clientId: client_id, clientSecret: client_secret };
  }

  return null;
}

/**
 * 验证客户端认证
 */
export async function authenticateClient(req: Request): Promise<ClientAuthResult> {
  const authInfo = parseClientAuth(req);
  if (!authInfo) {
    return { success: false, error: 'client_authentication_required' };
  }

  const { clientId, clientSecret } = authInfo;

  // 从数据库获取客户端信息
  const client = await prisma.client.findUnique({
    where: { clientId },
    select: {
      clientId: true,
      type: true,
      secretHash: true,
      authMethod: true
    }
  });

  if (!client) {
    return { success: false, error: 'invalid_client' };
  }

  const clientType = client.type as ClientType;
  const authMethod = client.authMethod as TokenEndpointAuthMethod;

  // 公共客户端验证
  if (clientType === 'PUBLIC') {
    if (authMethod !== 'none') {
      return { success: false, error: 'invalid_client_auth_method' };
    }
    if (clientSecret) {
      return { success: false, error: 'public_client_no_secret' };
    }
    return { success: true, clientId, clientType };
  }

  // 机密客户端验证
  if (clientType === 'CONFIDENTIAL') {
    if (authMethod === 'none') {
      return { success: false, error: 'confidential_client_requires_auth' };
    }

    if (!clientSecret) {
      return { success: false, error: 'client_secret_required' };
    }

    if (!client.secretHash) {
      return { success: false, error: 'client_secret_not_configured' };
    }

    // 验证密钥
    const secretValid = await bcrypt.compare(clientSecret, client.secretHash);
    if (!secretValid) {
      return { success: false, error: 'invalid_client_secret' };
    }

    return { success: true, clientId, clientType };
  }

  return { success: false, error: 'unsupported_client_type' };
}

/**
 * 验证授权类型是否允许
 */
export function validateGrantType(clientType: ClientType, grantType: string): boolean {
  switch (grantType) {
    case 'authorization_code':
      return true; // 两种客户端都支持
    case 'refresh_token':
      return true; // 两种客户端都支持
    case 'client_credentials':
      return clientType === 'CONFIDENTIAL'; // 只有机密客户端支持
    default:
      return false;
  }
}