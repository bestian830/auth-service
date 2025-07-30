// src/app.ts (or src/index.ts)

import express from 'express';
import compression from 'compression';
import morgan from 'morgan';
import { corsMiddleware, helmetMiddleware, globalLimiter, errorHandler } from './middleware';
import authRoutes from './routes/authRoutes';
import sessionRoutes from './routes/sessionRoutes';
import tenantRoutes from './routes/tenantRoutes';
import { env } from './config/env';
import { initializeErrorCapture, logger } from './utils';
import { initRedis, closeRedis, initDatabase, closeDatabase, testConnection } from './config';

const app = express();
const PORT = env.port || 3002;

// 初始化全局异常捕获
initializeErrorCapture();

async function bootstrap() {
  try {
    // 初始化依赖
    await initRedis();
    await initDatabase();

    // 全局中间件
    app.use(helmetMiddleware);
    app.use(corsMiddleware);
    app.use(compression());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));
    app.use(morgan('combined'));
    app.use(globalLimiter);

    // 路由注册
    app.use('/api/v1/auth', authRoutes);
    app.use('/api/v1/session', sessionRoutes);
    app.use('/api/v1/tenant', tenantRoutes);

    // 健康检查路由
    app.get('/health', async (req, res) => {
      try {
        // 检查数据库连接
        const dbOk = await testConnection();
        res.json({
          status: dbOk ? 'OK' : 'ERROR',
          database: dbOk ? 'connected' : 'disconnected',
          redis: 'connected', // 可以做 redis ping 检查
          timestamp: new Date().toISOString(),
          environment: env.nodeEnv,
        });
      } catch (error) {
        res.status(500).json({
          status: 'ERROR',
          error: 'Health check failed',
          timestamp: new Date().toISOString(),
        });
      }
    });

    // 欢迎页
    app.get('/', (req, res) => {
      res.json({
        message: 'Beauty Auth Service',
        version: '1.0.0',
        docs: '/api/v1',
      });
    });

    // 404兜底
    app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Route not found',
        message: `Cannot ${req.method} ${req.originalUrl}`,
      });
    });

    // 全局错误处理中间件
    app.use(errorHandler);

    // 启动服务器
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Auth service running on http://localhost:${PORT}`);
      console.log(`🚀 Auth service running on http://localhost:${PORT}`);
      console.log(`💚 Health check: http://localhost:${PORT}/health`);
    });

    // 优雅关闭
    const shutdown = async () => {
      logger.info('🛑 Received shutdown signal, closing dependencies...');
      server.close(async () => {
        await closeDatabase();
        await closeRedis();
        logger.info('✅ All resources closed, exiting.');
        process.exit(0);
      });
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

  } catch (error) {
    logger.error('❌ Service startup failed:', error);
    process.exit(1);
  }
}

bootstrap();

export default app;
