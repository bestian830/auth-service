/**
 * 配置模块统一导出
 * 集中管理所有配置模块的导出，提供统一的配置访问入口
 */

// ================================
// 全量导出所有配置模块
// ================================
export * from './env';
export * from './database';
export * from './cors';
export * from './jwt';
export * from './email';
export * from './payment';
export * from './security';

// ================================
// 特殊导出和别名  
// ================================

// 向后兼容别名（email.ts 等文件在使用 config.email.xxx）
export { env as config } from './env';

 