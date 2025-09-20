// src/controllers/oidc.ts
import { Request, Response } from 'express';
import { env } from '../config/env.js';
import { buildJwksWithEtag, ensureOneActiveKey } from '../infra/keystore.js';
import { prisma } from '../infra/prisma.js';
import { issueRefreshFamily, rotateRefreshToken, revokeFamilyByOldReuse, signAccessToken, signIdToken } from '../../services/token.js';
import { audit } from '../../middleware/audit.js';
import { importJWK, jwtVerify } from 'jose';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
// import { deviceService } from '../services/device.js'; // Device服务已移到其他微服务
import { jtiCache } from '../infra/redis.js';
import { authenticateClient, validateGrantType } from '../../services/clientAuth.js';

// ===== Discovery =====
export async function discovery(_req: Request, res: Response){
  const base = env.issuerUrl.replace(/\/+$/, '');
  
  // Dynamically determine supported auth methods based on existing clients
  const clients = await prisma.client.findMany({
    select: { 
      type: true, 
      authMethod: true 
    }
  });
  
  const authMethods = new Set<string>();
  
  // Add methods based on client types in database
  for (const client of clients) {
    if (client.type === 'PUBLIC') {
      authMethods.add('none');
    } else if (client.type === 'CONFIDENTIAL') {
      if (client.authMethod === 'client_secret_basic') {
        authMethods.add('client_secret_basic');
      } else if (client.authMethod === 'client_secret_post') {
        authMethods.add('client_secret_post');
      }
    }
  }
  
  // Ensure at least 'none' is supported if no clients exist
  if (authMethods.size === 0) {
    authMethods.add('none');
  }
  
  // Determine grant types based on client types
  const grantTypes = new Set(['authorization_code', 'refresh_token']);
  const hasConfidentialClients = clients.some((c: any) => c.type === 'CONFIDENTIAL');
  if (hasConfidentialClients) {
    grantTypes.add('client_credentials');
  }

  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    jwks_uri: `${base}/jwks.json`,
    userinfo_endpoint: `${base}/userinfo`,
    revocation_endpoint: `${base}/oauth/revoke`,
    grant_types_supported: Array.from(grantTypes),
    response_types_supported: ['code'],
    id_token_signing_alg_values_supported: ['RS256'],
    token_endpoint_auth_methods_supported: Array.from(authMethods),
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
  // Legacy password support has been removed with the new schema
  
  if (!passwordValid) {
    audit('login_fail', { email, reason: 'invalid_password' });
    return res.status(401).send('Invalid credentials');
  }
  
  // 写入轻量 session（假设你已有 session 中间件；若没有，用签名 cookie）
  (req as any).session = { user: { id: u.id, email: u.email }};
  audit('login_success', { email, userId: u.id });
  
  const redirect = return_to || '/';
  return res.redirect(302, redirect);
}

export async function getAuthorize(req: Request, res: Response){
  const u = (req as any).session?.user;
  if (!u){
    const return_to = encodeURIComponent(req.originalUrl);
    return res.redirect(302, `/login?return_to=${return_to}`);
  }

  // Check if user's email is verified
  const user = await prisma.user.findUnique({ where: { id: u.id } });
  if (!user?.emailVerifiedAt) {
    audit('authorize_unverified_email', { 
      userId: u.id, 
      email: u.email, 
      ip: req.ip 
    });
    return res.status(400).send('<h1>Email Not Verified</h1><p>Please verify your email before accessing applications.</p>');
  }

  // 生成一次性授权码
  const { client_id, redirect_uri, scope, state, code_challenge, code_challenge_method, nonce } = req.query as any;
  if (!client_id || !redirect_uri || !code_challenge) return res.status(400).send('invalid_request');

  // Check client exists and validate redirect URI whitelist
  const client = await prisma.client.findUnique({ 
    where: { id: client_id },
    select: { redirectUris: true }
  });
  
  if (!client) {
    audit('authorize_invalid_client', { 
      clientId: client_id, 
      userId: u.id, 
      ip: req.ip 
    });
    return res.status(400).send('invalid_client');
  }

  if (!client.redirectUris.includes(redirect_uri)) {
    audit('authorize_invalid_redirect_uri', { 
      clientId: client_id, 
      redirectUri: redirect_uri,
      allowedUris: client.redirectUris,
      userId: u.id, 
      ip: req.ip 
    });
    return res.status(400).send('invalid_redirect_uri');
  }

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
    // Client authentication
    const clientAuthResult = await authenticateClient(req);
    if (!clientAuthResult.success) {
      return res.status(401).json({ 
        error: 'invalid_client', 
        error_description: clientAuthResult.error 
      });
    }

    const { clientId, clientType } = clientAuthResult;
    
    // Validate grant type is allowed for client type
    if (!validateGrantType(clientType!, grant_type)) {
      return res.status(400).json({ 
        error: 'unauthorized_client',
        error_description: `Grant type '${grant_type}' not allowed for ${clientType} client`
      });
    }

    if (grant_type === 'authorization_code'){
      const { code, code_verifier, redirect_uri } = req.body;
      if (!code || !code_verifier || !redirect_uri) {
        return res.status(400).json({ error: 'invalid_request' });
      }
      const c = await prisma.authorizationCode.findUnique({ where: { id: code }});
      if (!c || c.used || new Date(c.expiresAt) < new Date()){
        return res.status(400).json({ error: 'invalid_grant' });
      }

      // ✅ 必修1：授权码绑定校验，防止换绑/窃用
      if (c.clientId !== clientId || c.redirectUri !== redirect_uri) {
        audit('token_denied', {
          clientId, organizationId: c.organizationId, reason: 'code_binding_mismatch'
        });
        return res.status(400).json({ error: 'invalid_grant' });
      }

      // 校验 PKCE (S256)
      const challenge = crypto.createHash('sha256').update(code_verifier).digest('base64')
        .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      if (c.codeChallengeMethod !== 'S256' || challenge !== c.codeChallenge){
        return res.status(400).json({ error: 'invalid_grant' });
      }
      // Get user with organization info
      const user = await prisma.user.findUnique({
        where: { id: c.subjectUserId! },
        include: {
          ownedOrganizations: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'asc' }
          }
        }
      });
      
      if (!user) {
        return res.status(400).json({ error: 'invalid_grant' });
      }
      
      // Get first active organization (simplified approach)
      const primaryOrg = user.ownedOrganizations[0];
      const organizationId = primaryOrg?.id || undefined;
      
      const scopes = (c.scope || '').split(/\s+/).filter(Boolean);
      
      // 发 RT 家族
      const { refreshId } = await issueRefreshFamily({ 
        userId: c.subjectUserId!, 
        clientId: clientId!, 
        organizationId 
      });

      // AT 面向 API
      const at = await signAccessToken({
        sub: c.subjectUserId!, 
        roles: primaryOrg ? ['OWNER'] : [], 
        scopes, 
        organizationId
      });
      
      // ID Token 面向客户端
      const idToken = await signIdToken({
        sub: c.subjectUserId!, 
        organizationId,
        aud: clientId!, 
        nonce: c.nonce || undefined
      });

      await prisma.authorizationCode.update({ where: { id: code }, data: { used: true, usedAt: new Date() }});
      
      audit('token_issue', { clientId: clientId!, userId: c.subjectUserId, grantType: grant_type });

      return res.json({
        access_token: at,
        token_type: 'Bearer',
        expires_in: Number(env.accessTtlSec),
        refresh_token: refreshId,
        id_token: idToken
      });
    }

    if (grant_type === 'refresh_token'){
      const { refresh_token, device_proof } = req.body;
      try{
        const rotated = await rotateRefreshToken(refresh_token);
        
        let deviceId: string | null = null;

        // 设备验证功能已移到其他微服务，暂时禁用
        // Optional device proof validation
        // if (device_proof) {
        //   deviceId validation logic...
        // }
        
        // Get user and organization info
        let organizationId: string | undefined = undefined;
        let roles: string[] = [];
        
        if (rotated.subject.userId) {
          const user = await prisma.user.findUnique({ 
            where: { id: rotated.subject.userId },
            include: {
              ownedOrganizations: {
                where: { status: 'ACTIVE' },
                orderBy: { createdAt: 'asc' }
              }
            }
          });
          
          if (user && user.ownedOrganizations.length > 0) {
            // Use primary organization (first created)
            const primaryOrg = user.ownedOrganizations[0];
            organizationId = primaryOrg.id;
            roles = ['OWNER']; // User is owner of their organizations
          }
        }
        
        const at = await signAccessToken({
          sub: (rotated.subject.userId ?? rotated.subject.deviceId)!,
          roles,
          scopes: [],
          organizationId,
          deviceId: deviceId ?? rotated.subject.deviceId ?? null
        });
        
        audit('token_refresh', { 
          refreshTokenId: refresh_token, 
          newRefreshTokenId: rotated.newId, 
          organizationId,
          deviceId,
          userId: rotated.subject.userId
        });
        
        return res.json({
          access_token: at,
          token_type: 'Bearer',
          expires_in: Number(env.accessTtlSec),
          refresh_token: rotated.newId
        });
      }catch(e:any){
        if (e?.code === 'reuse') {
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
  const { sub, organizationId, roles, scopes = [], acr } = claims;

  const s: string[] = Array.isArray(scopes) ? scopes : [];
  if (!s.includes('openid')) {
    return res.status(403).json({ error: 'insufficient_scope' });
  }

  res.json({
    sub,
    organizationId,
    roles: roles ?? [],
    scopes: s,
    acr: acr ?? 'normal'
  });
}

// ===== Revoke =====
export async function revoke(req: Request, res: Response){
  const { refresh_token } = req.body || {};
  if (!refresh_token) return res.status(400).json({ error: 'invalid_request' });

  // Basic Auth for client authentication (prevent DoS)
  const auth = req.header('authorization') || '';
  const m = auth.match(/^Basic\s+(.+)$/i);
  if (!m) {
    audit('revoke_no_auth', { refreshTokenId: refresh_token, ip: req.ip });
    return res.status(401).json({ error: 'invalid_client' });
  }
  
  const s = Buffer.from(m[1], 'base64').toString('utf8');
  const [cid, secret] = s.split(':');
  if (cid !== env.introspectClientId || secret !== env.introspectClientSecret){
    audit('revoke_invalid_client', { clientId: cid, refreshTokenId: refresh_token, ip: req.ip });
    return res.status(401).json({ error: 'invalid_client' });
  }

  // Check that the refresh token belongs to this client (prevent cross-client revocation)
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { id: refresh_token },
    select: { clientId: true, familyId: true }
  });

  if (!tokenRecord) {
    audit('revoke_token_not_found', { clientId: cid, refreshTokenId: refresh_token, ip: req.ip });
    return res.json({ success: true }); // Return success even if token doesn't exist
  }

  if (tokenRecord.clientId !== cid) {
    audit('revoke_client_mismatch', { 
      clientId: cid, 
      tokenClientId: tokenRecord.clientId,
      refreshTokenId: refresh_token, 
      ip: req.ip 
    });
    return res.status(403).json({ error: 'invalid_client' });
  }

  // Revoke the entire family
  await prisma.refreshToken.updateMany({
    where: { familyId: tokenRecord.familyId },
    data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: 'manual_revoke' }
  });
  
  audit('revoke', { 
    clientId: cid, 
    refreshTokenId: refresh_token, 
    familyId: tokenRecord.familyId,
    ip: req.ip 
  });
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
    
    if (!keyRecord || keyRecord.status === 'RETIRED') {
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
      organizationId: (decoded as any).organizationId,
      acr: (decoded as any).acr
    });

  } catch (error: any) {
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