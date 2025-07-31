// validators/account-validator.ts

import Joi from 'joi';
import { validatePhoneNumber } from '../utils';
import { RegisterTenantInput, LoginInput, ValidationError, ValidationResult } from '../types';

/**
 * 校验注册数据
 */
export function validateRegistrationData(data: RegisterTenantInput): ValidationResult {
  const schema = Joi.object({
    email: Joi.string()
      .email({ tlds: { allow: false } })
      .max(100)
      .required()
      .messages({
        'string.email': 'Email format error',
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
    storeName: Joi.string()
      .min(1)
      .max(100)
      .optional()
      .messages({
        'string.min': 'Store name cannot be empty',
        'string.max': 'Store name cannot exceed 100 characters',
      }),
    subdomain: Joi.string()
      .min(2)
      .max(50)
      .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .optional()
      .messages({
        'string.min': 'Subdomain must be at least 2 characters',
        'string.max': 'Subdomain cannot exceed 50 characters',
        'string.pattern.base': 'Subdomain can only contain lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen',
      }),
    phone: Joi.string()
      .allow('')
      .max(32)
      .custom((value, helpers) => {
        if (!value) return value; // 允许空
        if (!validatePhoneNumber(value, 'CA')) {
          return helpers.error('any.invalid');
        }
        return value;
      }, 'Phone number validation')
      .messages({
        'any.invalid': 'Phone number format error, please enter international format, such as +86137xxxx, +1604xxx or local number',
        'string.max': 'Phone number cannot exceed 32 characters'
      }),
    address: Joi.string()
      .allow('')
      .max(255)
      .optional()
      .messages({
        'string.base': 'Address format error',
        'string.max': 'Address cannot exceed 255 characters'
      }),
  });

  const { error } = schema.validate(data, { abortEarly: false });

  if (error) {
    const errors: ValidationError[] = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    return { isValid: false, errors };
  }

  return { isValid: true };
}

/**
 * 校验登录数据
 */
export function validateLoginData(data: LoginInput): ValidationResult {
  const schema = Joi.object({
    email: Joi.string()
      .email({ tlds: { allow: false } })
      .max(100)
      .required()
      .messages({
        'string.email': 'Email format error',
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
  });

  const { error } = schema.validate(data, { abortEarly: false });

  if (error) {
    const errors: ValidationError[] = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));
    return { isValid: false, errors };
  }

  return { isValid: true };
}
