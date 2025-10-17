import { Request, Response, NextFunction } from 'express';

export function requireUser(req: Request, res: Response, next: NextFunction) {
  const claims = (req as any).claims || {};
  if (claims.userType !== 'USER') return res.status(403).json({ error: 'user_only' });
  next();
}

export function requireAccount(req: Request, res: Response, next: NextFunction) {
  const claims = (req as any).claims || {};
  if (claims.userType !== 'ACCOUNT') return res.status(403).json({ error: 'account_only' });
  next();
}

export function requireAccountType(...allowed: Array<'OWNER' | 'MANAGER' | 'STAFF'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const claims = (req as any).claims || {};
    if (claims.userType !== 'ACCOUNT') return res.status(403).json({ error: 'account_only' });
    if (!allowed.includes(claims.accountType)) return res.status(403).json({ error: 'insufficient_account_type' });
    next();
  };
}

export function requireOrgAccess(paramName: string = 'orgId') {
  return (req: Request, res: Response, next: NextFunction) => {
    const claims = (req as any).claims || {};
    const orgId = (req.params as any)[paramName] || (req.query as any)[paramName] || (req.body as any)[paramName] || claims.organization?.id;
    if (!orgId) return res.status(400).json({ error: 'organization_required' });
    if (claims.userType === 'ACCOUNT' && claims.organization?.id !== orgId) {
      return res.status(403).json({ error: 'org_mismatch' });
    }
    next();
  };
}


