# Tymoe Auth Service

> **身份认证与授权中心** - 基于OAuth2/OpenID Connect的企业级身份管理服务

## 📖 目录

- [系统概述](#系统概述)
- [数据库架构](#数据库架构)
- [API接口详解](#api接口详解)
- [配置参数详解](#配置参数详解)
- [reCAPTCHA配置](#recaptcha配置)
- [邮件系统配置](#邮件系统配置)
- [与后端服务集成](#与后端服务集成)
- [在Tymoe生态中的定位](#在tymoe生态中的定位)
- [部署运维](#部署运维)
- [开发指南](#开发指南)
- [故障排除](#故障排除)

## 系统概述

Tymoe Auth Service 是一个基于 OAuth2/OIDC 标准的认证服务，专为 Tymoe 餐厅管理系统设计。它提供完整的身份认证、授权管理和用户管理功能，支持多组织架构，并具备企业级的安全特性。

### 核心功能

- **身份认证**: 用户注册、登录、密码管理
- **OAuth2/OIDC**: 标准协议支持，为其他服务提供统一认证
- **多组织支持**: 支持一个用户管理多个餐厅
- **安全防护**: 速率限制、账号锁定、验证码防护
- **邮件通知**: 邮箱验证、密码重置等通知
- **审计日志**: 完整的操作审计记录

### 技术栈
- **后端**: Node.js + TypeScript + Express
- **数据库**: PostgreSQL + Prisma ORM
- **缓存**: Redis (速率限制、会话管理)
- **认证**: JWT + OAuth2/OIDC
- **邮件**: NodeMailer (支持 SMTP/Console)
- **监控**: Prometheus metrics
- **安全**: Helmet, CORS, CSRF, Rate Limiting

## 数据库架构

### 用户管理模型

```sql
-- 用户表：存储基本用户信息
User {
  id                    String   @id @default(uuid())
  email                 String   @unique
  passwordHash          String
  name                  String?
  phone                 String?
  emailVerifiedAt       DateTime?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  
  -- 安全控制
  loginFailureCount     Int      @default(0)
  lastLoginFailureAt    DateTime?
  lockedUntil          DateTime?
  lockReason           String?
  
  -- 关联关系
  ownedOrganizations   Organization[] @relation("OrganizationOwner")
  emailVerifications   EmailVerification[]
  passwordResets       PasswordReset[]
  loginAttempts        LoginAttempt[]
}

-- 组织表：餐厅/店铺信息
Organization {
  id           String   @id @default(uuid())
  name         String
  ownerId      String
  description  String?
  location     String?   -- 店铺地址
  phone        String?   -- 店铺电话
  email        String?   -- 店铺邮箱
  status       OrganizationStatus @default(ACTIVE)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  
  owner        User @relation("OrganizationOwner")
}

enum OrganizationStatus {
  ACTIVE
  SUSPENDED
  DELETED
}
```

### OAuth2/OIDC 模型

```sql
-- OAuth2 客户端
Client {
  id           String   @id @default(cuid())
  clientId     String   @unique
  name         String?
  type         ClientType @default(PUBLIC)
  secretHash   String?
  authMethod   TokenEndpointAuthMethod @default(none)
  redirectUris String[]
}

-- 授权码
AuthorizationCode {
  id                  String   @id @default(uuid())
  clientId            String
  redirectUri         String
  codeChallenge       String
  codeChallengeMethod String   @default("S256")
  scope               String?
  state               String?
  
  -- 主体信息
  subjectUserId       String?
  subjectDeviceId     String?
  organizationId      String?  -- 上下文组织
  
  -- 生命周期
  createdAt           DateTime @default(now())
  expiresAt           DateTime
  used                Boolean  @default(false)
}

-- 刷新令牌
RefreshToken {
  id               String   @id
  familyId         String
  subjectUserId    String?
  subjectDeviceId  String?
  clientId         String
  organizationId   String?  -- 令牌关联的组织
  status           RefreshTokenStatus @default(ACTIVE)
  createdAt        DateTime @default(now())
  expiresAt        DateTime
}
```

### 身份验证模型

```sql
-- 邮箱验证
EmailVerification {
  id          String   @id @default(uuid())
  userId      String
  selector    String   @unique
  tokenHash   String
  purpose     String   -- "signup" | "email_change"
  sentTo      String
  expiresAt   DateTime
  attempts    Int      @default(0)
  
  -- 重发控制
  reuseWindowExpiresAt DateTime?
  lastSentAt           DateTime @default(now())
  resendCount          Int      @default(0)
}

-- 密码重置
PasswordReset {
  id          String   @id @default(uuid())
  userId      String
  selector    String   @unique
  tokenHash   String
  sentTo      String
  expiresAt   DateTime
  attempts    Int      @default(0)
  
  -- 重发控制
  reuseWindowExpiresAt DateTime?
  lastSentAt           DateTime @default(now())
  resendCount          Int      @default(0)
}

-- 登录记录
LoginAttempt {
  id             String   @id @default(uuid())
  userId         String?
  email          String
  organizationId String?  -- 登录上下文组织
  ipAddress      String
  userAgent      String?
  success        Boolean
  failureReason  String?
  captchaUsed    Boolean  @default(false)
  attemptAt      DateTime @default(now())
}
```

### 密钥管理和审计

```sql
-- JWT 签名密钥管理
Key {
  kid          String   @id
  type         String   -- 'RSA'
  status       KeyStatus
  privatePem   String   -- 加密存储的私钥
  publicJwk    Json
  createdAt    DateTime @default(now())
  activatedAt  DateTime?
  retiredAt    DateTime?
}

enum KeyStatus {
  ACTIVE
  GRACE
  RETIRED
}

-- 审计日志
AuditLog {
  id          String   @id @default(uuid())
  at          DateTime @default(now())
  ip          String?
  userAgent   String?
  actorUserId String?
  action      String
  subject     String?
  detail      Json?
}
```

## API接口详解

### 🏗️ 服务架构图

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   ploml     │    │   mopai     │    │  其他服务   │
│  (美业SaaS)  │    │  (餐饮SaaS)  │    │            │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       │                  │                  │
       └─────────┬────────┴──────────────────┘
                 │
    ┌────────────▼────────────┐
    │                         │
    │    Auth Service         │
    │   (身份认证中心)          │
    │                         │
    └─────────────────────────┘
                 │
    ┌────────────▼────────────┐
    │                         │
    │     PostgreSQL          │
    │    (用户数据存储)         │
    │                         │
    └─────────────────────────┘
```

### 🔗 服务间通信

#### 1. **与业务服务的通信协议**

### 1. Identity 身份管理 (`/identity`)

#### 用户注册
```http
POST /identity/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "name": "张三",
  "phone": "+8613812345678",
  "captcha": "recaptcha_response"
}
```

**响应示例:**
```json
{
  "success": true,
  "message": "Registration successful. Please check your email for verification.",
  "userId": "user-uuid"
}
```

#### 邮箱验证
```http
POST /identity/verify
{
  "selector": "verification_selector",
  "token": "123456"
}
```

#### 用户登录
```http
POST /identity/login
{
  "email": "user@example.com",
  "password": "password123",
  "captcha": "recaptcha_response" // 条件性必需
}
```

**登录成功响应:**
```json
{
  "success": true,
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "name": "张三",
    "emailVerified": true
  },
  "organizations": [
    {
      "id": "org-uuid",
      "name": "我的餐厅",
      "role": "OWNER"
    }
  ]
}
```

#### 获取验证码状态
```http
GET /identity/captcha-status?email=user@example.com
```

**响应:**
```json
{
  "captcha_required": true,
  "captcha_site_key": "6LcXXXXXXXXXXXXX",
  "threshold": 3
}
```

#### 密码重置流程
```http
# 1. 请求重置
POST /identity/forgot-password
{
  "email": "user@example.com"
}

# 2. 确认重置
POST /identity/reset-password
{
  "selector": "reset_selector",
  "token": "123456",
  "newPassword": "newpassword123"
}
```

#### 用户资料管理
```http
# 获取用户资料
GET /identity/profile
Authorization: Bearer <access_token>

# 更新用户资料
PUT /identity/profile
Authorization: Bearer <access_token>
{
  "name": "新姓名",
  "phone": "+8613987654321"
}

# 修改密码
POST /identity/change-password
Authorization: Bearer <access_token>
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123"
}
```

### 2. OAuth2/OIDC 端点

#### Discovery 端点
```http
GET /.well-known/openid-configuration
```

#### 获取公钥
```http
GET /jwks.json
```

#### Token 端点
```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=<authorization_code>&
redirect_uri=<redirect_uri>&
client_id=<client_id>&
code_verifier=<pkce_verifier>
```

**Token 响应:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "def502004a8b7e2c...",
  "id_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 1800
}
```

#### 令牌撤销
```http
POST /oauth/revoke
{
  "token": "<refresh_token>",
  "token_type_hint": "refresh_token"
}
```

#### 令牌内省
```http
POST /oauth/introspect
Authorization: Basic <client_credentials>
{
  "token": "<access_token>"
}
```

**内省响应:**
```json
{
  "active": true,
  "sub": "user-uuid",
  "client_id": "client-id",
  "aud": ["tymoe-service-order", "tymoe-service-menu"],
  "org": "organization_id",
  "scope": "read write",
  "exp": 1234567890
}
```

#### 用户信息
```http
GET /userinfo
Authorization: Bearer <access_token>
```

### 3. 组织管理 (`/organizations`)

#### 创建组织
```http
POST /organizations
Authorization: Bearer <access_token>
{
  "name": "我的餐厅",
  "description": "中式快餐",
  "location": "北京市朝阳区xxx街道",
  "phone": "+861012345678",
  "email": "restaurant@example.com"
}
```

#### 获取组织列表
```http
GET /organizations
Authorization: Bearer <access_token>
```

#### 更新组织信息
```http
PUT /organizations/{id}
Authorization: Bearer <access_token>
{
  "name": "更新的餐厅名",
  "location": "新地址"
}
```

### 4. 管理端点 (`/admin`)

```http
# JWT密钥轮换
POST /admin/rotate-keys
Authorization: Bearer <admin_token>

# 密钥回收
POST /admin/retire-keys
Authorization: Bearer <admin_token>
```

## 配置参数详解

**Token验证端点：**
```http
POST /oauth2/introspect
Content-Type: application/x-www-form-urlencoded

token=<access_token>&
client_id=<service_client_id>&
client_secret=<service_secret>
```

**响应格式：**
```json
{
  "active": true,
  "sub": "user-uuid",
  "aud": ["tymoe-service:org-id"],
  "roles": ["MANAGER"],
  "organizationId": "org-uuid",
  "exp": 1640995200
}
```

#### 2. **微服务注册规范**

每个业务服务需要在Auth Service中注册为OAuth2客户端：

```sql
INSERT INTO "Client" (
  "clientId", "name", "type", "secretHash", 
  "authMethod", "redirectUris"
) VALUES (
  'ploml-api', 'Ploml Business API', 'CONFIDENTIAL', 
  '<bcrypt_hash>', 'client_secret_post', 
  '[]'::jsonb
);
```

### 🎯 接口规则与约定

#### HTTP状态码规范
- `200` - 成功
- `400` - 请求参数错误
- `401` - 未认证或Token无效
- `403` - 已认证但权限不足
- `423` - 账户被锁定
- `429` - 请求频率过高
- `500` - 服务器内部错误

#### 错误响应格式
```json
{
  "error": "invalid_credentials",
  "detail": "Email or password is incorrect"
}
```

## 核心功能

### 👤 用户管理
- **用户注册**：邮箱验证、密码策略、防重复注册
- **用户登录**：多因素认证、CAPTCHA防护、失败锁定
- **密码管理**：重置密码、修改密码、强度验证
- **个人资料**：基本信息维护、邮箱变更验证

### 🏢 组织管理
- **组织架构**：创建组织、层级管理、状态控制
- **成员管理**：邀请用户、角色分配、权限控制
- **角色系统**：三级权限（OWNER/MANAGER/EMPLOYEE）

### 🔐 OAuth2/OIDC认证
- **授权码流程**：标准OAuth2授权码模式
- **Token管理**：Access Token + Refresh Token
- **ID Token**：OpenID Connect身份令牌
- **客户端认证**：支持多种客户端认证方式

### 📱 设备管理
- **设备注册**：生成设备密钥、OAuth2客户端配置
- **设备认证**：基于JWT的设备证明机制
- **生命周期管理**：激活、吊销、密钥轮换

### 🛡️ 安全防护
- **速率限制**：基于邮箱+IP的双重限制
- **CAPTCHA集成**：Google reCAPTCHA v2支持
- **账户锁定**：基于失败次数的自动锁定
- **会话管理**：安全的会话存储和清理

## 架构设计

### 📁 项目结构

```
src/
├── controllers/          # 控制器层
│   ├── identity.ts       # 用户认证相关
│   ├── oidc.ts          # OAuth2/OIDC流程
│   ├── admin.ts         # 管理员功能
│   └── organization.ts   # 组织管理
├── services/            # 业务逻辑层
│   ├── identity.ts      # 身份管理服务
│   ├── organization.ts  # 组织管理服务
│   ├── token.ts        # Token管理服务
│   ├── device.ts       # 设备管理服务
│   ├── mailer.ts       # 邮件发送服务
│   └── templates.ts    # 邮件模板
├── middleware/          # 中间件层
│   ├── bearer.ts       # Bearer Token验证
│   ├── redisRate.ts    # Redis速率限制
│   ├── captcha.ts      # CAPTCHA验证
│   └── audit.ts        # 审计日志
├── infra/              # 基础设施层
│   ├── prisma.ts       # 数据库连接
│   ├── redis.ts        # Redis连接和速率限制
│   └── cryptoVault.ts  # 加密密钥管理
├── routes/             # 路由定义
├── views/              # HTML模板
├── scripts/            # 运维脚本
└── config/             # 配置管理
```

### 🏗️ 分层架构

#### 1. **表示层 (Presentation Layer)**
- **HTTP路由**：Express.js路由配置
- **中间件**：认证、授权、速率限制、CORS
- **视图模板**：登录页面、错误页面

#### 2. **业务逻辑层 (Business Logic Layer)**
- **Service类**：封装核心业务逻辑
- **领域模型**：用户、组织、设备、Token等
- **业务规则**：密码策略、权限验证、组织管理

#### 3. **数据访问层 (Data Access Layer)**
- **Prisma ORM**：类型安全的数据库访问
- **数据模型**：完整的数据库schema定义
- **查询优化**：索引设计、查询性能优化

#### 4. **基础设施层 (Infrastructure Layer)**
- **数据库**：PostgreSQL主存储
- **缓存**：Redis缓存和速率限制
- **消息队列**：邮件发送队列（可选）
- **密钥管理**：JWT签名密钥的安全管理

### 🔄 数据流程

```mermaid
graph TB
    A[客户端请求] --> B[路由层]
    B --> C[中间件验证]
    C --> D[控制器]
    D --> E[服务层]
    E --> F[数据层]
    F --> G[数据库/Redis]
    G --> F
    F --> E
    E --> H[响应生成]
    H --> I[客户端响应]
```

## Token管理

### 🎫 Token类型与作用

#### 1. **Access Token**
- **用途**：API访问授权
- **有效期**：30分钟（可配置）
- **格式**：JWT (RS256签名)
- **包含信息**：
  ```json
  {
    "sub": "user-uuid",
    "aud": "tymoe-service:org-id",
    "roles": ["MANAGER"],
    "scopes": ["read", "write"],
    "organizationId": "org-uuid",
    "deviceId": "device-uuid",
    "exp": 1640995200,
    "iat": 1640991600,
    "jti": "token-unique-id"
  }
  ```

#### 2. **Refresh Token**
- **用途**：刷新Access Token
- **有效期**：30天（可配置）
- **格式**：不透明字符串（数据库存储）
- **安全特性**：
  - 家族化管理（Family-based）
  - 自动轮换（Rotation）
  - 泄露检测（Automatic revocation）

#### 3. **ID Token** (OpenID Connect)
- **用途**：身份信息传递
- **有效期**：5分钟（短期）
- **格式**：JWT (RS256签名)
- **包含信息**：
  ```json
  {
    "sub": "user-uuid",
    "aud": "client-id",
    "email": "user@example.com",
    "organizationId": "org-uuid",
    "exp": 1640991900,
    "iat": 1640991600
  }
  ```

### 🔄 Token轮换机制

#### Refresh Token家族管理
1. **初始发放**：创建新的Token Family
2. **使用刷新**：生成新的RT，旧RT标记为已轮换
3. **泄露检测**：使用已轮换的RT时，整个家族被吊销
4. **自动清理**：定期清理过期的Token记录

```typescript
// Token刷新流程示例
const rotated = await rotateRefreshToken(oldRefreshToken);
// 返回: { accessToken, refreshToken, expiresIn }
```

### ⏰ 长期在线策略

#### 1. **客户端实现**
```javascript
// 自动Token刷新
setInterval(async () => {
  if (shouldRefreshToken()) {
    await refreshAccessToken();
  }
}, 5 * 60 * 1000); // 每5分钟检查一次

// Token过期自动处理
axios.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      await refreshAccessToken();
      return axios.request(error.config);
    }
    return Promise.reject(error);
  }
);
```

#### 2. **服务端支持**
- **Token续期**：在Token过期前自动刷新
- **会话保持**：Redis存储用户会话状态
- **优雅降级**：Token失效时的友好处理

## 环境配置

### 🔧 .env配置文件

#### 开发环境 (.env.development)
```bash
# ==================== 基础配置 ====================
NODE_ENV=development
PORT=8080

# ==================== 数据库配置 ====================
DATABASE_URL=postgresql://username:password@localhost:5432/tymoe_auth_dev

# ==================== Redis配置 ====================
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_NAMESPACE=authsvc_dev

# ==================== OAuth2/OIDC配置 ====================
ISSUER_URL=http://localhost:8080
ACCESS_TOKEN_TTL_SECONDS=1800
REFRESH_TOKEN_TTL_SECONDS=2592000

# ==================== 安全配置 ====================
SESSION_SECRET=your-super-secret-session-key-development-only
KEYSTORE_ENC_KEY=your-32-byte-aes-key-for-development

# ==================== CORS配置 ====================
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
COOKIE_SAMESITE=lax

# ==================== 速率限制配置 ====================
RATE_LOGIN_PER_MIN=10
RATE_TOKEN_PER_MIN=50
RATE_MAX_LOGIN_PER_HR=20
RATE_MAX_REGISTER_PER_HR=10
RATE_MAX_RESET_PER_HR=5

# ==================== 邮件配置 ====================
MAIL_TRANSPORT=CONSOLE
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_mailtrap_user
SMTP_PASS=your_mailtrap_pass
MAIL_FROM=Tymoe Auth <no-reply@dev.tymoe.com>

# ==================== 验证码配置 ====================
SIGNUP_CODE_TTL_SEC=900
RESET_CODE_TTL_SEC=900
CODE_ATTEMPT_MAX=5
VERIFICATION_CODE_REUSE_WINDOW_SEC=600

# ==================== 登录安全配置 ====================
LOGIN_CAPTCHA_THRESHOLD=3
LOGIN_LOCK_THRESHOLD=10
LOGIN_LOCK_MINUTES=30

# ==================== CAPTCHA配置 ====================
CAPTCHA_ENABLED=true
CAPTCHA_SITE_KEY=your_recaptcha_site_key_v2
CAPTCHA_SECRET_KEY=your_recaptcha_secret_key_v2

# ==================== 监控配置 ====================
METRICS_TOKEN=dev-metrics-token-please-change

# ==================== 审计配置 ====================
AUDIT_TO_FILE=true
AUDIT_FILE_PATH=./logs/audit.log

# ==================== 设备认证配置 ====================
DEVICE_SECRET_LENGTH=32

# ==================== 内部服务配置 ====================
INTROSPECT_CLIENT_ID=internal-gateway
INTROSPECT_CLIENT_SECRET=super-secret-gateway-key
```

#### 生产环境 (.env.production)
```bash
# ==================== 基础配置 ====================
NODE_ENV=production
PORT=8080

# ==================== 数据库配置 ====================
DATABASE_URL=postgresql://auth_user:SUPER_SECURE_PASSWORD@db-server:5432/tymoe_auth_prod

# ==================== Redis配置 ====================
REDIS_URL=redis://redis-server:6379
REDIS_PASSWORD=REDIS_SUPER_SECURE_PASSWORD
REDIS_DB=0
REDIS_NAMESPACE=authsvc
REDIS_CONNECT_TIMEOUT=5000
REDIS_COMMAND_TIMEOUT=3000
REDIS_MAX_RETRIES=3

# ==================== OAuth2/OIDC配置 ====================
ISSUER_URL=https://auth.tymoe.com
ACCESS_TOKEN_TTL_SECONDS=1800
REFRESH_TOKEN_TTL_SECONDS=2592000

# ==================== 安全配置 ====================
SESSION_SECRET=EXTREMELY_LONG_AND_RANDOM_SESSION_SECRET_KEY_256_BITS
KEYSTORE_ENC_KEY=EXACTLY_32_BYTES_AES_256_KEY_HERE

# ==================== CORS配置 ====================
ALLOWED_ORIGINS=https://app.tymoe.com,https://ploml.tymoe.com,https://mopai.tymoe.com
COOKIE_SAMESITE=strict

# ==================== 速率限制配置 (生产环境更严格) ====================
RATE_LOGIN_PER_MIN=5
RATE_TOKEN_PER_MIN=25
RATE_MAX_LOGIN_PER_HR=10
RATE_MAX_REGISTER_PER_HR=5
RATE_MAX_RESET_PER_HR=3

# ==================== 邮件配置 ====================
MAIL_TRANSPORT=SMTP
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=postmaster@mg.tymoe.com
SMTP_PASS=MAILGUN_API_KEY
MAIL_FROM=Tymoe <no-reply@tymoe.com>

# ==================== 验证码配置 ====================
SIGNUP_CODE_TTL_SEC=600
RESET_CODE_TTL_SEC=600
CODE_ATTEMPT_MAX=3
VERIFICATION_CODE_REUSE_WINDOW_SEC=300

# ==================== 登录安全配置 (生产环境更严格) ====================
LOGIN_CAPTCHA_THRESHOLD=2
LOGIN_LOCK_THRESHOLD=5
LOGIN_LOCK_MINUTES=60

# ==================== CAPTCHA配置 ====================
CAPTCHA_ENABLED=true
CAPTCHA_SITE_KEY=PRODUCTION_RECAPTCHA_SITE_KEY_V2
CAPTCHA_SECRET_KEY=PRODUCTION_RECAPTCHA_SECRET_KEY_V2

# ==================== 监控配置 ====================
METRICS_TOKEN=PRODUCTION_METRICS_TOKEN_SUPER_SECURE

# ==================== 审计配置 ====================
AUDIT_TO_FILE=false
AUDIT_FILE_PATH=/var/log/tymoe/auth-audit.log

# ==================== 设备认证配置 ====================
DEVICE_SECRET_LENGTH=32

# ==================== 内部服务配置 ====================
INTROSPECT_CLIENT_ID=production-gateway
INTROSPECT_CLIENT_SECRET=PRODUCTION_GATEWAY_SUPER_SECRET_KEY
```

### ⚙️ 关键配置说明

#### 1. **安全配置**
- `SESSION_SECRET`: 至少256位的随机字符串
- `KEYSTORE_ENC_KEY`: 严格32字节的AES-256密钥
- `CAPTCHA_*`: Google reCAPTCHA v2配置

#### 2. **数据库配置**
- 生产环境建议使用连接池
- 设置合适的超时和重试参数
- 启用SSL连接

#### 3. **Redis配置**
- 生产环境必须设置密码
- 使用专用命名空间避免冲突
- 配置适当的超时参数

#### 4. **邮件配置**
- 开发环境可使用CONSOLE输出
- 生产环境建议使用专业邮件服务（如Mailgun、SendGrid）

## 快速开始

### 📦 初始化步骤

#### 1. **环境准备**
```bash
# 克隆项目
git clone <repository-url>
cd auth-service

# 安装依赖
npm install

# 复制环境配置
cp .env.example .env
# 编辑 .env 文件，填入正确的配置信息
```

#### 2. **数据库初始化**
```bash
# 生成Prisma客户端
npx prisma generate

# 运行数据库迁移
npx prisma migrate dev --name init

# (可选) 生成测试数据
npx prisma db seed
```

#### 3. **密钥管理**
```bash
# 生成第一个JWT签名密钥
npm run rotate:key

# 查看生成的密钥
npx prisma studio
# 导航到 Key 表查看生成的密钥
```

#### 4. **启动服务**
```bash
# 开发模式启动
npm run dev

# 生产模式启动
npm run build
npm start
```

### 🔧 必需的手动配置

#### 1. **OAuth2客户端注册**

为每个业务服务注册OAuth2客户端：

```sql
-- 注册ploml服务
INSERT INTO "Client" (
    "id", "clientId", "name", "type", 
    "secretHash", "authMethod", "redirectUris"
) VALUES (
    gen_random_uuid()::text,
    'ploml-web',
    'Ploml Web Application',
    'PUBLIC',
    NULL,
    'none',
    '["http://localhost:3000/auth/callback"]'::jsonb
);

-- 注册内部API网关
INSERT INTO "Client" (
    "id", "clientId", "name", "type", 
    "secretHash", "authMethod", "redirectUris"
) VALUES (
    gen_random_uuid()::text,
    'internal-gateway',
    'Internal API Gateway',
    'CONFIDENTIAL',
    '$2b$10$...',  -- 使用bcrypt加密的secret
    'client_secret_post',
    '[]'::jsonb
);
```

#### 2. **管理员用户创建**

```sql
-- 创建初始管理员用户
INSERT INTO "User" (
    "id", "email", "passwordHash", "name", 
    "emailVerifiedAt", "createdAt", "updatedAt"
) VALUES (
    gen_random_uuid()::text,
    'admin@tymoe.com',
    '$2b$10$...',  -- 使用bcrypt加密的密码
    'System Administrator',
    NOW(),
    NOW(),
    NOW()
);
```

#### 3. **Redis数据结构**

服务会自动创建以下Redis键结构：
- `authsvc:rl:login:email:<hash>` - 邮箱登录限制
- `authsvc:rl:login:ip:<ip>` - IP登录限制
- `authsvc:user_lock:<userId>` - 用户锁定状态
- `authsvc:login_failures:<userId>` - 登录失败计数

## API接口

> 📋 **详细的API使用示例和前端集成代码，请查看 [API_EXAMPLES.md](./API_EXAMPLES.md)**

### 🎯 设计理念

Auth Service v0.2.11 采用**纯API模式**：

- ✅ **前端控制UI**：登录页面、注册表单完全由前端实现
- ✅ **RESTful API**：标准的HTTP请求/响应
- ✅ **JWT Token**：安全的无状态认证
- ✅ **实时响应**：无页面跳转，单页应用体验

### 🔐 认证相关

#### 用户注册
```http
POST /identity/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "name": "用户姓名",
  "phone": "+86 138 0013 8000"
}
```

#### 邮箱验证
```http
POST /identity/verify
Content-Type: application/json

{
  "email": "user@example.com",
  "code": "selector.token"
}
```

#### 用户登录
```http
POST /identity/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "captcha": "captcha_response_token"
}
```

### 🎫 OAuth2流程

#### 授权请求
```http
GET /oauth2/authorize?response_type=code&client_id=ploml-web&redirect_uri=http://localhost:3000/callback&scope=openid profile&state=random_state
```

#### Token交换
```http
POST /oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code=AUTH_CODE&
client_id=ploml-web&
redirect_uri=http://localhost:3000/callback
```

#### Token刷新
```http
POST /oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token&
refresh_token=REFRESH_TOKEN&
client_id=ploml-web
```

#### Token验证（内部服务使用）
```http
POST /oauth2/introspect
Content-Type: application/x-www-form-urlencoded
Authorization: Basic <base64(client_id:client_secret)>

token=ACCESS_TOKEN
```

### 🏢 组织管理

#### 创建组织
```http
POST /organizations
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "我的美容院",
  "description": "专业美容服务"
}
```

#### 添加成员
```http
POST /organizations/:orgId/members
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "email": "employee@example.com",
  "role": "EMPLOYEE"
}
```

### 📱 设备管理

#### 注册设备
```http
POST /devices
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "POS机-001",
  "type": "HOST",
  "organizationId": "org-uuid"
}
```

## 前后端协作

### 🌐 前端集成指南

#### 1. **OAuth2流程实现**

```javascript
// auth.js - 前端认证模块
class AuthService {
  constructor() {
    this.authServer = 'http://localhost:8080';
    this.clientId = 'ploml-web';
    this.redirectUri = window.location.origin + '/auth/callback';
  }

  // 跳转到登录页面
  login() {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      scope: 'openid profile',
      state: this.generateState()
    });
    
    window.location.href = `${this.authServer}/oauth2/authorize?${params}`;
  }

  // 处理授权回调
  async handleCallback(code, state) {
    if (!this.validateState(state)) {
      throw new Error('Invalid state parameter');
    }

    const response = await fetch(`${this.authServer}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.clientId,
        redirect_uri: this.redirectUri
      })
    });

    const tokens = await response.json();
    this.storeTokens(tokens);
    return tokens;
  }

  // 自动刷新Token
  async refreshToken() {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) {
      this.login();
      return;
    }

    const response = await fetch(`${this.authServer}/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId
      })
    });

    if (response.ok) {
      const tokens = await response.json();
      this.storeTokens(tokens);
      return tokens;
    } else {
      this.login();
    }
  }
}
```

#### 2. **HTTP拦截器配置**

```javascript
// axios配置
import axios from 'axios';

const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_BASE_URL
});

// 请求拦截器 - 添加Token
apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器 - 处理Token过期
apiClient.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      const authService = new AuthService();
      try {
        await authService.refreshToken();
        // 重试原请求
        return apiClient.request(error.config);
      } catch (refreshError) {
        // 刷新失败，跳转登录
        authService.login();
      }
    }
    return Promise.reject(error);
  }
);
```

#### 3. **React组件示例**

```jsx
// LoginPage.jsx
import React, { useState } from 'react';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [needsCaptcha, setNeedsCaptcha] = useState(false);

  useEffect(() => {
    // 检查是否需要验证码
    if (email) {
      checkCaptchaStatus(email);
    }
  }, [email]);

  const checkCaptchaStatus = async (email) => {
    const response = await fetch(`/identity/captcha-status?email=${email}`);
    const data = await response.json();
    setNeedsCaptcha(data.captcha_required);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const response = await fetch('/identity/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, captcha })
    });

    if (response.ok) {
      // 登录成功，开始OAuth2流程
      const authService = new AuthService();
      authService.login();
    } else {
      const error = await response.json();
      handleLoginError(error);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="邮箱"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="密码"
        required
      />
      {needsCaptcha && (
        <ReCAPTCHA
          sitekey={process.env.REACT_APP_RECAPTCHA_SITE_KEY}
          onChange={setCaptcha}
        />
      )}
      <button type="submit">登录</button>
    </form>
  );
};
```

### 📱 移动端集成

#### React Native示例
```javascript
// AuthService.js for React Native
import { AuthSession } from 'expo-auth-session';

class MobileAuthService {
  constructor() {
    this.authServer = 'https://auth.tymoe.com';
    this.clientId = 'tymoe-mobile';
  }

  async login() {
    const redirectUri = AuthSession.makeRedirectUri();
    
    const authUrl = `${this.authServer}/oauth2/authorize` +
      `?response_type=code` +
      `&client_id=${this.clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=openid profile`;

    const result = await AuthSession.startAsync({ authUrl });
    
    if (result.type === 'success' && result.params.code) {
      return this.exchangeCodeForTokens(result.params.code, redirectUri);
    }
  }
}
```

## 开发指南

### 🛠️ 开发环境设置

#### 1. **本地开发工具**
```bash
# 安装全局工具
npm install -g tsx prisma

# VS Code插件推荐
code --install-extension Prisma.prisma
code --install-extension bradlc.vscode-tailwindcss
code --install-extension ms-vscode.vscode-typescript-next
```

#### 2. **数据库管理**
```bash
# 启动Prisma Studio
npx prisma studio

# 重置数据库（开发环境）
npx prisma migrate reset

# 生成新的迁移
npx prisma migrate dev --name add_new_feature

# 查看数据库状态
npx prisma migrate status
```

#### 3. **Redis管理**
```bash
# 连接Redis
redis-cli

# 查看所有键
KEYS authsvc:*

# 清空开发环境数据
FLUSHDB

# 监控Redis操作
MONITOR
```

### 🧪 测试策略

#### 单元测试
```javascript
// tests/services/token.test.js
import { describe, test, expect } from '@jest/globals';
import { TokenService } from '../src/services/token.js';

describe('TokenService', () => {
  test('should generate valid access token', async () => {
    const tokenService = new TokenService();
    const token = await tokenService.signAccessToken({
      sub: 'user-123',
      roles: ['EMPLOYEE'],
      scopes: ['read'],
      organizationId: 'org-123'
    });
    
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
  });
});
```

#### 集成测试
```javascript
// tests/api/oauth2.test.js
import request from 'supertest';
import { app } from '../src/app.js';

describe('OAuth2 API', () => {
  test('POST /oauth2/token should return tokens', async () => {
    const response = await request(app)
      .post('/oauth2/token')
      .send({
        grant_type: 'authorization_code',
        code: 'valid_auth_code',
        client_id: 'test-client'
      });
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('access_token');
    expect(response.body).toHaveProperty('refresh_token');
  });
});
```

### 🔄 开发流程

#### 1. **功能开发流程**
```bash
# 1. 创建功能分支
git checkout -b feature/new-oauth-flow

# 2. 数据库变更
npx prisma migrate dev --name add_new_oauth_flow

# 3. 实现功能
# - 更新Prisma schema
# - 实现Service层逻辑
# - 添加Controller层接口
# - 编写测试用例

# 4. 测试
npm run test
npm run test:e2e

# 5. 类型检查和构建
npm run build

# 6. 提交代码
git add .
git commit -m "feat: implement new oauth flow"

# 7. 推送并创建PR
git push origin feature/new-oauth-flow
```

#### 2. **数据库迁移最佳实践**

```sql
-- 迁移文件命名规范
-- 20231201120000_add_device_management.sql

-- 添加表
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- 添加索引
CREATE INDEX "Device_organizationId_idx" ON "Device"("organizationId");

-- 添加外键约束
ALTER TABLE "Device" ADD CONSTRAINT "Device_organizationId_fkey" 
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

### 📝 代码规范

#### TypeScript规范
```typescript
// 接口定义
interface CreateUserRequest {
  email: string;
  password: string;
  name?: string;
  phone?: string;
}

// Service类实现
export class UserService {
  private readonly prisma = prisma;

  async createUser(request: CreateUserRequest): Promise<User> {
    // 验证输入
    this.validateCreateUserRequest(request);
    
    // 业务逻辑
    const hashedPassword = await bcrypt.hash(request.password, 10);
    
    // 数据操作
    return this.prisma.user.create({
      data: {
        email: request.email,
        passwordHash: hashedPassword,
        name: request.name,
        phone: request.phone
      }
    });
  }

  private validateCreateUserRequest(request: CreateUserRequest): void {
    if (!this.isValidEmail(request.email)) {
      throw new Error('invalid_email');
    }
    
    if (!this.isStrongPassword(request.password)) {
      throw new Error('weak_password');
    }
  }
}
```

### 🚀 后续服务开发注意事项

#### 1. **微服务架构原则**
- **单一职责**：每个服务只负责特定的业务领域
- **数据隔离**：避免跨服务的数据库直接访问
- **API优先**：服务间通过定义良好的API通信
- **无状态设计**：服务实例应该是无状态的

#### 2. **与Auth Service集成**
```typescript
// 新服务中的认证中间件
import axios from 'axios';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'missing_token' });
  }

  try {
    // 调用Auth Service验证Token
    const response = await axios.post('http://auth-service:8080/oauth2/introspect', 
      `token=${token}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
        }
      }
    );

    if (response.data.active) {
      req.user = response.data;
      next();
    } else {
      return res.status(401).json({ error: 'invalid_token' });
    }
  } catch (error) {
    return res.status(401).json({ error: 'token_validation_failed' });
  }
};
```

#### 3. **组织权限检查**
```typescript
// 权限检查中间件
export const requireOrganizationAccess = (requiredRole?: Role) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user; // 来自认证中间件
    const organizationId = req.params.organizationId || req.body.organizationId;

    // 检查用户是否属于该组织
    if (user.organizationId !== organizationId) {
      return res.status(403).json({ error: 'access_denied' });
    }

    // 检查角色权限（如果需要）
    if (requiredRole && !hasRequiredRole(user.roles, requiredRole)) {
      return res.status(403).json({ error: 'insufficient_permissions' });
    }

    next();
  };
};

// 角色权限等级检查
const hasRequiredRole = (userRoles: string[], requiredRole: Role): boolean => {
  const roleHierarchy = {
    'OWNER': 3,
    'MANAGER': 2,
    'EMPLOYEE': 1
  };

  const maxUserRole = Math.max(...userRoles.map(role => roleHierarchy[role] || 0));
  const requiredLevel = roleHierarchy[requiredRole];

  return maxUserRole >= requiredLevel;
};
```

#### 4. **服务发现与配置**
```typescript
// 服务配置管理
export const ServiceConfig = {
  authService: {
    baseUrl: process.env.AUTH_SERVICE_URL || 'http://auth-service:8080',
    clientId: process.env.AUTH_CLIENT_ID || 'internal-service',
    clientSecret: process.env.AUTH_CLIENT_SECRET || 'super-secret'
  },
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/service_db'
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    namespace: process.env.SERVICE_NAME || 'unknown-service'
  }
};
```

## 部署运维

### 项目结构说明

```
auth-service/
├── src/
│   ├── controllers/          # 控制器层 - 处理HTTP请求
│   ├── services/            # 业务逻辑层 - 核心业务处理
│   ├── middleware/          # 中间件层 - 认证、限流等
│   ├── infra/               # 基础设施层 - 数据库、Redis等
│   ├── routes/              # 路由定义
│   ├── scripts/             # 运维脚本 (重要!必须保留)
│   │   ├── rotate-key.ts    # JWT密钥轮换脚本
│   │   └── retire-keys.ts   # 密钥清理脚本  
│   ├── config/              # 配置管理
│   ├── types/               # TypeScript类型定义
│   ├── utils/               # 工具函数
│   └── index.ts             # 应用入口
├── prisma/
│   └── schema.prisma        # 数据库模型定义
├── e2e/                     # 端到端测试
├── package.json             # 项目依赖和脚本
├── tsconfig.json            # TypeScript配置
├── Dockerfile               # Docker构建文件
├── docker-compose.yml       # 本地开发环境
├── .env                     # 环境配置 (不上传到Git)
├── .gitignore               # Git忽略文件
└── README.md                # 项目文档
```

### 重要文件说明

#### 🔑 `src/scripts/` 目录 (重要!必须保留)
- `rotate-key.ts`: JWT签名密钥轮换脚本，用于定期更新密钥以提高安全性
- `retire-keys.ts`: 清理过期密钥脚本，用于移除不再使用的密钥
- **这两个文件必须提交到GitHub，因为它们是生产环境运维必需的**

#### 🚫 不应提交的文件
- `.env` - 包含敏感信息（数据库密码、API密钥等）
- `node_modules/` - 依赖包
- `dist/` - 构建输出
- `*.log` - 日志文件

### .gitignore 配置

确保你的 `.gitignore` 文件包含以下内容：

```gitignore
# 环境配置文件
.env
.env.local
.env.production
.env.backup
*.env

# 依赖包
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# 构建输出
dist/
build/

# 日志文件
*.log
logs/
audit.log

# 缓存文件
.cache/
.parcel-cache/

# IDE设置
.vscode/settings.json
.idea/
*.swp
*.swo

# 系统文件
.DS_Store
Thumbs.db

# 临时文件
*.tmp
*.temp
*.backup

# Claude Code 本地设置
.claude/
```

### 本地开发环境准备

```bash
# 安装依赖
npm install

# 生成 Prisma 客户端
npm run prisma:generate

# 运行数据库迁移
npm run migrate

# 初始化JWT签名密钥
npm run rotate:key
```

## 云服务部署指南

### 部署方案决策

基于你的需求，推荐使用 **Oracle Cloud** 作为主要部署平台，理由如下：

#### 🏆 为什么选择 Oracle Cloud
- ✅ **Always Free Tier**：永久免费的资源（ARM Compute + 200GB 存储）
- ✅ **性能优秀**：4 vCPU + 24GB 内存的 ARM 实例
- ✅ **成本低**：适合初期项目和中小规模部署
- ✅ **与 AWS 兼容**：后续如需扩展可轻松迁移到 AWS

#### 🚀 推荐部署架构

```
┌──────────────────────────────────┐
│        Oracle Cloud Infrastructure        │
├──────────────────────────────────┤
│ 🌐 Load Balancer (OCI LB)             │
├──────────────────────────────────┤
│ 📦 Docker Container (Auth Service)    │
│   - Node.js + TypeScript                │
│   - 端口: 8080                           │
├──────────────────────────────────┤
│ 💾 PostgreSQL (Autonomous DB)        │
│   - 管理式数据库服务                 │
│   - 自动备份和恢复                   │
├──────────────────────────────────┤
│ ⚡ Redis Cache                        │
│   - 用于速率限制和会话管理         │
└──────────────────────────────────┘
```

### Oracle Cloud 部署步骤

#### 1. 创建 OCI 资源

```bash
# 安装 OCI CLI
bash -c "$(curl -L https://raw.githubusercontent.com/oracle/oci-cli/master/scripts/install/install.sh)"

# 配置 OCI CLI
oci setup config
```

#### 2. 创建 Compute 实例

```bash
# 创建Always Free ARM 实例
# VM.Standard.A1.Flex: 4 vCPU + 24GB RAM
# 操作系统: Ubuntu 22.04
```

#### 3. 设置数据库

```bash
# 选择方案A: Autonomous Database (Always Free)
# - 1 OCPU + 20GB 存储
# - 自动管理和维护

# 选择方案B: 在Compute实例上运行PostgreSQL
# - 更灵活，但需要自己管理
```

#### 4. Docker 部署 (推荐方案)

**为什么使用 Docker：**
- ✅ **环境一致性**：开发和生产环境完全一致
- ✅ **部署简单**：一键部署，无需复杂配置
- ✅ **资源隔离**：更好的安全性和稳定性
- ✅ **扩展性**：未来可轻松迁移到 Kubernetes

#### 5. 生产部署配置

**`docker-compose.prod.yml`**
```yaml
version: '3.8'

services:
  auth-service:
    build: .
    restart: unless-stopped
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - SESSION_SECRET=${SESSION_SECRET}
      - KEYSTORE_ENC_KEY=${KEYSTORE_ENC_KEY}
      - ISSUER_URL=${ISSUER_URL}
      - ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
      - SMTP_HOST=${SMTP_HOST}
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASS=${SMTP_PASS}
      - CAPTCHA_SITE_KEY=${CAPTCHA_SITE_KEY}
      - CAPTCHA_SECRET_KEY=${CAPTCHA_SECRET_KEY}
    volumes:
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
    networks:
      - tymoe-network

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    ports:
      - "127.0.0.1:6379:6379"
    networks:
      - tymoe-network

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - auth-service
    networks:
      - tymoe-network

volumes:
  redis_data:

networks:
  tymoe-network:
    driver: bridge
```

**Nginx 配置 (`nginx.conf`)**
```nginx
events {
  worker_connections 1024;
}

http {
  upstream auth_service {
    server auth-service:8080;
  }
  
  # HTTP -> HTTPS 重定向
  server {
    listen 80;
    server_name auth.tymoe.com;
    return 301 https://$server_name$request_uri;
  }
  
  # HTTPS 配置
  server {
    listen 443 ssl http2;
    server_name auth.tymoe.com;
    
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    # 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    location / {
      proxy_pass http://auth_service;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      
      # 超时配置
      proxy_connect_timeout 30s;
      proxy_send_timeout 30s;
      proxy_read_timeout 30s;
    }
    
    # 健康检查
    location /healthz {
      proxy_pass http://auth_service/healthz;
      access_log off;
    }
  }
}
```

#### 6. 部署脚本

**`deploy.sh`**
```bash
#!/bin/bash
set -e

echo "🚀 Starting deployment..."

# 更新代码
git pull origin main

# 构建和启动服务
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d

# 等待服务启动
echo "⏳ Waiting for service to be ready..."
sleep 30

# 运行数据库迁移
docker-compose -f docker-compose.prod.yml exec auth-service npm run migrate

# 健康检查
if curl -f http://localhost:8080/healthz; then
  echo "✅ Deployment successful!"
else
  echo "❌ Deployment failed - health check failed"
  exit 1
fi

# 清理旧镜像
docker image prune -f

echo "🎉 Deployment completed successfully!"
```

### AWS 部署方案 (备选)

如果未来需要扩展到 AWS，推荐使用：

- **ECS Fargate**: 无服务器容器运行
- **RDS PostgreSQL**: 管理式数据库
- **ElastiCache Redis**: 管理式 Redis
- **Application Load Balancer**: 负载均衡
- **Route 53**: DNS 管理
- **Certificate Manager**: SSL 证书管理

### 生产环境初始化

```bash
# 1. 连接到服务器
ssh -i ~/.ssh/oci-key ubuntu@your-server-ip

# 2. 克隆项目
git clone https://github.com/your-username/auth-service.git
cd auth-service

# 3. 配置环境变量
cp .env.example .env
nano .env  # 编辑生产配置

# 4. 部署服务
chmod +x deploy.sh
./deploy.sh

# 5. 初始化JWT密钥
docker-compose -f docker-compose.prod.yml exec auth-service npm run rotate:key

# 6. 创建初始客户端
docker-compose -f docker-compose.prod.yml exec auth-service npx tsx -e "
  import { PrismaClient } from '@prisma/client';
  const prisma = new PrismaClient();
  prisma.client.create({
    data: {
      clientId: 'tymoe-web',
      name: 'Tymoe Web Application',
      type: 'PUBLIC',
      authMethod: 'none',
      redirectUris: ['https://app.tymoe.com/auth/callback']
    }
  }).then(console.log).finally(() => prisma.$disconnect());"
```

### 监控和维护

#### 日志管理
```bash
# 查看应用日志
docker-compose -f docker-compose.prod.yml logs -f auth-service

# 查看所有服务日志
docker-compose -f docker-compose.prod.yml logs -f

# 查看特定时间段日志
docker-compose -f docker-compose.prod.yml logs --since="2h" auth-service
```

#### 定期维护任务
```bash
# 添加到 crontab
crontab -e

# 每周轮换JWT密钥
0 2 * * 0 cd /path/to/auth-service && docker-compose -f docker-compose.prod.yml exec auth-service npm run rotate:key

# 每月清理过期密钥
0 3 1 * * cd /path/to/auth-service && docker-compose -f docker-compose.prod.yml exec auth-service npm run retire:keys

# 每日数据库备份
0 1 * * * cd /path/to/auth-service && ./scripts/backup-db.sh
```

### 🐳 Docker化部署 (本地开发)

#### Dockerfile
```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:18-alpine AS runtime

RUN apk add --no-cache dumb-init
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

EXPOSE 8080

USER node
CMD ["dumb-init", "node", "dist/index.js"]
```

#### docker-compose.yml
```yaml
version: '3.8'

services:
  auth-service:
    build: .
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://auth_user:password@postgres:5432/tymoe_auth
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    networks:
      - tymoe-network

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: tymoe_auth
      POSTGRES_USER: auth_user
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - tymoe-network

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    networks:
      - tymoe-network

volumes:
  postgres_data:
  redis_data:

networks:
  tymoe-network:
    driver: bridge
```

### 📊 监控与日志

#### 健康检查端点
```typescript
// /health endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    checks: {
      database: await checkDatabase(),
      redis: await checkRedis(),
      smtp: await checkSMTP()
    }
  };

  const isHealthy = Object.values(health.checks).every(check => check.status === 'ok');
  
  res.status(isHealthy ? 200 : 503).json(health);
});
```

#### 日志配置
```typescript
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}
```

### 🔧 运维脚本

#### 密钥轮换
```bash
#!/bin/bash
# scripts/rotate-keys.sh

echo "Starting JWT key rotation..."

# 1. 生成新密钥
npm run rotate:key

# 2. 等待传播时间
echo "Waiting for key propagation..."
sleep 300  # 5分钟

# 3. 清理过期密钥
npm run retire:keys

echo "Key rotation completed successfully!"
```

#### 数据库备份
```bash
#!/bin/bash
# scripts/backup-db.sh

BACKUP_DIR="/backups/auth-service"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/auth_backup_${TIMESTAMP}.sql"

mkdir -p $BACKUP_DIR

pg_dump $DATABASE_URL > $BACKUP_FILE

if [ $? -eq 0 ]; then
    echo "Database backup completed: $BACKUP_FILE"
    # 保留最近7天的备份
    find $BACKUP_DIR -name "auth_backup_*.sql" -mtime +7 -delete
else
    echo "Database backup failed!"
    exit 1
fi
```

---

## 📞 支持与维护

### 问题排查

#### 常见问题
1. **Token验证失败**
   - 检查密钥是否已生成并处于ACTIVE状态
   - 验证客户端ID和Secret配置
   - 确认Token未过期

2. **邮件发送失败**
   - 检查SMTP配置
   - 验证邮件服务商设置
   - 查看审计日志

3. **Redis连接问题**
   - 检查Redis服务状态
   - 验证连接配置和密码
   - 查看网络连接

### 联系方式

- **技术支持**：tech@tymoe.com
- **安全问题**：security@tymoe.com
- **文档更新**：请提交GitHub Issue

---

*最后更新：2024年12月*
*版本：v0.2.11*