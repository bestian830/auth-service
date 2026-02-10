import { Request, Response } from 'express';

/**
 * Traefik ForwardAuth 网关鉴权端点
 *
 * Traefik 将原始请求的 headers（含 Authorization）转发到此端点。
 * 若 JWT 有效，返回 200 并通过 response headers 将用户身份信息
 * 回传给 Traefik，Traefik 再注入到下游服务的请求中。
 */
export async function gatewayCheck(req: Request, res: Response) {
  const claims = (req as any).claims;

  if (!claims || !claims.sub) {
    return res.status(401).json({ error: 'invalid_token' });
  }

  // 通过 response headers 将用户信息传递给 Traefik
  res.set('X-User-Id', String(claims.sub));
  res.set('X-User-Type', String(claims.userType || ''));
  res.set('X-User-Role', String(claims.accountType || ''));

  // 组织信息：优先从 JWT claims 获取，其次从原始请求 headers 透传
  const orgId = claims.organization?.id
    || req.headers['x-org-id']
    || req.headers['x-organization-id'];
  if (orgId) {
    res.set('X-Org-Id', String(orgId));
  }

  const orgName = claims.organization?.name
    || req.headers['x-org-name'];
  if (orgName) {
    res.set('X-Org-Name', String(orgName));
  }

  // 透传设备 ID（如果前端发送了的话）
  const deviceId = req.headers['x-device-id'];
  if (deviceId) {
    res.set('X-Device-Id', String(deviceId));
  }

  return res.status(200).json({ ok: true });
}
