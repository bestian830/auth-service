# DATABASE_REDESIGN.md

> 所有使用的类型定义放在 `types/database.ts`，所有配置常量放在 `constants/database.ts`，此文件不应定义新类型或硬编码常量，保持职责单一。所有 docstring 必须写清楚 input / output / 执行逻辑，用中文。所有代码必须用英文。

文件路径：`src/config/database.ts`

实现以下内容：

```ts
import { PrismaClient } from '../../generated/prisma';
import { logger } from '../utils/logger';
import { config } from './env';
import { DATABASE_CONFIG } from '../constants/database';

let prisma: PrismaClient;

declare global {
  var __prisma: PrismaClient | undefined;
}

/**
 * 创建 Prisma 客户端实例
 * @returns PrismaClient 实例
 * 执行逻辑：根据当前环境选择日志级别，连接 config.database.url 所定义的数据库地址。
 */
const createPrismaClient = (): PrismaClient => {
  return new PrismaClient({
    log: config.nodeEnv === 'production' ? ['error'] : ['query', 'info', 'warn', 'error'],
    datasources: {
      db: {
        url: config.database.url,
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
if (config.nodeEnv === 'production') {
  prisma = createPrismaClient();
} else {
  if (!global.__prisma) {
    global.__prisma = createPrismaClient();
  }
  prisma = global.__prisma;
}

/**
 * 延迟函数
 * @param ms 毫秒数
 * @returns Promise<void>
 * 执行逻辑：等待指定时间后 resolve，用于实现连接重试延时。
 */
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

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
    if (config.nodeEnv === 'production') {
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
    await prisma.$queryRaw`SELECT 1`;
    logger.info('✅ database connection test successful');
    return true;
  } catch (error) {
    logger.error('❌ database connection test failed:', error);
    return false;
  }
};

/**
 * 获取当前数据库连接状态
 * @returns Promise<object>
 * 执行逻辑：查询 pg_stat_activity，返回当前连接数及连接信息。
 */
export const getConnectionStatus = async () => {
  try {
    const result = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT count(*) as count FROM pg_stat_activity WHERE datname = current_database()
    `;
    const connectionCount = Number(result[0]?.count || 0);
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
      delay(10000).then(() => {
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

export { DATABASE_CONFIG };
export default prisma;
