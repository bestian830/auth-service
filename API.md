- # API端点设计文档

# Auth Service v2.1.1 - 第一部分:User用户管理模块

## 设计原则

1. **RESTful 风格**: 使用标准 HTTP 方法和状态码
2. **统一响应格式**: 成功和错误响应保持一致结构
3. **安全优先**: 所有敏感操作需要认证和授权
4. **幂等性**: GET/PUT/DELETE 操作保持幂等
5. **向后兼容**: API 版本化,保证平滑升级

## 基础信息

- **Base URL**: `https://tymoe.com`
- **API 前缀**: `/api/auth-service/v1`
- **认证方式**: Bearer Token (JWT)
- **Content-Type**: `application/json`

## 全局请求头

所有来自前端的请求都应携带:

http

`X-Product-Type: beauty  // 或 fb`

用于标识请求来自哪个产品前端,决定数据隔离边界。

---

## 1️⃣ User 用户管理模块 (`/api/auth-service/v1/identity`)

### 1.1 用户注册

**端点**: `POST /api/auth-service/v1/identity/register`

**请求头**:

http

`X-Product-Type: beauty  // 或 fb`

**请求体**:

json

`{
  "email": "user@example.com",
  "password": "Password123!",
  "name": "张三",
  "phone": "+16729650830"
}`

**字段说明**:

- `email` (必填, string): 邮箱地址
- `password` (必填, string): 密码,至少8位,包含大小写字母和数字
- `name` (可选, string): 姓名,2-50字符
- `phone` (可选, string): 电话号码,国际格式 (如 +16729650830, +8613800138000)

**处理逻辑**:

1. 验证 email 格式 (RFC 5322标准)
2. 验证 password 强度 (至少8位,包含大小写字母和数字)
3. 验证 phone 格式 (使用 Google libphonenumber,自动识别国家码)
4. 验证 name 格式 (2-50字符,只允许字母、中文、空格、连字符)
5. 检查 email 是否已存在:
    - 如果存在且 `emailVerifiedAt` 为 null → 删除旧记录和相关 email_verifications,继续注册
    - 如果存在且 `emailVerifiedAt` 不为 null → 返回 409 错误
6. 使用 bcrypt 哈希密码 (salt rounds = 10)
7. 创建 User 记录 (不创建组织,用户稍后在控制台创建)
8. 生成 6 位数字验证码
9. 使用 bcrypt 哈希验证码 (salt rounds = 10)
10. 创建 email_verifications 记录:
    - purpose = 'signup'
    - expiresAt = 30分钟后
    - attempts = 0
    - resendCount = 0
11. 发送验证邮件 (包含 6 位验证码)
12. 记录到 audit_logs (action='user_register', detail 中记录 productType)
13. 返回 email (不返回 userId,避免信息泄露)

**成功响应 (201)**:

json

`{
  "success": true,
  "message": "Please check your email for verification.",
  "data": {
    "email": "user@example.com"
  }
}`

**错误响应**:

json

`*// 400 - 邮箱格式错误*
{
  "error": "invalid_email_format",
  "detail": "Please provide a valid email address"
}

*// 400 - 密码强度不够*
{
  "error": "weak_password",
  "detail": "Password must be at least 8 characters with uppercase, lowercase, and numbers"
}

*// 400 - 电话号码格式错误*
{
  "error": "invalid_phone_format",
  "detail": "Please provide a valid phone number in international format (e.g., +16729650830)"
}

*// 400 - 姓名格式错误*
{
  "error": "invalid_name_format",
  "detail": "Name must be 2-50 characters, letters, Chinese characters, spaces, and hyphens only"
}

*// 409 - 邮箱已注册*
{
  "error": "email_already_registered",
  "detail": "This email is already registered and verified. Please try to log in."
}

*// 429 - 请求过于频繁*
{
  "error": "too_many_requests",
  "detail": "Too many registration attempts. Please try again later."
}`

---

### 1.2 邮箱验证

**端点**: `POST /api/auth-service/v1/identity/verification`

**请求体**:

json

`{
  "email": "user@example.com",
  "code": "123456"
}`

**字段说明**:

- `email` (必填, string): 用户邮箱
- `code` (必填, string): 6位数字验证码

**设计说明**:

- **不需要 userId**: 通过 email + code 组合即可唯一定位验证记录
- **安全考虑**: 使用 bcrypt 比对验证码哈希,防止暴力破解
- **用户体验**: 用户只需要输入邮箱和收到的验证码,无需记住 userId

**处理逻辑**:

1. 验证 email 格式
2. 验证 code 格式 (必须是6位数字)
3. 查询 email_verifications 表:
    - 条件: email 对应的 userId, purpose='signup', consumedAt IS NULL, expiresAt > NOW()
    - 按 createdAt DESC 排序,取最新一条
4. 如果找不到记录 → 返回 404 错误 "verification_not_found"
5. 如果验证码已过期 → 返回 400 错误 "code_expired"
6. 检查 attempts 次数:
    - 如果 attempts >= 10 → 返回 429 错误 "too_many_attempts"
7. 使用 bcrypt.compare() 比对 code 和 verificationCodeHash
8. 如果验证码不匹配:
    - attempts += 1
    - 保存记录
    - 返回 400 错误 "invalid_code"
9. 如果验证码匹配:
    - 更新 email_verifications.consumedAt = NOW()
    - 更新 users.emailVerifiedAt = NOW()
    - 记录到 audit_logs (action='email_verified')
    - 返回成功

**成功响应 (200)**:

json

`{
  "success": true,
  "message": "Email verified successfully. You can now log in.",
  "data": {
    "email": "user@example.com",
    "emailVerified": true
  }
}`

**错误响应**:

json

`*// 400 - 验证码格式错误*
{
  "error": "invalid_code_format",
  "detail": "Verification code must be 6 digits"
}

*// 400 - 验证码错误*
{
  "error": "invalid_code",
  "detail": "Invalid verification code."
}

*// 400 - 验证码已过期*
{
  "error": "code_expired",
  "detail": "Verification code has expired. Please request a new one."
}

*// 404 - 找不到验证记录*
{
  "error": "verification_not_found",
  "detail": "No pending verification found for this email. Please register again or request a new code."
}

*// 429 - 尝试次数过多*
{
  "error": "too_many_attempts",
  "detail": "Too many failed attempts. Please request a new verification code."
}`

---

### 1.3 重新发送验证码

**端点**: `POST /api/auth-service/v1/identity/resend`

**请求体**:

json

`{
  "email": "user@example.com",
  "purpose": "signup"
}`

**字段说明**:

- `email` (必填, string): 用户邮箱
- `purpose` (必填, string): 验证目的, 枚举值: "signup" | "password_reset" | "email_change"

**设计说明**:

- **为什么用 POST**: 虽然是"重新发送",但会创建新的验证码记录,属于资源创建操作
- **防滥用机制**:
    - 限制重发频率 (同一邮箱 60 秒内只能请求一次)
    - 限制重发次数 (同一验证会话最多重发 5 次)
    - Redis 速率限制

**处理逻辑**:

1. 验证 email 格式
2. 验证 purpose 枚举值
3. 查询对应的 User 记录:
    - 如果 purpose='signup' 且 emailVerifiedAt 不为 null → 返回 400 "already_verified"
    - 如果找不到用户 → 返回 404 "user_not_found"
4. 检查 Redis 速率限制:
    - Key: `resend:${email}:${purpose}`
    - 如果存在 → 返回 429 "too_soon"
    - 设置 60 秒过期
5. 查询最新的 email_verifications 记录 (未消费的)
6. 检查 resendCount:
    - 如果 >= 5 → 返回 429 "resend_limit_exceeded"
7. 标记旧验证码为过期 (设置 expiresAt = NOW())
8. 生成新的 6 位验证码
9. 创建新的 email_verifications 记录:
    - resendCount = 旧记录的 resendCount + 1
    - expiresAt = 30 分钟后
10. 发送验证邮件
11. 记录到 audit_logs
12. 返回成功

**成功响应 (200)**:

json

`{
  "success": true,
  "message": "Verification code has been sent. Please check your email.",
  "data": {
    "email": "user@example.com",
    "expiresIn": 1800
  }
}`

**错误响应**:

json

`*// 400 - 邮箱已验证*
{
  "error": "already_verified",
  "detail": "This email is already verified. You can log in directly."
}

*// 404 - 用户不存在*
{
  "error": "user_not_found",
  "detail": "No account found with this email address."
}

*// 429 - 请求过快*
{
  "error": "too_soon",
  "detail": "Please wait 60 seconds before requesting another verification code."
}

*// 429 - 超过重发次数*
{
  "error": "resend_limit_exceeded",
  "detail": "Maximum resend limit reached. Please try registering again."
}`

---

### 1.4 用户登录

**端点**: `POST /api/auth-service/v1/identity/login`

**请求头**:

http

`X-Product-Type: beauty  // 或 fb`

**请求体**:

json

`{
  "email": "user@example.com",
  "password": "Password123!"
}`

**字段说明**:

- `email` (必填, string): 用户邮箱
- `password` (必填, string): 密码

**处理逻辑**:

1. 验证 email 格式
2. 从请求头获取 `X-Product-Type`
3. 查询 User 记录 (by email)
4. 如果用户不存在 → 返回 401 "invalid_credentials" (不泄露用户是否存在)
5. 检查账户状态:
    - 如果 emailVerifiedAt 为 null → 返回 401 "account_not_verified"
    - 如果 lockedUntil 不为 null 且 > NOW() → 返回 423 "account_locked"
6. 使用 bcrypt.compare() 验证密码
7. 如果密码错误:
    - loginFailureCount += 1
    - lastLoginFailureAt = NOW()
    - 如果 loginFailureCount >= LOGIN_LOCK_THRESHOLD (默认10次):
        - lockedUntil = NOW() + LOGIN_LOCK_MINUTES (默认30分钟)
        - lockReason = 'max_failures'
    - 保存 User 记录
    - 记录到 login_attempts (success=false, ipAddress, userAgent, organizationId=null)
    - 返回 401 "invalid_credentials"
8. 如果密码正确:
    - 重置 loginFailureCount = 0, lastLoginFailureAt = null, lockedUntil = null, lockReason = null
    - 保存 User 记录
    - 记录到 login_attempts (success=true, ipAddress, userAgent)
    - 查询该用户的所有 organizations:
        - 条件: userId = 当前用户 AND productType = 请求头的 productType
        - 按 createdAt ASC 排序
    - 记录到 audit_logs (action='user_login', detail 中记录 productType)
    - 返回用户信息和筛选后的组织列表

**成功响应 (200)**:

json

`{
  "success": true,
  "user": {
    "email": "user@example.com",
    "name": "张三",
    "phone": "+16729650830",
    "emailVerified": true,
    "createdAt": "2025-01-15T08:30:00.000Z"
  },
  "organizations": [
    {
      "id": "org-uuid-1",
      "orgName": "我的美容院总店",
      "orgType": "MAIN",
      "productType": "beauty",
      "status": "ACTIVE"
    },
    {
      "id": "org-uuid-2",
      "orgName": "我的美容院分店",
      "orgType": "BRANCH",
      "productType": "beauty",
      "parentOrgId": "org-uuid-1",
      "status": "ACTIVE"
    }
  ]
}`

**注意**:

- 登录成功后,前端应该调用 `/oauth/token` endpoint 获取 access_token 和 refresh_token
- 不在登录接口直接返回 token,保持 OAuth2 标准流程

**错误响应**:

json

`*// 401 - 账户未验证*
{
  "error": "account_not_verified",
  "detail": "Please verify your email address before logging in."
}

*// 401 - 邮箱或密码错误*
{
  "error": "invalid_credentials",
  "detail": "Email or password is incorrect."
}

*// 423 - 账户已锁定*
{
  "error": "account_locked",
  "detail": "Account is locked due to too many failed login attempts. Please try again in 30 minutes or contact support.",
  "lockedUntil": "2025-01-15T09:30:00.000Z"
}`

---

### 1.5 获取 OAuth Token

**端点:** `POST /oauth/token`

**请求头:**

`X-Product-Type: beauty  // 或 fb
X-Device-ID: device-uuid  // 仅 POS 登录时需要`

此端点支持三种登录场景,通过请求体中的字段自动识别:

#### 场景 1: User 后台登录

**请求头**:

```http
X-Product-Type: beauty  // 或 fb
(不需要有X-Device-ID)
```

**请求体** (application/x-www-form-urlencoded):

```
grant_type=password
username=user@example.com     // 支持 username 或 email 字段传邮箱
password=Password123!
client_id=tymoe-web           // 必须
```

**处理逻辑**:

1. 验证 `grant_type=password` 和 `X-Product-Type`
2. 验证 `client_id` 存在
3. 验证用户凭证（邮箱 + 密码）
4. 检查邮箱是否已验证
5. 查询该用户在该 productType 下的所有组织 ID
6. 生成 **access_token** (JWT, RS256 签名):

```json
{
  "sub": "user-uuid",
  "userType": "USER",
  "email": "user@example.com",
  "productType": "beauty",
  "organizationIds": ["org1", "org2", "org3"],  // 数组，多组织
  "iat": 1640991600,
  "exp": 1640995200,  // 60分钟后过期
  "jti": "unique-token-id"
}
```

7. 生成 **refresh_token** 并存入数据库（30天有效，Uber方式）

**成功响应 (200)**:

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "def502004a8b7e2c...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

---

#### 场景 2: Account 后台登录

**请求头**:

```http
X-Product-Type: beauty  // 或 fb
(不需要有X-Device-ID)
```

**请求体** (application/x-www-form-urlencoded):

```
grant_type=password
username=manager001           // Account 的真实 username（不是邮箱,不能包含@符号）
password=Password123!
client_id=tymoe-web
```

**处理逻辑**:

1. 验证 `grant_type=password` 和 `X-Product-Type`
2. 验证 `client_id` 存在
3. 验证 Account 凭证（username 不包含 @ 符号）
4. 检查账号类型（只允许 OWNER/MANAGER 后台登录）
5. 检查账号是否锁定
6. 生成 **access_token**:

```json
{
  "sub": "account-uuid",
  "userType": "ACCOUNT",
  "accountType": "MANAGER",
  "username": "manager001",
  "employeeNumber": "EMP001",
  "productType": "beauty",
  "organizationId": "org-uuid",  // 单值，绑定特定组织
  "iat": 1640991600,
  "exp": 1640995200,  // 60分钟
  "jti": "unique-token-id"
}
```

**权限说明**:
- **OWNER**: 可以登录后台
- **MANAGER**: 可以登录后台
- **STAFF**: 不允许后台登录

7. 生成 **refresh_token**（30天有效）

**成功响应 (200)**:

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "def502004a8b7e2c...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

### 场景3: Account POS 登录 (Owner/Manager/Staff)

**请求头**:

```http
X-Product-Type: beauty  // 或 fb
X-Device-ID: device-uuid
```

**请求体 (application/x-www-form-urlencoded):**

`grant_type=password
pin_code=1234`

**识别方式:** 存在 pin_code 字段 + 请求头有 X-Device-ID

**生成的 access_token (JWT):**

`{
  "sub": "account-uuid",
  "userType": "ACCOUNT",
  "accountType": "STAFF",
  "employeeNumber": "EMP002",
  "productType": "beauty",
  "organizationId": "org-uuid",
  "deviceId": "device-uuid",  *// POS 特有*
  "iat": 1640991600,
  "exp": 1641007800,  *// 4.5小时 (16200秒)*
  "jti": "unique-token-id"
}`

**不生成 refresh_token** (POS 登录为一次性 Token)

**成功响应 (200)**:

```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 16200
}

---

**成功响应:**

User / Account 后台登录 (200):

`{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "refresh_token": "def502004a8b7e2c...",
  "token_type": "Bearer",
  "expires_in": 3600
}`

Account POS 登录 (200):

json

`{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 16200
}`

---

**注意事项**:

1. **User vs Account 区分**:
   - User: `username` 字段包含 `@` 符号（邮箱格式）
   - Account: `username` 字段不包含 `@` 符号（真实用户名）

2. **Refresh Token 机制**:
   - User/Account 后台登录: 30天固定不变（Uber方式）
   - Account POS 登录: 无 refresh_token（access_token 4.5小时）

3. **响应格式统一**:
   - User/Account 后台登录只返回 4 个字段：`access_token`, `refresh_token`, `token_type`, `expires_in`
   - Account POS登录只返回3个字段:`access_token`, `token_type`, `expires_in`

---

### 1.6 刷新 Token

**端点**: `POST /oauth/token`

**请求体** (application/x-www-form-urlencoded):

```
grant_type=refresh_token
refresh_token=550e8400-e29b-41d4-a716-446655440000
client_id=tymoe-web
```

**处理逻辑**:

1. 验证 `grant_type=refresh_token`
2. 验证 `client_id` 存在
3. 查询 `refresh_tokens` 表（by `id = refresh_token`）
4. 检查 token 状态:
   - 不存在 → 返回 401 `invalid_grant`
   - `status != 'ACTIVE'` → 返回 401 `token_revoked`
   - `expiresAt < NOW()` → 返回 401 `token_expired`
5. 如果 token 有效:
   - 更新 `lastSeenAt = NOW()`
   - 根据 `subjectUserId` 或 `subjectAccountId` 区分登录类型
   - **User 登录**: 查询最新的组织列表（可能新增了组织）
   - **Account 登录**: 直接使用绑定的 `organizationId`
   - 生成新的 `access_token`（包含最新信息）
   - **复用原来的 `refresh_token`**（Uber 方式，不轮换）

**User/Account 登录的响应示例**:

```json
{
  "access_token": "eyJhbGci...",  // 新的 JWT
  "refresh_token": "550e8400-e29b-41d4-a716-446655440000",  // 原来的，不变
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**新 Access Token Payload** (User):

```json
{
  "sub": "user-uuid",
  "userType": "USER",
  "email": "user@example.com",
  "productType": "beauty",
  "organizationIds": ["org1", "org2", "org3", "org4"],  // 可能有新增
  "iat": 1640995200,
  "exp": 1640998800,  // 新的过期时间
  "jti": "new-unique-id"  // 新的 JTI
}
```

**User 登录的响应示例**:

```json
{
  "access_token": "eyJhbGci...",  // 新的 JWT
  "refresh_token": "uuid-format-token",  // 原来的，不变
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**新 Access Token Payload** (Account):

```json
{
  "sub": "account-uuid",
  "userType": "ACCOUNT",
  "accountType": "MANAGER",
  "username": "manager001",
  "employeeNumber": "EMP001",
  "productType": "beauty",
  "organizationId": "org-uuid",  // 不变
  "iat": 1640995200,
  "exp": 1640998800,
  "jti": "new-unique-id"
}
```

**Account 登录的响应示例**:

```json
{
  "access_token": "eyJhbGci...",  // 新的 JWT
  "refresh_token": "uuid-format-token",  // 原来的，不变
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**注意:** POS 登录无法调用此接口 (没有 refresh_token)

---

**设计说明**:

1. **Uber 方式 (User/Account 后台登录)**:
   - Refresh Token **30天固定不变**
   - 每次刷新只生成新的 Access Token
   - 简化前端逻辑，无需每次更新 RT

2. **刷新的好处**:
   - User: 获取最新的组织列表
   - Account: 保持 token 活跃状态
   - 新的 JTI 便于 token 撤销管理

3. **安全措施**:
   - 每次刷新更新 `lastSeenAt`（检测异常频率）
   - 30天后强制重新登录
   - 登出时撤销 RT 并将 AT 的 JTI 加入黑名单

4. **Account POS 登录例外**:
   - **无 refresh_token**
   - Access Token 有效期 4.5 小时
   - 到期后需要重新刷卡登录

---

### 1.7 用户登出

**端点**: `POST /api/auth-service/v1/identity/logout`

**请求头**:

http

`Authorization: Bearer <access_token>`

**请求体**:

json

`{
  "refresh_token": "def502004a8b7e2c..."
}`

**字段说明**:

- `refresh_token` (必填, string): 必须提供,撤销该 refresh token 及其家族

**处理逻辑**:

1. 从 Bearer token 中提取 userId 和 jti
2. 验证 refresh_token:
    - 查询 refresh_tokens 表 (by id = refresh_token)
    - 如果找到且 subjectUserId 匹配:
        - 撤销该 token: status = 'REVOKED', revokedAt = NOW(), revokeReason = 'user_logout'
        - 撤销同家族的所有 token (by familyId, status='ACTIVE')
3. 将 access_token 的 jti 加入 Redis 黑名单:
    - Key: `token:blacklist:${jti}`
    - Value: "1"
    - TTL: access_token 的剩余有效时间 (exp - now)
4. 记录到 audit_logs (action='user_logout')
5. 返回成功

**成功响应 (200)**:

json

`{
  "success": true,
  "message": "Logged out successfully"
}`

**注意**:

- refresh_token 必填,确保完全撤销用户的登录状态
- 业务服务验证 access_token 时必须检查 Redis 黑名单,防止已登出的 token 继续使用

---

### 1.8 忘记密码

**端点**: `POST /api/auth-service/v1/identity/forgot-password`

**请求体**:

json

`{
  "email": "user@example.com"
}`

**处理逻辑**:

1. 验证 email 格式
2. 查询 User 记录
3. 如果用户不存在 → **仍然返回成功** (安全考虑,不泄露用户是否存在)
4. 如果用户存在:
    - 检查 Redis 速率限制 (同一邮箱 1 分钟内只能请求一次)
    - 如果超限 → 返回 429
    - 生成 6 位数字验证码
    - 使用 bcrypt 哈希验证码
    - 标记旧的 password_reset 记录为过期 (设置 expiresAt = NOW())
    - 创建新的 email_verifications 记录:
        - purpose = 'password_reset'
        - expiresAt = 10 分钟后 (比注册验证码更短,安全考虑)
    - 发送重置密码邮件
    - 记录到 audit_logs
5. 返回成功

**成功响应 (200)**:

json

`{
  "success": true,
  "message": "If the system works well, you will receive a password reset code shortly."
}`

**错误响应**:

json

`*// 429 - 请求过于频繁*
{
  "error": "too_many_requests",
  "detail": "Please wait 60 seconds before requesting another password reset code."
}`

---

### 1.9 重置密码

**端点**: `POST /api/auth-service/v1/identity/reset-password`

**请求体**:

json

`{
  "email": "user@example.com",
  "code": "123456",
  "password": "NewPassword123!"
}`

**处理逻辑**:

1. 验证 email 格式
2. 验证 code 格式 (6位数字)
3. 验证 password 强度
4. 查询 email_verifications:
    - 条件: purpose='password_reset', email 对应的 userId, consumedAt IS NULL, expiresAt > NOW()
5. 验证码校验逻辑同 1.2:
    - 如果找不到 → 404 "verification_not_found"
    - 如果已过期 → 400 "code_expired"
    - 如果尝试次数 >= 10 → 429 "too_many_attempts"
    - 验证码错误 → attempts++, 返回 400 "invalid_code"
6. 如果验证码正确:
    - 使用 bcrypt 哈希新密码
    - 更新 users.passwordHash
    - 标记验证码为已使用: consumedAt = NOW()
    - 撤销该用户的所有 refresh_tokens (安全考虑):
        - 更新 refresh_tokens: status = 'REVOKED', revokedAt = NOW(), revokeReason = 'password_reset'
    - 记录到 audit_logs (action='password_reset')
    - 返回成功

**成功响应 (200)**:

json

`{
  "success": true,
  "message": "Password has been reset successfully. Please log in with your new password."
}`

**错误响应**: 同 1.2 的验证码相关错误

---

### 1.10 修改密码 (已登录)

**端点**: `POST /api/auth-service/v1/identity/change-password`

**请求头**:

http

`Authorization: Bearer <access_token>`

**请求体**:

json

`{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword123!"
}`

**处理逻辑**:

1. 从 token 中提取 userId
2. 查询 User 记录
3. 使用 bcrypt.compare() 验证 currentPassword
4. 如果当前密码错误 → 返回 401 "invalid_current_password"
5. 验证 newPassword 强度
6. 检查新旧密码是否相同 → 返回 400 "same_password"
7. 使用 bcrypt 哈希新密码
8. 更新 users.passwordHash
9. 撤销该用户的所有 refresh_tokens (除了当前使用的):
    - 从当前 access_token 的 jti 找到对应的 refresh_token familyId
    - 撤销其他 familyId 的所有 refresh_tokens
10. 记录到 audit_logs (action='password_change')
11. 返回成功

**成功响应 (200)**:

json

`{
  "success": true,
  "message": "Password changed successfully"
}`

**错误响应**:

json

`*// 400 - 新旧密码相同*
{
  "error": "same_password",
  "detail": "New password must be different from the current password"
}

*// 401 - 当前密码错误*
{
  "error": "invalid_current_password",
  "detail": "Current password is incorrect"
}`

---

### 1.11 获取当前用户信息

**端点**: `GET /api/auth-service/v1/identity/profile`

**请求头**:

http

`Authorization: Bearer <access_token>`

**处理逻辑**:

1. 从 token 中提取 userId
2. 查询 User 记录 (排除 passwordHash, loginFailureCount 等敏感字段)
3. 返回用户信息

**成功响应 (200)**:

json

`{
  "success": true,
  "data": {
    "email": "user@example.com",
    "name": "张三",
    "phone": "+16729650830",
    "emailVerified": true,
    "createdAt": "2025-01-15T08:30:00.000Z",
    "updatedAt": "2025-01-15T08:30:00.000Z"
  }
}`

---

### 1.12 更新用户信息

**端点**: `PATCH /api/auth-service/v1/identity/profile`

**请求头**:

http

`Authorization: Bearer <access_token>`

**请求体**:

json

`{
  "name": "李四",
  "phone": "+8613900139000"
}`

**字段说明**:

- `name` (可选, string): 姓名
- `phone` (可选, string): 电话号码

**注意**: email 不能通过此接口修改,需要使用专门的修改邮箱接口

**处理逻辑**:

1. 从 token 中提取 userId
2. 验证提供的字段格式:
    - name: 2-50字符
    - phone: 使用 libphonenumber 验证
3. 更新 User 记录 (只更新提供的字段)
4. 记录到 audit_logs (action='profile_update', detail 中记录更新的字段)
5. 返回更新后的信息

**成功响应 (200)**:

json

`{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "email": "user@example.com",
    "name": "李四",
    "phone": "+8613900139000",
    "emailVerified": true,
    "createdAt": "2025-01-15T08:30:00.000Z",
    "updatedAt": "2025-01-16T10:30:00.000Z"
  }
}`

---

### 1.13 修改邮箱 (第1步: 请求验证码)

**端点**: `POST /api/auth-service/v1/identity/change-email`

**请求头**:

http

`Authorization: Bearer <access_token>`

**请求体**:

json

`{
  "newEmail": "newemail@example.com",
  "password": "Password123!"
}`

**处理逻辑**:

1. 从 token 中提取 userId
2. 查询 User 记录
3. 使用 bcrypt.compare() 验证 password (安全措施)
4. 如果密码错误 → 返回 401 "invalid_password"
5. 验证 newEmail 格式
6. 检查 newEmail 是否已被其他用户使用:
    - 查询 users 表 (by email = newEmail, emailVerifiedAt IS NOT NULL)
    - 如果存在 → 返回 409 "email_already_used"
7. 检查 Redis 速率限制 (同一 userId 5 分钟内只能请求一次)
8. 生成 6 位验证码
9. 使用 bcrypt 哈希验证码
10. 创建 email_verifications 记录:
    - purpose = 'email_change'
    - userId = 当前用户
    - sentTo = newEmail (重要!发送到新邮箱)
    - expiresAt = 30 分钟后
    - 在 detail 字段存储 JSON: `{ "oldEmail": "old@example.com", "newEmail": "new@example.com" }`
11. 发送验证邮件到新邮箱
12. 记录到 audit_logs (action='email_change_requested')
13. 返回成功

**成功响应 (200)**:

json

`{
  "success": true,
  "message": "Verification code has been sent to your new email address.",
  "data": {
    "newEmail": "newemail@example.com",
    "expiresIn": 1800
  }
}`

**错误响应**:

json

`*// 401 - 密码错误*
{
  "error": "invalid_password",
  "detail": "Password is incorrect"
}

*// 409 - 邮箱已被使用*
{
  "error": "email_already_used",
  "detail": "This email address is already registered"
}

*// 429 - 请求过于频繁*
{
  "error": "too_many_requests",
  "detail": "Please wait 5 minutes before requesting another email change"
}`

---

### 1.14 修改邮箱 (第2步: 确认验证码)

**端点**: `POST /api/auth-service/v1/identity/verification-email-change`

**请求头**:

http

`Authorization: Bearer <access_token>`

**请求体**:

json

`{
  "code": "123456"
}`

**处理逻辑**:

1. 从 token 中提取 userId
2. 查询 email_verifications:
    - 条件: userId, purpose='email_change', consumedAt IS NULL, expiresAt > NOW()
3. 验证码校验逻辑同 1.2
4. 如果验证码正确:
    - 从 detail 字段提取 newEmail
    - 再次检查 newEmail 是否已被其他用户使用 (防止竞态条件)
    - 如果已被使用 → 返回 409 "email_already_used"
    - 更新 users.email = newEmail
    - 更新 users.updatedAt = NOW()
    - 标记验证码为已使用: consumedAt = NOW()
    - 撤销该用户的所有 refresh_tokens (安全考虑,邮箱变更需要重新登录):
        - status = 'REVOKED', revokedAt = NOW(), revokeReason = 'email_changed'
    - 将当前 access_token 的 jti 加入 Redis 黑名单 (立即失效)
    - 记录到 audit_logs (action='email_changed', detail 中记录 oldEmail 和 newEmail)
    - 返回成功

**成功响应 (200)**:

json

`{
  "success": true,
  "message": "Email address has been changed successfully. Please log in again with your new email.",
  "data": {
    "newEmail": "newemail@example.com"
  }
}`

**错误响应**: 同 1.2 的验证码相关错误

---

### 关键设计点

1. **产品隔离**: 所有前端请求携带 `X-Product-Type` 请求头 (beauty/fb)
2. **注册流程**: 注册时只创建 User 账号,不创建组织
3. **OAuth2 标准**: 登录接口不直接返回 token,需调用 `/oauth/token`
4. **Token 设计**:
    - Access token: 60分钟过期,包含 userId, productType, organizationIds, permissions
    - Refresh token: 90天过期,支持家族化管理和轮换
5. **登出安全**: 撤销 refresh_token 家族 + access_token jti 加入 Redis 黑名单
6. **验证码机制**:
    - 6位数字验证码
    - bcrypt 哈希存储
    - 最多尝试10次
    - 最多重发5次
    - 30分钟过期 (密码重置10分钟)
7. **账户安全**:
    - 10次登录失败后锁定30分钟
    - 所有密码使用 bcrypt (salt rounds = 10)
    - 速率限制通过 Redis 实现
8. **审计日志**: 所有重要操作记录到 audit_logs

### 数据库表依赖

- users
- email_verifications
- login_attempts
- refresh_tokens
- audit_logs

### Redis Keys

- `resend:${email}:${purpose}` - 重发限制 (60秒)
- `token:blacklist:${jti}` - Token 黑名单 (TTL = token 剩余时间)
- 其他速率限制 keys (登录、注册、密码重置等)

---

# Auth Service v2.1.1 - 第二部分:Organization组织管理模块

## 2️⃣ Organization 组织管理模块 (`/api/auth-service/v1/organizations`)

### 业务规则说明

**组织所有权**:

- 所有组织(主店、分店、加盟店)的 `userId` 都是老板
- User (老板)拥有所有组织,但不直接管理店铺业务
- 店铺业务通过 Account 账号管理 (在第三部分设计)

**组织类型**:

- **MAIN (主店)**: 老板的第一个店铺, parentOrgId = null
- **BRANCH (分店)**: 分店, parentOrgId = 主店ID
- **FRANCHISE (加盟店)**: 加盟店, parentOrgId = 主店ID

**组织类型区别**:

- 主店和分店: 只能分配 MANAGER, STAFF 账号
- 加盟店: 可以分配 OWNER (加盟商), MANAGER, STAFF 账号
- 区别主要体现在 Account 权限,组织层面只通过 orgType 区分

**数据隔离**:

- 通过 orgId 隔离不同店铺的业务数据
- 所有请求需要携带 `X-Product-Type` 请求头
- User 在 beauty 前端只能看到 productType=beauty 的组织

---

### 2.1 创建组织

**端点**: `POST /api/auth-service/v1/organizations`

**请求头**:

`Authorization: Bearer <access_token>
X-Product-Type: beauty  // 或 fb`

**请求体**:

`{
  "orgName": "我的美容院总店",
  "orgType": "MAIN",
  "parentOrgId": null,
  "description": "专业美容服务",
  "location": "123 Main St, Vancouver, BC, V6B 1A1",
  "phone": "+16041234567",
  "email": "store@example.com"
}`

**字段说明**:

- `orgName` (必填, string): 组织名称, 2-100字符
- `orgType` (必填, enum): 组织类型, "MAIN" | "BRANCH" | "FRANCHISE"
- `parentOrgId` (条件必填, UUID): 父组织ID
    - MAIN: 必须为 null
    - BRANCH/FRANCHISE: 必填,必须是自己拥有的 MAIN 组织
- `description` (可选, text): 描述
- `location` (可选, string): 店铺地址
- `phone` (可选, string): 店铺电话,国际格式
- `email` (可选, string): 店铺邮箱

**处理逻辑**:

1. 从 access_token 中提取 userId 和 productType
2. 从请求头获取 `X-Product-Type`,验证与 token 中的 productType 一致
3. 验证 orgName 格式 (2-100字符)
4. 验证 phone 格式 (使用 libphonenumber)
5. 验证 email 格式
6. 根据 orgType 验证 parentOrgId:
    - 如果 orgType = 'MAIN':
        - parentOrgId 必须为 null
        - 用户可以拥有多个不同品牌的 MAIN 组织（例如：既是7分甜的老板，又是名创优品的老板）
    - 如果 orgType = 'BRANCH' 或 'FRANCHISE':
        - parentOrgId 必填
        - 查询 parent 组织,验证:
            - 存在且 userId = 当前用户
            - orgType = 'MAIN'
            - productType = 请求头的 productType
            - status = 'ACTIVE'
        - 如果验证失败 → 返回 400 "invalid_parent_org"
7. 创建 Organization 记录:
    - userId = 当前用户 ID (老板)
    - productType = 请求头的 X-Product-Type
    - status = 'ACTIVE'
8. 记录到 audit_logs (action='org_created')
9. 返回创建的组织信息

**成功响应 (201)**:

`{
  "success": true,
  "message": "Organization created successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "orgName": "我的美容院总店",
    "orgType": "MAIN",
    "productType": "beauty",
    "parentOrgId": null,
    "description": "专业美容服务",
    "location": "123 Main St, Vancouver, BC, V6B 1A1",
    "phone": "+16041234567",
    "email": "store@example.com",
    "status": "ACTIVE",
    "createdAt": "2025-01-16T10:00:00.000Z",
    "updatedAt": "2025-01-16T10:00:00.000Z"
  }
}`

**错误响应**:

`*// 400 - 父组织无效*
{
  "error": "invalid_parent_org",
  "detail": "Parent organization must be a MAIN organization that you own with matching product type"
}

`

---

### 2.2 获取用户的所有组织

**端点**: `GET /api/auth-service/v1/organizations`

**请求头**:

`Authorization: Bearer <access_token>
X-Product-Type: beauty  // 或 fb`

**查询参数**:

- `orgType` (可选, enum): 按组织类型筛选, "MAIN" | "BRANCH" | "FRANCHISE"
- `status` (可选, enum): 按状态筛选, "ACTIVE" | "SUSPENDED" | "DELETED"
    - 默认只返回 ACTIVE

**处理逻辑**:

1. 从 access_token 中提取 userId 和 productType
2. 从请求头获取 `X-Product-Type`,验证与 token 中的 productType 一致
3. 查询 organizations 表:
    - 条件: userId = 当前用户 AND productType = 请求头的 productType
    - 如果指定了 orgType → AND orgType = ?
    - 如果指定了 status → AND status = ?
    - 如果未指定 status → 默认只返回 ACTIVE
4. 按 orgType (MAIN优先), createdAt ASC 排序
5. 对于每个组织,如果有 parentOrgId,附加父组织的名称
6. 返回列表

**成功响应 (200)**:

`{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "orgName": "我的美容院总店",
      "orgType": "MAIN",
      "productType": "beauty",
      "parentOrgId": null,
      "description": "专业美容服务",
      "location": "123 Main St, Vancouver, BC",
      "phone": "+16041234567",
      "email": "main@example.com",
      "status": "ACTIVE",
      "createdAt": "2025-01-01T10:00:00.000Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "orgName": "市中心分店",
      "orgType": "BRANCH",
      "productType": "beauty",
      "parentOrgId": "550e8400-e29b-41d4-a716-446655440001",
      "parentOrgName": "我的美容院总店",
      "location": "456 Downtown St, Vancouver, BC",
      "status": "ACTIVE",
      "createdAt": "2025-01-10T10:00:00.000Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440003",
      "orgName": "东区加盟店",
      "orgType": "FRANCHISE",
      "productType": "beauty",
      "parentOrgId": "550e8400-e29b-41d4-a716-446655440001",
      "parentOrgName": "我的美容院总店",
      "location": "789 East St, Vancouver, BC",
      "status": "ACTIVE",
      "createdAt": "2025-01-15T10:00:00.000Z"
    }
  ],
  "total": 3
}`

---

### 2.3 获取单个组织详情

**端点**: `GET /api/auth-service/v1/organizations/:orgId`

**请求头**:

`Authorization: Bearer <access_token>`

**处理逻辑**:

1. 从 access_token 中提取 userId 和 organizationIds
2. 查询 organizations 表 (by id = orgId)
3. 如果不存在 → 返回 404 "org_not_found"
4. 检查权限:
    - 如果 userId != org.userId → 返回 403 "access_denied"
5. 如果有 parentOrgId,查询父组织信息 (id 和 orgName)
6. 统计子组织数量:
    - branchCount: orgType=BRANCH 且 status=ACTIVE
    - franchiseCount: orgType=FRANCHISE 且 status=ACTIVE
7. 返回详细信息

**成功响应 (200)**:

`{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "orgName": "我的美容院总店",
    "orgType": "MAIN",
    "productType": "beauty",
    "parentOrgId": null,
    "description": "专业美容服务",
    "location": "123 Main St, Vancouver, BC, V6B 1A1",
    "phone": "+16041234567",
    "email": "main@example.com",
    "status": "ACTIVE",
    "createdAt": "2025-01-01T10:00:00.000Z",
    "updatedAt": "2025-01-01T10:00:00.000Z",
    "statistics": {
      "branchCount": 2,
      "franchiseCount": 1
    }
  }
}`

**分店/加盟店的响应示例**:

`{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "orgName": "市中心分店",
    "orgType": "BRANCH",
    "productType": "beauty",
    "parentOrgId": "550e8400-e29b-41d4-a716-446655440001",
    "parentOrgName": "我的美容院总店",
    "description": "市中心旗舰店",
    "location": "456 Downtown St, Vancouver, BC",
    "phone": "+16042345678",
    "email": "downtown@example.com",
    "status": "ACTIVE",
    "createdAt": "2025-01-10T10:00:00.000Z",
    "updatedAt": "2025-01-10T10:00:00.000Z"
  }
}`

**错误响应**:

`*// 403 - 无权访问*
{
  "error": "access_denied",
  "detail": "You don't have permission to access this organization"
}

*// 404 - 组织不存在*
{
  "error": "org_not_found",
  "detail": "Organization not found"
}`

---

### 2.4 更新组织信息

**端点**: `PUT /api/auth-service/v1/organizations/:orgId`

**请求头**:

`Authorization: Bearer <access_token>`

**请求体**:

`{
  "orgName": "我的美容院总店(更新)",
  "description": "专业美容服务 - 10年老店",
  "location": "新地址",
  "phone": "+16047654321",
  "email": "newemail@example.com"
}`

**字段说明**:

- `orgName` (可选, string): 组织名称
- `description` (可选, text): 描述
- `location` (可选, string): 地址
- `phone` (可选, string): 电话
- `email` (可选, string): 邮箱

**注意**: 不能修改 orgType, productType, parentOrgId, userId, status

**处理逻辑**:

1. 从 access_token 中提取 userId
2. 查询 organizations 表 (by id = orgId)
3. 如果不存在 → 返回 404
4. 检查权限: userId != org.userId → 返回 403
5. 验证提供的字段格式
6. 更新 Organization 记录 (只更新提供的字段)
7. updatedAt = NOW()
8. 记录到 audit_logs (action='org_updated', detail 中记录更新的字段)
9. 返回更新后的信息

**成功响应 (200)**:

`{
  "success": true,
  "message": "Organization updated successfully",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "orgName": "我的美容院总店(更新)",
    "orgType": "MAIN",
    "productType": "beauty",
    "description": "专业美容服务 - 10年老店",
    "location": "新地址",
    "phone": "+16047654321",
    "email": "newemail@example.com",
    "status": "ACTIVE",
    "createdAt": "2025-01-01T10:00:00.000Z",
    "updatedAt": "2025-01-16T15:00:00.000Z"
  }
}`

---

### 2.5 删除组织 (软删除)

**端点**: `DELETE /api/auth-service/v1/organizations/:orgId`

**请求头**:

`Authorization: Bearer <access_token>`

**处理逻辑**:

1. 从 access_token 中提取 userId
2. 查询 organizations 表 (by id = orgId)
3. 如果不存在 → 返回 404
4. 检查权限: userId != org.userId → 返回 403
5. 检查是否有活跃的子组织:
    - 查询 organizations (parentOrgId = orgId, status = 'ACTIVE')
    - 如果存在 → 返回 400 "has_active_children"
6. 检查是否有活跃的账号:
    - 查询 accounts 表 (orgId = orgId, status = 'ACTIVE')
    - 如果存在 → 返回 400 "has_active_accounts"
7. 软删除:
    - status = 'DELETED'
    - updatedAt = NOW()
8. 记录到 audit_logs (action='org_deleted')
9. 返回成功

**成功响应 (200)**:

`{
  "success": true,
  "message": "Organization deleted successfully"
}`

**错误响应**:

`*// 400 - 有活跃的子组织*
{
  "error": "has_active_children",
  "detail": "Cannot delete organization with active branches or franchises. Please delete them first."
}

*// 400 - 有活跃的账号*
{
  "error": "has_active_accounts",
  "detail": "Cannot delete organization with active accounts. Please delete all accounts first."
}`

---

# Auth Service v2.1.1 - 第三部分:Account账号管理模块

## 3️⃣ Account 账号管理模块 (/api/auth-service/v1/accounts)

---

## 📋 业务规则说明

### Account 类型

**OWNER (加盟商)**

- 拥有加盟店的管理权限
- 仅适用于 FRANCHISE (加盟店) 类型的组织

**MANAGER (经理)**

- 管理组织的日常运营
- 适用于所有类型的组织

**STAFF (员工)**

- 执行具体业务操作
- 适用于所有类型的组织

---

### 创建权限

**User (老板) 的创建权限:**

- 对于主店/分店 (MAIN/BRANCH): 只能创建 MANAGER
- 对于加盟店 (FRANCHISE): 只能创建 OWNER,且每个加盟店仅限1个 OWNER
- 必须是组织的所有者 (org.userId = 当前User)
- 可以查看所有自己拥有的组织的账号信息(只读)

**加盟店 OWNER 的创建权限:**

- 只能为自己所在的加盟店创建 MANAGER 和 STAFF
- (如果所在加盟店订阅了business-service,可以管理自己所在的加盟店未来实现的全部business-service,暂时还没有开发business-service但是scope要写清楚.)

**MANAGER 的创建权限:**

- 只能为自己所在的组织创建 STAFF
- (如果所在加盟店订阅了business-service,可以管理自己所在的加盟店未来实现的全部business-service,暂时还没有开发business-service但是scope要写清楚.)

**STAFF:**

- 无创建权限

---

### 登录方式

**后台登录 (Owner / Manager):**

- 认证方式: username + password
- Token类型:
    - access_token 有效期 60分钟
    - refresh_token 有效期 30天 (固定,Uber方式)

**POS登录 (Owner / Manager / Staff):**

- 认证方式: employeeNumber + pinCode + 设备绑定
- Token类型:
    - access_token 有效期 4.5小时 (16200秒)
    - 无 refresh_token,到期需重新登录

---

### 账号字段说明

**所有角色都有的字段:**

- employeeNumber: 员工号,组织内唯一,(数据库里存的是string形式,因为有些店老板喜欢用编号代表员工,有些店老板喜欢用名字,甚至是中文名字,所以这个字段需要支持utf-8,允许用名字,也允许用数字)
- pinCode: 4位数字PIN码,用于POS登录

**仅 OWNER 和 MANAGER 有的字段:**

- username: 用户名,全局唯一,用于后台登录
- password: 密码,用于后台登录

**STAFF 特点:**

- 没有 username 和 password
- 只能通过 POS 登录

**存储规则:**

- password 和 pinCode 均使用 bcrypt Hash 存储
- PIN码创建/重置时显示一次明文,之后无法查看,只能重置

---

### Token 管理

**后台登录的 Token:**

- access_token: 60分钟有效期
- refresh_token: 30天固定不变
- 刷新机制: Uber 方式,复用 refresh_token,只刷新 access_token

**POS登录的 Token:**

- access_token: 4.5小时有效期 (16200秒)
- 无 refresh_token
- 到期后必须重新登录

---

## 🔐 3.1 Account 后台登录 (Owner/Manager) 

**端点:** `POST /api/auth-service/v1/accounts/login`

**请求头:**

`X-Product-Type: beauty  // 或 fb`

**请求体:**

`{
  "username": "manager001",
  "password": "Password123!"
}`

**字段说明:**

- username (必填, string): 账号用户名, username中不能含有@符号
- password (必填, string): 密码

**处理逻辑:**

1. 从请求头获取 X-Product-Type
2. 验证 username 和 password 格式
3. 查询 accounts 表 (by username, status != 'DELETED')
4. 如果不存在 → 返回 401 "invalid_credentials"
5. 检查账户类型: 如果 accountType = 'STAFF' → 返回 400 "staff_no_backend_access"
6. 检查账户状态: 如果 status != 'ACTIVE' → 返回 401 "account_suspended"
7. 使用 bcrypt.compare() 验证密码,如果错误 → 返回 401 "invalid_credentials"
8. 查询关联的 organization,验证 productType 和 status
9. 更新 accounts.lastLoginAt = NOW()
10. 记录到 login_attempts 和 audit_logs
11. 返回账号和组织信息

**成功响应 (200):**

`{
  "success": true,
  "account": {
    "id": "account-uuid",
    "username": "manager001",
    "employeeNumber": "EMP001",
    "accountType": "MANAGER",
    "productType": "beauty",
    "status": "ACTIVE",
    "lastLoginAt": "2025-01-16T10:00:00.000Z"
  },
  "organization": {
    "id": "org-uuid",
    "orgName": "市中心分店",
    "orgType": "BRANCH",
    "productType": "beauty",
    "status": "ACTIVE"
  }
}`

**注意:** 登录成功后,前端自动调用 /oauth/token 获取 access_token 和 refresh_token

**错误响应:**

- 400 staff_no_backend_access: "Staff accounts cannot access the backend system. Please use POS login."
- 401 invalid_credentials: "Username or password is incorrect"
- 401 account_suspended: "This account has been suspended. Please contact your administrator."
- 403 org_inactive_or_mismatch: "Organization is inactive or does not match the product type"

---

## 📱 3.2 Account POS 登录 (Owner/Manager/STAFF)

**端点:** `POST /api/auth-service/v1/accounts/login-pos`

**请求头:**

`X-Product-Type: fb
X-Device-ID: device-uuid  // 必须
X-Device-Fingerprint: {...}  // 可选,JSON字符串`

**请求体:**

`{
  "pinCode": "1234"
}`

**字段说明:**

- pinCode (必填, string): 4位数字 PIN 码
- deviceId 从请求头自动获取,不在请求体中

**处理逻辑:**

1. 从请求头获取 X-Device-ID, X-Product-Type, X-Device-Fingerprint(可选)
2. 验证 pinCode 格式
3. 查询 devices 表验证设备存在且 status = 'ACTIVE'
4. 获取 device.orgId
5. 在该组织下查询 pinCode 对应的账号
6. 使用 bcrypt.compare() 验证 pinCode
7. 验证组织的 productType 和 status
8. 可选:如果提供设备指纹,记录/对比变化(不阻止登录)
9. 更新 devices.lastActiveAt 和 accounts.lastLoginAt
10. 记录到 login_attempts 和 audit_logs
11. 返回账号、组织和设备信息

**成功响应 (200):**

`{
  "success": true,
  "account": {
    "id": "account-uuid",
    "employeeNumber": "EMP001",
    "accountType": "STAFF",
    "productType": "fb",
    "status": "ACTIVE",
    "lastLoginAt": "2025-01-16T10:00:00.000Z"
  },
  "organization": {
    "id": "org-uuid",
    "orgName": "市中心分店",
    "orgType": "BRANCH",
    "productType": "fb",
    "status": "ACTIVE"
  },
  "device": {
    "id": "device-uuid",
    "deviceName": "POS-001",
    "deviceType": "POS"
  }
}`

**注意:** 登录成功后,前端自动调用 /oauth/token 获取 4.5小时 有效的 access_token (无 refresh_token)

**错误响应:**

- 401 invalid_credentials: "PIN code is incorrect"
- 403 device_not_authorized: "This device is not authorized for your organization or is inactive"
- 404 device_not_found: "Device not found"

---

## 🔑 3.3 获取 OAuth Token (统一端点)
参考1.5

---

## 🔄 3.4 刷新 Token (后台登录专用)
参考1.6

---

## 🚪 3.5 Account 登出

**端点:** `POST /api/auth-service/v1/accounts/logout`

**请求头:**

`Authorization: Bearer <access_token>`

**请求体:**

后台登出时:

`{
  "refresh_token": "def502004a8b7e2c..."
}`

POS 登出时:

`{}`

**处理逻辑:**

1. 从 Bearer token 中提取 accountId, jti, deviceId(如果有)
2. 判断登录类型: 如果 payload 有 deviceId → POS登录
3. 如果是后台登录: 撤销 refresh_token (status='REVOKED')
4. 如果是 POS登录: 更新 devices.lastActiveAt
5. 将 access_token 的 jti 加入 Redis 黑名单
6. 记录到 audit_logs

**成功响应 (200):**

`{
  "success": true,
  "message": "Logged out successfully"
}`

---

## ➕ 3.6 创建 Account

**端点:** `POST /api/auth-service/v1/accounts`

**请求头:**

`Authorization: Bearer <access_token>`

**请求体:**

创建 OWNER 或 MANAGER:

`{
  "orgId": "org-uuid",
  "accountType": "MANAGER",
  "productType": "beauty",
  "username": "manager001",
  "password": "Password123!",
  "employeeNumber": "EMP001",
  "pinCode": "1234"
}`

创建 STAFF:

`{
  "orgId": "org-uuid",
  "accountType": "STAFF",
  "productType": "beauty",
  "employeeNumber": "EMP002",
  "pinCode": "5678"
}`

**字段说明:**

- orgId (必填, UUID): 所属组织ID
- accountType (必填, enum): "OWNER" | "MANAGER" | "STAFF"
- productType (必填, enum): "beauty" | "fb"
- username (条件必填, string): OWNER/MANAGER必填,全局唯一,4-50字符,不能包含@符号.
- password (条件必填, string): OWNER/MANAGER必填,至少8位,包含大小写字母和数字
- employeeNumber (必填, string): 员工号,组织内唯一
- pinCode (必填, string): 4位数字,创建的时候需要检查org内唯一,不能重复.

**权限规则:**

- User: 主店/分店可以创建MANAGER/STAFF, 加盟店只能创建OWNER(限1个)
- OWNER: 只能创建MANAGER和STAFF
- MANAGER: 只能创建STAFF
- STAFF: 无权限

**成功响应 (201):**

`{
  "success": true,
  "message": "Account created successfully",
  "data": {
    "id": "account-uuid",
    "orgId": "org-uuid",
    "accountType": "MANAGER",
    "productType": "beauty",
    "username": "manager001",
    "employeeNumber": "EMP001",
    "pinCode": "1234",
    "status": "ACTIVE",
    "createdAt": "2025-01-16T10:00:00.000Z"
  },
  "warning": "Please save the PIN code. It will not be displayed again after this response."
}`

**错误响应:**

- 403 can_not_create_owner: "You can not create OWNER accounts for MAIN and BRANCH organizations".
- 403 can_only_create_owner: "You can only create OWNER account for FRANCHISE organizations"
- 403 can_only_create_staff: "Managers can only create STAFF accounts"
- 409 owner_already_exists: "This franchise organization already has an OWNER account"
- 409 employee_number_exists: "This employee number already exists in this organization"
- 409 username_already_exists: "This username is already taken"
- 409 pinCode_already_exists: "This pin is already taken"

---

## 📋 3.7 获取组织的所有 Account

**端点:** `GET /api/auth-service/v1/accounts`

**请求头:**

`Authorization: Bearer <access_token>`

**查询参数:**

- orgId (条件必填, UUID): 组织ID
  - **User token**: 必须提供（因为 User 可能拥有多个组织）
  - **Account token** (OWNER/MANAGER): 可选，不提供时自动使用 token 中的 organizationId
- accountType (可选, enum): "OWNER" | "MANAGER" | "STAFF"
- status (可选, enum): "ACTIVE" | "SUSPENDED" | "DELETED", 默认只返回ACTIVE

**权限规则（按组织类型区分）:**

**User (老板) 的权限：**
- **MAIN/BRANCH 组织**: 可查看所有 MANAGER 和 STAFF（因为都是他直接雇佣的员工）
  - ✅ 可查看：MANAGER, STAFF
  - ❌ 不存在 OWNER（MAIN/BRANCH 不允许有 OWNER）
- **FRANCHISE 组织**: 只能查看 OWNER（因为只有 OWNER 是他创建的加盟商）
  - ✅ 可查看：OWNER
  - ❌ 不可查看：MANAGER, STAFF（这些是 OWNER 的员工，不是 User 的员工）

**OWNER (加盟商老板) 的权限：**
- 可查看同组织的所有 MANAGER 和 STAFF（他的员工）
  - ✅ 可查看：MANAGER, STAFF
  - ❌ 不可查看：其他 OWNER（不存在多个 OWNER）

**MANAGER (经理) 的权限：**
- 可查看同组织的其他 MANAGER 和所有 STAFF（同事和下属）
  - ✅ 可查看：其他 MANAGER, STAFF
  - ❌ 不可查看：OWNER（上级老板）

**STAFF (员工) 的权限：**
- ❌ 无任何查询权限

**场景举例:**

**场景1: User 查询 MAIN 组织（7分甜总部直营店）**
```http
GET /api/auth-service/v1/accounts?orgId=main-org-uuid
Authorization: Bearer <user-token>
```
返回: 该店的所有 MANAGER 和 STAFF（User 的员工）

**场景2: User 查询 FRANCHISE 组织（东区加盟店）**
```http
GET /api/auth-service/v1/accounts?orgId=franchise-org-uuid
Authorization: Bearer <user-token>
```
返回: 只有该加盟店的 OWNER（User 创建的加盟商）
不返回: 该加盟店的 MANAGER 和 STAFF（这些是 OWNER 的员工）

**场景3: OWNER 查询自己的加盟店**
```http
GET /api/auth-service/v1/accounts
Authorization: Bearer <owner-token>
```
返回: 该加盟店的所有 MANAGER 和 STAFF（OWNER 的员工）

**场景4: MANAGER 查询同组织员工**
```http
GET /api/auth-service/v1/accounts
Authorization: Bearer <manager-token>
```
返回: 该组织的其他 MANAGER 和所有 STAFF（同事和下属）
不返回: OWNER（上级老板）

**成功响应 (200):**

`{
  "success": true,
  "data": [
    {
      "id": "account-uuid-1",
      "orgId": "org-uuid",
      "accountType": "OWNER",
      "productType": "beauty",
      "username": "franchisee001",
      "employeeNumber": "EMP000",
      "status": "ACTIVE",
      "lastLoginAt": "2025-01-16T09:00:00.000Z",
      "createdAt": "2025-01-15T10:00:00.000Z"
    }
  ],
  "total": 3
}`

---

## 🔍 3.8 获取单个 Account 详情

**端点:** `GET /api/auth-service/v1/accounts/:accountId`

**请求头:**

`Authorization: Bearer <access_token>`

**权限规则:**

- User: 只能查看自己自己的franchise店的OWNER以及自己的main店和branch店的MANAGER和STAFF
- OWNER: 可查看同组织所有人
- MANAGER: 只能查看同组织的STAFF
- STAFF: 无权限

**成功响应 (200):**

`{
  "success": true,
  "data": {
    "id": "account-uuid",
    "orgId": "org-uuid",
    "orgName": "东区加盟店",
    "accountType": "MANAGER",
    "productType": "beauty",
    "username": "manager001",
    "employeeNumber": "EMP001",
    "status": "ACTIVE",
    "lastLoginAt": "2025-01-16T08:30:00.000Z",
    "createdAt": "2025-01-15T10:05:00.000Z",
    "updatedAt": "2025-01-16T08:30:00.000Z",
    "createdBy": "user-uuid"
  }
}`

---

## ✏️ 3.9 更新 Account 信息

**端点:** `PATCH /api/auth-service/v1/accounts/:accountId`

**请求头:**

`Authorization: Bearer <access_token>`

**请求体:**

`{
  "username": "manager001-new",
  "status": "SUSPENDED"
}`

**可修改字段:**

- username (可选, string): 仅OWNER/MANAGER
- status (可选, enum): "ACTIVE" | "SUSPENDED"

**不可修改:**

- accountType, productType, orgId, employeeNumber, password, pinCode

**权限规则:**

- User: 除了FRANCHISE的MANAGER和STAFF以外都可以修改。
- OWNER: 可修改同组织的MANAGER和STAFF(不能修改自己)
- MANAGER: 只能修改同组织的STAFF(不能修改自己)

**成功响应 (200):**

`{
  "success": true,
  "message": "Account updated successfully",
  "data": {
    "id": "account-uuid",
    "username": "manager001-new",
    "status": "SUSPENDED",
    "updatedAt": "2025-01-16T15:00:00.000Z"
  }
}`

---

## 🗑️ 3.10 删除 Account (软删除)

**端点:** `DELETE /api/auth-service/v1/accounts/:accountId`

**请求头:**

`Authorization: Bearer <access_token>`

**删除规则:**

- User删除OWNER: 级联删除该组织所有MANAGER和STAFF
- OWNER删除MANAGER: 不级联,STAFF保留
- MANAGER删除STAFF: 直接删除
- 不能删除自己

**权限规则:**

- User: 可删除自己创建的OWNER和MAIN或者BRANCH的所有MANAGER和STAFF
- OWNER: 可删除同组织的MANAGER和STAFF
- MANAGER: 只能删除同组织的STAFF

**成功响应 (200):**

`{
  "success": true,
  "message": "Account deleted successfully"
}`

级联删除时:

`{
  "success": true,
  "message": "Account and all subordinates deleted successfully",
  "deletedCount": 5
}`

**错误响应:**

- 400 cannot_delete_self: "You cannot delete your own account"
- 403 insufficient_permissions: "You don't have permission to delete this account"

---

## 🔒 3.11 修改自己的密码

**端点:** `POST /api/auth-service/v1/accounts/change-password`

**请求头:**

`Authorization: Bearer <access_token>`

**请求体:**

`{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewPassword456!"
}`

**权限规则:**

- **仅 ACCOUNT 类型的 token 可以使用此端点** (USER token 无权使用)
- 仅适用于 OWNER 和 MANAGER (有 username/password 的账号)
- STAFF 无密码，调用返回 400

**处理逻辑:**

1. 验证 token 必须是 ACCOUNT 类型
2. 验证当前密码是否正确
3. 验证新密码强度 (至少 8 位)
4. 更新密码
5. 撤销该账号所有 refresh_tokens (强制重新登录)

**成功响应 (200):**

`{
  "success": true,
  "message": "Password changed successfully. Please log in again with your new password."
}`

---

## 🔑 3.12 重置 Account 密码 (管理员操作)

**端点:** `POST /api/auth-service/v1/accounts/:accountId/reset-password`

**请求头:**

`Authorization: Bearer <access_token>`

**请求体:**

`{
  "newPassword": "NewPassword123!"
}`

**权限规则 (根据组织类型):**

**USER Token:**
- **MAIN/BRANCH 组织**: 只能为 MANAGER 重置密码 (STAFF 无密码)
- **FRANCHISE 组织**: 无权为任何人重置密码 (OWNER/MANAGER/STAFF 都属于 OWNER，不属于 USER)

**ACCOUNT Token:**
- **OWNER**: 只能为同组织的 MANAGER 重置密码
- **MANAGER**: 无权重置任何人的密码
- **STAFF**: 无权限

**限制:**
- STAFF 无密码，调用返回 400
- 重置密码后会撤销目标账号的所有 refresh_tokens，强制目标账号重新登录

**成功响应 (200):**

`{
  "success": true,
  "message": "Password has been reset successfully. The account must log in again."
}`

---

## 📌 3.13 重置 Account 的 PIN 码

**端点:** `POST /api/auth-service/v1/accounts/:accountId/reset-pin`

**请求头:**

`Authorization: Bearer <access_token>`

**请求体:**

`{
  "newPinCode": "5678"
}`

**权限规则 (根据组织类型):**

**USER Token:**
- **MAIN/BRANCH 组织**: 可为 MANAGER 和 STAFF 重置 PIN
- **FRANCHISE 组织**: 只能为 OWNER 重置 PIN (MANAGER/STAFF 属于 OWNER，不属于 USER)

**ACCOUNT Token:**
- **OWNER**: 可为组织内所有人重置 PIN (包括自己、MANAGER、STAFF)
- **MANAGER**: 只能为 STAFF 和自己重置 PIN
  - 不能为其他 MANAGER 重置 (平级)
  - 不能为 OWNER 重置 (上级)
- **STAFF**: 无权限

**成功响应 (200):**

`{
  "success": true,
  "message": "PIN code has been reset successfully",
  "newPinCode": "5678",
  "warning": "Please save this PIN code. It will not be displayed again."
}`

**注意:**
- newPinCode 仅在此响应中显示一次，请妥善保存
- PIN 码必须是 4 位数字

---

## 🔐 数据库约束

**employeeNumber 唯一性 (组织内,仅ACTIVE):**

sql

`CREATE UNIQUE INDEX idx_accounts_org_employee_active 
ON accounts (org_id, employee_number) 
WHERE status = 'ACTIVE';`

**username 唯一性 (全局,仅ACTIVE):**

sql

`CREATE UNIQUE INDEX idx_accounts_username_active 
ON accounts (username) 
WHERE status = 'ACTIVE' AND username IS NOT NULL;`

这样软删除后 employeeNumber 和 username 可以被重用。

---

# Auth Service v2.1.1 - 第四部分:Device设备管理模块 (最终版)

## 4️⃣ Device 设备管理模块 (/api/auth-service/v1/devices)

---

## 📋 业务规则说明

### 设备类型 (deviceType)

**POS (Point of Sale)**

- 销售点终端设备
- 用于处理交易、收银等操作
- 员工使用，需要 POS 登录

**KIOSK**

- 自助服务终端
- 用于客户自助下单、查询等
- 顾客使用，不需要登录

**TABLET**

- 平板设备
- 用于移动收银、点单等
- 员工使用，需要 POS 登录

---

### 设备状态 (status)

**PENDING (待激活)**

- 设备刚创建，拥有 deviceId 和 activationCode
- 等待在物理机器上输入这一对号码激活
- 不能用于 POS 登录或业务操作

**ACTIVE (已激活)**

- 设备已在物理机器上激活
- 可以正常使用，员工可以 POS 登录（POS/TABLET）
- 顾客可以使用自助服务（KIOSK）
- 有效期为 1 年

**DELETED (已删除)**

- 软删除状态
- 设备记录保留，但不可用
- 不可恢复

---

### 激活码机制

**激活码特点:**

- 全局唯一
- 与 deviceId 成对使用
- 必须同时输入 deviceId + activationCode 才能激活设备
- 激活后不会失效（除非手动更新激活码）
- 没有过期时间

**激活流程:**

1. User 在后台创建设备（选择 deviceType，填写 orgId）
2. 系统生成 deviceId 和 activationCode 一对
3. User 将这一对号码告知现场人员
4. 现场人员在物理机器上输入 deviceId + activationCode + deviceName
5. 系统验证配对是否正确
6. 设备状态变为 ACTIVE，记录激活时间和有效期（1年）

**更新激活码的场景:**

- User 想为某台设备更换物理机器
- 需要提供 deviceId + orgId + deviceType + 原activationCode
- 前提：设备状态必须是 ACTIVE
- 系统生成新的 activationCode
- 原机器失效，等待新机器用新码激活

---

### 设备生命周期管理

**有效期规则:**

- 激活时设置 expiresAt = NOW() + 1年
- 设备状态完全由用户或管理员手动管理

**活跃时间更新:**

- **POS/TABLET**: 员工 POS 登录时自动更新 lastActiveAt
- **KIOSK**: 业务操作时更新 lastActiveAt（由业务模块处理，auth-service 不涉及）

---

### 创建权限

**User (老板):**

- 可以为自己拥有的任何组织创建设备
- 创建时自动生成唯一的 deviceId 和 activationCode

**Account (OWNER/MANAGER/STAFF):**

- 无创建权限
- 只有 User 可以创建设备

---

### 查看权限

**User:**

- 可以查看所有自己拥有的组织的设备

**Account (OWNER/MANAGER):**

- 只能查看自己所在组织的设备

**Account (STAFF):**

- 无后台访问权限

---

### 修改/删除权限

**User:**

- 可以修改所有自己拥有的组织的设备
- 可以删除设备（软删除）
- 可以更新激活码

**Account (OWNER/MANAGER):**

- 只能修改设备名称 (deviceName)
- 不能删除设备
- 不能更新激活码

**Account (STAFF):**

- 无后台访问权限

---

## ➕ 4.1 创建设备（生成激活码）

**端点:** `POST /api/auth-service/v1/devices`

**请求头:**

`Authorization: Bearer <access_token>`

**请求体:**

`{
  "orgId": "org-uuid",
  "deviceType": "POS",
  "deviceName":"POS-001"
}`

**字段说明:**

- orgId (必填, UUID): 所属组织ID
- deviceType (必填, enum): "POS" | "KIOSK" | "TABLET"
- deviceName (必填, string):只有user创建设备时可以命名机器.

---

### 处理逻辑

1. 从 access_token 中提取 userType, userId,只有user的token可以,account的token不可以.
2. 如果 userType != 'USER' → 返回 403 "only_user_can_create_device"
3. 查询组织，验证 org.userId = 当前 User ID
4. 验证deviceName在该org中唯一
5. 验证 org.status = 'ACTIVE'
6. 生成唯一的 activationCode（9位大写字母数字）
7. 生成唯一的deviceId(9位小写字母数字组合)
8. 创建设备记录:
    - id (UUID) = deviceId
    - orgId
    - deviceType
    - deviceName = “POS-001”
    - activationCode
    - status = 'PENDING'
    - createdAt = NOW()
    - updatedAt = NOW()
9. 记录到 audit_logs
10. 返回 deviceId 和 activationCode

---

### 成功响应 (201)

`{
  "success": true,
  "message": "Device created successfully",
  "data": {
    "deviceId": "device-uuid",
    "orgId": "org-uuid",
    "orgName": "市中心分店",
    "deviceType": "POS",
    "deviceName": "POS-001",
    "activationCode": "ABC123XYZ",
    "status": "PENDING",
    "createdAt": "2025-01-16T10:00:00.000Z"
  },
  "warning": "Please save the deviceId and activationCode. Both are required to activate the device on-site."
}`

**注意:** deviceId 和 activationCode 必须同时使用才能激活设备

---

### 错误响应

**403 - 权限不足**

`{
  "error": "only_user_can_create_device",
  "detail": "Only User (owner) can create devices"
}`

**404 - 组织不存在**

`{
  "error": "org_not_found",
  "detail": "Organization not found"
}`

**403 - 无权限访问此组织**

`{
  "error": "access_denied",
  "detail": "You don't have permission to create devices for this organization"
}`

**403 - deviceName重复**

`{
  "error": "deviceName_repeated",
  "detail": "The device name is occupied."
}`

---

## 🔓 4.2 激活设备

**端点:** `POST /api/auth-service/v1/devices/activate`

**请求头:**

`X-Product-Type: beauty  // 或 fb
X-Device-Fingerprint: {...}  // 可选，设备指纹JSON`

**请求体:**

`{
  "deviceId": "device-uuid",
  "activationCode": "ABC123XYZ"
}`

**字段说明:**

- deviceId (必填, UUID): 设备ID
- activationCode (必填, string): 9位激活码

**注意:** 此接口不需要 Authorization，因为设备还未激活

---

### 处理逻辑

1. 验证 deviceId 和 activationCode 格式
2. 查询设备:

   `SELECT * FROM devices 
   WHERE id = deviceId 
     AND activation_code = activationCode 
     AND status = 'PENDING'`

1. 如果不存在 → 返回 404 "invalid_device_or_code"
2. 如果 status != 'PENDING' → 返回 400 "device_already_activated"
3. 查询组织，验证 org.status = 'ACTIVE'
4. 验证 org.productType = 请求头的 productType
5. 激活设备:
    - status = 'ACTIVE'
    - deviceName = "收银台-001"
    - activatedAt = NOW()
    - lastActiveAt = NOW()
    - deviceFingerprint = 请求头的 deviceFingerprint（如果有）
    - updatedAt = NOW()
6. 记录到 audit_logs
7. 返回设备信息

---

### 成功响应 (200)

`{
  "success": true,
  "message": "Device activated successfully",
  "data": {
    "id": "device-uuid",
    "orgId": "org-uuid",
    "orgName": "市中心分店",
    "deviceType": "POS",
    "deviceName": "收银台-001",
    "status": "ACTIVE",
    "activatedAt": "2025-01-16T10:30:00.000Z"
  }
}`

---

### 错误响应

**404 - 设备ID或激活码无效**

`{
  "error": "invalid_device_or_code",
  "detail": "Invalid deviceId or activationCode, or device already activated"
}`

**400 - 设备已激活**

`{
  "error": "device_already_activated",
  "detail": "This device has already been activated"
}`

**403 - 组织未激活**

`{
  "error": "org_inactive",
  "detail": "The organization is inactive. Please contact support."
}`

---

## 🔄 4.3 更新激活码

**端点:** `POST /api/auth-service/v1/devices/:deviceId/update-activation-code`

**请求头:**

`Authorization: Bearer <access_token>`

**请求体:**

`{
  "orgId": "org-uuid",
  "deviceType": "POS",
  "newDeviceName":"POS-001",
  "currentActivationCode": "ABC123XYZ"
}`

**字段说明:**

- orgId (必填, UUID): 组织ID
- deviceType (必填, enum): "POS" | "KIOSK" | "TABLET"
- newDeviceName (选填, string): "如果没填还沿用之前的名字,填了就检查新名字是否重复,不重复可以用,重复就返回报错.例如POS-001"
- currentActivationCode (必填, string): 当前的激活码

---

### 处理逻辑

1. 从 access_token 中提取 userType, userId
2. 如果 userType != 'USER' → 返回 403 "only_user_can_update_code"
3. 查询设备 (by id = deviceId)
4. 如果不存在 → 返回 404 "device_not_found"
5. 验证设备信息:
    - device.orgId = 请求体的 orgId
    - device.deviceType = 请求体的 deviceType
    - device.activationCode = 请求体的 currentActivationCode
    - 如果不匹配 → 返回 400 "device_info_mismatch"
    - 检查是否填写了新名字,如果没有填写新名字沿用之前的名字
    - 如果填写了新名字检查新名字是否重复,如果重复 -> 报错.不重复则可用
6. 验证设备状态:
    - 如果 status != 'ACTIVE' → 返回 400 "device_not_active"
7. 查询组织，验证 org.userId = 当前 User ID
8. 生成新的 activationCode
9.  更新设备:
    - status = 'PENDING'（回到待激活状态）
    - activationCode = 新激活码
    - deviceName = "newDeviceName"
    - activatedAt = NULL
    - lastActiveAt = NULL
    - deviceFingerprint = NULL
    - updatedAt = NOW()
10. 记录到 audit_logs
11. 返回新的 activationCode

---

### 成功响应 (200)

`{
  "success": true,
  "message": "Activation code updated successfully. The previous device is now deactivated.",
  "data": {
    "deviceId": "device-uuid",
    "orgId": "org-uuid",
    "deviceType": "POS",
    "deviceName": "POS-001"
    "newActivationCode": "XYZ789ABC",
    "status": "PENDING"
  },
  "warning": "Please save the new activation code. The device must be activated again with this new code."
}`

---

### 错误响应

**403 - 权限不足**

`{
  "error": "only_user_can_update_code",
  "detail": "Only User (owner) can update activation code"
}`

**404 - 设备不存在**

`{
  "error": "device_not_found",
  "detail": "Device not found"
}`

**400 - 设备信息不匹配**

`{
  "error": "device_info_mismatch",
  "detail": "Device orgId, deviceType, or activationCode does not match"
}`

**400 - 设备未激活**

`{
  "error": "device_not_active",
  "detail": "Only ACTIVE devices can have their activation code updated"
}`

**409 - 新名字重复**

`{
  "error": "device_name_repeated",
  "detail": "Device name is occupied."
}`

---

## 📋 4.4 获取组织的所有设备

**端点:** `GET /api/auth-service/v1/devices`

**请求头:**

`Authorization: Bearer <access_token>`

**查询参数:**

- orgId (必填, UUID): 组织ID
- deviceType (可选, enum): "POS" | "KIOSK" | "TABLET"
- status (可选, enum): "PENDING" | "ACTIVE" | "DELETED"
    - 默认返回 PENDING, ACTIVE（不包括 DELETED）

---

### 处理逻辑

1. 从 access_token 中提取 userType, userId 或 accountId
2. 查询组织 (by id = orgId)
3. 如果不存在 → 返回 404 "org_not_found"
4. 权限校验:
    - 如果 userType = 'USER':
        - 验证 org.userId = 当前 User ID
    - 如果 userType = 'ACCOUNT':
        - 查询当前 Account，验证 account.orgId = orgId
        - 如果 accountType = 'STAFF' → 返回 403 "staff_no_backend_access"
5. 查询设备列表:
    - 条件: orgId = orgId
    - 可选过滤: deviceType, status
    - 默认不返回 DELETED 状态
    - 排序: status (ACTIVE优先), createdAt DESC
6. 返回列表（不返回 activationCode）

---

### 成功响应 (200)

`{
  "success": true,
  "data": [
    {
      "id": "device-uuid-1",
      "orgId": "org-uuid",
      "deviceType": "POS",
      "deviceName": "收银台-001",
      "status": "ACTIVE",
      "activatedAt": "2025-01-15T10:00:00.000Z",
      "lastActiveAt": "2025-01-16T09:30:00.000Z",
      "createdAt": "2025-01-15T09:00:00.000Z"
    },
    {
      "id": "device-uuid-2",
      "orgId": "org-uuid",
      "deviceType": "KIOSK",
      "deviceName": null,
      "status": "PENDING",
      "activatedAt": null,
      "lastActiveAt": null,
      "createdAt": "2025-01-16T08:00:00.000Z"
    },
    {
      "id": "device-uuid-3",
      "orgId": "org-uuid",
      "deviceType": "TABLET",
      "deviceName": "移动收银-001",
      "status": "ACTIVE",
      "activatedAt": "2024-12-01T10:00:00.000Z",
      "lastActiveAt": "2024-12-15T15:00:00.000Z",
      "createdAt": "2024-12-01T09:00:00.000Z"
    }
  ],
  "total": 3
}`

---

## 🔍 4.5 获取单个设备详情

**端点:** `GET /api/auth-service/v1/devices/:deviceId`

**请求头:**

`Authorization: Bearer <access_token>`

---

### 处理逻辑

1. 从 access_token 中提取 userType, userId 或 accountId
2. 查询设备 (by id = deviceId, status != 'DELETED')
3. 如果不存在 → 返回 404 "device_not_found"
4. 查询关联的组织
5. 权限校验:
    - 如果 userType = 'USER':
        - 验证 org.userId = 当前 User ID
    - 如果 userType = 'ACCOUNT':
        - 查询当前 Account，验证 account.orgId = device.orgId
        - 如果 accountType = 'STAFF' → 返回 403 "staff_no_backend_access"
6. 返回详细信息（不返回 activationCode）

---

### 成功响应 (200)

`{
  "success": true,
  "data": {
    "id": "device-uuid",
    "orgId": "org-uuid",
    "orgName": "市中心分店",
    "deviceType": "POS",
    "deviceName": "收银台-001",
    "status": "ACTIVE",
    "activatedAt": "2025-01-15T10:00:00.000Z",
    "lastActiveAt": "2025-01-16T09:30:00.000Z",
    "deviceFingerprint": {
      "userAgent": "Mozilla/5.0 ...",
      "screen": "1024x768",
      "timezone": "America/Vancouver"
    },
    "createdAt": "2025-01-15T09:00:00.000Z",
    "updatedAt": "2025-01-16T09:30:00.000Z"
  }
}`

---

## ✏️ 4.6 更新设备信息

**端点:** `PATCH /api/auth-service/v1/devices/:deviceId`

**请求头:**

`Authorization: Bearer <access_token>`

**请求体:**

`{
  "deviceName": "收银台-001-新名称"
}`

**字段说明:**

- deviceName (可选, string): 设备名称，1-100字符

**不可修改的字段:**

- deviceType
- orgId
- activationCode（使用专门的更新激活码接口）
- status（由系统自动管理）

---

### 处理逻辑

1. 从 access_token 中提取 userType, userId 或 accountId
2. 查询设备 (by id = deviceId, status != 'DELETED')
3. 如果不存在 → 返回 404 "device_not_found"
4. 查询关联的组织
5. 权限校验:
    - 如果 userType = 'USER':
        - 验证 org.userId = 当前 User ID
    - 如果 userType = 'ACCOUNT':
        - 查询当前 Account，验证 account.orgId = device.orgId
        - 如果 accountType = 'STAFF' → 返回 403 "staff_no_backend_access"
6. 验证 deviceName 不为空
7. 更新设备:
    - deviceName
    - updatedAt = NOW()
8. 记录到 audit_logs
9. 返回更新后的信息

---

### 成功响应 (200)

`{
  "success": true,
  "message": "Device updated successfully",
  "data": {
    "id": "device-uuid",
    "deviceName": "收银台-001-新名称",
    "updatedAt": "2025-01-16T15:00:00.000Z"
  }
}`

---

## 🗑️ 4.7 删除设备（软删除）

**端点:** `DELETE /api/auth-service/v1/devices/:deviceId`

**请求头:**

`Authorization: Bearer <access_token>`

---

### 处理逻辑

1. 从 access_token 中提取 userType, userId
2. 如果 userType != 'USER' → 返回 403 "only_user_can_delete_device"
3. 查询设备 (by id = deviceId, status != 'DELETED')
4. 如果不存在 → 返回 404 "device_not_found"
5. 查询关联的组织，验证 org.userId = 当前 User ID
6. 软删除设备:
    - status = 'DELETED'
    - updatedAt = NOW()
7. 记录到 audit_logs
8. 返回成功

---

### 成功响应 (200)

`{
  "success": true,
  "message": "Device deleted successfully"
}`

---

### 错误响应

**403 - 权限不足**

`{
  "error": "only_user_can_delete_device",
  "detail": "Only User (owner) can delete devices"
}`

**404 - 设备不存在**

`{
  "error": "device_not_found",
  "detail": "Device not found"
}`

---

# Auth Service v2.1.1 - 第五部分:OAuth标准端点

## 5️⃣ OAuth 标准端点 (/oauth, /jwks.json, /userinfo)

---

## 📋 概述

本模块提供标准化的 OAuth 端点，主要用于：

1. 微服务间的 token 验证
2. 获取当前用户/账号信息
3. 内部服务的黑名单查询

**注意:**

- 本系统不是完整的 OAuth2/OIDC 实现
- 不支持第三方应用授权
- 主要用于内部微服务架构

---

## 🔑 5.1 获取 JWT 公钥

**端点:** `GET /jwks.json`

**用途:**

- 其他微服务获取公钥，用于验证 JWT 签名
- 符合 JWKS (JSON Web Key Set) 标准

**请求头:** 无需认证

---

### 处理逻辑

1. 读取 auth-service 的 RSA 公钥
2. 转换为 JWKS 格式
3. 返回公钥信息

---

### 成功响应 (200)

`{
  "keys": [
    {
      "kty": "RSA",
      "use": "sig",
      "kid": "auth-service-key-2025",
      "alg": "RS256",
      "n": "0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtV...",
      "e": "AQAB"
    }
  ]
}`

**字段说明:**

- kty: Key Type，固定为 "RSA"
- use: Public Key Use，固定为 "sig" (signature)
- kid: Key ID，密钥标识符
- alg: Algorithm，固定为 "RS256"
- n: RSA 公钥模数 (Base64 URL 编码)
- e: RSA 公钥指数 (Base64 URL 编码)

---

### 使用示例

**其他微服务验证 JWT:**

`*// business-service 启动时获取公钥*
const jwks = await fetch('https://auth-service/jwks.json').then(r => r.json());
const publicKey = convertJWKSToPublicKey(jwks.keys[0]);

*// 验证 JWT*
function verifyToken(token) {
  try {
    const payload = jwt.verify(token, publicKey, {
      algorithms: ['RS256']
    });
    return payload;
  } catch (error) {
    throw new Error('Invalid token');
  }
}`

---

## 👤 5.2 获取当前用户信息

**端点:** `GET /userinfo`

**用途:**

- 获取当前 token 对应的用户/账号详细信息
- 前端不需要知道 userId 或 accountId
- 直接用 token 查询 "我是谁"

**请求头:**

`Authorization: Bearer <access_token>`

---

### 处理逻辑

1. 从 Bearer token 中提取 JWT
2. 验证 JWT 签名
3. 检查 jti 是否在黑名单中
4. 从 payload 中提取 userType
5. 根据 userType 查询对应的信息:
    - 如果 userType = 'USER': 查询 users 表
    - 如果 userType = 'ACCOUNT': 查询 accounts 表
6. 返回详细信息

---

### 成功响应 (200)

**User 的响应:**

`{
  "success": true,
  "userType": "USER",
  "data": {
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1234567890",
    "productType": "beauty",
    "status": "ACTIVE",
    "emailVerified": true,
    "createdAt": "2025-01-10T10:00:00.000Z",
    "organizations": [
      {
        "id": "org-uuid-1",
        "orgName": "主店",
        "orgType": "MAIN"
      },
      {
        "id": "org-uuid-2",
        "orgName": "东区分店",
        "orgType": "BRANCH"
      }
    ]
  }
}`

**Account 的响应:**

`{
  "success": true,
  "userType": "ACCOUNT",
  "data": {
    "username": "manager001",
    "employeeNumber": "EMP001",
    "accountType": "MANAGER",
    "productType": "beauty",
    "status": "ACTIVE",
    "lastLoginAt": "2025-01-16T09:30:00.000Z",
    "createdAt": "2025-01-15T10:00:00.000Z",
    "organization": {
      "id": "org-uuid",
      "orgName": "东区分店",
      "orgType": "BRANCH"
    }
  }
}`

**注意:**

- 不返回敏感信息（passwordHash, pinCodeHash 等）
- User 返回所有关联的组织
- Account 只返回所属的单个组织

---

### 错误响应

**401 - Token 无效**

`{
  "error": "invalid_token",
  "detail": "Token is invalid or expired"
}`

**401 - Token 已撤销**

json

`{
  "error": "token_revoked",
  "detail": "Token has been revoked"
}`

**404 - 用户不存在**

json

`{
  "error": "user_not_found",
  "detail": "User or account not found"
}`

---

## 🔍 5.3 检查 Token 黑名单（内部服务用）

**端点:** `POST /api/auth-service/v1/internal/token/check-blacklist`

**用途:**

- 其他微服务验证 token 是否被撤销
- 仅供内部服务调用

**请求头:**

`X-Internal-Service-Key: <shared-secret-key>`

**请求体:**

`{
  "jti": "token-uuid"
}`

**字段说明:**

- jti (必填, string): JWT 的唯一标识符（从 token payload 中提取）

---

### 处理逻辑

1. 验证 X-Internal-Service-Key（防止外部调用）
2. 如果验证失败 → 返回 403 "invalid_service_key"
3. 从请求体提取 jti
4. 查询 Redis:

   `EXISTS token:blacklist:{jti}`

1. 返回是否在黑名单中

---

### 成功响应 (200)

**Token 在黑名单中:**

`{
  "success": true,
  "blacklisted": true,
  "reason": "user_logout"
}`

**Token 不在黑名单中:**

`{
  "success": true,
  "blacklisted": false
}`

---

### 错误响应

**403 - 服务密钥无效**

`{
  "error": "invalid_service_key",
  "detail": "Invalid internal service key"
}`

**400 - 缺少 jti**

`{
  "error": "missing_jti",
  "detail": "jti is required"
}`

---

### 使用示例

**其他微服务调用:**

`*// business-service 验证 token 流程*
async function verifyToken(token) {
  *// 1. 验证 JWT 签名（用公钥）*
  const payload = jwt.verify(token, publicKey);
  
  *// 2. 检查黑名单（调用 auth-service）*
  const blacklistResult = await fetch(
    'https://auth-service/api/auth-service/v1/internal/token/check-blacklist',
    {
      method: 'POST',
      headers: {
        'X-Internal-Service-Key': process.env.INTERNAL_SERVICE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ jti: payload.jti })
    }
  ).then(r => r.json());
  
  if (blacklistResult.blacklisted) {
    throw new Error('Token revoked');
  }
  
  return payload;
}`

---

## 📊 端点汇总

**公开端点:**

- 5.1 GET /jwks.json - 获取 JWT 公钥

**需要认证:**

- 5.2 GET /userinfo - 获取当前用户信息

**内部服务专用:**

- 5.3 POST /api/auth-service/v1/internal/token/check-blacklist - 检查单个 token

**已在其他模块实现:**

- POST /oauth/token (第一、三部分)
- 登出接口 (第一、三部分)

---

## 🏗️ 微服务集成架构

`┌──────────────────────────────────────────────────────┐
│                    Frontend                          │
│  - 调用 auth-service 登录，获取 token                │
│  - 携带 token 调用其他服务                           │
└────────────────┬─────────────────────────────────────┘
                 │
        ┌────────┼────────┐
        │        │        │
        ▼        ▼        ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│  Auth    │ │Business  │ │Subscrip- │
│ Service  │ │ Service  │ │  tion    │
└────┬─────┘ └────┬─────┘ └──────────┘
     │            │
     │ 1. GET /jwks.json
     │◄───────────┤
     │ 返回公钥    │
     │            │
     │ 2. POST /internal/token/check-blacklist
     │◄───────────┤
     │ 检查黑名单   │
     │            │
┌────▼─────┐      │
│  Redis   │      │
│ (黑名单)  │      │
└──────────┘      │
                  │
                  ▼
            验证通过，执行业务逻辑`

---

## 🔒 安全注意事项

### 1. 内部服务密钥管理

**X-Internal-Service-Key:**

- 所有内部服务共享的密钥
- 存储在环境变量中，不硬编码
- 定期轮换（建议每季度）
- 只有可信的内部服务知道

**建议配置:**

`*# .env*
INTERNAL_SERVICE_KEY=sk_internal_a1b2c3d4e5f6g7h8i9j0`

### 2. JWKS 公钥安全

**公钥可以公开，但要防止篡改:**

- 使用 HTTPS
- 其他服务启动时获取一次，缓存公钥
- 定期刷新（如每小时）
- 如果 JWT 验证失败，重新获取公钥再试一次

### 3. 黑名单的一致性

**Redis 黑名单特点:**

- Key 格式: `token:blacklist:{jti}`
- Value: "revoked"
- TTL: token 的剩余有效期

**一致性保证:**

- 登出时立即写入 Redis
- 其他服务缓存"不在黑名单"的结果 10 秒
- 最多 10 秒延迟，可接受

---

## 📈 性能优化建议

### 1. 公钥缓存

**其他服务应该:**

`*// 启动时获取公钥*
let publicKey = null;
let lastFetch = 0;

async function getPublicKey() {
  *// 1小时内使用缓存*
  if (publicKey && Date.now() - lastFetch < 3600000) {
    return publicKey;
  }
  
  *// 重新获取*
  const jwks = await fetch('https://auth-service/jwks.json').then(r => r.json());
  publicKey = convertJWKS(jwks.keys[0]);
  lastFetch = Date.now();
  
  return publicKey;
}`

### 2. 黑名单缓存

**business-service 实现:**

`const blacklistCache = new Map();

async function checkBlacklist(jti) {
  *// 检查缓存（10秒有效）*
  const cached = blacklistCache.get(jti);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.blacklisted;
  }
  
  *// 调用 auth-service*
  const result = await authService.checkBlacklist(jti);
  
  *// 只缓存 "不在黑名单" 的结果*
  if (!result.blacklisted) {
    blacklistCache.set(jti, {
      blacklisted: false,
      expiresAt: Date.now() + 10000 *// 10秒*
    });
  }
  
  return result.blacklisted;
}`

---

## 🔄 Token 验证完整流程

**其他微服务的标准验证流程:**

`async function authenticateRequest(req, res, next) {
  try {
    *// 1. 提取 token*
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'no_token' });
    
    *// 2. 验证 JWT 签名（用公钥，本地验证）*
    const publicKey = await getPublicKey();
    const payload = jwt.verify(token, publicKey, { algorithms: ['RS256'] });
    
    *// 3. 检查黑名单（调用 auth-service，有缓存）*
    const blacklisted = await checkBlacklistWithCache(payload.jti);
    if (blacklisted) {
      return res.status(401).json({ error: 'token_revoked' });
    }
    
    *// 4. 验证通过，将 payload 附加到请求*
    req.user = payload;
    next();
    
  } catch (error) {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

*// 使用*
app.use('/api/business-service', authenticateRequest);`

---

## 💡 与订阅检查的配合

**完整的请求验证流程:**

`async function handleBusinessRequest(req, res) {
  *// 1. 验证 token（上面的流程）// req.user 已包含 JWT payload*
  
  *// 2. 检查订阅状态（缓存 30 分钟）*
  const subscription = await getSubscriptionWithCache(
    req.user.organizationId,
    30 * 60 * 1000
  );
  
  if (subscription.status !== 'active') {
    return res.status(403).json({ error: 'subscription_expired' });
  }
  
  *// 3. 执行业务逻辑// ...*
}`

---

# Auth Service v2.1.1 - 第六部分:Admin管理端点

## 6️⃣ Admin 管理端点 (/api/auth-service/v1/admin)

---

## 📋 概述

本模块提供系统管理员专用的端点，用于：

1. 系统监控和健康检查
2. 查看系统统计信息
3. 审计日志查询
4. 紧急操作（强制登出、解锁账户等）
5. 系统维护（密钥轮换、缓存清理等）

**访问控制:**

- 所有 Admin 端点都需要特殊的 Admin API Key
- 每个管理员有独立的 API Key
- 所有操作记录到审计日志

---

## 🔐 Admin 认证机制

### 请求头要求

所有 Admin 端点都需要携带：

`X-Admin-Key: admin_{name}_sk_{random_string}`

### Admin API Key 配置

**环境变量配置:**

`*# .env*
ADMIN_API_KEYS=admin_alice_sk_a1b2c3d4e5f6,admin_bob_sk_x9y8z7w6v5u4`

**配置格式:**

`const adminKeys = {
  'admin_alice_sk_a1b2c3d4e5f6': {
    name: 'Alice',
    role: 'super_admin',
    email: 'alice@example.com'
  },
  'admin_bob_sk_x9y8z7w6v5u4': {
    name: 'Bob',
    role: 'admin',
    email: 'bob@example.com'
  }
};`

### 验证逻辑

`function requireAdmin(req, res, next) {
  const apiKey = req.headers['x-admin-key'];
  
  if (!adminKeys[apiKey]) {
    return res.status(403).json({ 
      error: 'invalid_admin_key',
      detail: 'Invalid or missing admin API key'
    });
  }
  
  *// 记录管理员信息*
  req.admin = adminKeys[apiKey];
  next();
}`

### 错误响应

**403 - 无效的 Admin Key**

`{
  "error": "invalid_admin_key",
  "detail": "Invalid or missing admin API key"
}`

---

## 🏥 6.1 系统健康检查

**端点:** `GET /api/auth-service/v1/admin/health`

**用途:**

- 检查 auth-service 及其依赖是否正常运行
- 用于监控系统（如 Kubernetes liveness/readiness probes）

---

### 处理逻辑

1. 检查数据库连接（PostgreSQL）
2. 检查 Redis 连接
3. 检查系统负载（可选）
4. 返回健康状态

---

### 成功响应 (200)

**所有服务正常:**

`{
  "status": "healthy",
  "timestamp": "2025-01-16T10:00:00.000Z",
  "uptime": 86400,
  "checks": {
    "database": {
      "status": "ok",
      "responseTime": 5
    },
    "redis": {
      "status": "ok",
      "responseTime": 2
    },
    "memory": {
      "status": "ok",
      "used": "512MB",
      "total": "2GB"
    }
  }
}`

**部分服务异常:**

`{
  "status": "degraded",
  "timestamp": "2025-01-16T10:00:00.000Z",
  "uptime": 86400,
  "checks": {
    "database": {
      "status": "ok",
      "responseTime": 5
    },
    "redis": {
      "status": "error",
      "error": "Connection timeout"
    },
    "memory": {
      "status": "warning",
      "used": "1.8GB",
      "total": "2GB"
    }
  }
}`

---

## 📊 6.2 系统统计信息

**端点:** `GET /api/auth-service/v1/admin/stats`

**用途:**

- 查看系统的整体使用情况
- 只返回数量统计，不包含具体数据

**请求头:**

`X-Admin-Key: admin_{name}_sk_{random}`

---

### 处理逻辑

1. 验证 Admin API Key
2. 统计各类实体的数量
3. 按状态/类型分组统计
4. 返回统计结果

---

### 成功响应 (200)

`{
  "success": true,
  "timestamp": "2025-01-16T10:00:00.000Z",
  "stats": {
    "users": {
      "total": 150,
      "byStatus": {
        "ACTIVE": 145,
        "SUSPENDED": 3,
        "DELETED": 2
      },
      "byProductType": {
        "beauty": 90,
        "fb": 60
      },
      "newThisMonth": 12
    },
    "organizations": {
      "total": 300,
      "byType": {
        "MAIN": 50,
        "BRANCH": 100,
        "FRANCHISE": 150
      },
      "byStatus": {
        "ACTIVE": 290,
        "INACTIVE": 10
      },
      "byProductType": {
        "beauty": 180,
        "fb": 120
      }
    },
    "accounts": {
      "total": 1500,
      "byType": {
        "OWNER": 150,
        "MANAGER": 350,
        "STAFF": 1000
      },
      "byStatus": {
        "ACTIVE": 1450,
        "SUSPENDED": 30,
        "DELETED": 20
      }
    },
    "devices": {
      "total": 800,
      "byType": {
        "POS": 500,
        "KIOSK": 200,
        "TABLET": 100
      },
      "byStatus": {
        "PENDING": 50,
        "ACTIVE": 740,
        "DELETED": 10
      }
    },
    "tokens": {
      "activeRefreshTokens": 250,
      "blacklistedTokens": 180
    }
  }
}`

---

## ⚙️ 6.3 系统配置信息

**端点:** `GET /api/auth-service/v1/admin/config`

**用途:**

- 查看当前系统配置参数
- 不包含敏感信息（如密钥、密码等）

**请求头:**

`X-Admin-Key: admin_{name}_sk_{random}`

---

### 成功响应 (200)

`{
  "success": true,
  "config": {
    "tokenExpiry": {
      "userAccessToken": 3600,
      "userRefreshToken": 2592000,
      "accountAccessToken": 3600,
      "accountRefreshToken": 2592000,
      "posAccessToken": 16200
    },
    "cacheSettings": {
      "subscriptionCacheTTL": 1800,
      "blacklistCacheTTL": 10,
      "publicKeyCacheTTL": 3600
    },
    "deviceSettings": {
      "activationCodeLength": 9,
      "deviceValidityPeriod": 31536000,
      "dormantCheckInterval": "monthly",
      "dormantThreshold": 2592000,
      "dormantGracePeriod": 2592000
    },
    "securitySettings": {
      "maxLoginAttempts": 5,
      "lockoutDuration": 1800,
      "passwordMinLength": 8,
      "pinCodeLength": 4
    },
    "systemInfo": {
      "version": "2.0.0",
      "environment": "production",
      "nodeVersion": "v18.17.0"
    }
  }
}`

---

## 📜 6.4 查询审计日志

**端点:** `GET /api/auth-service/v1/admin/audit-logs`

**用途:**

- 查询系统操作记录
- 追踪谁做了什么操作
- 安全审计和问题排查

**请求头:**

`X-Admin-Key: admin_{name}_sk_{random}`

**查询参数:**

`?actorUserId=xxx          # 操作者（User ID）
&actorAccountId=xxx       # 操作者（Account ID）
&actorAdmin=Alice         # 操作者（Admin 名称）
&action=create_org        # 操作类型
&targetUserId=xxx         # 操作对象（User）
&targetAccountId=xxx      # 操作对象（Account）
&targetOrgId=xxx          # 操作对象（Organization）
&targetDeviceId=xxx       # 操作对象（Device）
&startDate=2025-01-01     # 开始时间（ISO 8601）
&endDate=2025-01-31       # 结束时间（ISO 8601）
&limit=100                # 返回数量（默认 50，最大 1000）
&offset=0                 # 分页偏移（默认 0）`

---

### 处理逻辑

1. 验证 Admin API Key
2. 构建查询条件（支持多条件组合）
3. 从 audit_logs 表查询
4. 按时间倒序排序
5. 分页返回结果

---

### 成功响应 (200)

`{
  "success": true,
  "data": [
    {
      "id": "log-uuid-1",
      "action": "user_login",
      "actorUserId": "user-uuid",
      "actorAccountId": null,
      "actorAdmin": null,
      "targetUserId": "user-uuid",
      "targetAccountId": null,
      "targetOrgId": null,
      "targetDeviceId": null,
      "detail": {
        "ip": "192.168.1.100",
        "userAgent": "Mozilla/5.0..."
      },
      "createdAt": "2025-01-16T10:30:00.000Z"
    },
    {
      "id": "log-uuid-2",
      "action": "admin_force_logout",
      "actorUserId": null,
      "actorAccountId": null,
      "actorAdmin": "Alice",
      "targetUserId": "user-uuid-2",
      "targetAccountId": null,
      "targetOrgId": null,
      "targetDeviceId": null,
      "detail": {
        "reason": "Security incident"
      },
      "createdAt": "2025-01-16T09:15:00.000Z"
    },
    {
      "id": "log-uuid-3",
      "action": "device_activated",
      "actorUserId": null,
      "actorAccountId": null,
      "actorAdmin": null,
      "targetUserId": null,
      "targetAccountId": null,
      "targetOrgId": "org-uuid",
      "targetDeviceId": "device-uuid",
      "detail": {
        "deviceType": "POS",
        "deviceName": "收银台-001"
      },
      "createdAt": "2025-01-16T08:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 1523,
    "limit": 100,
    "offset": 0,
    "hasMore": true
  }
}`

---

## 🚪 6.5 强制登出 User

**端点:** `POST /api/auth-service/v1/admin/users/:userId/force-logout`

**用途:**

- 管理员强制某个 User 登出
- 撤销所有 refresh_token
- 将所有 access_token 加入黑名单

**请求头:**

`X-Admin-Key: admin_{name}_sk_{random}`

**请求体:**

`{
  "reason": "Security incident - account compromised"
}`

**字段说明:**

- reason (可选, string): 强制登出的原因

---

### 处理逻辑

1. 验证 Admin API Key
2. 查询 User (by userId)
3. 如果不存在 → 返回 404
4. 查询该 User 的所有活跃 refresh_tokens
5. 撤销所有 refresh_tokens:

   `UPDATE refresh_tokens 
   SET status = 'REVOKED', 
       revoked_at = NOW(),
       revoke_reason = 'admin_force_logout'
   WHERE subject_user_id = userId 
     AND status = 'ACTIVE'`

1. 将所有 refresh_tokens 关联的 access_token jti 加入黑名单
2. 记录到 audit_logs (actorAdmin = 管理员名称)
3. 返回成功

---

### 成功响应 (200)

`{
  "success": true,
  "message": "User force logged out successfully",
  "data": {
    "userId": "user-uuid",
    "revokedTokens": 3,
    "reason": "Security incident - account compromised"
  }
}`

---

## 🚪 6.6 强制登出 Account

**端点:** `POST /api/auth-service/v1/admin/accounts/:accountId/force-logout`

**用途:**

- 管理员强制某个 Account 登出
- 撤销所有 refresh_token
- 将所有 access_token 加入黑名单

**请求头:**

`X-Admin-Key: admin_{name}_sk_{random}`

**请求体:**

`{
  "reason": "Employee terminated"
}`

---

### 处理逻辑

同 6.5，但操作对象是 Account

---

### 成功响应 (200)

`{
  "success": true,
  "message": "Account force logged out successfully",
  "data": {
    "accountId": "account-uuid",
    "revokedTokens": 2,
    "reason": "Employee terminated"
  }
}`

---

## 🔓 6.7 解锁 User 账号

**端点:** `POST /api/auth-service/v1/admin/users/:userId/unlock`

**用途:**

- 解锁因登录失败过多而被锁定的 User 账号

**请求头:**

`X-Admin-Key: admin_{name}_sk_{random}`

**请求体:**

`{
  "reason": "User verified identity via phone"
}`

---

### 处理逻辑

1. 验证 Admin API Key
2. 查询 User (by userId)
3. 如果不存在 → 返回 404
4. 检查账号是否被锁定:
    - 如果 lockedUntil = NULL → 返回 400 "account_not_locked"
5. 解锁账号:

   `UPDATE users 
   SET locked_until = NULL,
       login_failure_count = 0,
       lock_reason = NULL,
       updated_at = NOW()
   WHERE id = userId`

1. 记录到 audit_logs
2. 返回成功

---

### 成功响应 (200)

`{
  "success": true,
  "message": "User account unlocked successfully",
  "data": {
    "userId": "user-uuid",
    "email": "user@example.com",
    "unlockedBy": "Alice",
    "reason": "User verified identity via phone"
  }
}`

---

### 错误响应

**400 - 账号未被锁定**

`{
  "error": "account_not_locked",
  "detail": "This account is not locked"
}`

---

## 🗑️ 6.8 清除缓存

**端点:** `POST /api/auth-service/v1/admin/cache/clear`

**用途:**

- 手动清除各类缓存
- 紧急情况下确保数据一致性

**请求头:**

`X-Admin-Key: admin_{name}_sk_{random}`

**请求体:**

`{
  "cacheType": "all",
  "reason": "Data inconsistency detected"
}`

**字段说明:**

- cacheType (必填, enum):
    - "all": 清除所有缓存
    - "subscription": 清除订阅状态缓存
    - "blacklist": 清除黑名单缓存
    - "publicKey": 清除公钥缓存
- reason (可选, string): 清除原因

---

### 处理逻辑

1. 验证 Admin API Key
2. 根据 cacheType 清除对应的缓存:
    - subscription: 清除 business-service 的订阅缓存（需要通知）
    - blacklist: 清除 Redis 中的黑名单缓存（或清除 business-service 的本地缓存）
    - publicKey: 清除其他服务的公钥缓存（需要通知）
    - all: 清除所有
3. 记录到 audit_logs
4. 返回清除结果

---

### 成功响应 (200)

`{
  "success": true,
  "message": "Cache cleared successfully",
  "data": {
    "cacheType": "all",
    "clearedItems": {
      "subscription": 150,
      "blacklist": 80,
      "publicKey": 1
    },
    "clearedBy": "Alice",
    "reason": "Data inconsistency detected"
  }
}`

---

## 📊 6.9 查看活跃 Token

**端点:** `GET /api/auth-service/v1/admin/tokens/active`

**用途:**

- 查看当前有多少活跃的 refresh_token
- 按用户/账号/组织分组统计

**请求头:**

`X-Admin-Key: admin_{name}_sk_{random}`

**查询参数:**

`?userId=xxx               # 按 User 筛选
&accountId=xxx            # 按 Account 筛选
&organizationId=xxx       # 按 Organization 筛选
&limit=50                 # 返回数量
&offset=0                 # 分页偏移`

---

### 成功响应 (200)

`{
  "success": true,
  "data": {
    "totalActiveTokens": 250,
    "byUserType": {
      "USER": 120,
      "ACCOUNT": 130
    },
    "tokens": [
      {
        "id": "refresh-token-uuid-1",
        "subjectUserId": "user-uuid",
        "subjectAccountId": null,
        "organizationId": null,
        "clientId": "tymoe-web",
        "createdAt": "2025-01-10T10:00:00.000Z",
        "expiresAt": "2025-02-09T10:00:00.000Z",
        "lastSeenAt": "2025-01-16T09:30:00.000Z"
      },
      {
        "id": "refresh-token-uuid-2",
        "subjectUserId": null,
        "subjectAccountId": "account-uuid",
        "organizationId": "org-uuid",
        "clientId": "tymoe-web",
        "createdAt": "2025-01-15T14:00:00.000Z",
        "expiresAt": "2025-02-14T14:00:00.000Z",
        "lastSeenAt": "2025-01-16T10:00:00.000Z"
      }
    ]
  },
  "pagination": {
    "total": 250,
    "limit": 50,
    "offset": 0
  }
}`

---

## 🔒 安全注意事项

### 1. Admin API Key 管理

**生成规则:**

- 格式: `admin_{name}_sk_{32位随机字符}`
- 示例: `admin_alice_sk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`

**存储:**

`*# .env 文件*
ADMIN_API_KEYS=admin_alice_sk_abc...,admin_bob_sk_xyz...

*# 不要提交到 Git# 加入 .gitignore*`

**轮换:**

- 建议每季度轮换一次
- 管理员离职时立即更换
- 泄露时紧急轮换

### 2. 审计日志

**所有 Admin 操作必须记录:**

`INSERT INTO audit_logs (
  action,
  actor_admin,
  target_user_id,
  detail,
  created_at
) VALUES (
  'admin_force_logout',
  'Alice',
  'user-uuid',
  '{"reason": "Security incident"}',
  NOW()
)`

### 3. IP 白名单（可选）

**额外安全措施:**

`const ADMIN_ALLOWED_IPS = ['192.168.1.100', '10.0.0.5'];

app.use('/api/auth-service/v1/admin', (req, res, next) => {
  if (!ADMIN_ALLOWED_IPS.includes(req.ip)) {
    return res.status(403).json({ error: 'ip_not_allowed' });
  }
  next();
});`

### 4. 操作通知（可选）

**重要操作发送通知:**

- 强制登出用户
- 轮换密钥
- 清除缓存

通知方式: Email、Slack、短信等

---

## 📝 使用示例

### 场景1: 查看系统健康状态

`curl -X GET https://api.example.com/api/auth-service/v1/admin/health \
  -H "X-Admin-Key: admin_alice_sk_abc123..."`

### 场景2: 查看系统统计

`curl -X GET https://api.example.com/api/auth-service/v1/admin/stats \
  -H "X-Admin-Key: admin_alice_sk_abc123..."`

### 场景3: 查询审计日志

`curl -X GET "https://api.example.com/api/auth-service/v1/admin/audit-logs?action=user_login&startDate=2025-01-01&limit=100" \
  -H "X-Admin-Key: admin_alice_sk_abc123..."`

### 场景4: 强制用户登出

`curl -X POST https://api.example.com/api/auth-service/v1/admin/users/user-uuid/force-logout \
  -H "X-Admin-Key: admin_alice_sk_abc123..." \
  -H "Content-Type: application/json" \
  -d '{"reason": "Account compromised"}'`

### 场景5: 手动触发设备检查

`curl -X POST https://api.example.com/api/auth-service/v1/admin/devices/check-activity \
  -H "X-Admin-Key: admin_alice_sk_abc123..." \
  -H "Content-Type: application/json" \
  -d '{"dryRun": false}'`

---

## ⚠️ 重要提醒

### 关于 Family ID 机制

**本系统不使用 Family ID 轮换机制:**

- User 和 Account 后台登录都使用 Uber 方式（30天固定 refresh_token）
- POS/KIOSK 登录只有 access_token，无 refresh_token
- `refresh_tokens` 表的 `familyId` 字段应设为 null 或删除

**代码实现时注意:**

- 第一部分 (User 登录) 的 familyId 相关逻辑需要移除
- 第三部分 (Account 登录) 的 familyId 相关逻辑需要移除
- refresh_tokens 表创建时 familyId 字段设为 null

### Admin 操作的影响范围

**强制登出的影响:**

- 立即撤销所有 refresh_token
- 将相关 access_token 加入黑名单
- 用户/账号需要重新登录
- 其他服务在缓存过期后（最多10秒）会检测到 token 失效

**密钥轮换的影响:**

- 所有服务需要重新获取公钥（从 /jwks.json）
- 旧密钥签发的 token 在 60 分钟内仍然有效
- 建议在低峰时段执行

**缓存清除的影响:**

- 可能导致短暂的性能下降（需要重新查询）
- 确保数据一致性
- 适用于发现数据不一致时的紧急修复

---

## ✅ 设计总结

**第六部分提供的能力:**

1. 系统监控和健康检查
2. 统计信息和配置查看
3. 审计日志查询和追踪
4. 紧急操作（强制登出、解锁）
5. 系统维护（密钥轮换、缓存清理、设备检查）

**安全机制:**

- Admin API Key 认证
- 每个管理员独立密钥
- 所有操作记录审计日志
- 可追踪操作者

**与其他模块的关系:**

- 监控所有模块的运行状态
- 可以干预所有模块的数据
- 提供紧急操作能力

**使用场景:**

- 日常监控：health、stats
- 问题排查：audit-logs、tokens/active
- 紧急响应：force-logout、unlock
- 定期维护：keys/rotate、cache/clear、devices/check-activity

---

## 🚪 6.10 强制注销 Device

**端点:** `POST /api/auth-service/v1/admin/devices/:deviceId/force-logout`

**用途:**

- 管理员强制某个 Device 注销
- 将其status改为DELETE

**请求头:**

`X-Admin-Key: admin_{name}_sk_{random}`

**请求体:**

`{
  "reason": "Security incident - user compromised"
}`

**字段说明:**

- reason (可选, string): 强制登出的原因

---

### 处理逻辑

1. 验证 Admin API Key
2. 查询 Device (by deviceId)
3. 如果不存在 → 返回 404
4. 修改其status: 如果为!DELETE都改为DELETE.如果已经是DELETE,不用修改.
5. 记录到 audit_logs (actorAdmin = 管理员名称)
6. 返回成功

---

### 成功响应 (200)

`{
  "success": true,
  "message": "Device status change to DELETE successfully",
  "data": {
    "deviceId": "device-uuid",
    "status: "DELETE"
    "reason": "Security incident - account compromised"
  }
}`

---

## 🔑 6.11 轮换 JWT 签名密钥

**端点:** `POST /api/auth-service/v1/admin/keys/rotate`

**用途:**

- 手动轮换 JWT 签名密钥（RSA 密钥对）
- 用于定期安全维护或密钥泄露时紧急轮换
- 替代命令行脚本 `rotate-key.ts` 和 `retire-keys.ts`

**请求头:**

`X-Admin-Key: admin_{name}_sk_{random}`

**请求体:**

`{
  "reason": "Quarterly security rotation"
}`

**字段说明:**

- reason (可选, string): 轮换密钥的原因

---

### 处理逻辑

1. 验证 Admin API Key
2. 调用 `keystore.rotateKey()` 生成新的 RSA 密钥对
3. 新密钥自动标记为 `ACTIVE` 状态
4. 旧密钥自动标记为 `GRACE` 状态（保留 1 小时）
5. 1 小时后旧密钥自动变为 `RETIRED` 状态
6. 更新 JWKS 端点 (`/jwks.json`) 同时返回新旧密钥
7. 记录到 audit_logs (actorAdmin = 管理员名称)
8. 返回新旧密钥的 kid

---

### 成功响应 (200)

`{
  "success": true,
  "message": "JWT signing keys rotated successfully",
  "data": {
    "newKeyId": "auth-service-key-2025-01-16-abc123",
    "oldKeyId": "auth-service-key-2025-01-01-xyz789",
    "oldKeyRetentionPeriod": 3600,
    "rotatedBy": "Alice",
    "reason": "Quarterly security rotation"
  },
  "warning": "Old tokens will remain valid for 60 minutes. Please inform other services to refresh public keys from /jwks.json"
}`

---

### 说明

**密钥轮换机制:**

1. **新密钥生成:**
   - 生成新的 2048 位 RSA 密钥对
   - kid 格式: `auth-service-key-{timestamp}-{random}`
   - 状态设为 `ACTIVE`

2. **旧密钥保留:**
   - 旧密钥状态从 `ACTIVE` 改为 `GRACE`
   - 保留 1 小时（与 access_token 过期时间一致）
   - 旧 token 在此期间仍然有效

3. **自动清理:**
   - 1 小时后旧密钥自动变为 `RETIRED`
   - `RETIRED` 密钥不再出现在 JWKS 端点
   - 但数据库中保留记录用于审计

**对其他服务的影响:**

- 所有资源服务（business-service 等）需要从 `/jwks.json` 重新获取公钥
- JWKS 缓存 TTL 为 1 小时，缓存过期后会自动更新
- 旧密钥签发的 token 在 grace period 内仍然有效
- 新签发的 token 立即使用新密钥

**使用建议:**

- 定期轮换（建议每季度一次）
- 密钥泄露时紧急轮换
- 在低峰时段执行
- 提前通知其他服务团队

---

### 错误响应

**500 - 密钥生成失败**

`{
  "error": "server_error",
  "detail": "Failed to generate new key pair"
}`

---

# Auth Service v2.1.1 - 第七部分:系统端点

## 7️⃣ 系统端点

---

## 📋 概述

本模块提供公开的系统端点，不需要任何认证。主要用于：

1. 容器编排平台（Kubernetes, Docker）的健康检查
2. 负载均衡器的存活探测

**特点:**

- 无需认证
- 快速响应
- 最小化依赖检查

---

## 🏥 7.1 公开健康检查

**端点:** `GET /healthz`

**用途:**

- 容器平台的 liveness probe（存活探测）
- 负载均衡器检查服务是否可用
- 简单快速的健康状态检查

**请求头:** 无需认证

---

### 与 Admin Health 的区别

**/healthz (公开健康检查):**

- 认证：不需要
- 返回内容：简单状态（"OK" 或 "ERROR"）
- 响应速度：极快（< 100ms）
- 用途：自动化监控（容器平台、负载均衡器）
- 依赖检查：最小化（只检查服务进程）

**/admin/health (管理员健康检查):**

- 认证：需要 Admin API Key
- 返回内容：详细组件状态（数据库、Redis、内存等）
- 响应速度：较慢
- 用途：人工排查问题
- 依赖检查：全面检查所有组件

---

### 处理逻辑

**基础版本（推荐）:**

1. 检查服务进程是否运行
2. 简单的数据库连接检查（可选）
3. 返回状态

**不检查:**

- Redis 连接（避免依赖导致误报）
- 复杂的业务逻辑
- 外部服务状态

**原则:**

- 快速响应（< 100ms）
- 尽量少的依赖检查
- 避免因单个组件故障导致整个服务被判定为不健康

---

### 成功响应 (200)

**正常状态:**

`{
  "status": "ok",
  "timestamp": "2025-01-16T10:00:00.000Z"
}`

---

### 错误响应 (503)

**服务不可用:**

`{
  "status": "error",
  "timestamp": "2025-01-16T10:00:00.000Z"
}`

---

## 💡 实现建议

### 基础实现

`app.get('/healthz', (req, res) => {
  *// 只检查服务进程是否正常运行*
  res.status(200).send('OK');
});`

**优点:**

- 极快响应
- 不会因为依赖故障而误报
- 适合容器编排平台

---

### 🔧 使用场景

### Kubernetes 配置

`apiVersion: v1
kind: Pod
metadata:
  name: auth-service
spec:
  containers:
  - name: auth-service
    image: auth-service:latest
    livenessProbe:
      httpGet:
        path: /healthz
        port: 3000
      initialDelaySeconds: 30
      periodSeconds: 10
      timeoutSeconds: 5
      failureThreshold: 3
    readinessProbe:
      httpGet:
        path: /healthz
        port: 3000
      initialDelaySeconds: 5
      periodSeconds: 5
      timeoutSeconds: 3
      failureThreshold: 2`

---

### Docker Compose 配置

`version: '3.8'
services:
  auth-service:
    image: auth-service:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/healthz"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s`

---

### 负载均衡器配置

**Nginx:**

`upstream auth_service {
    server auth-service-1:3000 max_fails=3 fail_timeout=30s;
    server auth-service-2:3000 max_fails=3 fail_timeout=30s;
    
    *# 健康检查*
    check interval=3000 rise=2 fall=3 timeout=1000 type=http;
    check_http_send "GET /healthz HTTP/1.0\r\n\r\n";
    check_http_expect_alive http_2xx;
}`

**AWS ELB/ALB:**

`Health Check Path: /healthz
Health Check Protocol: HTTP
Health Check Port: 3000
Healthy Threshold: 2
Unhealthy Threshold: 3
Timeout: 5 seconds
Interval: 30 seconds`

---

## 📊 端点汇总

**公开端点:**

- 7.1 GET /healthz - 公开健康检查

---

## 🔒 安全注意事项

### 1. 信息泄露

**避免返回敏感信息:**

- 不返回版本号（避免暴露已知漏洞）
- 不返回内部组件详情
- 不返回错误堆栈

**正确做法:**

javascript

`*// ✅ 好*
res.status(200).send('OK');

*// ❌ 不好*
res.status(200).json({
  status: 'ok',
  version: '2.0.0',
  database: 'PostgreSQL 14.5',
  redis: 'Redis 7.0.5',
  uptime: '15 days'
});`

---

### 2. DDoS 防护

**添加简单的速率限制:**

健康检查端点虽然公开，但应该限制单个 IP 的访问频率，防止被滥用消耗资源。

javascript

`*// 使用 express-rate-limit 中间件*
const rateLimit = require('express-rate-limit');

const healthzLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, *// 1 分钟时间窗口*
  max: 5, *// 每个 IP 最多 5 次请求*
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests'
});

app.get('/healthz', healthzLimiter, (req, res) => {
  res.status(200).send('OK');
});`

**说明:**

- 每个 IP 每分钟最多 5 次请求
- 足够容器平台和负载均衡器使用
- 防止恶意用户频繁请求消耗资源

---

### 3. 日志记录

**不要记录每次健康检查:**

javascript

`app.get('/healthz', (req, res) => {
  *// ❌ 不要这样做// logger.info('Health check request received');*
  
  res.status(200).send('OK');
});`

**原因:**

- 健康检查频率很高
- 会产生大量无用日志
- 占用存储空间

**例外:** 只记录失败的健康检查

---

## 📝 最佳实践

### 1. 快速响应

健康检查应该在 100ms 内完成：

- 不进行复杂计算
- 不查询大量数据
- 不调用外部服务

### 2. 幂等性

多次调用不应该产生副作用：

- 不修改数据
- 不触发业务逻辑
- 不发送通知

### 3. 明确的健康标准

**服务健康的定义:**

- 进程正常运行 ✅
- 能接受请求 ✅
- 数据库可连接（可选）✅
- 能处理基本业务逻辑 ❌（太复杂）

### 4. 区分 Liveness 和 Readiness

**Liveness (存活探测):**

- 检查进程是否还活着
- 失败 → 重启容器
- 使用 /healthz

**Readiness (就绪探测):**

- 检查是否准备好接受流量
- 失败 → 从负载均衡移除
- 可以使用同一个 /healthz，或单独的 /readyz

**如果需要区分，可以添加 /readyz:**

`app.get('/readyz', async (req, res) => {
  try {
    *// 检查数据库、Redis 等*
    await db.raw('SELECT 1');
    await redis.ping();
    
    res.status(200).send('READY');
  } catch (error) {
    res.status(503).send('NOT READY');
  }
});`

---

## ✅ 设计总结

**第七部分提供的能力:**

- 简单快速的健康检查
- 供容器平台和负载均衡器使用
- 无需认证，公开访问

**设计原则:**

- 简单至上
- 快速响应
- 最小化依赖
- 不泄露信息

**与其他模块的关系:**

- 独立于所有业务模块
- 不依赖认证系统
- 可以在服务启动后立即响应

**推荐实现:**

- 基础版本：直接返回 "OK"
- 可选：简单的数据库 ping
- 避免复杂的依赖检查

---

## 🔄 与 Admin Health 的配合使用

**日常监控:**

- 容器平台使用 /healthz（自动化）
- 管理员使用 /admin/health（人工排查）

**问题排查流程:**

`1. /healthz 返回错误
   ↓
2. 容器平台自动重启服务
   ↓
3. 如果持续失败，管理员介入
   ↓
4. 访问 /admin/health 查看详细状态
   ↓
5. 根据详细信息排查问题`