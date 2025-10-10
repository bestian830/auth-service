// src/services/clientAuth.ts
import { Request } from 'express';
import * as bcrypt from 'bcryptjs';
// 简化为无需数据库客户端表：按是否提供 client_secret 推断客户端类型

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
  // 简化策略：提供了 client_secret → CONFIDENTIAL；否则 PUBLIC（无需验证密钥）
  const clientType: ClientType = clientSecret ? 'CONFIDENTIAL' : 'PUBLIC';
  return { success: true, clientId, clientType };
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
    case 'password':
      return true; // 支持简化的密码模式
    default:
      return false;
  }
}