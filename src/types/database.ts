/**
 * 数据库连接状态接口
 */
export interface DatabaseConnectionStatus {
  connected: boolean;
  connectionCount?: number;
  maxConnections?: number;
  database?: string;
  host?: string;
  port?: number;
  error?: string;
}

/**
 * 数据库配置接口
 */
export interface DatabaseConfig {
  readonly connectionLimit: number;
  readonly acquireTimeout: number;
  readonly timeout: number;
  readonly maxRetries: number;
  readonly retryDelay: number;
  readonly idleTimeout: number;
  readonly shutdownTimeout: number;
} 