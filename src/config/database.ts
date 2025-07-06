// auth-service/src/config/database.ts
import { PrismaClient } from '../../generated/prisma';
import { logger } from '../utils/logger';
import { config } from './env';

// 数据库连接配置
const DATABASE_CONFIG = {
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '50'), // 最大连接数
  acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '30000'), // 获取连接超时时间 (毫秒)
  timeout: parseInt(process.env.DB_TIMEOUT || '30000'), // 查询超时时间 (毫秒)

  // 重连配置
  maxRetries: parseInt(process.env.DB_MAX_RETRIES || '3'), // 最大重试次数
  retryDelay: parseInt(process.env.DB_RETRY_DELAY || '3000'), // 重试延迟 (毫秒)

  // 连接保活
  idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'), // 空闲连接超时 (毫秒)
};

// 创建全局 Prisma 客户端实例
let prisma: PrismaClient;

declare global {
  // 仅开发环境下用 global 复用连接，防止热重载多实例
  var __prisma: PrismaClient | undefined;
}

// 创建 Prisma 实例
const createPrismaClient = (): PrismaClient => {
  return new PrismaClient({
    // 日志配置：控制Prisma记录哪些信息
    log: config.NODE_ENV === 'production' 
      ? ['error']                           // 生产环境：只记录错误，减少日志量
      : ['query', 'info', 'warn', 'error'], // 开发环境：记录所有信息，便于调试
    
    // 数据源配置：告诉Prisma连接哪个数据库
    datasources: {
      db: {
        url: config.database.url, // 数据库连接字符串，如：postgresql://user:pass@host:port/db
      },
    },

    // 错误格式化：控制错误信息的显示方式
    errorFormat: 'pretty', // 易读格式, 'colorless': 无颜色, 'minimal': 精简格式
  });
};

// 根据环境创建Prisma实例
if (config.NODE_ENV === 'production') {
  // 生产环境：直接创建，因为不会热重载
  prisma = createPrismaClient();
} else {
  // 开发环境：检查global对象中是否已存在客户端
  if (!global.__prisma) {
    global.__prisma = createPrismaClient();
  }
  // 使用global中的客户端（复用连接）
  prisma = global.__prisma;
}

/**
 * 延迟函数，等待指定毫秒数
 */
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));



/**
 * 带重试机制的数据库连接
 */
const connectWithRetry = async (retries: number = DATABASE_CONFIG.maxRetries): Promise<void> => {
  try {
    // 尝试连接数据库
    await prisma.$connect();
    logger.info('✅ Prisma database connection successful');
    logger.info(`📊 connection limit=${DATABASE_CONFIG.connectionLimit}, timeout=${DATABASE_CONFIG.timeout}ms`);
  } catch (error) {
    logger.error(`❌ database connection failed (remaining retries: ${retries}):`, error);
    
    if (retries > 0) {
      // 还有重试次数：等待后重试
      logger.info(`🔄 retry in ${DATABASE_CONFIG.retryDelay}ms...`);
      await delay(DATABASE_CONFIG.retryDelay);
      return connectWithRetry(retries - 1); // 递归调用，重试次数减1
    } else {
      // 重试次数耗尽：抛出错误
      logger.error('❌ database connection retries exhausted, connection failed');
      throw error;
    }
  }
};

/**
 * 初始化数据库连接
 */
export const initDatabase = async (): Promise<void> => {
  try {
    // 第一步：建立数据库连接（包含重试逻辑）
    await connectWithRetry();
    
    // 第二步：设置生产环境的数据库优化参数
    if (config.NODE_ENV === 'production') {
      // 设置单个SQL语句的最大执行时间
      await prisma.$executeRaw`SET statement_timeout = ${DATABASE_CONFIG.timeout}`;
      // 设置事务空闲时的超时时间（避免长时间锁定资源）
      await prisma.$executeRaw`SET idle_in_transaction_session_timeout = ${DATABASE_CONFIG.idleTimeout}`;
      // 记录配置成功
      logger.info('✅ database connection parameters configured');
    }
  } catch (error) {
    logger.error('❌ database initialization failed:', error);
    throw error; // 抛出错误，让调用方知道初始化失败
  }
};

/**
 * 测试数据库连接
 */
export const testConnection = async (): Promise<boolean> => {
  try {
    // 执行最简单的SQL查询测试连通性
    await prisma.$queryRaw`SELECT 1`;
    // 记录测试成功
    logger.info('✅ database connection test successful');
    return true;
  } catch (error) {
    logger.error('❌ database connection test failed:', error);
    return false;
  }
};

/**
 * 获取数据库连接状态
 */
export const getConnectionStatus = async () => {
  try {
    // 查询PostgreSQL系统表，获取当前数据库的活跃连接数
    const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) as count
      FROM pg_stat_activity
      WHERE datname = current_database()
    `;
    // 获取当前活跃连接数
    const connectionCount = Number(result[0]?.count || 0);
    
    // 返回详细的连接状态信息
    return {
      connected: true,
      connectionCount,
      maxConnections: DATABASE_CONFIG.connectionLimit,
      database: config.database.name,
      host: config.database.host,
      port: config.database.port
    };
  } catch (error) {
    logger.error('❌ failed to get connection status:', error);
    return {
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

/**
 * 数据库健康检查
 */
export const healthCheck = async (timeoutMs: number = DATABASE_CONFIG.timeout): Promise<boolean> => {
  return Promise.race([
    // Promise 1: 执行数据库连接测试
    testConnection(),
    // Promise 2: 超时控制，在指定时间后reject
    new Promise<boolean>((_, reject) =>
      setTimeout(() => reject(new Error('database health check timeout')), timeoutMs)
    )
  ]).catch(error => {
    logger.error('❌ database health check failed:', error);
    return false; // 任何错误都返回false，表示不健康
  });
};

/**
 * 关闭数据库连接
 */
export const closeDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    logger.info('✅ database connection closed');
  } catch (error) {
    logger.error('❌ failed to close database connection:', error);
    // 注意：这里不抛出异常，避免影响程序正常关闭
  }
};

/**
 * 优雅关闭数据库连接
 */
export const gracefulShutdown = async (): Promise<void> => {
  logger.info('🔄 starting graceful database connection shutdown...');
  try {
    // 启动两个并行Promise：正常关闭 vs 超时保护
    await Promise.race([
      closeDatabase(), // 正常关闭数据库连接
      delay(10000).then(() => {
        // 10秒超时保护，避免无限期等待
        logger.warn('⚠️ database shutdown timeout, force exit');
      })
    ]);
  } catch (error) {
    logger.error('❌ graceful shutdown failed:', error);
    // 不管失败与否，都要继续关闭流程
  }
};

// 注册进程退出处理
process.on('SIGINT', gracefulShutdown);   // Ctrl+C 中断信号
process.on('SIGTERM', gracefulShutdown);  // 系统终止信号
process.on('beforeExit', gracefulShutdown); // Node.js 进程退出前

// 导出配置信息
export { DATABASE_CONFIG };

// 导出 Prisma 客户端实例
export default prisma;
