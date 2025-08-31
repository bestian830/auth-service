import { Request, Response, NextFunction } from 'express';
import { audit } from './audit.js';

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const claims = (req as any).claims;
      
      if (!claims?.sub) {
        audit('role_check_unauthorized', { 
          ip: req.ip, 
          requiredRole: role 
        });
        return res.status(401).json({ error: 'unauthorized' });
      }

      const userRoles = claims.roles || [];
      
      if (!userRoles.includes(role)) {
        audit('role_check_insufficient', { 
          ip: req.ip, 
          userId: claims.sub, 
          userRoles, 
          requiredRole: role 
        });
        return res.status(403).json({ error: 'insufficient_permissions' });
      }

      // Role check passed
      next();
    } catch (error: any) {
      audit('role_check_error', { 
        ip: req.ip, 
        userId: (req as any).claims?.sub,
        requiredRole: role,
        error: error.message 
      });
      res.status(500).json({ error: 'server_error' });
    }
  };
}

export const requireAdmin = requireRole('admin');