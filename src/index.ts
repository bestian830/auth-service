import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { env } from './config/env.js';
import oidcRoutes from './routes/oidc.js';
import { prisma } from './infra/prisma.js';
import { sessionMiddleware } from './infra/session.js';
import { registry } from './infra/metrics.js';

// 创建 logger
export const logger = pino({
  level: env.nodeEnv === 'development' ? 'debug' : 'info',
  transport: env.nodeEnv === 'development' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined,
});

const app = express();

// 中间件顺序很重要
app.use(helmet());
app.use(pinoHttp({ logger }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false })); // 解析 login 表单
app.use(cors());
app.use(sessionMiddleware);

app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Prometheus metrics端点
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});

app.use(oidcRoutes);

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error(err);
  res.status(500).json({ error: 'server_error', detail: err?.message });
});

app.listen(env.port, () => {
  console.log(`auth-service listening on :${env.port}`);
});
