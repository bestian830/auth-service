import { validateRegistrationData, validateLoginData } from '../validators';
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

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

/**
 * 验证邮箱格式
 */
export function validateEmailFormat(req: Request, res: Response, next: NextFunction) {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ 
      success: false, 
      error: 'Email is required' 
    });
  }

  // 复用注册时的邮箱验证逻辑
  const emailSchema = Joi.string()
    .email({ tlds: { allow: false } })
    .max(100)
    .required()
    .messages({
      'string.email': 'Email format error',
      'string.max': 'Email length cannot exceed 100 characters',
      'any.required': 'Email is required'
    });

  const { error } = emailSchema.validate(email);
  
  if (error) {
    return res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }

  next();
}

/**
 * 验证验证码格式（6位数字）
 */
export function validateVerificationCode(req: Request, res: Response, next: NextFunction) {
  const { code } = req.body;
  
  if (!code) {
    return res.status(400).json({ 
      success: false, 
      error: 'Verification code is required' 
    });
  }

  // 验证码必须是6位数字
  const codeSchema = Joi.string()
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      'string.pattern.base': 'Verification code must be 6 digits',
      'any.required': 'Verification code is required'
    });

  const { error } = codeSchema.validate(code);
  
  if (error) {
    return res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }

  next();
}

/**
 * 验证密码强度
 */
export function validatePasswordStrength(req: Request, res: Response, next: NextFunction) {
  const { newPassword } = req.body;
  
  if (!newPassword) {
    return res.status(400).json({ 
      success: false, 
      error: 'New password is required' 
    });
  }

  // 复用现有的密码强度验证
  const { validatePasswordStrength } = require('../utils/password');
  const errors = validatePasswordStrength(newPassword);
  
  if (errors.length > 0) {
    return res.status(400).json({ 
      success: false, 
      error: errors.join(', ') 
    });
  }

  next();
}

/**
 * 验证租户信息更新
 */
export function validateTenantUpdate(req: Request, res: Response, next: NextFunction) {
  const { storeName, subdomain, email } = req.body;
  
  // 验证 subdomain 格式和长度
  if (subdomain !== undefined) {
    const subdomainSchema = Joi.string()
      .pattern(/^[a-z0-9-]{3,50}$/)
      .messages({
        'string.pattern.base': 'Subdomain must be 3-50 characters, only letters, numbers, and hyphens allowed',
        'string.empty': 'Subdomain cannot be empty'
      });
    
    const { error } = subdomainSchema.validate(subdomain);
    if (error) {
      return res.status(400).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
  
  // 验证 storeName 长度
  if (storeName !== undefined) {
    const storeNameSchema = Joi.string()
      .max(100)
      .messages({
        'string.max': 'Store name cannot exceed 100 characters',
        'string.empty': 'Store name cannot be empty'
      });
    
    const { error } = storeNameSchema.validate(storeName);
    if (error) {
      return res.status(400).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
  
  // 验证 email 格式
  if (email !== undefined) {
    const emailSchema = Joi.string()
      .email({ tlds: { allow: false } })
      .max(100)
      .messages({
        'string.email': 'Email format error',
        'string.max': 'Email length cannot exceed 100 characters'
      });
    
    const { error } = emailSchema.validate(email);
    if (error) {
      return res.status(400).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
  
  next();
}
