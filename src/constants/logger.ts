import * as path from 'path';

/**
 * 日志系统相关常量配置
 */
export const LOGGER_CONFIG = {
  // 目录配置
  LOG_DIR: 'logs',
  ARCHIVED_DIR: path.join('logs', 'archived'),
  ERROR_LOG_PATH: path.join('logs', 'error.log'),
  
  // 文件大小限制
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  
  // 清理配置
  ARCHIVE_RETENTION_DAYS: 30,
  
  // Winston 配置
  WINSTON_CONFIG: {
    level: 'error',
    maxsize: 5 * 1024 * 1024, // 5MB
    maxFiles: 1,
    tailable: false,
    timestampFormat: 'YYYY-MM-DD HH:mm:ss'
  }
} as const; 