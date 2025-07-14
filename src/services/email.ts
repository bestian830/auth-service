/**
 * 邮件服务 - 处理邮件发送相关业务逻辑
 */
import { createEmailTransporter } from '../config/email';
import { EMAIL_SUBJECTS } from '../constants/email-subjects';
import { config } from '../config';
import { logger } from '../utils/logger';
import { AuthError } from '../types';
import { 
  EmailOptions, 
  EmailTokenValidation, 
  VerificationEmailData, 
  ResetPasswordEmailData, 
  SubscriptionEmailData 
} from '../types/email';
import { validateEmail } from '../validators/account-validator';
import { emailTemplateRenderer } from '../utils/email-template-renderer';
const jwt = require('jsonwebtoken');

/**
 * 邮件服务类
 */
class EmailService {
  private transporter: any;

  constructor() {
    this.initialize();
  }

  /**
   * 初始化邮件服务
   */
  private initialize() {
    this.transporter = createEmailTransporter();
    logger.info('✅ Email service initialized successfully');
  }

  /**
   * 发送邮件的通用方法
   */
  private async sendEmail(options: EmailOptions): Promise<void> {
    // 验证邮箱地址
    const emailValidation = validateEmail(options.to);
    if (!emailValidation.isValid) {
      throw new AuthError('INVALID_EMAIL', 'Email address format is invalid');
    }

    try {
      const mailOptions = {
        from: {
          name: config.email.from.name,
          address: config.email.from.address
        },
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text
      };

      const result = await this.transporter.sendMail(mailOptions);
      
      logger.info('📧 Email sent successfully', {
        to: options.to,
        subject: options.subject,
        messageId: result.messageId
      });
    } catch (error) {
      logger.error('📧 Email sending failed', {
        to: options.to,
        subject: options.subject,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new AuthError('EMAIL_SEND_FAILED', 'Email sending failed');
    }
  }

  /**
   * 生成邮件验证令牌
   */
  private generateEmailToken(email: string, purpose: 'verification' | 'reset'): string {
    const expiry = purpose === 'verification' 
      ? config.email.templates.verificationTokenExpiry 
      : config.email.templates.resetTokenExpiry;

    const payload = { 
      email, 
      purpose,
      timestamp: Date.now()
    };

    const secret = config.jwt.secret;
    if (!secret) {
      throw new Error('JWT secret is not configured');
    }

    return jwt.sign(payload, secret, { expiresIn: expiry as string });
  }

  /**
   * 构建验证链接
   */
  private buildVerificationUrl(token: string): string {
    return `${config.email.templates.baseUrl}${config.email.templates.verificationPath}?token=${token}`;
  }

  /**
   * 构建密码重置链接
   */
  private buildResetUrl(token: string): string {
    return `${config.email.templates.baseUrl}${config.email.templates.resetPasswordPath}?token=${token}`;
  }

  /**
   * 发送邮箱验证邮件
   */
  async sendVerificationEmail(email: string, token?: string): Promise<void> {
    try {
      const verificationToken = token || this.generateEmailToken(email, 'verification');
      const verificationUrl = this.buildVerificationUrl(verificationToken);

      const templateData: VerificationEmailData = {
        companyName: config.email.from.name,
        verificationUrl
      };

      await this.sendEmail({
        to: email,
        subject: EMAIL_SUBJECTS.verification,
        html: emailTemplateRenderer.renderHtml('verification', templateData),
        text: emailTemplateRenderer.renderText('verification', templateData)
      });

      logger.info('📧 Email verification email sent', { email });
    } catch (error) {
      logger.error('📧 Email verification email sending failed', { email, error });
      throw error;
    }
  }

  /**
   * 发送密码重置邮件
   */
  async sendResetPasswordEmail(email: string, token?: string): Promise<void> {
    try {
      const resetToken = token || this.generateEmailToken(email, 'reset');
      const resetUrl = this.buildResetUrl(resetToken);

      const templateData: ResetPasswordEmailData = {
        companyName: config.email.from.name,
        resetUrl
      };

      await this.sendEmail({
        to: email,
        subject: EMAIL_SUBJECTS.resetPassword,
        html: emailTemplateRenderer.renderHtml('reset-password', templateData),
        text: emailTemplateRenderer.renderText('reset-password', templateData)
      });

      logger.info('📧 Password reset email sent', { email });
    } catch (error) {
      logger.error('📧 Password reset email sending failed', { email, error });
      throw error;
    }
  }

  /**
   * 发送订阅通知邮件
   */
  async sendSubscriptionNotice(email: string, info: {
    type: 'activated' | 'cancelled' | 'renewed' | 'expired';
    planName?: string;
    status?: string;
    expiresAt?: string;
    amount?: number;
  }): Promise<void> {
    try {
      const templateData: SubscriptionEmailData = {
        companyName: config.email.from.name,
        type: info.type,
        typeText: '',
        color: '',
        info
      };

      const subject = EMAIL_SUBJECTS.subscription[info.type] || 'Subscription notification';

      await this.sendEmail({
        to: email,
        subject,
        html: emailTemplateRenderer.renderHtml('subscription', templateData),
        text: emailTemplateRenderer.renderText('subscription', templateData)
      });

      logger.info('📧 Subscription notification email sent', { email, type: info.type });
    } catch (error) {
      logger.error('📧 Subscription notification email sending failed', { email, type: info.type, error });
      throw error;
    }
  }

  /**
   * 验证邮件令牌
   */
  async verifyEmailToken(token: string): Promise<EmailTokenValidation> {
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as {
        email: string;
        purpose: 'verification' | 'reset';
        timestamp: number;
      };

      if (!decoded.email || !decoded.purpose) {
        return {
          valid: false,
          error: 'Token format is invalid'
        };
      }

      return {
        valid: true,
        email: decoded.email,
        purpose: decoded.purpose
      };
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        return {
          valid: false,
          error: 'Token expired'
        };
      } else if (error.name === 'JsonWebTokenError') {
        return {
          valid: false,
          error: 'Token is invalid'
        };
      } else {
        logger.error('Error verifying email token', { error });
        return {
          valid: false,
          error: 'Token verification failed'
        };
      }
    }
  }

  /**
   * 测试邮件配置
   */
  async testEmailConfig(): Promise<boolean> {
    try {
      await this.transporter.verify();
      logger.info('✅ Email configuration test successful');
      return true;
    } catch (error) {
      logger.error('❌ Email configuration test failed', { error });
      return false;
    }
  }
}

// 创建邮件服务实例
const emailService = new EmailService();

// 导出具体的方法
export const sendVerificationEmail = emailService.sendVerificationEmail.bind(emailService);
export const sendResetPasswordEmail = emailService.sendResetPasswordEmail.bind(emailService);
export const sendSubscriptionNotice = emailService.sendSubscriptionNotice.bind(emailService);
export const verifyEmailToken = emailService.verifyEmailToken.bind(emailService);
export const testEmailConfig = emailService.testEmailConfig.bind(emailService);

// 导出邮件服务实例
export { emailService }; 