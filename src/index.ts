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
import organizationRoutes from './routes/organizations.js';
import accountRoutes from './routes/accounts.js';
import deviceRoutes from './routes/devices.js';
import { prisma } from './infra/prisma.js';
import { sessionMiddleware } from './infra/session.js';
import { registry } from './infra/metrics.js';
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

// Health check endpoint (不需要API前缀，用于负载均衡器)
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Prometheus metrics端点 (不需要API前缀，用于监控系统)
app.get('/metrics', metricsAuth, async (_req, res) => {
  res.set('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});

// API v1 路由前缀
const API_PREFIX = '/api/auth-service/v1';

// API信息端点
app.get('/', (_req, res) => {
  res.json({
    name: 'Auth Service',
    version: '0.2.11',
    description: 'Tymoe Authentication and Authorization Service',
    apiVersion: 'v1',
    endpoints: {
      // OAuth/OIDC端点
      jwks: '/jwks.json',
      token: '/oauth/token',
      userinfo: '/userinfo',
      // 业务API端点
      identity: `${API_PREFIX}/identity`,
      admin: `${API_PREFIX}/admin`,
      organizations: `${API_PREFIX}/organizations`,
      accounts: `${API_PREFIX}/accounts`,
      devices: `${API_PREFIX}/devices`,
      // 内部服务端点
      tokenBlacklist: `${API_PREFIX}/internal/token/check-blacklist`,
      // 系统端点
      health: '/healthz',
      metrics: '/metrics'
    },
    documentation: 'https://docs.tymoe.com/auth-service'
  });
});

// OIDC标准端点需要在根路径下（符合OIDC规范）
app.use(oidcRoutes);

// 业务API使用统一前缀
app.use(`${API_PREFIX}/identity`, identityRoutes);
app.use(`${API_PREFIX}/admin`, adminRoutes);
app.use(`${API_PREFIX}/organizations`, organizationRoutes);
app.use(`${API_PREFIX}/accounts`, accountRoutes);
app.use(`${API_PREFIX}/devices`, deviceRoutes);

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
      
    // 确保至少有一个活动的JWT签名密钥
    console.log('🔐 Initializing JWT signing keys...');
    const { ensureOneActiveKey } = await import('./infra/keystore.js');
    await ensureOneActiveKey();
    console.log('✅ JWT signing keys ready');
      
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
