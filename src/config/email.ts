/**
 * 邮件服务配置
 */
import * as nodemailer from 'nodemailer';
import { config } from './env';

/**
 * 创建邮件传输器
 */
export const createEmailTransporter = () => {
  return nodemailer.createTransport({
    host: config.email.smtp.host,
    port: config.email.smtp.port,
    secure: config.email.smtp.secure,
    auth: {
      user: config.email.smtp.user,
      pass: config.email.smtp.password
    },
    // 自建邮件服务器可能需要的额外配置
    tls: {
      // 如果是自签名证书，可以设置为 false
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false'
    }
  });
};
