/**
 * 数据库配置常量
 * 集中管理所有数据库相关的配置参数
 */
export const DATABASE_CONFIG = {
  // 连接池配置
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '50'),
  acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '30000'),
  timeout: parseInt(process.env.DB_TIMEOUT || '30000'),

  // 重连配置
  maxRetries: parseInt(process.env.DB_MAX_RETRIES || '3'),
  retryDelay: parseInt(process.env.DB_RETRY_DELAY || '3000'),

  // 连接保活配置
  idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),

  // 优雅关闭配置
  shutdownTimeout: 10000,
} as const; 