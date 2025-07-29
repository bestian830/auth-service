/**
 * 邮件发送配置模块（nodemailer + SMTP）
 * 主要职责：基于环境变量配置 SMTP 邮件服务，初始化全局传输器。
 * 
 * 输入：环境变量 env.smtpHost, env.smtpPort, env.smtpSecure, env.smtpUser, env.smtpPass
 * 输出：一个 sendEmail 函数用于其他模块发送邮件
 * 
 * 执行逻辑：
 * 1. 初始化 nodemailer 传输器
 * 2. 提供 sendEmail 函数，用于发送模板邮件（不负责内容渲染）
 * 
 * ❗邮件内容渲染逻辑应交由 mailer 模块处理，模板字符串等应由 template 层生成。
 */

import nodemailer from 'nodemailer';
import { env } from './env';
import { logger } from '../utils';

if (!env.smtpHost) throw new Error('SMTP_HOST is not defined in environment');
if (!env.smtpUser) throw new Error('SMTP_USER is not defined in environment');
if (!env.smtpPass) throw new Error('SMTP_PASS is not defined in environment');

/**
 * 创建 SMTP 传输器
 */
const transporter = nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: env.smtpSecure, // true for 465, false for other ports
  auth: {
    user: env.smtpUser,
    pass: env.smtpPass
  }
});

/**
 * 验证 SMTP 连接
 */
transporter.verify((error, success) => {
  if (error) {
    logger.error('SMTP connection failed', { error: error.message });
  } else {
    logger.info('SMTP connection established');
  }
});

/**
 * 发送邮件
 * @param to 收件人
 * @param subject 标题
 * @param html 邮件HTML内容（已渲染）
 * @param text 纯文本内容（可选）
 */
export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  text?: string
): Promise<void> => {
  try {
    const mailOptions = {
      from: env.smtpUser,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, '') // 简单的 HTML 转纯文本
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info('Email sent via SMTP', { to, subject, messageId: info.messageId });
  } catch (error: any) {
    logger.error('Failed to send email via SMTP', { to, subject, error: error.message });
    throw error;
  }
};