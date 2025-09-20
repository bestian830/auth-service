# Tymoe Auth Service 内部员工使用手册

> **内部员工专用** - 本手册面向Tymoe技术团队和运营人员

## 📋 目录

1. [服务概览](#服务概览)
2. [常用操作](#常用操作)
3. [用户管理](#用户管理)
4. [组织管理](#组织管理)
5. [客户端管理](#客户端管理)
6. [监控和故障排除](#监控和故障排除)
7. [安全管理](#安全管理)
8. [日常维护](#日常维护)

## 服务概览

### 基本信息
- **服务地址**: https://tymoe.com
- **管理后台**: 暂无 (通过API管理)
- **数据库**: PostgreSQL (外部)
- **缓存**: Redis (容器)
- **监控**: Prometheus metrics

### 系统架构

#### 容器化部署架构

系统采用 Docker Compose 多容器部署架构：

```
                Internet
                    ↓
               Nginx (容器)
             端口: 80/443
              ↓        ↓
      反向代理         静态文件服务
         ↓                ↓
   Auth-Service      Frontend
   端口: 8080        (HTML/CSS/JS)
       ↓
   Redis (容器)
   端口: 6379
   (缓存&会话)
```

#### 容器组件职责

**Nginx 容器 (`tymoe-nginx`)**
- SSL 证书管理 (Let's Encrypt)
- 请求路由和负载均衡
- 静态文件服务 (`./frontend/dist/`)
- 安全防护和限流

**Auth-Service 容器 (`auth-service-app`)**
- Node.js 应用主体
- OAuth2/OIDC 认证逻辑
- API 接口服务
- 业务逻辑处理

**Redis 容器 (`tymoe-redis`)**
- 会话数据存储
- 验证码和临时数据
- 限流计数器
- 缓存服务

**Frontend 容器 (`tymoe-frontend`)**
- 静态前端资源
- 用户界面 (登录/注册页面)
- **注意**: 当前为预留容器，`./frontend/dist/` 目录为空

#### 请求流向

1. **API 请求**: `https://tymoe.com/api/*` → Nginx → Auth-Service
2. **OIDC 端点**: `https://tymoe.com/.well-known/*` → Nginx → Auth-Service
3. **静态文件**: `https://tymoe.com/*` → Nginx → Frontend dist 目录
4. **健康检查**: `https://tymoe.com/healthz` → Nginx → Auth-Service

### 服务职责
- 用户身份认证和授权
- OAuth2/OIDC 标准实现
- 组织(餐厅/美容院)管理
- JWT令牌签发和验证
- 安全防护(速率限制、账号锁定)

## 常用操作

### 1. 检查服务状态

```bash
# 基础健康检查
curl https://tymoe.com/healthz

# 详细系统健康检查 (需要管理员权限)
curl -H "Authorization: Bearer <admin_token>" \
  https://tymoe.com/api/auth-service/v1/admin/health
```

### 2. 查看系统指标

```bash
# 获取Prometheus指标
curl -H "Authorization: Basic <metrics_token>" \
  https://tymoe.com/metrics
```

### 3. 获取OIDC配置

```bash
# 查看OIDC发现端点
curl https://tymoe.com/.well-known/openid-configuration

# 获取公钥
curl https://tymoe.com/jwks.json
```

## 用户管理

### 查看用户信息

由于安全考虑，用户信息查看需要通过数据库或特殊管理接口：

```sql
-- 查询用户基本信息
SELECT id, email, name, phone, "emailVerifiedAt", "createdAt",
       "loginFailureCount", "lockedUntil"
FROM "User"
WHERE email = 'user@example.com';

-- 查询用户组织关系
SELECT u.email, o.name as organization_name, o.status
FROM "User" u
JOIN "Organization" o ON u.id = o."ownerId"
WHERE u.email = 'user@example.com';
```

### 解锁被锁定的用户

```bash
# 解锁用户账户 (需要管理员权限)
curl -X PATCH https://tymoe.com/api/auth-service/v1/admin/users/{userId}/unlock \
  -H "Authorization: Bearer <admin_token>"
```

### 查看登录尝试记录

```sql
-- 查看最近的登录尝试
SELECT email, "ipAddress", success, "failureReason", "attemptAt"
FROM "LoginAttempt"
WHERE email = 'user@example.com'
ORDER BY "attemptAt" DESC
LIMIT 10;
```

## 组织管理

### 查看组织信息

```sql
-- 查询组织详情
SELECT o.id, o.name, o.description, o.location, o.phone, o.email,
       o.status, o."createdAt", u.email as owner_email
FROM "Organization" o
JOIN "User" u ON o."ownerId" = u.id
WHERE o.name LIKE '%餐厅%';
```

### 处理组织相关问题

```sql
-- 查看某用户的所有组织
SELECT o.name, o.status, o."createdAt"
FROM "Organization" o
JOIN "User" u ON o."ownerId" = u.id
WHERE u.email = 'user@example.com';

-- 暂停问题组织
UPDATE "Organization"
SET status = 'SUSPENDED'
WHERE id = 'org-uuid';

-- 恢复组织
UPDATE "Organization"
SET status = 'ACTIVE'
WHERE id = 'org-uuid';
```

## 客户端管理

### 查看OAuth2客户端

```sql
-- 查看所有客户端
SELECT "clientId", name, type, "authMethod", "redirectUris"
FROM "Client"
ORDER BY "createdAt" DESC;
```

### 注册新的业务服务客户端

```sql
-- 注册新的内部服务客户端
INSERT INTO "Client" (
    "id", "clientId", "name", "type",
    "secretHash", "authMethod", "redirectUris"
) VALUES (
    gen_random_uuid()::text,
    'new-service-api',
    'New Business Service',
    'CONFIDENTIAL',
    '<bcrypt_hash_of_secret>',
    'client_secret_post',
    '[]'::jsonb
);
```

### 验证令牌

```bash
# 内部服务验证令牌
curl -X POST https://tymoe.com/oauth/introspect \
  -H "Authorization: Basic <base64(client_id:client_secret)>" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "token=<access_token>"
```

## 监控和故障排除

### 常见问题诊断

#### 1. 用户无法登录

**诊断步骤：**

```sql
-- 1. 检查用户账户状态
SELECT email, "emailVerifiedAt", "loginFailureCount", "lockedUntil"
FROM "User"
WHERE email = 'user@example.com';

-- 2. 查看最近登录尝试
SELECT success, "failureReason", "attemptAt", "ipAddress"
FROM "LoginAttempt"
WHERE email = 'user@example.com'
ORDER BY "attemptAt" DESC
LIMIT 5;
```

**解决方案：**
- 账户未验证 → 重发验证邮件
- 账户被锁定 → 使用解锁API
- 密码错误 → 引导用户重置密码

#### 2. 邮件发送失败

**检查邮件配置：**

```bash
# 查看应用日志
docker logs auth-service-container | grep "mail\|smtp"

# 测试SMTP连接
telnet smtp.server.com 587
```

#### 3. Redis连接问题

```bash
# 检查Redis状态
redis-cli ping

# 查看Redis连接数
redis-cli info clients

# 检查认证相关的键
redis-cli keys "authsvc:*"
```

### 性能监控

#### 关键指标

1. **响应时间**:
   - 登录API: < 500ms
   - Token验证: < 100ms
   - 注册API: < 1s

2. **错误率**:
   - 4xx错误: < 5%
   - 5xx错误: < 1%

3. **可用性**: > 99.9%

#### 监控命令

```bash
# 查看活跃连接数
netstat -an | grep :8080 | wc -l

# 检查内存使用
free -h

# 查看磁盘使用
df -h
```

## 安全管理

### 密钥轮换

```bash
# 轮换JWT签名密钥 (每月执行)
npm run rotate:key

# 清理过期密钥
npm run retire:keys
```

### 查看安全事件

```sql
-- 查看最近的安全相关审计日志
SELECT action, "actorUserId", detail, at
FROM "AuditLog"
WHERE action LIKE '%lock%' OR action LIKE '%security%'
ORDER BY at DESC
LIMIT 20;

-- 查看失败登录统计
SELECT email, COUNT(*) as failure_count
FROM "LoginAttempt"
WHERE success = false AND "attemptAt" > NOW() - INTERVAL '1 day'
GROUP BY email
ORDER BY failure_count DESC;
```

### 封禁恶意IP

```bash
# 在Redis中添加IP黑名单 (临时)
redis-cli setex "authsvc:blocked_ip:192.168.1.100" 3600 "1"

# 查看被封禁的IP
redis-cli keys "authsvc:blocked_ip:*"
```

## 日常维护

### 数据库维护

#### 每日检查

```sql
-- 检查数据库连接数
SELECT count(*) FROM pg_stat_activity;

-- 检查表大小
SELECT schemaname,tablename,
       pg_size_pretty(pg_total_relation_size(tablename::regclass)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(tablename::regclass) DESC;
```

#### 定期清理

```sql
-- 清理过期的邮箱验证记录 (30天前)
DELETE FROM "EmailVerification"
WHERE "expiresAt" < NOW() - INTERVAL '30 days';

-- 清理过期的密码重置记录 (30天前)
DELETE FROM "PasswordReset"
WHERE "expiresAt" < NOW() - INTERVAL '30 days';

-- 清理旧的登录尝试记录 (90天前)
DELETE FROM "LoginAttempt"
WHERE "attemptAt" < NOW() - INTERVAL '90 days';

-- 清理旧的审计日志 (1年前)
DELETE FROM "AuditLog"
WHERE at < NOW() - INTERVAL '1 year';
```

### 备份操作

```bash
# 数据库备份
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# 验证备份文件
gzip -t backup_file.sql.gz

# 查看备份大小
ls -lh backup_*.sql
```

### 服务重启

```bash
# 重启服务 (生产环境谨慎操作)
docker-compose restart auth-service

# 查看服务状态
docker-compose ps

# 查看服务日志
docker-compose logs -f auth-service
```

## 紧急情况处理

### 服务宕机

1. **检查服务状态**
   ```bash
   curl https://tymoe.com/healthz
   docker-compose ps
   ```

2. **查看错误日志**
   ```bash
   docker-compose logs --tail=100 auth-service
   ```

3. **重启服务**
   ```bash
   docker-compose restart auth-service
   ```

4. **如果数据库连接问题**
   ```bash
   # 检查数据库连接
   psql $DATABASE_URL -c "SELECT 1;"

   # 重启数据库服务 (如果需要)
   sudo systemctl restart postgresql
   ```

### 安全事件

1. **发现异常登录**
   ```sql
   -- 立即锁定账户
   UPDATE "User"
   SET "lockedUntil" = NOW() + INTERVAL '24 hours',
       "lockReason" = 'security_violation'
   WHERE email = 'suspicious@example.com';
   ```

2. **Token泄露**
   ```sql
   -- 撤销用户所有refresh token
   UPDATE "RefreshToken"
   SET status = 'REVOKED', "revokedAt" = NOW()
   WHERE "subjectUserId" = 'user-id';
   ```

3. **DDoS攻击**
   ```bash
   # 紧急限制单IP连接数
   iptables -A INPUT -p tcp --dport 8080 -m connlimit --connlimit-above 10 -j DROP
   ```

## 联系信息

- **技术负责人**: [你的姓名] - [邮箱]
- **紧急联系**: [电话号码]
- **文档更新**: 发现问题请及时更新此文档

---

**⚠️ 重要提醒**:
1. 所有生产环境操作需要至少2人确认
2. 数据库操作前务必备份
3. 密钥和敏感信息严格保密
4. 定期检查和更新此手册