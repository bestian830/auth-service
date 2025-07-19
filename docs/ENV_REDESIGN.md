# ENV_REDESIGN.md

> 📌 所有用到的 Type 和 Constant 必须统一定义在 `types/` 与 `constants/` 层中，不可在 config 层重复定义。

## 文件名

`env.ts`

## 职责说明

该模块负责读取 `.env` 文件中的所有环境变量，并导出为统一的对象供全项目调用，避免硬编码，同时确保环境变量的类型安全、默认值设置与加载失败提示。

## 主要功能

- 从 `.env` 文件中读取配置项
- 提供类型安全的环境变量访问方式
- 支持默认值和缺失变量的校验（如未设置则抛错）
- 分环境管理（开发、测试、生产）

## 输入说明

- 系统 `.env` 文件中配置的环境变量
- 通常通过 `process.env` 注入

## 输出说明

- 导出统一对象 `env`，包含所有环境变量
- 每个字段类型清晰明确（如字符串、布尔值、数值等）

## 核心字段说明（以你的业务为例）

| 字段名                     | 类型   | 是否必填 | 默认值 | 用途说明                                      |
| -------------------------- | ------ | -------- | ------ | --------------------------------------------- |
| `NODE_ENV`                 | string | 是       | -      | 当前运行环境，development / production / test |
| `PORT`                     | number | 是       | 3000   | 服务器运行端口                                |
| `DATABASE_URL`             | string | 是       | -      | PostgreSQL 连接字符串                         |
| `JWT_SECRET`               | string | 是       | -      | 用于加密生成 JWT                              |
| `JWT_EXPIRES_IN`           | string | 否       | "1d"   | JWT 默认过期时间                              |
| `REFRESH_TOKEN_EXPIRES_IN` | string | 否       | "7d"   | Refresh token 默认过期时间                    |
| `STRIPE_SECRET_KEY`        | string | 否       | -      | Stripe 后台管理密钥                           |
| `STRIPE_WEBHOOK_SECRET`    | string | 否       | -      | Stripe Webhook 验证密钥                       |
| `EMAIL_SMTP_HOST`          | string | 否       | -      | SMTP 邮件主机（用于注册/找回密码）            |
| `EMAIL_SMTP_PORT`          | number | 否       | 465    | SMTP 端口                                     |
| `EMAIL_SMTP_USER`          | string | 否       | -      | SMTP 登录用户名                               |
| `EMAIL_SMTP_PASS`          | string | 否       | -      | SMTP 登录密码                                 |
| `EMAIL_FROM`               | string | 否       | -      | 默认发件人邮箱地址                            |

## 示例代码结构（文件内）

```ts
import dotenv from 'dotenv';
dotenv.config();

const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env: ${key}`);
  return value;
};

export const env = {
  nodeEnv: required('NODE_ENV'),
  port: Number(required('PORT')),
  databaseUrl: required('DATABASE_URL'),
  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',

  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,

  email: {
    smtpHost: process.env.EMAIL_SMTP_HOST,
    smtpPort: Number(process.env.EMAIL_SMTP_PORT || 465),
    smtpUser: process.env.EMAIL_SMTP_USER,
    smtpPass: process.env.EMAIL_SMTP_PASS,
    from: process.env.EMAIL_FROM,
  },
};

## 注意事项

## 所有环境变量必须加注释说明其作用，放在 .env.example 中供他人参考

## 为敏感配置（如密钥）使用专门 Vault 或 Secrets Manager 管理更安全

## 可考虑使用 zod 或 envalid 做更强类型校验（后期增强）