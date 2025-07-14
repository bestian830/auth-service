/**
 * CORS配置
 */
import { AUTH_HEADERS } from '../types/auth';

/**
 * CORS配置选项
 */
export const corsConfig = {
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200,
  allowedHeaders: [
    'Content-Type',
    AUTH_HEADERS.AUTHORIZATION,
    AUTH_HEADERS.TENANT_ID,
    AUTH_HEADERS.REFRESH_TOKEN,
    AUTH_HEADERS.SESSION_ID
  ],
  exposedHeaders: [
    AUTH_HEADERS.TENANT_ID,
    AUTH_HEADERS.SESSION_ID
  ]
};
