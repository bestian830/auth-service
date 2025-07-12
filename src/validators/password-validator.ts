/**
 * Password Validator - 密码相关数据校验
 * 职责：校验密码格式、强度、确认等
 */

import Joi from 'joi';
import zxcvbn from 'zxcvbn';
import { SimpleValidationResult } from '../types/validation';
import { PASSWORD_RULES, PASSWORD_SECURITY_CONFIG } from '../constants/validation-rules';

/**
 * 校验密码格式
 * @param password 密码
 * @returns 校验结果
 */
export function validatePasswordFormat(password: string): SimpleValidationResult {
  const schema = Joi.string()
    .min(PASSWORD_RULES.MIN_LENGTH)
    .max(PASSWORD_RULES.MAX_LENGTH)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]+$/)
    .required()
    .messages({
      'string.min': `Password must be at least ${PASSWORD_RULES.MIN_LENGTH} characters`,
      'string.max': `Password cannot exceed ${PASSWORD_RULES.MAX_LENGTH} characters`,
      'string.pattern.base': 'Password must contain uppercase letters, lowercase letters, numbers and special characters',
      'any.required': 'Password is required'
    });

  const { error } = schema.validate(password);
  
  if (error) {
    return {
      isValid: false,
      errors: [{ 
        field: 'password', 
        message: error.details[0].message
      }]
    };
  }

  return { isValid: true, errors: [] };
}

/**
 * 校验密码强度
 * @param password 密码
 * @param userInputs 用户相关信息（用于检测弱密码）
 * @returns 校验结果
 */
export function validatePasswordStrength(password: string, userInputs?: string[]): SimpleValidationResult {
  try {
    const result = zxcvbn(password, userInputs);
    
    if (result.score < PASSWORD_SECURITY_CONFIG.ZXCVBN_MIN_SCORE) {
      let message = 'Password strength is insufficient';
      
      if (result.feedback.warning) {
        message += `: ${result.feedback.warning}`;
      }
      
      if (result.feedback.suggestions && result.feedback.suggestions.length > 0) {
        message += `. Suggestions: ${result.feedback.suggestions.join(', ')}`;
      }
      
      return {
        isValid: false,
        errors: [{ 
          field: 'password', 
          message
        }]
      };
    }

    return { isValid: true, errors: [] };
  } catch (error) {
    return {
      isValid: false,
      errors: [{ 
        field: 'password', 
        message: 'Password strength check failed'
      }]
    };
  }
}

/**
 * 校验密码确认
 * @param password 原密码
 * @param confirmPassword 确认密码
 * @returns 校验结果
 */
export function validatePasswordConfirmation(password: string, confirmPassword: string): SimpleValidationResult {
  if (password !== confirmPassword) {
    return {
      isValid: false,
      errors: [{ 
        field: 'confirmPassword', 
        message: 'Passwords do not match'
      }]
    };
  }

  return { isValid: true, errors: [] };
}

/**
 * 校验密码重置令牌格式
 * @param token 重置令牌
 * @returns 校验结果
 */
export function validateResetToken(token: string): SimpleValidationResult {
  const schema = Joi.string()
    .guid({ version: 'uuidv4' })
    .required()
    .messages({
      'string.guid': 'Reset token format is incorrect',
      'any.required': 'Reset token is required'
    });

  const { error } = schema.validate(token);
  
  if (error) {
    return {
      isValid: false,
      errors: [{ 
        field: 'token', 
        message: error.details[0].message
      }]
    };
  }

  return { isValid: true, errors: [] };
} 