// 统一导出所有配置模块
export * from './env';
export * from './database';
export * from './cors';
export * from './jwt';

// 重新导出常用配置
export { config } from './env';
export { corsConfig } from './cors';
export { authenticateRequest } from './jwt';
export { default as prisma } from './database'; 