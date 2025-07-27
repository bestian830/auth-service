import { validateRegistrationData, validateLoginData } from '../validators';
import { Request, Response, NextFunction } from 'express';

export function validateRegisterInput(req: Request, res: Response, next: NextFunction) {
  const result = validateRegistrationData(req.body);
  if (!result.isValid) return res.status(400).json({ success: false, errors: result.errors });
  next();
}

export function validateLoginInput(req: Request, res: Response, next: NextFunction) {
  const result = validateLoginData(req.body);
  if (!result.isValid) return res.status(400).json({ success: false, errors: result.errors });
  next();
}
