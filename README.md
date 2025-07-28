# Auth Service Documentation

## 概述

Auth Service 是美容院预约管理系统的**独立认证服务**，负责处理用户身份验证、授权和租户管理。

## 架构设计

### 系统定位
- **独立系统**: 有自己的数据库、端口、部署流程
- **共享服务**: 为所有业务系统（美业、奶茶店等）提供认证服务
- **端口**: 3002 (避免与 booking-service:3002 冲突)
- **数据库**: auth_db (独立数据库，与业务系统隔离)

### 技术栈
- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL + Prisma ORM
- **Authentication**: JWT (Access + Refresh Tokens)
- **Password**: bcrypt 哈希加密
- **Email**: SendGrid 邮件服务
- **Validation**: Joi 数据验证和安全检查
- **Logging**: Winston 日志系统
- **Security**: Helmet, CORS, Rate Limiting

## 目录结构

```
auth-service/
├── docs/                    # 📚 项目文档
│   ├── README.md           # 总体说明
│   ├── API.md              # API 接口文档
│   ├── DATABASE.md         # 数据库设计
│   └── DEPLOYMENT.md       # 部署说明
├── src/                     # 📦 源代码
│   ├── config/             # ⚙️ 配置管理
│   │   ├── index.ts        # 配置模块统一导出
│   │   ├── env.ts          # 环境变量配置
│   │   ├── database.ts     # 数据库连接配置
│   │   ├── redis.ts        # Redis 连接配置
│   │   ├── jwt.ts          # JWT 配置
│   │   ├── cors.ts         # CORS 配置
│   │   └── email.ts        # 邮件服务配置
│   ├── constants/          # 📋 常量定义
│   │   ├── index.ts        # 常量统一导出
│   │   ├── DATABASE_CONSTANTS.ts    # 数据库常量
│   │   ├── JWT_CONSTANTS.ts         # JWT 常量
│   │   ├── LOGGER_CONSTANTS.ts      # 日志常量
│   │   ├── REDIS_CONSTANTS.ts       # Redis 常量
│   │   ├── AUTHSERVICE.ts           # 认证服务常量
│   │   ├── TENANTSERVICE.ts         # 租户服务常量
│   │   ├── SESSION.ts               # 会话常量
│   │   ├── PASSWORD.ts              # 密码常量
│   │   ├── EMAIL.ts                 # 邮件常量
│   │   └── SUBSCRIPTION.ts          # 订阅常量
│   ├── controllers/        # 🎮 控制器层
│   │   ├── index.ts        # 控制器统一导出
│   │   ├── authController.ts        # 认证控制器
│   │   ├── sessionController.ts     # 会话控制器
│   │   ├── tenantController.ts      # 租户控制器
│   │   ├── subscriptionController.ts # 订阅控制器
│   │   └── emailController.ts       # 邮件控制器
│   ├── middleware/         # 🔒 中间件层
│   │   ├── index.ts        # 中间件统一导出
│   │   ├── security.ts     # 安全中间件 (Helmet, CORS)
│   │   ├── rateLimiter.ts  # 速率限制中间件
│   │   ├── jwtAuth.ts      # JWT 认证中间件
│   │   ├── errorHandler.ts # 错误处理中间件
│   │   ├── dataCleaner.ts  # 数据清理中间件
│   │   └── validators.ts   # 验证中间件
│   ├── routes/             # 🛣️ 路由层
│   │   ├── authRoutes.ts   # 认证路由
│   │   ├── sessionRoutes.ts # 会话路由
│   │   ├── tenantRoutes.ts # 租户路由
│   │   └── emailRoutes.ts  # 邮件路由
│   ├── services/           # 🔧 业务服务层
│   │   ├── index.ts        # 服务统一导出
│   │   ├── authService.ts  # 认证服务
│   │   ├── sessionService.ts # 会话服务
│   │   ├── passwordService.ts # 密码服务
│   │   ├── emailService.ts # 邮件服务
│   │   ├── subscriptionService.ts # 订阅服务
│   │   └── tenantService.ts # 租户服务
│   ├── types/              # 📝 TypeScript 类型
│   │   ├── index.ts        # 类型统一导出
│   │   ├── express.ts      # Express 类型扩展
│   │   ├── env_types.ts    # 环境变量类型
│   │   ├── database_types.ts # 数据库类型
│   │   ├── logger_types.ts # 日志类型
│   │   ├── jwt_types.ts    # JWT 类型
│   │   ├── auth_types.ts   # 认证类型
│   │   ├── authService.ts  # 认证服务类型
│   │   ├── sessionService.ts # 会话服务类型
│   │   ├── tenantService.ts # 租户服务类型
│   │   ├── password_types.ts # 密码类型
│   │   ├── email_types.ts  # 邮件类型
│   │   ├── subscription_types.ts # 订阅类型
│   │   └── validator_types.ts # 验证器类型
│   ├── utils/              # 🛠️ 工具函数
│   │   ├── index.ts        # 工具统一导出
│   │   ├── logger.ts       # 日志工具
│   │   ├── delay.ts        # 延迟工具
│   │   ├── redis-prefix.ts # Redis 前缀工具
│   │   ├── redis-helper.ts # Redis 辅助工具
│   │   ├── token-blacklist.ts # Token 黑名单
│   │   ├── password.ts     # 密码工具
│   │   ├── loginLock.ts    # 登录锁定工具
│   │   ├── email-template-renderer.ts # 邮件模板渲染器
│   │   └── phone-validator.ts # 手机号验证工具
│   ├── validators/         # ✅ 数据验证器
│   │   ├── index.ts        # 验证器统一导出
│   │   ├── account-validator.ts # 账户验证器
│   │   └── password-validator.ts # 密码验证器
│   └── templates/          # 📧 邮件模板
│       └── email/          # 邮件模板目录
│           ├── verification.pug    # 邮箱验证模板
│           ├── reset-password.pug  # 密码重置模板
│           └── subscription.pug    # 订阅通知模板
├── prisma/                  # 🗄️ 数据库相关
│   ├── schema.prisma       # 数据库模式
│   ├── migrations/         # 数据库迁移
│   └── seed.ts             # 初始数据
├── dist/                    # 📤 编译输出 (生产环境)
├── generated/               # 🤖 自动生成的代码
│   └── prisma/             # Prisma 客户端
├── logs/                    # 📋 日志文件
├── node_modules/            # 📦 依赖包
├── .env                     # 🔐 环境变量 (不提交到Git)
├── env.sample               # 📋 环境变量模板
├── package.json             # 📦 项目配置
├── tsconfig.json            # 🔧 TypeScript 配置
└── src/app.ts               # 🚀 应用入口文件
```

## 核心功能

### 1. 租户管理 (Multi-tenant)
- 租户注册和激活
- 子域名管理 (salon123.beauty.domain.com)
- 业务类型支持 (beauty, teashop, 等)
- 租户配置和权限管理

### 2. 用户认证
- 用户注册和登录
- JWT Access + Refresh Token 机制
- 密码安全策略
- 邮箱验证和密码重置
- 登录失败锁定和速率限制

### 3. 权限授权
- 基于角色的权限控制 (RBAC)
- 跨系统权限管理
- API 级别的访问控制
- 资源级别的数据隔离

### 4. 安全特性
- 密码强度验证 (zxcvbn)
- 防暴力破解保护
- JWT Token 安全管理
- 会话管理和清理
- 审计日志记录

## 数据库设计

### 独立数据库策略
- **数据库名**: `auth_db`
- **与业务系统隔离**: booking-service 使用 `booking_db`
- **数据安全**: 认证数据与业务数据分离
- **独立扩展**: 可以独立优化和扩展

### 核心表结构
```sql
-- 租户表
tenants (
  id, email, phone, store_name, subdomain, 
  password_hash, address, email_verified_at, 
  email_verification_token, created_at, updated_at, deleted_at
)

-- 会话表
sessions (
  id, tenant_id, token_jti, refresh_token, 
  user_agent, ip_address, device_type, 
  expires_at, created_at, updated_at
)

-- 密码重置令牌表
password_reset_tokens (
  id, tenant_id, email, reset_token, 
  expires_at, used_at, created_at
)
```

## API 设计

### 认证相关
```
POST /api/v1/auth/register         # 用户注册
POST /api/v1/auth/login            # 用户登录
POST /api/v1/auth/logout           # 用户登出
POST /api/v1/auth/refresh          # 刷新 Token
POST /api/v1/auth/verify-email     # 邮箱验证
POST /api/v1/auth/initiate-reset   # 发起密码重置
POST /api/v1/auth/reset-password   # 重置密码
PUT  /api/v1/auth/password         # 修改密码
```

### 租户相关
```
POST /api/v1/tenant/register       # 租户注册
GET  /api/v1/tenant/:id            # 获取租户信息
PUT  /api/v1/tenant/:id            # 更新租户信息
DELETE /api/v1/tenant/:id          # 软删除租户
POST /api/v1/tenant/:id/verify     # 邮箱验证激活
```

### 会话相关
```
POST /api/v1/session/create        # 创建会话
GET  /api/v1/session/list          # 获取会话列表
DELETE /api/v1/session/:id         # 删除会话
POST /api/v1/session/invalidate-all # 使所有会话失效
```

### 邮件相关
```
POST /api/v1/email/send-verification # 发送验证邮件
POST /api/v1/email/send-reset       # 发送重置邮件
```

### 订阅相关
```
GET /api/v1/subscription/:tenantId  # 获取订阅信息
```

### 系统相关
```
GET  /health                        # 健康检查
GET  /                              # 欢迎页
```

## 与其他系统的集成

### 1. 与 Booking Service 集成
```typescript
// Booking Service 验证用户身份
const token = req.headers.authorization;
const payload = await verifyJWT(token); // 使用共享的 JWT_SECRET
const tenantId = payload.tenantId;      // 获取租户 ID 进行数据隔离
```

### 2. 与 Nginx 集成 (未来)
```nginx
# Nginx 验证用户身份
location /api/bookings/ {
    auth_request /auth-validate;  # 调用 Auth Service 验证
    proxy_pass http://booking-service;
}
```

### 3. 跨系统权限检查
```typescript
// 检查用户是否有权限访问特定资源
POST /api/v1/auth/check-permission
{
  "tenantId": "uuid",
  "businessType": "beauty", 
  "permission": "booking:write"
}
```

## 部署策略

### 开发环境
```bash
cd auth-service
npm install
cp env.sample .env          # 配置环境变量
npm run prisma:generate     # 生成 Prisma 客户端
npm run prisma:migrate      # 数据库迁移
npm run dev                 # 启动开发服务器 (端口 3002)
```

### 生产环境
```bash
npm run build              # 编译 TypeScript
npm run prisma:generate    # 生成 Prisma 客户端
npm run prisma:deploy      # 部署数据库变更
npm start                  # 启动生产服务器
```

## 安全注意事项

1. **强随机密钥**: 生产环境必须更换 JWT_SECRET
2. **数据库安全**: 使用专用数据库用户和强密码
3. **HTTPS 强制**: 生产环境必须使用 HTTPS
4. **速率限制**: 防止暴力破解和 DoS 攻击
5. **日志监控**: 记录安全事件和异常行为
6. **定期更新**: 及时更新依赖包和安全补丁

## 监控和维护

1. **健康检查**: `/health` 端点监控服务状态
2. **性能监控**: JWT 验证延迟、数据库查询性能
3. **安全监控**: 登录失败、异常访问模式
4. **日志分析**: 错误日志、访问日志、安全日志
5. **备份策略**: 数据库定期备份和恢复测试

## 技术特性

### 1. 分层架构
- **配置层 (config/)**: 环境变量、数据库、Redis、JWT、CORS、邮件配置
- **常量层 (constants/)**: 业务常量、错误码、配置常量
- **控制器层 (controllers/)**: HTTP 请求处理、参数验证、响应格式化
- **中间件层 (middleware/)**: 安全中间件、认证中间件、错误处理中间件
- **路由层 (routes/)**: API 路由定义、路由分组、版本控制
- **服务层 (services/)**: 业务逻辑处理、数据操作、外部服务调用
- **类型层 (types/)**: TypeScript 类型定义、接口定义、类型扩展
- **工具层 (utils/)**: 通用工具函数、日志工具、辅助函数
- **验证层 (validators/)**: 数据验证、输入校验、格式检查
- **模板层 (templates/)**: 邮件模板、HTML 模板、Pug 模板

### 2. 安全机制
- **JWT 认证**: Access Token + Refresh Token 机制
- **密码安全**: bcrypt 哈希、密码强度验证
- **速率限制**: 防止暴力破解和 DoS 攻击
- **CORS 配置**: 跨域请求安全控制
- **Helmet 安全头**: 防止常见 Web 攻击
- **数据清理**: 输入数据清理和验证

### 3. 日志系统
- **Winston 日志**: 结构化日志记录
- **错误捕获**: 全局异常捕获和处理
- **审计日志**: 安全事件和操作记录
- **性能监控**: 请求响应时间和性能指标

### 4. 邮件系统
- **SendGrid 集成**: 可靠的邮件发送服务
- **Pug 模板**: 动态邮件模板渲染
- **邮件类型**: 验证邮件、重置密码邮件、通知邮件
- **模板管理**: 集中化的邮件模板管理 