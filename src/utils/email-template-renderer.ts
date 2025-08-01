import { env } from '../config';
import type { EmailTemplateParams, EmailType } from '../types';
import pug from 'pug';
import path from 'path';

export function renderEmailTemplate(type: EmailType, params: EmailTemplateParams): string {
  if (type === 'verify-email') {
    // 渲染 verification.pug 模板
    const templatePath = path.join(__dirname, '../templates/email/verification.pug');
    return pug.renderFile(templatePath, params);
  } else if (type === 'password-reset-code') {
    // 渲染 password-reset-code.pug 模板
    const templatePath = path.join(__dirname, '../templates/email/password-reset-code.pug');
    return pug.renderFile(templatePath, params);
  }
  // 其他类型（如 'custom'）直接返回传入的 HTML 字符串
  return params.html || '';
}