import winston from 'winston';
import path from 'path';
import fs from 'fs';
import { ErrorLogData, ErrorContext } from '../types';
import { LOGGER_CONFIG } from '../constants';

/**
 * 确保日志目录存在
 */
function ensureLogDirs(){
  [LOGGER_CONFIG.LOG_DIR, LOGGER_CONFIG.ARCHIVED_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir,{recursive: true});
  });
}

/**
 * 清理过期归档文件
 */
function cleanOldArchives(){
  try{
    const now = Date.now();
    const retention = LOGGER_CONFIG.ARCHIVE_RETENTION_DAYS * 24 * 3600 * 1000; // 30天
    fs.readdirSync(LOGGER_CONFIG.ARCHIVED_DIR).forEach(file => {
      const fp = path.join(LOGGER_CONFIG.ARCHIVED_DIR, file);
      if (fs.statSync(fp).mtimeMs < now - retention){
        fs.unlinkSync(fp);
      }
    });
  } catch (err){
    // 可选本地控制台警告
    console.warn('Failed to clean old archives:', err);
  }
}

/**
 * 归档当前错误日志文件
 */
function archiveLogIfNeeded() {
  try{
    if (!fs.existsSync(LOGGER_CONFIG.ERROR_LOG_PATH)) return;
    const stats = fs.statSync(LOGGER_CONFIG.ERROR_LOG_PATH);
    if (stats.size >= LOGGER_CONFIG.MAX_FILE_SIZE) {
      const now = new Date();
      const ts = now.toISOString().replace(/:/g, '-').replace(/\./g, '-').replace('T', '_').substring(0, 19);
      const archiveName = `error_${ts}.log`;
      const archivePath = path.join(LOGGER_CONFIG.ARCHIVED_DIR, archiveName);
      fs.renameSync(LOGGER_CONFIG.ERROR_LOG_PATH, archivePath);
      cleanOldArchives();
    }
  } catch (err) {
    console.error('Failed to archive log:', err);
  }
}

// 全局错误捕获系统
let currentContext: ErrorContext = {};
let loggerInstance: winston.Logger;

/**
 * 创建/重建winston logger日志实例
 */
function getWinstonLogger(): winston.Logger {
  if (loggerInstance) return loggerInstance;
  ensureLogDirs();
  archiveLogIfNeeded();

  loggerInstance = winston.createLogger({
    level: LOGGER_CONFIG.WINSTON_CONFIG.level,
    format: winston.format.combine(
      winston.format.timestamp({ format: LOGGER_CONFIG.WINSTON_CONFIG.timestampFormat }),
      winston.format.json()
    ),
    transports: [
      new winston.transports.File({
        filename: LOGGER_CONFIG.ERROR_LOG_PATH,
        level: LOGGER_CONFIG.WINSTON_CONFIG.level,
        maxsize: LOGGER_CONFIG.WINSTON_CONFIG.maxsize,
        maxFiles: LOGGER_CONFIG.WINSTON_CONFIG.maxFiles,
        tailable: LOGGER_CONFIG.WINSTON_CONFIG.tailable
      })
    ]
  });
  return loggerInstance;
}

/**
 * 记录错误到日志文件
 */
function recordError(
  errorMessage: string,
  errorReason: string,
  operation: string
) {
  archiveLogIfNeeded();
  const errorData: ErrorLogData = {
    ...currentContext,
    timestamp: new Date().toISOString(),
    errorMessage,
    errorReason,
    operation
  };
  getWinstonLogger().error('System automatically captured error', errorData);
}

// 全局异常/Promise拒绝/警告处理
function setupGlobalErrorHandlers() {
  process.on('uncaughtException', (error: Error) => {
    recordError(
      error.message,
      error.stack || error.toString(),
      currentContext.operation || 'uncaughtException'
    );
    setTimeout(() => process.exit(1), 1000);
  });

  process.on('unhandledRejection', (reason: any) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? (reason.stack || reason.toString()) : String(reason);
    recordError(
      message,
      stack,
      currentContext.operation || 'unhandledRejection'
    );
  });

  process.on('warning', (warning: Error) => {
    if (warning.name !== 'DeprecationWarning' && warning.name !== 'ExperimentalWarning') {
      recordError(
        `System warning: ${warning.message}`,
        warning.stack || warning.toString(),
        currentContext.operation || 'System warning'
      );
    }
  });
}

// ====== 对外API ======

/** 日志基础API */
export const logger = {
  info: (msg: string, ...args: any[]) => {
    console.log(`ℹ️ ${msg}`, ...args);
    getWinstonLogger().info(msg, ...args);
  },
  error: (msg: string, ...args: any[]) => {
    console.error(`❌ ${msg}`, ...args);
    recordError(msg, args.length > 0 ? JSON.stringify(args) : msg, 'system');
  },
  warn: (msg: string, ...args: any[]) => {
    console.warn(`⚠️ ${msg}`, ...args);
    getWinstonLogger().warn(msg, ...args);
  },
  debug: (msg: string, ...args: any[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`🐛 ${msg}`, ...args);
      getWinstonLogger().debug(msg, ...args);
    }
  }
};

/** 设置全局错误上下文 */
export function setLoggerContext(ctx: ErrorContext) {
  currentContext = { ...ctx };
}

/** 清除全局错误上下文 */
export function clearLoggerContext() {
  currentContext = {};
}

/** 更新全局错误上下文 */
export function updateLoggerContext(updates: Partial<ErrorContext>) {
  currentContext = { ...currentContext, ...updates };
}

/** 初始化全局错误捕获系统（应用启动时调用） */
export function initializeErrorCapture() {
  getWinstonLogger();
  setupGlobalErrorHandlers();
  console.log('Auto error capture system has been started');
}

/** 包装业务操作自动捕获/清理上下文，兼容同步/异步 */
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
  setLoggerContext({ ...context, operation });
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .catch((err: Error) => {
          recordError(err.message, err.stack || err.toString(), operation);
          throw err;
        })
        .finally(() => clearLoggerContext());
    } else {
      clearLoggerContext();
      return result;
    }
  } catch (err) {
    const error = err as Error;
    recordError(error.message, error.stack || error.toString(), operation);
    clearLoggerContext();
    throw err;
  }
}