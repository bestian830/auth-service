import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  logger.error('Unhandled error', { error: err, path: req.path, tenantId: req.tenantId });
  res.status(500).json({ success: false, error: 'Internal Server Error' });
}
