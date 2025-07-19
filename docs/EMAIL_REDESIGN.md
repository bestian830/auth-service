> 所有类型定义请放置于 types/email.ts，所有常量配置请放置于 constants/email.ts。config/email.ts 文件仅负责初始化并导出 SendGrid 邮件客户端，无业务逻辑，无模板渲染，无动态参数构造。

```ts
/**
 * 邮件发送配置模块（SendGrid）
 * 主要职责：基于环境变量配置 SendGrid 邮件服务，初始化全局 API 客户端。
 * 
 * 输入：环境变量 env.sendgridApiKey, env.emailSenderAddress
 * 输出：一个 sendEmail 函数用于其他模块发送邮件
 * 
 * 执行逻辑：
 * 1. 初始化 SendGrid 客户端（@sendgrid/mail）
 * 2. 提供 sendEmail 函数，用于发送模板邮件（不负责内容渲染）
 * 
 * ❗邮件内容渲染逻辑应交由 mailer 模块处理，模板字符串等应由 template 层生成。
 */

import sgMail from '@sendgrid/mail';
import { env } from './env';

/**
 * 初始化 SendGrid API 客户端
 */
sgMail.setApiKey(env.sendgridApiKey);

/**
 * 发送邮件封装
 * @param to - 收件人邮箱地址
 * @param subject - 邮件标题
 * @param html - 邮件 HTML 内容（已渲染）
 * @returns Promise<void>
 */
export const sendEmail = async (
  to: string,
  subject: string,
  html: string
): Promise<void> => {
  await sgMail.send({
    to,
    from: env.emailSenderAddress,
    subject,
    html
  });
};
