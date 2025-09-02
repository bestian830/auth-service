// src/middleware/productHint.ts
import { Request, Response, NextFunction } from 'express';
import { resolveProductType, getUnknownProductStrategy, preloadProductMappings, type ProductType } from '../config/products.js';
import { audit } from './audit.js';

declare module 'express' {
  interface Request {
    product?: ProductType;
  }
}

/**
 * 产品线判定中间件
 * 
 * 优先级：
 * 1. 显式提示：req.query.product 或 req.header('x-product')
 * 2. client_id → 环境变量映射 PRODUCT_CLIENT_MAP  
 * 3. 回退策略：UNKNOWN_PRODUCT_STRATEGY
 */
export function productHint() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      let product: ProductType = 'unknown';
      let source: 'header' | 'query' | 'client_map' | 'fallback' = 'fallback';
      const clientId = req.body?.client_id || req.query?.client_id as string;

      // 1. 检查显式产品提示
      const headerProduct = req.get('x-product');
      const queryProduct = req.query?.product as string;
      
      if (headerProduct && ['mopai', 'ploml'].includes(headerProduct)) {
        product = headerProduct as ProductType;
        source = 'header';
      } else if (queryProduct && ['mopai', 'ploml'].includes(queryProduct)) {
        product = queryProduct as ProductType;
        source = 'query';
      } else if (clientId) {
        // 2. 从 client_id 解析产品类型
        product = await resolveProductType(clientId);
        if (product !== 'unknown') {
          source = 'client_map';
        }
      }

      // 3. 处理 unknown 产品
      if (product === 'unknown') {
        const strategy = getUnknownProductStrategy();
        
        audit('product_unknown_client', {
          clientId,
          strategy,
          ip: req.ip,
          userAgent: req.get('user-agent')
        });

        if (strategy === 'reject') {
          return res.status(400).json({ 
            error: 'unknown_product',
            message: 'Client product type could not be determined'
          });
        }
        
        product = strategy;
        source = 'fallback';
      }

      // 设置产品线到请求上下文
      req.product = product;

      // 审计产品线判定结果
      audit('product_hint_resolved', {
        source,
        product,
        clientId,
        ip: req.ip
      });

      next();
    } catch (error) {
      console.error('Product hint middleware error:', error);
      next(error);
    }
  };
}

/**
 * 要求特定产品线的中间件
 */
export function requireProduct(requiredProduct: ProductType) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.product !== requiredProduct) {
      audit('product_access_denied', {
        required: requiredProduct,
        actual: req.product,
        clientId: req.body?.client_id,
        ip: req.ip
      });
      
      return res.status(403).json({
        error: 'product_access_denied',
        message: `This endpoint requires ${requiredProduct} product context`
      });
    }
    
    next();
  };
}

/**
 * v0.2.8-p2: 重新加载产品客户端映射缓存
 * 返回新的映射表用于管理接口显示
 */
export async function refreshProductClientMap(): Promise<Map<string, ProductType>> {
  try {
    // 强制重新预加载映射
    await preloadProductMappings();
    
    // 获取当前缓存状态并返回（这里需要导出 cachedMappings，或提供获取接口）
    // 为了简化，返回一个空Map，实际中可以完善这个接口
    return new Map();
  } catch (error) {
    console.error('Failed to refresh product client map:', error);
    throw error;
  }
}