// src/infra/keystore.ts
import { prisma } from './prisma.js';
import { env } from '../config/env.js';
import { createHash, generateKeyPairSync } from 'crypto';
import { exportJWK } from 'jose';
import { seal, open } from './cryptoVault.js';
import { any } from 'zod';

type DbKey = {
  kid: string; type: string; status: 'active'|'grace'|'retired';
  privatePem: string; publicJwk: any;
  createdAt: Date; activatedAt: Date|null; retiredAt: Date|null;
};

function computeJwksEtag(keys: any[]): string {
  const raw = JSON.stringify(keys.map(k => ({ kid: k.kid, e: k.e, n: k.n, use: k.use })));
  const h = createHash('sha256').update(raw).digest('base64url');
  return `W/"jwks-${h}"`; // Weak ETag for CDN compatibility
}

export async function getActiveKey(): Promise<DbKey|null> {
  const k = await prisma.key.findFirst({ where: { status: 'active' }});
  if (!k) return null;
  
  // Decrypt private key if encrypted
  const privatePem = env.keystoreEncKey ? open(k.privatePem) : k.privatePem;
  
  return {
    ...k,
    privatePem
  } as any;
}

export async function getGraceKeys(): Promise<DbKey[]> {
  const ks = await prisma.key.findMany({ where: { status: 'grace' }});
  
  // Decrypt private keys if encrypted
  return ks.map((k: any) => ({
    ...k,
    privatePem: env.keystoreEncKey ? open(k.privatePem) : k.privatePem
  })) as any;
}

export async function ensureOneActiveKey(): Promise<void> {
  const active = await getActiveKey();
  if (active) return;
  await rotateKey(); // 生成一把
}

export async function rotateKey(): Promise<DbKey> {
  // 1) 旧 active → grace
  const old = await getActiveKey();
  if (old) {
    await prisma.key.update({ where: { kid: old.kid }, data: { status: 'grace', activatedAt: old.activatedAt ?? new Date() }});
  }
  // 2) 生成新 RSA（2048）
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const jwk = await exportJWK(publicKey as any);
  const kid = `kid-${Date.now()}`;
  const publicJwk = { ...jwk, kid, alg: 'RS256', use: 'sig' };

  // Encrypt private key if encryption is enabled
  const encryptedPrivatePem = env.keystoreEncKey ? seal(privatePem) : privatePem;

  const created = await prisma.key.create({
    data: { 
      kid, 
      type: 'RSA', 
      status: 'active', 
      privatePem: encryptedPrivatePem, 
      publicJwk, 
      createdAt: new Date(), 
      activatedAt: new Date() 
    }
  });

  // 3) 只保留一把 grace，更多的设为 retired
  const graces = await getGraceKeys();
  if (graces.length > 1) {
    const sorted = graces.sort((a,b)=> (a.activatedAt?.getTime()||0)-(b.activatedAt?.getTime()||0));
    for (let i=0;i<sorted.length-1;i++){
      await prisma.key.update({ where: { kid: sorted[i].kid }, data: { status: 'retired', retiredAt: new Date() }});
    }
  }
  return created as any;
}

export async function buildJwksWithEtag(){
  const active = await getActiveKey();
  const graces = await getGraceKeys();
  const keys = [active, ...graces].filter(Boolean).map(k => (k as any).publicJwk);
  const etag = computeJwksEtag(keys);
  return { jwks: { keys }, etag };
}