/**
 * Session Validator - Session-related data validation
 * 会话相关参数的基础格式校验，所有校验都用于防御客户端不规范输入
 */

import Joi from 'joi';
import { SimpleValidationResult } from '../types/validation';

/**
 * 校验会话ID格式
 * @param sessionId 会话ID
 * @returns 校验结果
 */
export function validateSessionId(sessionId: string): SimpleValidationResult {
  const schema = Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Session ID format is invalid',
      'any.required': 'Session ID is required'
    });

  const { error } = schema.validate(sessionId);
  
  if (error) {
    return {
      isValid: false,
      errors: [{ 
        field: 'sessionId', 
        message: error.details[0].message
      }]
    };
  }

  return { isValid: true, errors: [] };
}

/**
 * 校验访问令牌格式
 * @param token 访问令牌
 * @returns 校验结果
 */
export function validateTokenFormat(token: string): SimpleValidationResult {
  const schema = Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Access token format is invalid',
      'any.required': 'Access token is required'
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

/**
 * 校验刷新令牌格式
 * @param refreshToken 刷新令牌
 * @returns 校验结果
 */
export function validateRefreshTokenFormat(refreshToken: string): SimpleValidationResult {
  const schema = Joi.string()
    .uuid()
    .required()
    .messages({
      'string.guid': 'Refresh token format is invalid',
      'any.required': 'Refresh token is required'
    });

  const { error } = schema.validate(refreshToken);
  
  if (error) {
    return {
      isValid: false,
      errors: [{ 
        field: 'refreshToken', 
        message: error.details[0].message
      }]
    };
  }

  return { isValid: true, errors: [] };
} 