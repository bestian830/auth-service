/**
 * Tenant Validator - 租户相关数据校验
 * 租户相关参数的基础格式校验，用于注册、设置和资料编辑等场景
 */

import Joi from 'joi';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { SimpleValidationResult } from '../types/validation';
import { SUBDOMAIN_RULES, RESERVED_SUBDOMAINS } from '../constants/validation-rules';

/**
 * 校验店铺名称
 * @param storeName 店铺名称
 * @returns 校验结果
 */
export function validateStoreName(storeName: string): SimpleValidationResult {
  const schema = Joi.string()
    .min(1)
    .max(100)
    .required()
    .messages({
      'string.min': 'Store name cannot be empty',
      'string.max': 'Store name cannot exceed 100 characters',
      'any.required': 'Store name is required'
    });

  const { error } = schema.validate(storeName);
  
  if (error) {
    return {
      isValid: false,
      errors: [{ 
        field: 'storeName', 
        message: error.details[0].message
      }]
    };
  }

  return { isValid: true, errors: [] };
}

/**
 * 校验子域名
 * @param subdomain 子域名
 * @returns 校验结果
 */
export function validateSubdomain(subdomain: string): SimpleValidationResult {
  const schema = Joi.string()
    .min(SUBDOMAIN_RULES.MIN_LENGTH)
    .max(SUBDOMAIN_RULES.MAX_LENGTH)
    .pattern(SUBDOMAIN_RULES.PATTERN)
    .pattern(/^[a-z0-9].*[a-z0-9]$/) // 不能以短横线开头或结尾
    .required()
    .messages({
      'string.min': `Subdomain must be at least ${SUBDOMAIN_RULES.MIN_LENGTH} characters`,
      'string.max': `Subdomain cannot exceed ${SUBDOMAIN_RULES.MAX_LENGTH} characters`,
      'string.pattern.base': 'Subdomain can only contain lowercase letters, numbers, and hyphens, and cannot start or end with a hyphen',
      'any.required': 'Subdomain is required'
    });

  const { error } = schema.validate(subdomain);
  
  if (error) {
    return {
      isValid: false,
      errors: [{ 
        field: 'subdomain', 
        message: error.details[0].message
      }]
    };
  }

  // 检查是否是保留的子域名
  if ((RESERVED_SUBDOMAINS as readonly string[]).includes(subdomain)) {
    return {
      isValid: false,
      errors: [{ 
        field: 'subdomain', 
        message: 'This subdomain is reserved by the system, please choose another name'
      }]
    };
  }

  return { isValid: true, errors: [] };
}

/**
 * 校验电话号码
 * @param phoneNumber 电话号码
 * @param country 国家代码，默认为加拿大 (CA)
 * @returns 校验结果
 */
export function validatePhoneNumber(phoneNumber: string, country: string = 'CA'): SimpleValidationResult {
  if (!phoneNumber || phoneNumber.trim() === '') {
    return { isValid: true, errors: [] }; // 电话号码是可选的
  }

  try {
    const parsed = parsePhoneNumberFromString(phoneNumber, country as any);
    
    if (!parsed || !parsed.isValid()) {
      return {
        isValid: false,
        errors: [{ 
          field: 'phone', 
          message: 'Phone number format is invalid'
        }]
      };
    }

    return { isValid: true, errors: [] };
  } catch (error) {
    return {
      isValid: false,
      errors: [{ 
        field: 'phone', 
        message: 'Phone number format is invalid'
      }]
    };
  }
} 