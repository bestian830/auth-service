#!/usr/bin/env tsx
/**
 * R5: 密钥清理脚本
 * 用法: npm run retire:keys
 */

import { prisma } from '../src/infra/prisma.js';

async function main() {
  try {
    console.log('🧹 Starting expired key retirement...');
    
    // 查询所有 grace 状态的密钥
    const graceKeys = await prisma.key.findMany({
      where: { status: 'GRACE' },
      orderBy: { createdAt: 'asc' }
    });
    
    if (graceKeys.length === 0) {
      console.log('✅ No grace keys to retire');
      return;
    }
    
    console.log(`📋 Found ${graceKeys.length} grace keys to retire`);
    
    // 将所有 grace 密钥设为 retired
    for (const key of graceKeys) {
      await prisma.key.update({
        where: { kid: key.kid },
        data: {
          status: 'RETIRED',
          retiredAt: new Date()
        }
      });
      
      console.log(`🔒 Retired key: ${key.kid} (created: ${key.createdAt.toISOString()})`);
    }
    
    console.log(`✅ Successfully retired ${graceKeys.length} keys`);
    
  } catch (error) {
    console.error('❌ Key retirement failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as retireKeys };