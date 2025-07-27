import cors from 'cors';
import helmet from 'helmet';
import { env } from '../config';

// CORS 配置
export const corsMiddleware = cors({
  origin: env.corsOrigin,
  methods: env.corsMethods || ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: env.corsAllowedHeaders || ['Content-Type','Authorization'],
  credentials: true,
});

// Helmet 安全头部
export const helmetMiddleware = helmet();
