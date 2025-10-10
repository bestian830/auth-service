// src/middleware/adminAuth.ts
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { audit } from './audit.js';

// Admin 配置类型
interface AdminInfo {
  name: string;
  role: string;
  email: string;
}

// 解析 ADMIN_API_KEYS 环境变量
function parseAdminKeys(): Record<string, AdminInfo> {
  const keys: Record<string, AdminInfo> = {};

  if (!env.adminApiKeys || env.adminApiKeys.trim() === '') {
    return keys;
  }

  const keyList = env.adminApiKeys.split(',').map(k => k.trim()).filter(Boolean);

  for (const key of keyList) {
    // 格式: admin_{name}_sk_{random}
    const match = key.match(/^admin_([a-zA-Z0-9_]+)_sk_([a-zA-Z0-9]+)$/);
    if (match) {
      const name = match[1];
      keys[key] = {
        name: name.charAt(0).toUpperCase() + name.slice(1), // 首字母大写
        role: 'admin',
        email: `${name}@admin.local`
      };
    }
  }

  return keys;
}

// 全局 Admin 密钥映射
const adminKeys = parseAdminKeys();

/**
 * Admin 认证中间件
 * 验证 X-Admin-Key header
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const apiKey = (req.headers['x-admin-key'] || req.headers['X-Admin-Key']) as string | undefined;

  if (!apiKey || !adminKeys[apiKey]) {
    audit('admin_auth_failed', {
      ip: req.ip,
      providedKey: apiKey ? apiKey.substring(0, 15) + '...' : 'none',
      userAgent: req.get('user-agent')
    });

    return res.status(403).json({
      error: 'invalid_admin_key',
      detail: 'Invalid or missing admin API key'
    });
  }

  // 将管理员信息附加到请求对象
  (req as any).admin = adminKeys[apiKey];

  next();
}
