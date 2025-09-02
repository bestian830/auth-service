import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { env } from './config/env.js';
import oidcRoutes from './routes/oidc.js';
import identityRoutes from './routes/identity.js';
import adminRoutes from './routes/admin.js';
import { prisma } from './infra/prisma.js';
import { sessionMiddleware } from './infra/session.js';
import { registry } from './infra/metrics.js';
import { preloadProductMappings } from './config/products.js';
import { metricsAuth } from './middleware/metricsAuth.js';

// 创建 logger
export const logger = pino({
  level: env.nodeEnv === 'development' ? 'debug' : 'info',
  transport: env.nodeEnv === 'development' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined,
});

const app = express();

// Trust proxy in production
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// CORS白名单配置
const allowedOrigins = env.allowedOrigins.split(',').filter(Boolean);
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Authorization',
    'Content-Type', 
    'X-Requested-With',
    'X-Product',
    'X-Device-Id',
    'X-Device-Proof',
    'X-JTI',
    'X-TS'
  ]
};

// 中间件顺序很重要
app.use(helmet());
app.use(pinoHttp({ 
  logger,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie', 
      'res.headers["set-cookie"]',
      'req.body.password',
      'req.body.client_secret',
      'req.body.refresh_token',
      'req.body.access_token',
      'req.body.id_token',
      'req.body.code',
      'req.body.code_verifier',
      'req.body.device_proof',
      'req.query.access_token',
      'req.query.refresh_token',
      'req.query.code',
      'jti',
      'token'
    ],
    censor: '[REDACTED]'
  }
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false })); // 解析 login 表单
app.use(cors(corsOptions));
app.use(sessionMiddleware);

app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Prometheus metrics端点 (with authentication)
app.get('/metrics', metricsAuth, async (_req, res) => {
  res.set('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});

app.use(oidcRoutes);
app.use('/identity', identityRoutes);
app.use('/admin', adminRoutes);

// 错误处理中间件 - 生产环境脱敏
app.use((err: any, req: any, res: any, _next: any) => {
  const requestId = randomUUID();
  
  // Log full error details
  req.log?.error({ err, requestId }, 'Unhandled error');
  
  // Return sanitized response
  res.status(500).json({ 
    error: 'server_error', 
    requestId 
  });
});

// 启动时验证邮件配置
async function startServer() {
  try {
    // 预热产品映射缓存
    console.log('🔄 Loading product mappings...');
    await preloadProductMappings();
    
    // 验证邮件配置
    const { testEmailConfiguration } = await import('./services/mailer.js');
    const emailTest = await testEmailConfiguration();
    
    if (emailTest.success) {
      console.log(`✅ Email configuration verified (${emailTest.transport})`);
    } else {
      console.warn(`⚠️ Email configuration issue (${emailTest.transport}): ${emailTest.error}`);
      if (env.nodeEnv === 'production') {
        console.error('❌ Production environment requires working email configuration');
        // 在生产环境中，可以选择是否要退出进程
        // process.exit(1);
      }
    }

    app.listen(env.port, () => {
      console.log(`🚀 auth-service listening on :${env.port}`);
      console.log(`📧 Mail transport: ${emailTest.transport}`);
      console.log(`🔧 Environment: ${env.nodeEnv}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
