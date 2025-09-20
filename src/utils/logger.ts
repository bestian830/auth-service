// src/utils/logger.ts
import { env } from '../config/env.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: any;
  service: string;
}

class Logger {
  private serviceName = 'auth-service';
  
  private formatMessage(level: LogLevel, message: string, context?: any): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      context,
      service: this.serviceName
    };
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevel = env.nodeEnv === 'production' ? 'info' : 'debug';
    return levels.indexOf(level) >= levels.indexOf(currentLevel);
  }

  private writeLog(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return;

    const output = env.nodeEnv === 'production' 
      ? JSON.stringify(entry)
      : this.formatForDevelopment(entry);

    switch (entry.level) {
      case 'debug':
        console.debug(output);
        break;
      case 'info':
        console.info(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output);
        break;
    }
  }

  private formatForDevelopment(entry: LogEntry): string {
    const timestamp = entry.timestamp.split('T')[1].replace('Z', '');
    const levelColor = {
      debug: '\x1b[36m', // cyan
      info: '\x1b[32m',  // green  
      warn: '\x1b[33m',  // yellow
      error: '\x1b[31m'  // red
    }[entry.level];
    
    const reset = '\x1b[0m';
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
    
    return `${levelColor}[${entry.level.toUpperCase()}]${reset} ${timestamp} ${entry.message}${contextStr}`;
  }

  debug(message: string, context?: any): void {
    this.writeLog(this.formatMessage('debug', message, context));
  }

  info(message: string, context?: any): void {
    this.writeLog(this.formatMessage('info', message, context));
  }

  warn(message: string, context?: any): void {
    this.writeLog(this.formatMessage('warn', message, context));
  }

  error(message: string, context?: any): void {
    this.writeLog(this.formatMessage('error', message, context));
  }

  // 特殊方法：设备相关日志
  device(message: string, deviceId?: string, context?: any): void {
    this.info(message, { ...context, deviceId, category: 'device' });
  }

  // 特殊方法：认证相关日志
  auth(message: string, userId?: string, context?: any): void {
    this.info(message, { ...context, userId, category: 'auth' });
  }

  // 特殊方法：配额相关日志
  quota(message: string, orgId?: string, context?: any): void {
    this.info(message, { ...context, orgId, category: 'quota' });
  }

  // 特殊方法：管理操作日志
  admin(message: string, adminUserId?: string, context?: any): void {
    this.info(message, { ...context, adminUserId, category: 'admin' });
  }
}

// 单例导出
export const logger = new Logger();

// 便利函数
export const log = {
  debug: (message: string, context?: any) => logger.debug(message, context),
  info: (message: string, context?: any) => logger.info(message, context),
  warn: (message: string, context?: any) => logger.warn(message, context),
  error: (message: string, context?: any) => logger.error(message, context),
  device: (message: string, deviceId?: string, context?: any) => logger.device(message, deviceId, context),
  auth: (message: string, userId?: string, context?: any) => logger.auth(message, userId, context),
  quota: (message: string, orgId?: string, context?: any) => logger.quota(message, orgId, context),
  admin: (message: string, adminUserId?: string, context?: any) => logger.admin(message, adminUserId, context)
};

// 默认导出
export default logger;