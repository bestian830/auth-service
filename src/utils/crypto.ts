import crypto from 'crypto';

/**
 * 生成安全的随机字母数字令牌
 * @param length 令牌长度
 * @returns 随机字母数字字符串
 */
export function generateRandomToken(length: number): string {
  if (length <= 0) {
    throw new Error('Token length must be greater than 0');
  }
  
  // 使用crypto.randomBytes生成随机字节
  const bytes = crypto.randomBytes(length);
  
  // 将字节转换为base64字符串，然后移除特殊字符
  const base64 = bytes.toString('base64');
  
  // 只保留字母和数字，移除特殊字符
  const alphanumeric = base64.replace(/[^a-zA-Z0-9]/g, '');
  
  // 如果长度不够，递归调用直到达到所需长度
  if (alphanumeric.length >= length) {
    return alphanumeric.substring(0, length);
  } else {
    // 递归调用以获取更多随机字符
    return generateRandomToken(length);
  }
} 