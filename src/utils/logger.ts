import winston from 'winston';
import path from 'path';
import fs from 'fs';

/**
 * 错误日志接口
 * 定义错误日志必须包含的字段
 */
interface ErrorLogData {
  tenantId?: string;        // 租户ID
  timestamp: string;        // 错误发生时间
  sessionId?: string;       // 相关会话ID
  errorMessage: string;     // 错误消息
  errorReason: string;      // 错误原因/堆栈
  ipAddress?: string;       // 客户端IP地址
  operation: string;        // 执行的操作
}

/**
 * 错误上下文接口
 * 用于传递当前操作的上下文信息
 */
interface ErrorContext {
  tenantId?: string;
  sessionId?: string;
  operation?: string;
  ipAddress?: string;
}

/**
 * 日志目录管理类
 * 负责创建和管理日志目录结构
 */
class LogDirectoryManager {
  private static readonly LOG_DIR = 'logs';
  private static readonly ARCHIVED_DIR = path.join('logs', 'archived');

  /**
   * 确保日志目录存在
   */
  static ensureDirectories(): void {
    if (!fs.existsSync(this.LOG_DIR)) {
      fs.mkdirSync(this.LOG_DIR, { recursive: true });
    }
    if (!fs.existsSync(this.ARCHIVED_DIR)) {
      fs.mkdirSync(this.ARCHIVED_DIR, { recursive: true });
    }
  }

  /**
   * 清理30天前的归档日志
   */
  static cleanOldArchives(): void {
    try {
      const archiveFiles = fs.readdirSync(this.ARCHIVED_DIR);
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      archiveFiles.forEach(file => {
        const filePath = path.join(this.ARCHIVED_DIR, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < thirtyDaysAgo) {
          fs.unlinkSync(filePath);
          console.log(`${file} has over 30 days, so it has been deleted`);
        }
      });
    } catch (error) {
      console.error('Failed to clean up archived logs:', error);
    }
  }
}

/**
 * 日志归档管理器
 * 处理日志文件的归档和轮转
 */
class LogArchiveManager {
  private static readonly ERROR_LOG_PATH = path.join('logs', 'error.log');
  private static readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  /**
   * 检查是否需要归档当前日志文件
   */
  static shouldArchive(): boolean {
    try {
      if (!fs.existsSync(this.ERROR_LOG_PATH)) {
        return false;
      }
      const stats = fs.statSync(this.ERROR_LOG_PATH);
      return stats.size >= this.MAX_FILE_SIZE;
    } catch {
      return false;
    }
  }

  /**
   * 归档当前错误日志文件
   */
  static archiveCurrentLog(): void {
    try {
      if (!fs.existsSync(this.ERROR_LOG_PATH)) {
        return;
      }

      const now = new Date();
      const timestamp = now.toISOString()
        .replace(/:/g, '-')
        .replace(/\./g, '-')
        .replace('T', '_')
        .substring(0, 19);
      
      const archiveFileName = `error_${timestamp}.log`;
      const archivePath = path.join('logs', 'archived', archiveFileName);

      // 移动当前日志到归档目录
      fs.renameSync(this.ERROR_LOG_PATH, archivePath);
      console.log(`Log has been archived to: ${archiveFileName}`);

      // 清理旧归档
      LogDirectoryManager.cleanOldArchives();
    } catch (error) {
      console.error('Failed to archive logs:', error);
    }
  }
}

/**
 * 自动错误捕获系统
 * 全局错误监听和自动记录系统
 */
class AutoErrorCaptureSystem {
  private winstonLogger: winston.Logger;
  private static instance: AutoErrorCaptureSystem | null = null;
  private currentContext: ErrorContext = {};

  private constructor() {
    // 确保目录存在
    LogDirectoryManager.ensureDirectories();

    // 检查是否需要归档
    if (LogArchiveManager.shouldArchive()) {
      LogArchiveManager.archiveCurrentLog();
    }

    // 创建Winston日志实例
    this.winstonLogger = winston.createLogger({
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          maxsize: 5 * 1024 * 1024, // 5MB
          maxFiles: 1,
          tailable: false
        })
      ],
      silent: false
    });

    // 启动自动错误捕获
    this.setupGlobalErrorHandlers();
  }

  /**
   * 获取单例实例
   */
  static getInstance(): AutoErrorCaptureSystem {
    if (!this.instance) {
      this.instance = new AutoErrorCaptureSystem();
    }
    return this.instance;
  }

  /**
   * 设置当前操作的上下文信息
   * 在业务操作开始时调用，设置当前操作的租户、会话等信息
   */
  setContext(context: ErrorContext): void {
    this.currentContext = { ...context };
  }

  /**
   * 清除当前上下文
   * 在业务操作完成时调用
   */
  clearContext(): void {
    this.currentContext = {};
  }

  /**
   * 更新上下文中的特定字段
   */
  updateContext(updates: Partial<ErrorContext>): void {
    this.currentContext = { ...this.currentContext, ...updates };
  }

  /**
   * 设置全局错误处理器
   * 自动捕获未处理的异常和Promise拒绝
   */
  private setupGlobalErrorHandlers(): void {
    // 捕获未处理的异常
    process.on('uncaughtException', (error: Error) => {
      this.recordError(
        error.message,
        error.stack || error.toString(),
        this.currentContext.operation || 'Unknown operation-uncaughtException'
      );
      
      // 给日志写入时间，然后优雅退出
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    });

    // 捕获未处理的Promise拒绝
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      const errorMessage = reason instanceof Error ? reason.message : String(reason);
      const errorReason = reason instanceof Error ? (reason.stack || reason.toString()) : String(reason);
      
      this.recordError(
        errorMessage,
        errorReason,
        this.currentContext.operation || 'Unknown operation-unhandledRejection'
      );
    });

    // 捕获警告（可选）
    process.on('warning', (warning: Error) => {
      // 只记录严重警告，避免日志过多
      if (warning.name === 'DeprecationWarning' || warning.name === 'ExperimentalWarning') {
        return;
      }
      
      this.recordError(
        `System warning: ${warning.message}`,
        warning.stack || warning.toString(),
        this.currentContext.operation || 'System warning'
      );
    });
  }

  /**
   * 记录错误到日志文件
   */
  public recordError(
    errorMessage: string,
    errorReason: string,
    operation: string
  ): void {
    const errorData: ErrorLogData = {
      tenantId: this.currentContext.tenantId,
      timestamp: new Date().toISOString(),
      sessionId: this.currentContext.sessionId,
      errorMessage,
      errorReason,
      ipAddress: this.currentContext.ipAddress,
      operation
    };

    // 检查文件大小，如果需要则归档
    if (LogArchiveManager.shouldArchive()) {
      LogArchiveManager.archiveCurrentLog();
      this.recreateLogger();
    }

    this.winstonLogger.error('System automatically captured error', errorData);
  }

  /**
   * 重新创建logger实例
   */
  private recreateLogger(): void {
    this.winstonLogger.close();
    this.winstonLogger = winston.createLogger({
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          maxsize: 5 * 1024 * 1024,
          maxFiles: 1,
          tailable: false
        })
      ],
      silent: false
    });
  }
}

/**
 * 包装函数：为业务操作提供错误捕获
 * 自动设置和清理上下文，捕获操作中的错误
 */
export function withErrorCapture<T>(
  operation: string,
  context: ErrorContext,
  fn: () => Promise<T>
): Promise<T>;

export function withErrorCapture<T>(
  operation: string,
  context: ErrorContext,
  fn: () => T
): T;

export function withErrorCapture<T>(
  operation: string,
  context: ErrorContext,
  fn: () => T | Promise<T>
): T | Promise<T> {
  const errorCapture = AutoErrorCaptureSystem.getInstance();
  
  // 设置上下文
  errorCapture.setContext({
    ...context,
    operation
  });

  try {
    const result = fn();
    
    // 如果是Promise，处理异步错误
    if (result instanceof Promise) {
      return result
        .catch((error: Error) => {
          errorCapture.recordError(
            error.message,
            error.stack || error.toString(),
            operation
          );
          throw error; // 重新抛出错误，让上层处理
        })
        .finally(() => {
          errorCapture.clearContext();
        });
    } else {
      // 同步操作完成，清理上下文
      errorCapture.clearContext();
      return result;
    }
  } catch (error) {
    // 捕获同步错误
    const err = error as Error;
    errorCapture.recordError(
      err.message,
      err.stack || err.toString(),
      operation
    );
    errorCapture.clearContext();
    throw error; // 重新抛出错误，让上层处理
  }
}

/**
 * 设置当前请求的上下文
 * 在处理HTTP请求时调用，设置租户ID、IP等信息
 */
export function setRequestContext(tenantId?: string, ipAddress?: string): void {
  const errorCapture = AutoErrorCaptureSystem.getInstance();
  errorCapture.setContext({ tenantId, ipAddress });
}

/**
 * 更新当前上下文中的会话ID
 * 在处理认证相关操作时调用
 */
export function setSessionContext(sessionId: string): void {
  const errorCapture = AutoErrorCaptureSystem.getInstance();
  errorCapture.updateContext({ sessionId });
}

/**
 * 清除所有上下文
 * 在请求处理完成时调用
 */
export function clearContext(): void {
  const errorCapture = AutoErrorCaptureSystem.getInstance();
  errorCapture.clearContext();
}

/**
 * 初始化错误捕获系统
 * 在应用启动时调用一次
 */
export function initializeErrorCapture(): void {
  AutoErrorCaptureSystem.getInstance();
  console.log('Auto error capture system has been started');
}

/**
 * 导出错误捕获实例（用于特殊情况的手动调用）
 */
export const errorCapture = AutoErrorCaptureSystem.getInstance();

/**
 * 标准日志接口 - 兼容其他模块的logger导入
 */
export const logger = {
  info: (message: string, ...args: any[]) => {
    console.log(`ℹ️ ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    console.error(`❌ ${message}`, ...args);
    // 同时记录到错误捕获系统
    const errorSystem = AutoErrorCaptureSystem.getInstance();
    errorSystem.recordError(
      message,
      args.length > 0 ? JSON.stringify(args) : message,
      'system'
    );
  },
  warn: (message: string, ...args: any[]) => {
    console.warn(`⚠️ ${message}`, ...args);
  },
  debug: (message: string, ...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`🐛 ${message}`, ...args);
    }
  }
}; 