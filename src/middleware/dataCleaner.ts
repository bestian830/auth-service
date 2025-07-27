import { Request, Response, NextFunction } from 'express';

// 深度 trim
const deepTrim = (value: any): any => {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(deepTrim);
  if (value && typeof value === 'object') {
    const result: any = {};
    for (const [k, v] of Object.entries(value)) result[k] = deepTrim(v);
    return result;
  }
  return value;
};
// 空字符串 => undefined
const cleanEmptyStrings = (value: any): any => {
  if (typeof value === 'string') return value === '' ? undefined : value;
  if (Array.isArray(value)) return value.map(cleanEmptyStrings);
  if (value && typeof value === 'object') {
    const result: any = {};
    for (const [k, v] of Object.entries(value)) {
      const cleaned = cleanEmptyStrings(v);
      if (cleaned !== undefined) result[k] = cleaned;
    }
    return result;
  }
  return value;
};

export const cleanRequestData = (req: Request, res: Response, next: NextFunction) => {
  if (req.body && typeof req.body === 'object') {
    req.body = deepTrim(req.body);
    req.body = cleanEmptyStrings(req.body);
  }
  next();
};

export const cleanQueryParams = (req: Request, res: Response, next: NextFunction) => {
  if (req.query && typeof req.query === 'object') {
    req.query = deepTrim(req.query);
    req.query = cleanEmptyStrings(req.query);
  }
  next();
};

export const cleanAllRequestData = (req: Request, res: Response, next: NextFunction) => {
  cleanRequestData(req, res, () => {
    cleanQueryParams(req, res, next);
  });
};
