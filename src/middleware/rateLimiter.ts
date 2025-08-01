import rateLimit from 'express-rate-limit';
import { env } from '../config';
import { NextFunction, Request, Response } from 'express';

// 全局速率限制（每个 IP 15分钟最多100次）
export const globalLimiter = process.env.NODE_ENV === 'production'
  ? rateLimit({
      windowMs: env.rateLimitWindowMs || 900000,
      max: env.rateLimitMax || 100,
      skipSuccessfulRequests: !!env.rateLimitSkipSuccessfulRequests,
      standardHeaders: true,
      legacyHeaders: false,
      message: { success: false, error: 'Too many requests, please try again later.' },
    })
  : (req: Request, res: Response, next: NextFunction) => next(); // 开发环境直接跳过

// 登录专用速率限制
export const loginLimiter = process.env.NODE_ENV === 'production'
  ? rateLimit({
      windowMs: env.rateLimitWindowMs || 900000,
      max: env.loginAttempts || 10,
      keyGenerator: (req) => req.body?.email || req.ip,
      skipSuccessfulRequests: true, // 只算失败的
      message: { success: false, error: 'Too many failed login attempts, try later.' },
    })
  : (req: Request, res: Response, next: NextFunction) => next(); // 开发环境直接跳过

// 注册专用速率限制
export const registerLimiter = process.env.NODE_ENV === 'production'
  ? rateLimit({
      windowMs: env.rateLimitWindowMs || 900000,
      max: env.registrationAttempts || 3,
      keyGenerator: (req) => req.body?.email || req.ip,
      skipSuccessfulRequests: false,
      message: { 
        success: false, 
        error: 'Too many registration attempts, try later.' 
      },
    })
  : (req: Request, res: Response, next: NextFunction) => next(); // 开发环境直接跳过
