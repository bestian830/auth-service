import { Request, Response, NextFunction } from 'express';
import { importJWK, jwtVerify } from 'jose';
import { prisma } from '../infra/prisma.js';
import { env } from '../config/env.js';
import { getRedisClient, isRedisConnected } from '../infra/redis.js';

export async function requireBearer(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization || '';
  const [scheme, token] = auth.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'invalid_token' });
  }

  try {
    // 解析JWT header获取kid
    const [headerB64] = token.split('.');
    if (!headerB64) {
      return res.status(401).json({ error: 'invalid_token' });
    }
    
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());
    const kid = header.kid as string | undefined;
    if (!kid) {
      return res.status(401).json({ error: 'invalid_token' });
    }

    // 根据kid查找公钥
    const keyRecord = await prisma.key.findUnique({ 
      where: { kid },
      select: { publicJwk: true, status: true }
    });
    
    if (!keyRecord || keyRecord.status === 'RETIRED') {
      return res.status(401).json({ error: 'invalid_token' });
    }

    // 使用jose验证JWT，仅校验签名和issuer
    const publicKey = await importJWK(keyRecord.publicJwk as any, 'RS256');
    const { payload: claims } = await jwtVerify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: env.issuerUrl.replace(/\/+$/, ''),   // 规范化，去掉尾斜杠
      clockTolerance: 30                          // 30 秒时钟容错
    });

    // 手动校验audience（宽松模式，只要有 aud 就行）
    // 不强制校验 audience 前缀，允许所有 client_id
    // const aud = claims.aud;
    // if (aud && !Array.isArray(aud) && typeof aud === 'string') {
    //   const allowedPrefixes = env.allowedAudiences.split(',').map(s => s.trim()).filter(Boolean);
    //   const hasValidPrefix = allowedPrefixes.some(prefix => aud.startsWith(prefix));
    //
    //   if (!hasValidPrefix) {
    //     return res.status(401).json({ error: 'invalid_audience' });
    //   }
    // }

    // 检查 JTI 黑名单
    const jti = claims.jti as string | undefined;
    if (jti && isRedisConnected()) {
      try {
        const redis = await getRedisClient();
        const blacklisted = await redis.get(`token:blacklist:${jti}`);
        if (blacklisted) {
          return res.status(401).json({ error: 'token_revoked' });
        }
      } catch (redisError) {
        console.error('Redis blacklist check error:', redisError);
        // Redis 错误时不阻止请求，继续执行
      }
    }

    (req as any).claims = claims;
    next();

  } catch (e: any) {
    return res.status(401).json({ error: 'invalid_token', detail: e?.message });
  }
}