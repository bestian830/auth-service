// src/middleware/metricsAuth.ts
import { Request, Response, NextFunction } from 'express';

export function metricsAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.get('X-Metrics-Token');
  if (!token || token !== process.env.METRICS_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}