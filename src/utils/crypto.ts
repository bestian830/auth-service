// src/utils/crypto.ts
// v0.2.7: short-lived encrypted code reuse
import crypto from 'crypto';

const keyB64 = process.env.VERIFICATION_CODE_ENC_KEY || '';

export function isEncKeyAvailable(): boolean {
  return !!keyB64;
}

function getKey(): Buffer {
  if (!keyB64) throw new Error('VERIFICATION_CODE_ENC_KEY missing');
  const key = Buffer.from(keyB64.replace(/^base64:/, ''), 'base64');
  if (key.length !== 32) throw new Error('VERIFICATION_CODE_ENC_KEY must be 32 bytes in base64');
  return key;
}

export function encryptShortLived(plaintext: string): { enc: string; iv: string; tag: string } {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    enc: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

export function decryptShortLived(enc: string, iv: string, tag: string): string {
  const key = getKey();
  const ivBuf = Buffer.from(iv, 'base64');
  const tagBuf = Buffer.from(tag, 'base64');
  const encBuf = Buffer.from(enc, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf);
  decipher.setAuthTag(tagBuf);
  const out = Buffer.concat([decipher.update(encBuf), decipher.final()]);
  return out.toString('utf8');
}