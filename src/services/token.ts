// src/services/token.ts
import { env } from '../config/env.js';
import { prisma } from '../infra/prisma.js';
import * as crypto from 'crypto';
import { SignJWT, importPKCS8, JWTPayload } from 'jose';
import { open } from '../infra/cryptoVault.js';

export type AccessClaims = {
  jti: string; 
  iat: number; 
  exp: number; 
  iss: string;
  aud: string | string[];
  sub: string;
  roles: string[];
  scopes: string[];
  organizationId?: string | null;
  deviceId?: string | null;
};

function nowSec() { 
  return Math.floor(Date.now() / 1000); 
}

function resolveAudience(inputAud: string | string[] | undefined, organizationId?: string): string {
  if (typeof inputAud === 'string' && inputAud.trim()) return inputAud.trim();
  const prefix = (env.defaultAudPrefix || 'tymoe-service').replace(/:$/, '');
  return organizationId ? `${prefix}:${organizationId}` : prefix;
}

async function getActivePrivateKey() {
  const k = await prisma.key.findFirst({ where: { status: 'ACTIVE' } });
  if (!k) throw new Error('no_active_key');
  
  // Decrypt private key if encrypted
  const pkcs8 = env.keystoreEncKey ? open(k.privatePem) : k.privatePem;
  const privateKey = await importPKCS8(pkcs8, 'RS256');
  return { privateKey, kid: k.kid };
}

export async function signAccessToken(payload: {
  sub: string; 
  roles?: string[]; 
  scopes?: string[];
  organizationId?: string | null; 
  deviceId?: string | null; 
  aud?: string | string[];
}): Promise<string> {
  const iat = nowSec();
  const exp = iat + Number(env.accessTtlSec || 1800);
  const jti = crypto.randomUUID();
  const aud = resolveAudience(payload.aud, payload.organizationId || undefined);

  const claims: AccessClaims = {
    jti, iat, exp, iss: env.issuerUrl, aud,
    sub: payload.sub,
    roles: payload.roles ?? [], 
    scopes: payload.scopes ?? [],
    organizationId: payload.organizationId ?? null, 
    deviceId: payload.deviceId ?? null,
  };

  const { privateKey, kid } = await getActivePrivateKey();
  return await new SignJWT(claims as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(env.issuerUrl)
    .setAudience(typeof aud === 'string' ? aud : aud[0])
    .setSubject(payload.sub)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(privateKey);
}

export async function signIdToken(payload: {
  sub: string; 
  organizationId?: string;
  aud: string;
  nonce?: string;
  acr?: string;
}): Promise<string> {
  const iat = nowSec();
  const exp = iat + 300; // ID Token 短期有效
  const { privateKey, kid } = await getActivePrivateKey();
  
  const claims: JWTPayload = {
    iss: env.issuerUrl,
    aud: payload.aud,
    sub: payload.sub,
    iat, exp,
    jti: crypto.randomUUID(),
    organizationId: payload.organizationId,
    acr: payload.acr ?? 'normal',
    ...(payload.nonce ? { nonce: payload.nonce } : {}),
  };
  
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(env.issuerUrl)
    .setAudience(payload.aud)
    .setSubject(payload.sub)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(privateKey);
}

// ===== Refresh Token Family =====

export async function issueRefreshFamily(args: { 
  userId?: string; 
  deviceId?: string | null; 
  clientId: string; 
  organizationId?: string 
}) {
  const id = crypto.randomUUID();
  const familyId = crypto.randomUUID();
  
  await prisma.refreshToken.create({
    data: {
      id, 
      familyId, 
      clientId: args.clientId,
      subjectUserId: args.userId ?? null,
      subjectDeviceId: args.deviceId ?? null,
      organizationId: args.organizationId ?? null,
      status: 'ACTIVE',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + Number(env.refreshTtlSec) * 1000)
    }
  });
  
  return { refreshId: id, familyId };
}

export async function rotateRefreshToken(oldId: string) {
  const old = await prisma.refreshToken.findUnique({ where: { id: oldId } });
  if (!old) {
    const err: any = new Error('invalid_refresh_token_not_found');
    err.code = 'not_found';
    throw err;
  }
  
  if (old.expiresAt && old.expiresAt < new Date()) {
    const err: any = new Error('invalid_refresh_token_expired');
    err.code = 'expired';
    throw err;
  }
  
  if (old.status === 'ROTATED') {
    const err: any = new Error('invalid_refresh_token_reuse');
    err.code = 'reuse';
    throw err;
  }
  
  if (old.status !== 'ACTIVE') {
    const err: any = new Error('invalid_refresh_token_inactive');
    err.code = 'inactive';
    throw err;
  }

  // 旋转：旧设为rotated，新发一个同familyId
  await prisma.refreshToken.update({ 
    where: { id: oldId }, 
    data: { status: 'ROTATED', rotatedAt: new Date() } 
  });
  
  const newId = crypto.randomUUID();
  await prisma.refreshToken.create({
    data: {
      id: newId, 
      familyId: old.familyId, 
      clientId: old.clientId,
      subjectUserId: old.subjectUserId, 
      subjectDeviceId: old.subjectDeviceId,
      organizationId: old.organizationId,
      status: 'ACTIVE',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + Number(env.refreshTtlSec) * 1000)
    }
  });
  
  return { 
    newId, 
    subject: { userId: old.subjectUserId, deviceId: old.subjectDeviceId },
    clientId: old.clientId,
    organizationId: old.organizationId,
    lastSeenAt: old.lastSeenAt,
    rotatedAt: new Date(),
    createdAt: old.createdAt
  };
}

export async function revokeFamilyByOldReuse(oldId: string) {
  const old = await prisma.refreshToken.findUnique({ where: { id: oldId } });
  if (!old) return;
  
  await prisma.refreshToken.updateMany({ 
    where: { familyId: old.familyId }, 
    data: { 
      status: 'REVOKED', 
      revokedAt: new Date(), 
      revokeReason: 'reuse_detected' 
    } 
  });
}

export async function revokeFamily(familyId: string, reason: string) {
  await prisma.refreshToken.updateMany({ 
    where: { familyId }, 
    data: { 
      status: 'REVOKED', 
      revokedAt: new Date(), 
      revokeReason: reason 
    }
  });
}

export async function revokeAllUserTokens(userId: string, reason: string): Promise<{
  revokedFamilies: number;
  revokedTokens: number;
}> {
  const activeTokens = await prisma.refreshToken.findMany({
    where: {
      subjectUserId: userId,
      status: 'ACTIVE'
    },
    select: { familyId: true }
  });

  const uniqueFamilies: string[] = Array.from(
    new Set(activeTokens.map(t => t.familyId).filter(Boolean))
  );
  
  if (uniqueFamilies.length === 0) {
    return { revokedFamilies: 0, revokedTokens: 0 };
  }

  const result = await prisma.refreshToken.updateMany({
    where: {
      familyId: { in: uniqueFamilies },
      status: 'ACTIVE'
    },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
      revokeReason: reason
    }
  });

  return {
    revokedFamilies: uniqueFamilies.length,
    revokedTokens: result.count
  };
}

export async function revokeUserTokensGlobally(userId: string, reason: string): Promise<{
  revokedFamilies: number;
  revokedTokens: number;
}> {
  const activeTokens = await prisma.refreshToken.findMany({
    where: {
      subjectUserId: userId,
      status: { in: ['ACTIVE', 'ROTATED'] }
    },
    select: { familyId: true }
  });

  const uniqueFamilies: string[] = Array.from(
    new Set(activeTokens.map(t => t.familyId).filter(Boolean))
  );
  
  if (uniqueFamilies.length === 0) {
    return { revokedFamilies: 0, revokedTokens: 0 };
  }

  const result = await prisma.refreshToken.updateMany({
    where: {
      familyId: { in: uniqueFamilies },
      status: { in: ['ACTIVE', 'ROTATED'] }
    },
    data: {
      status: 'REVOKED',
      revokedAt: new Date(),
      revokeReason: reason
    }
  });

  return {
    revokedFamilies: uniqueFamilies.length,
    revokedTokens: result.count
  };
}