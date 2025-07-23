/**
 * CORS 跨域配置模块
 * 主要职责：根据环境变量动态生成 CORS 配置项，支持多来源、认证凭证与必要头部管理。
 * 
 * 输入：无显式输入，依赖 process.env.CORS_ORIGIN 及 AUTH_HEADERS 常量
 * 输出：标准 Express CORS 中间件配置对象 corsConfig
 * 
 * 执行逻辑：
 * 1. 读取 CORS_ORIGIN 环境变量（以逗号分隔）构建 origin 白名单，若未定义则使用 localhost 默认值
 * 2. 启用 credentials 跨域凭证支持
 * 3. 设置允许头部（如 Authorization、Refresh-Token、Tenant-Id 等认证字段）
 * 4. 设置暴露头部（让前端可读取 Session-Id / Tenant-Id / Refresh-Token 等）
 */

import { get } from 'http';
import { AUTH_HEADERS } from '../types';

const getCorsOrigin = (): string[] => {
  const raw = process.env.CORS_ORIGIN || 'http://localhost:3002';
  if (!raw) return ['http://localhost:3000'];
  return raw.split(',').map(origin => origin.trim());
};

/**
 * 跨域配置对象
 */
export const corsConfig = {
  origin: getCorsOrigin(),
  credentials: true,
  optionsSuccessStatus: 200,
  allowedHeaders: [
    'Content-Type',
    AUTH_HEADERS.AUTHORIZATION,
    AUTH_HEADERS.REFRESH_TOKEN,
    AUTH_HEADERS.TENANT_ID,
    AUTH_HEADERS.SESSION_ID
  ],
  exposedHeaders: [
    AUTH_HEADERS.TENANT_ID,
    AUTH_HEADERS.SESSION_ID,
    AUTH_HEADERS.AUTHORIZATION,
    AUTH_HEADERS.REFRESH_TOKEN
  ]
};