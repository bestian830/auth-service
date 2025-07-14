/**
 * 邮件模板渲染器 - 使用Pug模板引擎
 */
import * as pug from 'pug';
import * as path from 'path';
import { EmailTemplateData, EmailTemplateRenderer, SubscriptionEmailData } from '../types/email';
import { logger } from './logger';

/**
 * Pug邮件模板渲染器
 */
export class PugEmailTemplateRenderer implements EmailTemplateRenderer {
  private templateDir: string;

  constructor() {
    this.templateDir = path.join(__dirname, '../templates/email');
  }

  /**
   * 渲染HTML模板
   */
  renderHtml(templateName: string, data: EmailTemplateData): string {
    try {
      const templatePath = path.join(this.templateDir, `${templateName}.pug`);
      
      // 为订阅模板添加特殊数据处理
      if (templateName === 'subscription' && this.isSubscriptionData(data)) {
        data = this.prepareSubscriptionData(data);
      }

      return pug.renderFile(templatePath, data);
    } catch (error) {
      logger.error('Render email HTML template failed', { templateName, error });
      throw new Error(`Failed to render email template: ${templateName}`);
    }
  }

  /**
   * 渲染纯文本模板
   */
  renderText(templateName: string, data: EmailTemplateData): string {
    // 为不同模板生成对应的纯文本版本
    switch (templateName) {
      case 'verification':
        return this.renderVerificationText(data);
      case 'reset-password':
        return this.renderResetPasswordText(data);
      case 'subscription':
        return this.renderSubscriptionText(data as SubscriptionEmailData);
      default:
        return `${data.companyName} - Email Notification`;
    }
  }

  /**
   * 检查是否为订阅数据
   */
  private isSubscriptionData(data: EmailTemplateData): data is SubscriptionEmailData {
    return 'type' in data && 'info' in data;
  }

  /**
   * 准备订阅模板数据
   */
  private prepareSubscriptionData(data: SubscriptionEmailData): SubscriptionEmailData {
    const colors = {
      'activated': '#28a745',
      'cancelled': '#dc3545',
      'renewed': '#007bff',
      'expired': '#ffc107'
    };

    const typeTexts = {
      'activated': 'Activated',
      'cancelled': 'Cancelled',
      'renewed': 'Renewed',
      'expired': 'Expired'
    };

    return {
      ...data,
      color: colors[data.type] || '#007bff',
      typeText: typeTexts[data.type] || 'Notification'
    };
  }

  /**
   * 渲染验证邮件纯文本
   */
  private renderVerificationText(data: EmailTemplateData): string {
    const verificationUrl = (data as any).verificationUrl;
    return `
      Welcome to ${data.companyName}!
      
      Thank you for registering with us. Please visit the following link to verify your email address:
      
      ${verificationUrl}
      
      Note: This link will expire in 24 hours.
      
      If you did not register for this account, please ignore this email.
    `.trim();
  }

  /**
   * 渲染密码重置邮件纯文本
   */
  private renderResetPasswordText(data: EmailTemplateData): string {
    const resetUrl = (data as any).resetUrl;
    return `
      ${data.companyName} - Password Reset Request
      
      We have received your password reset request. Please visit the following link to reset your password:
      
      ${resetUrl}
      
      Security reminder:
      - This link will expire in 1 hour
      - For your account security, please do not share this link with others
      - If you did not request a password reset, please ignore this email
      
      If you did not request a password reset, please contact our customer support immediately.
    `.trim();
  }

  /**
   * 渲染订阅通知邮件纯文本
   */
  private renderSubscriptionText(data: SubscriptionEmailData): string {
    return `
      ${data.companyName} - Subscription Notification
      
      Your subscription status has been updated:
      
      Subscription Plan: ${data.info.planName || 'Unknown'}
      Status: ${data.info.status || 'Unknown'}
      ${data.info.expiresAt ? `Expiration Date: ${data.info.expiresAt}` : ''}
      ${data.info.amount ? `Amount: ¥${data.info.amount}` : ''}
      
      If you have any questions, please contact our customer support team.
    `.trim();
  }
}

// 导出单例实例
export const emailTemplateRenderer = new PugEmailTemplateRenderer(); 