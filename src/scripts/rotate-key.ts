#!/usr/bin/env tsx
/**
 * R5: 密钥轮换脚本
 * 用法: npm run rotate:key
 */

import { rotateKey, getActiveKey } from '../infra/keystore.js';
import { audit } from '../middleware/audit.js';

async function main() {
  try {
    console.log('🔄 Starting key rotation...');
    
    // 获取当前活跃密钥
    const currentKey = await getActiveKey();
    const oldKid = currentKey?.kid;
    
    // 轮换密钥
    const newKey = await rotateKey();
    
    console.log(`✅ Key rotation completed successfully!`);
    console.log(`Old Key ID: ${oldKid || 'none'}`);
    console.log(`New Key ID: ${newKey.kid}`);
    
    // 记录审计日志
    audit('key_rotation', {
      oldKid,
      newKid: newKey.kid,
      operator: 'script'
    });
    
    // 提示更新资源服务器
    console.log('');
    console.log('⚠️  Action required:');
    console.log('1. Resource servers will automatically pick up new JWKS within cache TTL (1 hour)');
    console.log('2. Old tokens remain valid during grace period');
    console.log('3. New tokens will use the new key immediately');
    
  } catch (error) {
    console.error('❌ Key rotation failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main as rotateKey };