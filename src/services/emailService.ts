// /**
//  * Email Service Module
//  * 邮件服务模块
//  */

// import { sendEmail as sendEmailConfig } from '../config/email';
// import { PugEmailTemplateRenderer } from '../utils/email-template-renderer';
// import { logger } from '../utils/logger';
// import { EMAIL_TEMPLATES, EMAIL_SUBJECTS } from '../constants/emailTemplates';

// // ================================
// // Types
// // ================================

// /**
//  * 邮件发送数据
//  */
// export interface EmailSendData {
//   to: string;
//   subject: string;
//   template: string;
//   templateData: Record<string, any>;
// }

// /**
//  * 邮件发送结果
//  */
// export interface EmailSendResult {
//   success: boolean;
//   messageId?: string;
//   error?: string;
// }

// /**
//  * 邮箱验证邮件数据
//  */
// export interface VerificationEmailData {
//   to: string;
//   tenantId: string;
//   token: string;
//   subdomain: string;
//   storeName: string;
//   verificationUrl: string;
// }

// /**
//  * 密码重置邮件数据
//  */
// export interface PasswordResetEmailData {
//   to: string;
//   resetCode: string;
//   companyName: string;
//   expiryMinutes: number;
// }

// // ================================
// // Helper Functions
// // ================================

// /**
//  * 渲染邮件模板
//  */
// const renderEmailTemplate = async (
//   template: string,
//   templateData: Record<string, any>
// ): Promise<{ html: string; text: string }> => {
//   try {
//     const templateRenderer = new PugEmailTemplateRenderer();
    
//     const htmlContent = templateRenderer.renderHtml(template, templateData as any);
//     const textContent = templateRenderer.renderText(template, templateData as any);
    
//     return {
//       html: htmlContent,
//       text: textContent
//     };
//   } catch (error) {
//     logger.error('Email template rendering failed', { template, templateData, error });
//     throw new Error('Email template rendering failed');
//   }
// };

// /**
//  * 发送邮件
//  */
// const sendEmailInternal = async (data: EmailSendData): Promise<EmailSendResult> => {
//   try {
//     // 渲染邮件模板
//     const { html, text } = await renderEmailTemplate(data.template, data.templateData);
    
//     // 发送邮件
//     await sendEmailConfig(
//       data.to,
//       data.subject,
//       html,
//       text
//     );
    
//     logger.info('Email sent successfully', {
//       to: data.to,
//       subject: data.subject,
//       template: data.template
//     });
    
//     return {
//       success: true
//     };
    
//   } catch (error) {
//     logger.error('Email sending failed', { data, error });
//     return {
//       success: false,
//       error: 'Email sending failed'
//     };
//   }
// };

// // ================================
// // Main Business Functions
// // ================================

// /**
//  * 发送邮箱验证邮件
//  *
//  * Input: VerificationEmailData
//  * Output: EmailSendResult
//  *
//  * 执行流程：
//  * 1. 准备邮件模板数据
//  * 2. 渲染邮件模板
//  * 3. 发送验证邮件
//  * 4. 返回发送结果
//  */
// export const sendVerificationEmail = async (data: VerificationEmailData): Promise<EmailSendResult> => {
//   try {
//     const templateData = {
//       companyName: data.storeName,
//       verificationUrl: data.verificationUrl,
//       token: data.token,
//       subdomain: data.subdomain,
//       storeName: data.storeName
//     };
    
//     return await sendEmailInternal({
//       to: data.to,
//       subject: EMAIL_SUBJECTS[EMAIL_TEMPLATES.VERIFICATION],
//       template: EMAIL_TEMPLATES.VERIFICATION,
//       templateData
//     });
    
//   } catch (error) {
//     logger.error('Send verification email failed', { data, error });
//     return {
//       success: false,
//       error: 'Send verification email failed'
//     };
//   }
// };

// /**
//  * 发送密码重置邮件
//  *
//  * Input: PasswordResetEmailData
//  * Output: EmailSendResult
//  *
//  * 执行流程：
//  * 1. 准备邮件模板数据
//  * 2. 渲染邮件模板
//  * 3. 发送密码重置邮件
//  * 4. 返回发送结果
//  */
// export const sendPasswordResetEmail = async (data: PasswordResetEmailData): Promise<EmailSendResult> => {
//   try {
//     const templateData = {
//       resetCode: data.resetCode,
//       companyName: data.companyName,
//       expiryMinutes: data.expiryMinutes
//     };
    
//     return await sendEmailInternal({
//       to: data.to,
//       subject: EMAIL_SUBJECTS[EMAIL_TEMPLATES.PASSWORD_RESET],
//       template: EMAIL_TEMPLATES.PASSWORD_RESET,
//       templateData
//     });
    
//   } catch (error) {
//     logger.error('Send password reset email failed', { data, error });
//     return {
//       success: false,
//       error: 'Send password reset email failed'
//     };
//   }
// };

// /**
//  * 发送欢迎邮件
//  *
//  * Input: { to: string, storeName: string, subdomain: string }
//  * Output: EmailSendResult
//  */
// export const sendWelcomeEmail = async (data: {
//   to: string;
//   storeName: string;
//   subdomain: string;
// }): Promise<EmailSendResult> => {
//   try {
//     const templateData = {
//       companyName: data.storeName,
//       subdomain: data.subdomain,
//       storeName: data.storeName
//     };
    
//     return await sendEmailInternal({
//       to: data.to,
//       subject: EMAIL_SUBJECTS[EMAIL_TEMPLATES.WELCOME],
//       template: EMAIL_TEMPLATES.WELCOME,
//       templateData
//     });
    
//   } catch (error) {
//     logger.error('Send welcome email failed', { data, error });
//     return {
//       success: false,
//       error: 'Send welcome email failed'
//     };
//   }
// };

// /**
//  * 发送密码更改通知邮件
//  *
//  * Input: { to: string, storeName: string, ipAddress?: string, userAgent?: string }
//  * Output: EmailSendResult
//  */
// export const sendPasswordChangedEmail = async (data: {
//   to: string;
//   storeName: string;
//   ipAddress?: string;
//   userAgent?: string;
// }): Promise<EmailSendResult> => {
//   try {
//     const templateData = {
//       companyName: data.storeName,
//       storeName: data.storeName,
//       ipAddress: data.ipAddress,
//       userAgent: data.userAgent,
//       timestamp: new Date().toISOString()
//     };
    
//     return await sendEmailInternal({
//       to: data.to,
//       subject: EMAIL_SUBJECTS[EMAIL_TEMPLATES.PASSWORD_CHANGED],
//       template: EMAIL_TEMPLATES.PASSWORD_CHANGED,
//       templateData
//     });
    
//   } catch (error) {
//     logger.error('Send password changed email failed', { data, error });
//     return {
//       success: false,
//       error: 'Send password changed email failed'
//     };
//   }
// };

// /**
//  * 发送登录通知邮件
//  *
//  * Input: { to: string, storeName: string, ipAddress: string, userAgent: string }
//  * Output: EmailSendResult
//  */
// export const sendLoginNotificationEmail = async (data: {
//   to: string;
//   storeName: string;
//   ipAddress: string;
//   userAgent: string;
// }): Promise<EmailSendResult> => {
//   try {
//     const templateData = {
//       companyName: data.storeName,
//       storeName: data.storeName,
//       ipAddress: data.ipAddress,
//       userAgent: data.userAgent,
//       timestamp: new Date().toISOString()
//     };
    
//     return await sendEmailInternal({
//       to: data.to,
//       subject: EMAIL_SUBJECTS[EMAIL_TEMPLATES.LOGIN_NOTIFICATION],
//       template: EMAIL_TEMPLATES.LOGIN_NOTIFICATION,
//       templateData
//     });
    
//   } catch (error) {
//     logger.error('Send login notification email failed', { data, error });
//     return {
//       success: false,
//       error: 'Send login notification email failed'
//     };
//   }
// }; 
import { sendEmail } from '../config';
import { EMAIL_SUBJECTS } from '../constants';
import { renderEmailTemplate, buildVerificationUrl, buildResetPasswordUrl } from '../utils';
import { generateEmailVerificationToken, generatePasswordResetToken } from '../config';

/**
 * 发送邮箱验证邮件
 */
export async function sendVerificationEmail(email: string, tenantId: string) {
  // 1. 生成token和url
  const token = generateEmailVerificationToken(email, tenantId);
  const url = buildVerificationUrl(token, email);

  // 2. 渲染模板
  const html = renderEmailTemplate('verify-email', { email, token, url });
  const subject = EMAIL_SUBJECTS.VERIFY_EMAIL;

  // 3. 发送邮件
  await sendEmail(email, subject, html);
}

/**
 * 发送密码重置邮件
 */
export async function sendResetPasswordEmail(email: string, tenantId: string) {
  const token = generatePasswordResetToken(email, tenantId);
  const url = buildResetPasswordUrl(token, email);

  const html = renderEmailTemplate('reset-password', { email, token, url });
  const subject = EMAIL_SUBJECTS.RESET_PASSWORD;

  await sendEmail(email, subject, html);
}

/**
 * 通用邮件
 */
export async function sendNotificationEmail(email: string, subject: string, html: string, text?: string) {
  await sendEmail(email, subject, html, text);
}