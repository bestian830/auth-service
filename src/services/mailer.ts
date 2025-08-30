// src/services/mailer.ts
import { env } from '../config/env.js';

export async function sendMailDev(to: string, subject: string, html: string) {
  // 生产可接入 SMTP，这里开发期直接 log
  console.log(`[DEV MAIL] to=${to} subject="${subject}" from=${env.mailFrom}`);
  console.log('=== EMAIL CONTENT START ===');
  console.log(html);
  console.log('=== EMAIL CONTENT END ===');
  console.log('');
  
  // 模拟异步发送
  return Promise.resolve({ success: true, messageId: Date.now().toString() });
}