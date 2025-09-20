import { Request, Response, NextFunction } from 'express';

export function ensureLoggedIn(req: Request, res: Response, next: NextFunction) {
  const user = (req.session as any)?.user;
  if (user && user.id) return next();
  const returnTo = encodeURIComponent(req.originalUrl);
  return res.redirect(`/login?return_to=${returnTo}`);
}