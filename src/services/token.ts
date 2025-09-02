// src/services/token.ts
import { env } from '../config/env.js';
import { prisma } from '../infra/prisma.js';
import * as crypto from 'crypto';
import { SignJWT, importPKCS8, JWTPayload } from 'jose';
import type { RefreshFamilyRow } from '../types/prisma.js';

export type AccessClaims = {
  jti: string; iat: number; exp: number; iss: string;
  aud: string | string[];
  sub: string;
  tenant_id: string;
  roles: string[];
  scopes: string[];
  device_id?: string | null;
  location_id?: string | null;
  acr: string;
};

function nowSec(){ return Math.floor(Date.now()/1000); }

function resolveAudience(inputAud: string | string[] | undefined, tenantId: string): string {
  if (typeof inputAud === 'string' && inputAud.trim()) return inputAud.trim();
  const prefix = (env.defaultAudPrefix || 'tymoe-service').replace(/:$/, '');
  return `${prefix}:${tenantId}`;
}

async function getActivePrivateKey(){
  const k = await prisma.key.findFirst({ where: { status: 'active' }});
  if (!k) throw new Error('no_active_key');
  const pkcs8 = k.privatePem;
  const privateKey = await importPKCS8(pkcs8, 'RS256');
  return { privateKey, kid: k.kid };
}

export async function signAccessToken(payload: {
  sub: string; tenant_id: string; roles?: string[]; scopes?: string[];
  device_id?: string|null; location_id?: string|null; acr?: string; aud?: string | string[];
}): Promise<string> {
  const iat = nowSec();
  const exp = iat + Number(env.accessTtlSec || 1800);
  const jti = crypto.randomUUID();
  const aud = resolveAudience(payload.aud, payload.tenant_id);

  const claims: AccessClaims = {
    jti, iat, exp, iss: env.issuerUrl, aud,
    sub: payload.sub, tenant_id: payload.tenant_id,
    roles: payload.roles ?? [], scopes: payload.scopes ?? [],
    device_id: payload.device_id ?? null, location_id: payload.location_id ?? null,
    acr: payload.acr ?? 'normal',
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
  tenant_id: string; 
  aud: string;   // ✅ OIDC 标准字段，传入 clientId
  nonce?: string;      // ✅ 回显授权请求的 nonce（如有）
  acr?: string;
}): Promise<string> {
  const iat = nowSec();
  const exp = iat + 300;
  const { privateKey, kid } = await getActivePrivateKey();
  const claims: JWTPayload = {
    iss: env.issuerUrl,
    aud: payload.aud,           // ✅ OIDC 要求 aud=clientId
    sub: payload.sub,
    iat, exp,
    jti: crypto.randomUUID(),
    tenant_id: payload.tenant_id,
    acr: payload.acr ?? 'normal',
    ...(payload.nonce ? { nonce: payload.nonce } : {}), // ✅ 回显 nonce
  };
  return await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuer(env.issuerUrl).setAudience(payload.aud)
    .setSubject(payload.sub)
    .setIssuedAt(iat).setExpirationTime(exp).sign(privateKey);
}

// ===== Refresh Token Family =====

export async function issueRefreshFamily(args: { userId?: string; deviceId?: string|null; clientId: string; tenantId?: string }){
  const id = crypto.randomUUID();
  const familyId = crypto.randomUUID();
  await prisma.refreshToken.create({
    data: {
      id, familyId, clientId: args.clientId,
      subjectUserId: args.userId ?? null,
      subjectDeviceId: args.deviceId ?? null,
      status: 'active',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + Number(env.refreshTtlSec)*1000)
    }
  });
  return { refreshId: id, familyId };
}

export async function rotateRefreshToken(oldId: string){
  const old = await prisma.refreshToken.findUnique({ where: { id: oldId }});
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
  if (old.status === 'rotated') {
    const err: any = new Error('invalid_refresh_token_reuse');
    err.code = 'reuse';
    throw err;
  }
  if (old.status !== 'active') {
    const err: any = new Error('invalid_refresh_token_inactive');
    err.code = 'inactive';
    throw err;
  }

  // 旋转：旧设为 rotated，新发一个同 familyId
  await prisma.refreshToken.update({ where: { id: oldId }, data: { status: 'rotated', rotatedAt: new Date() }});
  const newId = crypto.randomUUID();
  await prisma.refreshToken.create({
    data: {
      id: newId, familyId: old.familyId, clientId: old.clientId,
      subjectUserId: old.subjectUserId, subjectDeviceId: old.subjectDeviceId,
      status: 'active',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + Number(env.refreshTtlSec)*1000)
    }
  });
  return { 
    newId, 
    subject: { userId: old.subjectUserId, deviceId: old.subjectDeviceId },
    clientId: old.clientId,
    lastSeenAt: old.lastSeenAt,
    rotatedAt: new Date(),
    createdAt: old.createdAt
  };
}

export async function revokeFamilyByOldReuse(oldId: string){
  const old = await prisma.refreshToken.findUnique({ where: { id: oldId }});
  if (!old) return;
  await prisma.refreshToken.updateMany({ where: { familyId: old.familyId }, data: { status: 'revoked', revokedAt: new Date(), revokeReason: 'reuse_detected' }});
}

export async function revokeFamily(familyId: string, reason: string){
  await prisma.refreshToken.updateMany({ 
    where: { familyId }, 
    data: { 
      status: 'revoked', 
      revokedAt: new Date(), 
      revokeReason: reason 
    }
  });
}

// v0.2.6: Revoke all refresh token families for a specific user
export async function revokeAllUserTokens(userId: string, reason: string): Promise<{
  revokedFamilies: number;
  revokedTokens: number;
}> {
  const activeTokens = await prisma.refreshToken.findMany({
    where: {
      subjectUserId: userId,
      status: 'active'
    },
    select: { familyId: true }
  }) as RefreshFamilyRow[];

  const uniqueFamilies: string[] = Array.from(
    new Set(activeTokens.map((t: RefreshFamilyRow) => t.familyId).filter(Boolean))
  );
  
  if (uniqueFamilies.length === 0) {
    return { revokedFamilies: 0, revokedTokens: 0 };
  }

  // Revoke all tokens for these families
  const result = await prisma.refreshToken.updateMany({
    where: {
      familyId: { in: uniqueFamilies },
      status: 'active'
    },
    data: {
      status: 'revoked',
      revokedAt: new Date(),
      revokeReason: reason
    }
  });

  return {
    revokedFamilies: uniqueFamilies.length,
    revokedTokens: result.count
  };
}

// v0.2.6: Revoke user tokens across all tenants and clients
export async function revokeUserTokensGlobally(userId: string, reason: string): Promise<{
  revokedFamilies: number;
  revokedTokens: number;
}> {
  const activeTokens = await prisma.refreshToken.findMany({
    where: {
      subjectUserId: userId,
      status: { in: ['active', 'rotated'] }
    },
    select: { familyId: true }
  }) as RefreshFamilyRow[];

  const uniqueFamilies: string[] = Array.from(
    new Set(activeTokens.map((t: RefreshFamilyRow) => t.familyId).filter(Boolean))
  );
  
  if (uniqueFamilies.length === 0) {
    return { revokedFamilies: 0, revokedTokens: 0 };
  }

  // Revoke all tokens in these families
  const result = await prisma.refreshToken.updateMany({
    where: {
      familyId: { in: uniqueFamilies },
      status: { in: ['active', 'rotated'] }
    },
    data: {
      status: 'revoked',
      revokedAt: new Date(),
      revokeReason: reason
    }
  });

  return {
    revokedFamilies: uniqueFamilies.length,
    revokedTokens: result.count
  };
}