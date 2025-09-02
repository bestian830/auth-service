// src/config/products.ts
import { env } from './env.js';
import { prisma } from '../infra/prisma.js';

export type ProductType = 'mopai' | 'ploml' | 'unknown';

interface ProductMapping {
  [clientId: string]: ProductType;
}

// 内存缓存
let cachedMappings: ProductMapping = {};
let lastCacheUpdate = 0;
const CACHE_TTL_MS = 60 * 1000; // 1分钟

/**
 * 解析环境变量映射
 * 格式: PRODUCT_CLIENT_MAP=web-mopai:mopai,web-ploml:ploml,kiosk-mopai:mopai
 */
function parseEnvMapping(): ProductMapping {
  const envMap = process.env.PRODUCT_CLIENT_MAP || '';
  const mapping: ProductMapping = {};
  
  if (envMap) {
    const pairs = envMap.split(',');
    for (const pair of pairs) {
      const [clientId, product] = pair.split(':');
      if (clientId && product && ['mopai', 'ploml'].includes(product)) {
        mapping[clientId.trim()] = product as ProductType;
      }
    }
  }
  
  return mapping;
}

/**
 * 从数据库加载客户端产品映射
 */
async function loadDbMappings(): Promise<ProductMapping> {
  const mapping: ProductMapping = {};
  
  try {
    // 优先从 Client 表查找 productType 字段（如果存在）
    const clients = await prisma.$queryRaw`
      SELECT id, 
             CASE 
               WHEN EXISTS(SELECT 1 FROM information_schema.columns 
                          WHERE table_name = 'Client' AND column_name = 'productType') 
               THEN "productType"::text 
               ELSE NULL 
             END as product_type
      FROM "Client"
    ` as Array<{id: string, product_type: string | null}>;
    
    for (const client of clients) {
      if (client.product_type && ['mopai', 'ploml'].includes(client.product_type)) {
        mapping[client.id] = client.product_type as ProductType;
      }
    }
    
    // 备用：从 TenantClient 表的配置推断产品类型
    if (Object.keys(mapping).length === 0) {
      const tenantClients = await prisma.tenantClient.findMany({
        select: { clientId: true, allowedAudPrefixes: true }
      });
      
      for (const tc of tenantClients) {
        // 根据受众前缀推断产品类型
        const audPrefixes = tc.allowedAudPrefixes || [];
        if (audPrefixes.some((prefix: string) => prefix.includes('mopai'))) {
          mapping[tc.clientId] = 'mopai';
        } else if (audPrefixes.some((prefix: string) => prefix.includes('ploml'))) {
          mapping[tc.clientId] = 'ploml';
        }
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Failed to load DB product mappings:', errorMessage);
  }
  
  return mapping;
}

/**
 * 使用字符串包含规则作为后备
 */
function fallbackProductType(clientId: string): ProductType {
  if (clientId.includes('mopai')) return 'mopai';
  if (clientId.includes('ploml')) return 'ploml';
  return 'unknown';
}

/**
 * 刷新产品映射缓存
 */
async function refreshCache(): Promise<void> {
  const now = Date.now();
  if (now - lastCacheUpdate < CACHE_TTL_MS) {
    return; // 缓存未过期
  }
  
  try {
    // 1. 优先从 DB 加载
    const dbMappings = await loadDbMappings();
    
    // 2. 合并环境变量映射
    const envMappings = parseEnvMapping();
    
    // 3. DB 优先，环境变量补充
    cachedMappings = { ...envMappings, ...dbMappings };
    
    lastCacheUpdate = now;
    
    console.log('Product mappings refreshed:', Object.keys(cachedMappings).length, 'entries');
  } catch (error) {
    console.error('Failed to refresh product mappings cache:', error);
  }
}

/**
 * 解析客户端产品类型
 * 
 * 查找优先级：
 * 1. DB 中的 Client.productType 字段
 * 2. 环境变量 PRODUCT_CLIENT_MAP 映射
 * 3. 字符串包含规则（后备）
 */
export async function resolveProductType(clientId: string): Promise<ProductType> {
  if (!clientId) return 'unknown';
  
  // 刷新缓存（如果需要）
  await refreshCache();
  
  // 1. 检查缓存映射
  if (cachedMappings[clientId]) {
    return cachedMappings[clientId];
  }
  
  // 2. 后备到字符串包含规则
  const fallbackType = fallbackProductType(clientId);
  
  // 缓存后备结果（避免重复计算）
  cachedMappings[clientId] = fallbackType;
  
  return fallbackType;
}

/**
 * 同步版本（用于已知缓存有效的场景）
 */
export function resolveProductTypeSync(clientId: string): ProductType {
  if (!clientId) return 'unknown';
  
  // 检查缓存
  if (cachedMappings[clientId]) {
    return cachedMappings[clientId];
  }
  
  // 后备规则
  return fallbackProductType(clientId);
}

/**
 * 手动预热缓存（在应用启动时调用）
 */
export async function preloadProductMappings(): Promise<void> {
  await refreshCache();
}

/**
 * 获取未知产品类型的默认处理策略
 */
export function getUnknownProductStrategy(): ProductType | 'reject' {
  const strategy = env.unknownProductStrategy || 'ploml';
  return ['mopai', 'ploml', 'reject'].includes(strategy) ? strategy as (ProductType | 'reject') : 'ploml';
}