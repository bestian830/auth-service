/**
 * Account Validator - 账号相关数据校验
 * 职责：校验邮箱、注册、登录等账号相关输入格式
 */

import Joi from 'joi';
import { RegisterData, LoginCredentials } from '../types/auth';
import { SimpleValidationResult, SimpleMultiFieldValidationResult } from '../types/validation';

/**
 * 校验邮箱格式
 * @param email 邮箱地址
 * @returns 校验结果
 */
export function validateEmail(email: string): SimpleValidationResult {
  const schema = Joi.string()
    .email({ tlds: { allow: false } })
    .max(100)
    .required();

  const { error } = schema.validate(email);
  
  if (error) {
    return {
      isValid: false,
      errors: [{ 
        field: 'email', 
        message: 'Email format is incorrect or exceeds 100 characters'
      }]
    };
  }

  return { isValid: true, errors: [] };
}

/**
 * 校验注册数据
 * @param data 注册数据
 * @returns 校验结果
 */
export function validateRegistrationData(data: RegisterData): SimpleMultiFieldValidationResult {
  const schema = Joi.object({
    email: Joi.string()
      .email({ tlds: { allow: false } })
      .max(100)
      .required()
      .messages({
        'string.email': 'Email format is incorrect',
        'string.max': 'Email length cannot exceed 100 characters',
        'any.required': 'Email is required'
      }),
    password: Joi.string()
      .min(8)
      .max(64)
      .required()
      .messages({
        'string.min': 'Password must be at least 8 characters',
        'string.max': 'Password cannot exceed 64 characters',
        'any.required': 'Password is required'
      }),
    confirmPassword: Joi.string()
      .valid(Joi.ref('password'))
      .required()
      .messages({
        'any.only': 'Passwords do not match',
        'any.required': 'Confirm password is required'
      }),
    storeName: Joi.string()
      .min(1)
      .max(100)
      .required()
      .messages({
        'string.min': 'Store name cannot be empty',
        'string.max': 'Store name cannot exceed 100 characters',
        'any.required': 'Store name is required'
      }),
    subdomain: Joi.string()
      .min(2)
      .max(50)
      .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .required()
      .messages({
        'string.min': 'Subdomain must be at least 2 characters',
        'string.max': 'Subdomain cannot exceed 50 characters',
        'string.pattern.base': 'Subdomain can only contain lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen',
        'any.required': 'Subdomain is required'
      }),
    phone: Joi.string()
      .allow('')
      .optional()
      .messages({
        'string.base': 'Phone number format is incorrect'
      }),
    address: Joi.string()
      .allow('')
      .optional()
      .messages({
        'string.base': 'Address format is incorrect'
      }),
    acceptTerms: Joi.boolean()
      .valid(true)
      .required()
      .messages({
        'any.only': 'Must agree to terms',
        'any.required': 'Must agree to terms'
      })
  });

  const { error } = schema.validate(data, { abortEarly: false });
  
  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    return { isValid: false, errors };
  }

  return { isValid: true };
}

/**
 * 校验登录数据
 * @param data 登录数据
 * @returns 校验结果
 */
export function validateLoginData(data: LoginCredentials): SimpleMultiFieldValidationResult {
  const schema = Joi.object({
    email: Joi.string()
      .email({ tlds: { allow: false } })
      .max(100)
      .required()
      .messages({
        'string.email': 'Email format is incorrect',
        'string.max': 'Email length cannot exceed 100 characters',
        'any.required': 'Email is required'
      }),
    password: Joi.string()
      .min(1)
      .required()
      .messages({
        'string.min': 'Password cannot be empty',
        'string.empty': 'Password cannot be empty',
        'any.required': 'Password is required'
      }),
    rememberMe: Joi.boolean()
      .optional()
      .messages({
        'boolean.base': 'Remember me option format is incorrect'
      })
  });

  const { error } = schema.validate(data, { abortEarly: false });
  
  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    
    return { isValid: false, errors };
  }

  return { isValid: true };
} 