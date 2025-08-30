// src/controllers/oidc.ts
import { Request, Response } from 'express';
import { env } from '../config/env.js';
import { buildJwksWithEtag, ensureOneActiveKey } from '../infra/keystore.js';
import { prisma } from '../infra/prisma.js';
import { issueRefreshFamily, rotateRefreshToken, revokeFamilyByOldReuse, signAccessToken, signIdToken } from '../services/token.js';
import { validateClientTenantAccess } from '../services/tenant.js';
import { audit } from '../middleware/audit.js';
import { importJWK, jwtVerify } from 'jose';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

// ===== Discovery =====
export async function discovery(_req: Request, res: Response){
  const base = env.issuerUrl.replace(/\/+$/, '');
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    jwks_uri: `${base}/jwks.json`,
    userinfo_endpoint: `${base}/userinfo`,
    revocation_endpoint: `${base}/oauth/revoke`,
    grant_types_supported: ['authorization_code','refresh_token'],
    response_types_supported: ['code'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: ['none','client_secret_post','client_secret_basic'],
    code_challenge_methods_supported: ['S256']
  });
}

// ===== JWKS with ETag =====
export async function jwks(req: Request, res: Response){
  await ensureOneActiveKey();
  const { jwks, etag } = await buildJwksWithEtag();
  const inm = req.header('if-none-match') || req.header('If-None-Match');
  if (inm && inm === etag) {
    return res.status(304)
      .set('Cache-Control', `public, max-age=${env.jwksMaxAgeSec}`)
      .set('ETag', etag).end();
  }
  return res.status(200)
    .set('Cache-Control', `public, max-age=${env.jwksMaxAgeSec}`)
    .set('ETag', etag).json(jwks);
}

// ===== 简化的登录与授权（保持与 R4 一致的行为） =====
export async function getLogin(_req: Request, res: Response){
  res.type('html').sendFile('login.html', { root: 'src/views' });
}

export async function postLogin(req: Request, res: Response){
  const { email, password, return_to } = req.body;
  audit('login_attempt', { email, ip: req.ip });
  
  const u = await prisma.user.findUnique({ where: { email }});
  if (!u) {
    audit('login_fail', { email, reason: 'user_not_found' });
    return res.status(401).send('Invalid credentials');
  }
  
  let passwordValid = false;
  
  // 优先使用 bcrypt hash 验证
  if (u.passwordHash) {
    passwordValid = await bcrypt.compare(password, u.passwordHash);
  } 
  // 兜底：如果还有 legacy 明文密码且 hash 为空，临时允许并迁移
  else if (u.password) {
    passwordValid = (password === u.password);
    if (passwordValid) {
      // 自动迁移：将明文密码升级为哈希
      const hash = await bcrypt.hash(password, 10); // 使用默认轮数
      await prisma.user.update({
        where: { id: u.id },
        data: { passwordHash: hash, password: null }
      });
      audit('password_auto_migrated', { userId: u.id, email });
    }
  }
  
  if (!passwordValid) {
    audit('login_fail', { email, reason: 'invalid_password' });
    return res.status(401).send('Invalid credentials');
  }
  
  // 写入轻量 session（假设你已有 session 中间件；若没有，用签名 cookie）
  (req as any).session = { user: { id: u.id, email: u.email, tenantId: u.tenantId, roles: u.roles }};
  audit('login_success', { email, userId: u.id, tenantId: u.tenantId });
  
  const redirect = return_to || '/';
  return res.redirect(302, redirect);
}

export async function getAuthorize(req: Request, res: Response){
  const u = (req as any).session?.user;
  if (!u){
    const return_to = encodeURIComponent(req.originalUrl);
    return res.redirect(302, `/login?return_to=${return_to}`);
  }
  // 生成一次性授权码
  const { client_id, redirect_uri, scope, state, code_challenge, code_challenge_method, nonce } = req.query as any;
  if (!client_id || !redirect_uri || !code_challenge) return res.status(400).send('invalid_request');

  const codeId = crypto.randomUUID();
  await prisma.authorizationCode.create({
    data: {
      id: codeId,
      clientId: client_id,
      redirectUri: redirect_uri,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method || 'S256',
      scope: (scope || '').toString(),
      state: (state || '').toString(),
      nonce: (nonce || '').toString(),
      subjectUserId: u.id,
      tenantId: u.tenantId,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5*60*1000),
      used: false
    }
  });
  
  audit('authorize', { clientId: client_id, userId: u.id, scope });
  
  const r = new URL(redirect_uri);
  r.searchParams.set('code', codeId);
  if (state) r.searchParams.set('state', state);
  return res.redirect(302, r.toString());
}

// ===== Token Endpoint =====
export async function token(req: Request, res: Response){
  const { grant_type } = req.body || {};
  try{
    if (grant_type === 'authorization_code'){
      const { code, code_verifier, client_id, redirect_uri } = req.body;
      if (!code || !code_verifier || !client_id || !redirect_uri) {
        return res.status(400).json({ error: 'invalid_request' });
      }
      const c = await prisma.authorizationCode.findUnique({ where: { id: code }});
      if (!c || c.used || new Date(c.expiresAt) < new Date()){
        return res.status(400).json({ error: 'invalid_grant' });
      }

      // ✅ 必修1：授权码绑定校验，防止换绑/窃用
      if (c.clientId !== client_id || c.redirectUri !== redirect_uri) {
        audit('token_denied', {
          clientId: client_id, tenantId: c.tenantId, reason: 'code_binding_mismatch'
        });
        return res.status(400).json({ error: 'invalid_grant' });
      }

      // 校验 PKCE (S256)
      const challenge = require('crypto').createHash('sha256').update(code_verifier).digest('base64')
        .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      if (c.codeChallengeMethod !== 'S256' || challenge !== c.codeChallenge){
        return res.status(400).json({ error: 'invalid_grant' });
      }
      // 强校验：client_id 是否允许在该 tenant 下使用
      const isClientAllowed = await validateClientTenantAccess(client_id, c.tenantId!);
      if (!isClientAllowed) {
        audit('token_denied', { clientId: client_id, tenantId: c.tenantId, reason: 'unauthorized_client_tenant' });
        return res.status(401).json({ error: 'unauthorized_client_tenant' });
      }
      
      // 多租户与受众：从 TenantClient 上下文兜底 aud
      const tc = await prisma.tenantClient.findFirst({ where: { clientId: client_id, tenantId: c.tenantId || undefined }});
      const aud = tc?.defaultAud ?? `${env.defaultAudPrefix}:${c.tenantId}`;
      const scopes = (c.scope || '').split(/\s+/).filter(Boolean);
      
      // 发 RT 家族
      const { refreshId } = await issueRefreshFamily({ userId: c.subjectUserId!, clientId: client_id, tenantId: c.tenantId! });

      // AT 面向 API（aud = API 受众）
      const at = await signAccessToken({
        sub: c.subjectUserId!, tenant_id: c.tenantId!, roles: [], scopes, aud
      });
      
      // ✅ 必修2&3：ID Token 面向客户端 aud=client_id，并包含 nonce（若存在）
      const idToken = await signIdToken({
        sub: c.subjectUserId!, 
        tenant_id: c.tenantId!, 
        client_id, 
        nonce: c.nonce || undefined
      });

      await prisma.authorizationCode.update({ where: { id: code }, data: { used: true, usedAt: new Date() }});
      
      audit('token_issue', { clientId: client_id, userId: c.subjectUserId, grantType: grant_type });

      return res.json({
        access_token: at,
        token_type: 'Bearer',
        expires_in: Number(env.accessTtlSec),
        refresh_token: refreshId,
        id_token: idToken
      });
    }

    if (grant_type === 'refresh_token'){
      const { refresh_token } = req.body;
      try{
        const rotated = await rotateRefreshToken(refresh_token);
        
        // 从用户信息获取真实的tenant_id
        let tenantId: string | null = null;
        if (rotated.subject.userId) {
          const user = await prisma.user.findUnique({ 
            where: { id: rotated.subject.userId },
            select: { tenantId: true }
          });
          tenantId = user?.tenantId ?? null;
        }
        
        if (!tenantId) {
          audit('token_refresh_failed', { refreshTokenId: refresh_token, reason: 'no_tenant_found' });
          return res.status(400).json({ error: 'invalid_refresh_subject' });
        }
        
        // 根据租户计算受众（避免跨租户误发）
        const aud = `${env.defaultAudPrefix}:${tenantId}`;
        
        const at = await signAccessToken({
          sub: (rotated.subject.userId ?? rotated.subject.deviceId)!,
          tenant_id: tenantId,
          roles: [], // 刷新场景通常不扩权
          scopes: [], // 刷新场景通常不扩权
          device_id: rotated.subject.deviceId ?? null,
          aud
        });
        
        audit('token_refresh', { refreshTokenId: refresh_token, newRefreshTokenId: rotated.newId, tenantId });
        
        return res.json({
          access_token: at,
          token_type: 'Bearer',
          expires_in: Number(env.accessTtlSec),
          refresh_token: rotated.newId
        });
      }catch(e:any){
        if (e?.code === 'reuse') {            // 只有"复用"才全家族封禁
          await revokeFamilyByOldReuse(refresh_token);
          audit('refresh_reuse', { refreshTokenId: refresh_token });
          return res.status(401).json({ error: 'invalid_refresh_token' });
        }
        if (['expired','inactive','not_found'].includes(e?.code)) {
          audit('token_refresh_failed', { refreshTokenId: refresh_token, reason: e.code });
          return res.status(401).json({ error: 'invalid_refresh_token' });
        }
        throw e;
      }
    }

    return res.status(400).json({ error: 'unsupported_grant_type' });

  }catch(e:any){
    return res.status(500).json({ error: 'server_error', detail: e?.message });
  }
}

// ===== UserInfo =====
export async function userinfo(req: Request, res: Response){
  // 由 requireBearer 验证并注入的 claims
  const claims = (req as any).claims || {};
  const { sub, tenant_id, roles, scopes = [], acr } = claims;

  const s: string[] = Array.isArray(scopes) ? scopes : [];
  if (!s.includes('openid')) {
    return res.status(403).json({ error: 'insufficient_scope' });
  }

  res.json({
    sub,
    tenant_id,
    roles: roles ?? [],
    scopes: s,
    acr: acr ?? 'normal'
  });
}

// ===== Revoke =====
export async function revoke(req: Request, res: Response){
  const { refresh_token } = req.body || {};
  if (!refresh_token) return res.status(400).json({ error: 'invalid_request' });
  
  await prisma.refreshToken.updateMany({
    where: { OR: [{ id: refresh_token }, { familyId: refresh_token }] },
    data: { status: 'revoked', revokedAt: new Date(), revokeReason: 'manual' }
  });
  
  audit('revoke', { refreshTokenId: refresh_token });
  res.json({ success: true });
}

// ===== Introspect（要求 Basic Auth 并验证JWT）=====
export async function introspect(req: Request, res: Response){
  // 1) Client authentication（Basic Auth）
  const auth = req.header('authorization') || '';
  const m = auth.match(/^Basic\s+(.+)$/i);
  if (!m) {
    audit('introspect', { result: 'no_auth' });
    return res.json({ active: false });
  }
  const s = Buffer.from(m[1], 'base64').toString('utf8');
  const [cid, secret] = s.split(':');
  if (cid !== env.introspectClientId || secret !== env.introspectClientSecret){
    audit('introspect', { clientId: cid, result: 'invalid_client' });
    return res.json({ active: false });
  }

  // 2) 获取要验证的token
  const token = (req.body?.token as string) || '';
  if (!token) {
    audit('introspect', { clientId: cid, result: 'no_token' });
    return res.json({ active: false });
  }

  try {
    // 3) 解析JWT header获取kid
    const [headerB64] = token.split('.');
    if (!headerB64) {
      audit('introspect', { clientId: cid, result: 'invalid_token_format' });
      return res.json({ active: false });
    }
    
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    const kid = header.kid as string | undefined;
    if (!kid) {
      audit('introspect', { clientId: cid, result: 'no_kid' });
      return res.json({ active: false });
    }

    // 4) 根据kid查找公钥
    const keyRecord = await prisma.key.findUnique({ 
      where: { kid },
      select: { publicJwk: true, status: true }
    });
    
    if (!keyRecord || keyRecord.status === 'retired') {
      audit('introspect', { clientId: cid, kid, result: 'key_not_found_or_retired' });
      return res.json({ active: false });
    }

    // 5) 使用jose验证JWT
    const publicKey = await importJWK(keyRecord.publicJwk as any, 'RS256');
    const { payload: decoded } = await jwtVerify(token, publicKey, { 
      algorithms: ['RS256'],
      clockTolerance: 30  // ✅ 30 秒时钟容错
    });

    // 6) 返回RFC 7662标准格式的响应
    audit('introspect', { clientId: cid, kid, sub: decoded.sub, result: 'active' });
    return res.json({
      active: true,
      iss: decoded.iss,
      sub: decoded.sub,
      aud: decoded.aud,
      iat: decoded.iat,
      exp: decoded.exp,
      jti: decoded.jti,
      scope: Array.isArray((decoded as any).scopes) ? (decoded as any).scopes.join(' ') : undefined,
      tenant_id: (decoded as any).tenant_id,
      acr: (decoded as any).acr
    });

  } catch (error) {
    // JWT验证失败（过期、签名错误等）
    audit('introspect', { clientId: cid, result: 'token_invalid', error: error instanceof Error ? error.message : String(error) });
    return res.json({ active: false });
  }
}

// ===== Logout =====
export async function logout(req: Request, res: Response){
  (req as any).session = null;
  audit('logout', { ip: req.ip });
  res.redirect('/');
}