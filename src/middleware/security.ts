import cors from 'cors';
import helmet from 'helmet';
import { env } from '../config';

// CORS 配置
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // 开发环境允许所有本地请求
    if (env.nodeEnv === 'development') {
      if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        return callback(null, true);
      }
    }
    
    // 生产环境检查白名单
    if (origin && env.corsOrigin.includes(origin)) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  methods: env.corsMethods || ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: env.corsAllowedHeaders || ['Content-Type','Authorization'],
  credentials: true,
});

// Helmet 安全头部
export const helmetMiddleware = helmet();
