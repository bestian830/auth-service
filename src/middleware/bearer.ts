import { Request, Response, NextFunction } from 'express';
import { importJWK, jwtVerify } from 'jose';
import { prisma } from '../infra/prisma.js';
import { env } from '../config/env.js';

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
    
    if (!keyRecord || keyRecord.status === 'retired') {
      return res.status(401).json({ error: 'invalid_token' });
    }

    // 计算允许的受众
    function getAllowedAudiences(): string[] {
      const list = (process.env.ALLOWED_AUDIENCES || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      if (list.length) return list;
      // 兜底：只允许我们自己的前缀
      return [env.defaultAudPrefix || 'tymoe-service'];
    }

    // 使用jose验证JWT，增加issuer和audience校验
    const publicKey = await importJWK(keyRecord.publicJwk as any, 'RS256');
    const { payload: claims } = await jwtVerify(token, publicKey, {
      algorithms: ['RS256'],
      issuer: env.issuerUrl.replace(/\/+$/, ''),   // 规范化，去掉尾斜杠
      audience: getAllowedAudiences(),            // 限制 aud
      clockTolerance: 30                          // ✅ 30 秒时钟容错
    });
    
    (req as any).claims = claims;
    next();

  } catch (e: any) {
    return res.status(401).json({ error: 'invalid_token', detail: e?.message });
  }
}