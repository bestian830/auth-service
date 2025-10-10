import { Request, Response, NextFunction } from 'express';

export function requireProductType(req: Request, res: Response, next: NextFunction) {
  const h = (req.headers['x-product-type'] || req.headers['X-Product-Type']) as string | undefined;
  if (!h || !['beauty', 'fb'].includes(h)) {
    return res.status(400).json({ error: 'invalid_product_type' });
  }
  (req as any).productType = h;
  next();
}


