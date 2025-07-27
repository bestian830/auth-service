/**
 * Express 类型扩展
 * 扩展Express的Request接口，添加中间件注入的属性
 */

declare global {
  namespace Express {
    interface Request {
      // 租户中间件注入的属性
      tenantId?: string;        // 便于快速访问的tenantId
      tenant?: { tenantId: string }; // 租户上下文对象
      jwtPayload?: any;         // JWT payload 数据
    }
  }
}

// 导出空对象确保这是一个模块
export {}; 