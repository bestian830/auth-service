// src/infra/cryptoVault.ts
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

// 32字节AES-256-GCM密钥
const KEY = Buffer.from(process.env.KEYSTORE_ENC_KEY!, 'base64');

export function seal(plaintext: string): string {
  const iv = randomBytes(12); // 12 bytes for GCM
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function open(blobB64: string): string {
  const blob = Buffer.from(blobB64, 'base64');
  const iv = blob.subarray(0, 12);
  const tag = blob.subarray(12, 28);
  const enc = blob.subarray(28);
  
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}