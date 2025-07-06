import { CorsOptions } from 'cors';
import { config } from './env';
import { AUTH_HEADERS } from '../types';

/**
 * CORS 配置 - 允许前端/其他服务访问 auth-service
 */
export const corsConfig: CorsOptions = {
  // 允许的源
  origin: (origin, callback) => {
    if (config.NODE_ENV === 'development') {
      // 开发环境：允许本地源和无origin（如Postman等）
      const allowedOrigins = [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:3000'
      ];

      if (!origin || allowedOrigins.includes(origin)) {
        // 允许请求
        callback(null, true);
      } else {
        // 不允许请求
        callback(new Error('Not allowed by CORS in development'));
      }
    } else {
      // 生产环境：严格检查，只允许配置中的域名
      if (config.cors.origin.includes(origin || '')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },

  // 允许的 HTTP 方法
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],

  // 允许的请求头（加上自定义认证头）
  allowedHeaders: [
    'Content-Type',
    AUTH_HEADERS.AUTHORIZATION, // 比如 'Authorization'
    AUTH_HEADERS.TENANT_ID,     // 比如 'X-Tenant-Id'
    AUTH_HEADERS.REFRESH_TOKEN, // 比如 'X-Refresh-Token'
    AUTH_HEADERS.SESSION_ID     // 比如 'X-Session-Id'
  ],

  // 允许携带 cookies 和认证信息（前端登录后携带 cookie/token 时必须 true）
  credentials: true,

  // 预检请求（OPTIONS）的缓存时间，单位：秒（这里 86400 是 24小时）
  maxAge: 86400
};
