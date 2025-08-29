# Auth-Service 数据库表结构设计（Prisma）

此文档用于定义 auth-service 的 Prisma 数据库 schema 结构，确保每个字段明确、清晰，以便于使用 Cursor 自动生成 Prisma schema 和数据库迁移文件。

## 📌 1. Tenant（租户表）

| 字段名                     | 类型      | 属性                 | 说明                           |
| -------------------------- | --------- | -------------------- | ------------------------------ |
| id                         | String    | @id @default(uuid()) | 租户唯一标识                   |
| email                      | String    | @unique              | 租户邮箱，用于登录和联系       |
| phone                      | String?   | @unique              | 租户联系电话（可选）           |
| store\_name                | String    |                      | 店铺名称，用于展示和识别       |
| subdomain                  | String    | @unique              | 租户唯一子域名，用于区分商铺   |
| password\_hash             | String    |                      | 用户密码哈希值，确保密码安全   |
| address                    | String?   |                      | 租户联系地址（可选）           |
| email\_verified\_at        | DateTime? |                      | 邮箱验证完成的时间             |
| email\_verification\_token | String?   |                      | 邮箱验证唯一 Token，验证后清空 |
| created\_at                | DateTime  | @default(now())      | 记录创建时间                   |
| updated\_at                | DateTime  | @updatedAt           | 记录更新时间                   |
| deleted\_at                | DateTime? |                      | 软删除标记                     |

## 📌 2. Session（会话表）

| 字段名         | 类型     | 属性                 | 说明                            |
| -------------- | -------- | -------------------- | ------------------------------- |
| id             | String   | @id @default(uuid()) | 会话唯一标识                    |
| tenant\_id     | String   |                      | 关联的租户 ID                   |
| token\_jti     | String   | @unique              | JWT Token 唯一标识（JWT jti）   |
| refresh\_token | String?  | @unique              | 长期刷新令牌，续期 Access Token |
| user\_agent    | String?  |                      | 用户代理信息（设备、浏览器）    |
| ip\_address    | String?  |                      | 登录 IP 地址                    |
| device\_type   | String?  |                      | 登录设备类型                    |
| expires\_at    | DateTime |                      | Refresh Token 有效期            |
| created\_at    | DateTime | @default(now())      | 会话创建时间                    |
| updated\_at    | DateTime | @updatedAt           | 会话更新时间                    |

## 📌 3. PasswordResetToken（密码重置令牌表）

| 字段名       | 类型      | 属性                 | 说明                         |
| ------------ | --------- | -------------------- | ---------------------------- |
| id           | String    | @id @default(uuid()) | Token 唯一标识               |
| tenant\_id   | String    |                      | 关联的租户 ID                |
| email        | String    |                      | 请求密码重置的邮箱           |
| reset\_token | String    | @unique              | 密码重置唯一令牌             |
| expires\_at  | DateTime  |                      | Token 过期时间               |
| used\_at     | DateTime? |                      | Token 使用时间，使用后即失效 |
| created\_at  | DateTime  | @default(now())      | Token 创建时间               |

## 📌 Prisma Schema 完整示例

```prisma
model Tenant {
  id                        String               @id @default(uuid())
  email                     String               @unique
  phone                     String?              @unique
  store_name                String
  subdomain                 String               @unique
  password_hash             String
  address                   String?
  email_verified_at         DateTime?
  email_verification_token  String?
  created_at                DateTime             @default(now())
  updated_at                DateTime             @updatedAt
  deleted_at                DateTime?

  sessions                  Session[]
  password_reset_tokens     PasswordResetToken[]

  @@map("tenants")
}

model Session {
  id             String    @id @default(uuid())
  tenant_id      String
  token_jti      String    @unique
  refresh_token  String?   @unique
  user_agent     String?
  ip_address     String?
  device_type    String?
  expires_at     DateTime
  created_at     DateTime  @default(now())
  updated_at     DateTime  @updatedAt

  tenant         Tenant    @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@index([tenant_id])
  @@map("sessions")
}

model PasswordResetToken {
  id              String    @id @default(uuid())
  tenant_id       String
  email           String
  reset_token     String    @unique
  expires_at      DateTime
  used_at         DateTime?
  created_at      DateTime  @default(now())

  tenant          Tenant    @relation(fields: [tenant_id], references: [id], onDelete: Cascade)

  @@index([email])
  @@index([expires_at])
  @@map("password_reset_tokens")
}
```

## 🚩 Redis 存储说明（不在数据库schema定义内）

| 键名格式              | 值     | 过期时间                   |
| --------------------- | ------ | -------------------------- |
| `jwt:blacklist:{jti}` | `true` | JWT 剩余有效期（自动失效） |

---

### 下一步操作

* 使用 Cursor 根据本 Markdown 文档自动生成 Prisma Schema 文件和数据库结构。
* 完成数据库表创建与迁移工作，开始具体业务逻辑开发。
