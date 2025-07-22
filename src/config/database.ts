// auth-service/src/config/database.ts
import { PrismaClient } from '@prisma/client';
import { logger, delay } from '../utils';
import { env } from './env';
import { DATABASE_CONFIG } from '../constants';
import type { DatabaseConnectionStatus } from '../types';

let prisma: PrismaClient;

declare global {
  var __prisma: PrismaClient | undefined;
}

/**
 * 创建 Prisma 客户端实例
 * @returns PrismaClient 实例
 * 执行逻辑：根据当前环境选择日志级别，连接 env.databaseUrl 所定义的数据库地址。
 */
const createPrismaClient = (): PrismaClient => {
  return new PrismaClient({
    log: env.nodeEnv === 'production' ? ['error'] : ['query', 'info', 'warn', 'error'],
    datasources: {
      db: {
        url: env.databaseUrl,
      },
    },
    errorFormat: 'pretty',
  });
};

/**
 * 初始化 Prisma 客户端
 * @returns 无返回值
 * 执行逻辑：生产环境直接创建客户端；开发环境复用 global.__prisma 防止热重载创建多个实例。
 */
if (env.nodeEnv === 'production') {
  prisma = createPrismaClient();
} else {
  if (!global.__prisma) {
    global.__prisma = createPrismaClient();
  }
  prisma = global.__prisma;
}

/**
 * 尝试连接数据库（带重试机制）
 * @param retries 剩余重试次数（默认读取配置）
 * @returns Promise<void>
 * 执行逻辑：调用 prisma.$connect，如果失败并还有重试次数，则等待后递归重试。
 */
const connectWithRetry = async (retries: number = DATABASE_CONFIG.maxRetries): Promise<void> => {
  try {
    await prisma.$connect();
    logger.info('✅ Prisma database connection successful');
    logger.info(`📊 connection limit=${DATABASE_CONFIG.connectionLimit}, timeout=${DATABASE_CONFIG.timeout}ms`);
  } catch (error) {
    logger.error(`❌ database connection failed (remaining retries: ${retries}):`, error);
    if (retries > 0) {
      logger.info(`🔄 retry in ${DATABASE_CONFIG.retryDelay}ms...`);
      await delay(DATABASE_CONFIG.retryDelay);
      return connectWithRetry(retries - 1);
    } else {
      logger.error('❌ database connection retries exhausted');
      throw error;
    }
  }
};

/**
 * 初始化数据库连接
 * @returns Promise<void>
 * 执行逻辑：连接数据库，并在生产环境下设置 SQL 执行参数，如超时、事务闲置超时等。
 */
export const initDatabase = async (): Promise<void> => {
  try {
    await connectWithRetry();
    if (env.nodeEnv === 'production') {
      await prisma.$executeRaw`SET statement_timeout = ${DATABASE_CONFIG.timeout}`;
      await prisma.$executeRaw`SET idle_in_transaction_session_timeout = ${DATABASE_CONFIG.idleTimeout}`;
      logger.info('✅ database connection parameters configured');
    }
  } catch (error) {
    logger.error('❌ database initialization failed:', error);
    throw error;
  }
};

/**
 * 测试数据库连接是否正常
 * @returns Promise<boolean>
 * 执行逻辑：执行简单查询 SELECT 1，判断数据库是否可用。
 */
export const testConnection = async (): Promise<boolean> => {
  try {
    await prisma.$queryRawUnsafe(`SELECT 1`);
    logger.info('✅ database connection test successful');
    return true;
  } catch (error) {
    logger.error('❌ database connection test failed:', error);
    return false;
  }
};

/**
 * 获取当前数据库连接状态
 * @returns Promise<DatabaseConnectionStatus>
 * 执行逻辑：查询 pg_stat_activity，返回当前连接数及连接信息。
 */
export const getConnectionStatus = async (): Promise<DatabaseConnectionStatus> => {
  try {
    const result = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>`
      SELECT count(*) as count FROM pg_stat_activity WHERE datname = current_database()
    `;
    const connectionCount = Number(result[0]?.count || 0);
    return {
      connected: true,
      connectionCount,
      maxConnections: DATABASE_CONFIG.connectionLimit,
      database: env.databaseUrl.split('/').pop()?.split('?')[0],
      host: new URL(env.databaseUrl).hostname,
      port: parseInt(new URL(env.databaseUrl).port) || 5432
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
 * 数据库健康检查（带超时）
 * @param timeoutMs 超时时间（毫秒），默认读取配置
 * @returns Promise<boolean>
 * 执行逻辑：Promise.race 测试连接 vs 超时控制，任何失败都视为不健康。
 */
export const healthCheck = async (timeoutMs: number = DATABASE_CONFIG.timeout): Promise<boolean> => {
  return Promise.race([
    testConnection(),
    new Promise<boolean>((_, reject) =>
      setTimeout(() => reject(new Error('database health check timeout')), timeoutMs)
    )
  ]).catch(error => {
    logger.error('❌ database health check failed:', error);
    return false;
  });
};

/**
 * 关闭数据库连接
 * @returns Promise<void>
 * 执行逻辑：调用 prisma.$disconnect，记录关闭结果，失败时记录日志但不中断流程。
 */
export const closeDatabase = async (): Promise<void> => {
  try {
    await prisma.$disconnect();
    logger.info('✅ database connection closed');
  } catch (error) {
    logger.error('❌ failed to close database connection:', error);
  }
};

/**
 * 优雅关闭数据库连接
 * @returns Promise<void>
 * 执行逻辑：调用 closeDatabase() 与 10 秒超时保护并发执行，防止卡死。
 */
export const gracefulShutdown = async (): Promise<void> => {
  logger.info('🔄 starting graceful database connection shutdown...');
  try {
    await Promise.race([
      closeDatabase(),
      delay(DATABASE_CONFIG.shutdownTimeout).then(() => {
        logger.warn('⚠️ database shutdown timeout, force exit');
      })
    ]);
  } catch (error) {
    logger.error('❌ graceful shutdown failed:', error);
  }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('beforeExit', gracefulShutdown);

export default prisma;