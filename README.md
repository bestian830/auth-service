# Auth Service - 认证微服务

## 概述

Auth Service 是**独立认证微服务**，负责处理用户身份验证、授权和租户管理。采用微服务架构，为所有业务系统提供统一的认证服务。

### 核心功能
- **用户认证**: 注册、登录、登出、Token 管理
- **邮箱验证**: 邮箱验证码、密码重置
- **租户管理**: 多租户数据隔离、租户信息管理
- **会话管理**: Session 创建、失效、管理
- **安全防护**: 速率限制、密码强度、Token 黑名单

### 技术栈
- **Runtime**: Node.js + TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL + Prisma ORM
- **Authentication**: JWT (Access + Refresh Tokens)
- **Password**: bcrypt 哈希加密
- **Email**: 自定义 SMTP 服务
- **Validation**: Joi 数据验证
- **Logging**: Winston 日志系统
- **Security**: Helmet, CORS, Rate Limiting

## 快速开始

### 1. 环境准备

#### 安装依赖
```bash
# 进入项目目录
cd services/auth-service

# 安装依赖
npm install

# 安装 Prisma CLI
npm install -g prisma
```

#### 配置环境变量
```bash
# 复制环境变量模板
cp env.sample .env

# 编辑 .env 文件，配置以下必要参数
```

#### 环境变量配置 (.env)
```env
# 基础配置
NODE_ENV=development
PORT=3002  # 可以修改为其他端口

# 数据库配置
DATABASE_URL="postgresql://username:password@localhost:5432/auth_db"

# Redis 配置
REDIS_URL="redis://localhost:6379"

# JWT 密钥 (生产环境必须更换)
JWT_SECRET="your-super-secret-jwt-key-here"
JWT_REFRESH_SECRET="your-super-secret-refresh-key-here"

# 邮件配置 (自定义 SMTP)
SMTP_HOST=your-smtp-server.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@domain.com
SMTP_PASS=your-smtp-password

# 前端 URL (用于邮件链接)
FRONTEND_URL=http://localhost:3000

# 邮件配置
EMAIL_FROM_NAME=Tymoe
EMAIL_VERIFICATION_TOKEN_EXPIRY=24h
EMAIL_RESET_TOKEN_EXPIRY=1h

# 速率限制配置
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
LOGIN_RATE_LIMIT_MAX=5
REGISTER_RATE_LIMIT_MAX=3

# 密码配置
BCRYPT_ROUNDS=12
PASSWORD_MIN_LENGTH=8
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_NUMBERS=true
PASSWORD_REQUIRE_SPECIAL_CHARS=true

# 邮箱验证配置
REQUIRE_EMAIL_VERIFICATION=true
```

### 2. 数据库配置

#### 创建 PostgreSQL 数据库
```sql
-- 连接到 PostgreSQL
psql -U postgres

-- 创建数据库
CREATE DATABASE auth_db;

-- 创建用户 (可选)
CREATE USER auth_user WITH PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE auth_db TO auth_user;
```

#### 数据库迁移
```bash
# 生成 Prisma 客户端
npm run prisma:generate

# 运行数据库迁移
npm run prisma:migrate

# 验证数据库连接
npm run prisma:studio
```

### 3. Redis 配置

#### 安装 Redis
```bash
# macOS
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt-get install redis-server
sudo systemctl start redis-server

# 验证 Redis 连接
redis-cli ping
# 应该返回 PONG
```

### 4. 启动服务

#### 开发模式启动
```bash
# 启动开发服务器
npm run dev

# 服务将在 http://localhost:3002 启动
# 访问 http://localhost:3002 查看欢迎页面
```

#### 验证服务状态
```bash
# 健康检查
curl http://localhost:3002/health

# 应该返回
{
  "status": "ok",
  "timestamp": "2025-08-02T01:20:00.000Z",
  "service": "auth-service"
}
```

## 已实现的接口

### 认证相关接口 ✅
```
POST /api/v1/auth/register              # 用户注册
POST /api/v1/auth/login                 # 用户登录
POST /api/v1/auth/logout                # 用户登出
POST /api/v1/auth/refresh               # 刷新 Token
POST /api/v1/auth/verify-email          # 邮箱验证
POST /api/v1/auth/resend-verification   # 重新发送验证码
POST /api/v1/auth/initiate-reset        # 发起密码重置
POST /api/v1/auth/verify-reset-code     # 验证重置码
POST /api/v1/auth/reset-password        # 重置密码
PUT  /api/v1/auth/password              # 修改密码
```

### 租户管理接口 ✅
```
GET  /api/v1/tenant/:tenantId           # 获取租户信息
PUT  /api/v1/tenant/:tenantId           # 更新租户信息
GET  /api/v1/tenant/check-unique        # 检查字段唯一性
GET  /api/v1/tenant/by-email            # 根据邮箱获取租户
DELETE /api/v1/tenant/:tenantId         # 软删除租户
```

### 会话管理接口 ✅
```
POST /api/v1/session/invalidate         # 失效当前会话
POST /api/v1/session/invalidate-all     # 失效所有会话
```

## 微服务协作方案

### 1. Token 结构与权限判断

#### JWT Token 结构
```typescript
interface JWTToken {
  tenantId: string;           // 租户ID - 用于数据隔离
  email: string;              // 用户邮箱
  storeName: string;          // 店铺名称
  subdomain: string;          // 子域名
  emailVerified: boolean;     // 邮箱是否已验证
  sessionId: string;          // 会话ID
  type: 'access' | 'refresh'; // Token类型
  iat: number;               // 签发时间
  exp: number;               // 过期时间
  jti: string;               // Token唯一ID
}
```

#### Token 验证中间件 (其他服务使用)
```typescript
// 共享的 Token 验证函数
import { verifyToken } from '@shared/auth-utils';

const authenticateRequest = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'No token provided' 
      });
    }

    const payload = await verifyToken(token, 'access');
    
    // 设置请求上下文
    req.tenantId = payload.tenantId;
    req.userEmail = payload.email;
    req.emailVerified = payload.emailVerified;
    req.sessionId = payload.sessionId;
    
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid or expired token' 
    });
  }
};
```

### 2. 与前端协作

#### 前端 Token 管理
```typescript
// 1. 登录后存储 Token
const handleLogin = async (email: string, password: string) => {
  const response = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  
  const { accessToken, refreshToken, tenantId, emailVerified } = await response.json();
  
  // 存储 Token
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  localStorage.setItem('tenantId', tenantId);
  localStorage.setItem('emailVerified', emailVerified.toString());
  
  return { success: true };
};

// 2. 请求拦截器 - 自动添加 Token
axios.interceptors.request.use(config => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 3. 响应拦截器 - Token 自动刷新
axios.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const refreshResponse = await fetch('/api/v1/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
          });
          
          const { accessToken: newToken } = await refreshResponse.json();
          localStorage.setItem('accessToken', newToken);
          
          // 重试原请求
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return axios(originalRequest);
        } catch (refreshError) {
          // 刷新失败，清除 Token 并跳转登录
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('tenantId');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

// 4. 权限检查 Hook
const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const tenantId = localStorage.getItem('tenantId');
    const emailVerified = localStorage.getItem('emailVerified') === 'true';
    
    if (token && tenantId) {
      setIsAuthenticated(true);
      setUser({ tenantId, emailVerified });
    }
  }, []);
  
  return { isAuthenticated, user };
};

// 5. 受保护的路由组件
const ProtectedRoute = ({ children, requireEmailVerified = false }) => {
  const { isAuthenticated, user } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }
  
  if (requireEmailVerified && !user?.emailVerified) {
    return <Navigate to="/verify-email" />;
  }
  
  return children;
};
```

#### 前端错误处理
```typescript
// 统一错误处理
const handleApiError = (error) => {
  const status = error.response?.status;
  const code = error.response?.data?.code;
  const message = error.response?.data?.error;
  
  switch (code) {
    case 'UNAUTHORIZED':
      // Token 过期，已在拦截器中处理
      break;
    case 'FORBIDDEN':
      showNotification('权限不足', 'error');
      break;
    case 'SUBSCRIPTION_REQUIRED':
      showSubscriptionModal();
      break;
    case 'EMAIL_NOT_VERIFIED':
      navigate('/verify-email');
      break;
    case 'FEATURE_NOT_AVAILABLE':
      showUpgradeModal();
      break;
    case 'RATE_LIMIT_EXCEEDED':
      showNotification('请求过于频繁，请稍后再试', 'warning');
      break;
    default:
      showNotification(message || '请求失败', 'error');
  }
};
```

### 3. 与其他微服务协作

#### 与 Booking Service 协作

**Booking Service 需要实现的接口：**
```typescript
// 1. 身份验证中间件
const authenticateBookingRequest = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const payload = await verifyToken(token, 'access');
    req.tenantId = payload.tenantId;
    req.userEmail = payload.email;
    req.emailVerified = payload.emailVerified;
    
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// 2. 数据隔离中间件
const ensureDataIsolation = (req, res, next) => {
  const { tenantId } = req;
  
  // 确保所有数据库查询都包含 tenant_id 条件
  req.prisma = prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          if (operation === 'findMany' || operation === 'findFirst' || operation === 'findUnique') {
            args.where = { ...args.where, tenant_id: tenantId };
          }
          if (operation === 'create') {
            args.data = { ...args.data, tenant_id: tenantId };
          }
          if (operation === 'update' || operation === 'delete') {
            args.where = { ...args.where, tenant_id: tenantId };
          }
          return query(args);
        }
      }
    }
  });
  
  next();
};

// 3. 权限检查中间件
const checkBookingPermission = async (req, res, next) => {
  const { tenantId } = req;
  const { bookingId } = req.params;
  
  const booking = await prisma.booking.findFirst({
    where: { 
      id: bookingId,
      tenant_id: tenantId 
    }
  });
  
  if (!booking) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  req.booking = booking;
  next();
};
```

**Booking Service 路由配置：**
```typescript
// 所有路由都需要身份验证
router.use(authenticateBookingRequest);
router.use(ensureDataIsolation);

// 获取预约列表
router.get('/bookings', async (req, res) => {
  const { tenantId } = req;
  
  const bookings = await req.prisma.booking.findMany({
    where: { tenant_id: tenantId },
    include: { customer: true }
  });
  
  res.json({ success: true, data: bookings });
});

// 创建预约 (需要邮箱验证)
router.post('/bookings', 
  (req, res, next) => {
    if (!req.emailVerified) {
      return res.status(403).json({ 
        error: 'Email verification required' 
      });
    }
    next();
  },
  async (req, res) => {
    const { tenantId } = req;
    
    const booking = await req.prisma.booking.create({
      data: {
        ...req.body,
        tenant_id: tenantId
      }
    });
    
    res.json({ success: true, data: booking });
  }
);

// 更新预约 (需要权限检查)
router.put('/bookings/:bookingId', 
  checkBookingPermission,
  async (req, res) => {
    const { bookingId } = req.params;
    
    const booking = await req.prisma.booking.update({
      where: { id: bookingId },
      data: req.body
    });
    
    res.json({ success: true, data: booking });
  }
);
```

#### 与 Subscription Service 协作

**Subscription Service 需要实现的接口：**
```typescript
// 1. 订阅状态检查中间件
const checkSubscriptionStatus = async (req, res, next) => {
  try {
    const { tenantId } = req;
    
    // 调用 Subscription Service
    const subscriptionResponse = await fetch(
      `${SUBSCRIPTION_SERVICE_URL}/api/v1/subscription/${tenantId}`,
      {
        headers: {
          'Authorization': req.headers.authorization,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (!subscriptionResponse.ok) {
      return res.status(402).json({ 
        error: 'Subscription check failed',
        code: 'SUBSCRIPTION_REQUIRED'
      });
    }
    
    const subscription = await subscriptionResponse.json();
    
    if (!subscription.active) {
      return res.status(402).json({ 
        error: 'Active subscription required',
        code: 'SUBSCRIPTION_REQUIRED',
        subscription: subscription
      });
    }
    
    req.subscription = subscription;
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Subscription check failed' });
  }
};

// 2. 功能权限检查
const checkFeaturePermission = (feature: string) => {
  return (req, res, next) => {
    const { subscription } = req;
    
    if (!subscription.features.includes(feature)) {
      return res.status(403).json({ 
        error: `Feature '${feature}' not available in current plan`,
        code: 'FEATURE_NOT_AVAILABLE'
      });
    }
    
    next();
  };
};
```

**Booking Service 集成订阅检查：**
```typescript
// 高级功能需要订阅检查
router.post('/bookings/advanced', 
  checkSubscriptionStatus,
  checkFeaturePermission('advanced_booking'),
  async (req, res) => {
    // 高级预约功能
    const booking = await req.prisma.booking.create({
      data: {
        ...req.body,
        tenant_id: req.tenantId,
        type: 'advanced'
      }
    });
    
    res.json({ success: true, data: booking });
  }
);

// 批量操作需要订阅检查
router.post('/bookings/bulk', 
  checkSubscriptionStatus,
  checkFeaturePermission('bulk_operations'),
  async (req, res) => {
    // 批量创建预约
    const bookings = await req.prisma.booking.createMany({
      data: req.body.bookings.map(booking => ({
        ...booking,
        tenant_id: req.tenantId
      }))
    });
    
    res.json({ success: true, count: bookings.count });
  }
);
```

### 4. 微服务间 Token 验证

#### Auth Service 提供验证接口
```typescript
// GET /api/v1/auth/verify
const verifyTokenEndpoint = async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ valid: false });
    }

    const payload = await verifyToken(token, 'access');
    res.json({ 
      valid: true, 
      tenantId: payload.tenantId,
      email: payload.email,
      emailVerified: payload.emailVerified,
      sessionId: payload.sessionId
    });
  } catch (error) {
    res.status(401).json({ valid: false });
  }
};

// POST /api/v1/auth/validate-session
const validateSessionEndpoint = async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    const session = await prisma.session.findUnique({
      where: { id: sessionId }
    });
    
    if (!session || session.expires_at < new Date()) {
      return res.status(401).json({ valid: false });
    }
    
    res.json({ valid: true, session });
  } catch (error) {
    res.status(401).json({ valid: false });
  }
};
```

#### 其他服务调用验证接口
```typescript
// 其他服务可以调用 Auth Service 验证 Token
const validateTokenWithAuthService = async (token: string) => {
  try {
    const response = await fetch(`${AUTH_SERVICE_URL}/api/v1/auth/verify`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      return null;
    }
    
    return await response.json();
  } catch (error) {
    return null;
  }
};
```

### 5. 数据隔离策略

#### 数据库层面隔离
```sql
-- 所有业务表都必须包含 tenant_id 字段
CREATE TABLE bookings (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  customer_id UUID,
  service_id UUID,
  booking_date TIMESTAMP,
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- 索引优化
  INDEX idx_tenant_id (tenant_id),
  INDEX idx_tenant_booking_date (tenant_id, booking_date),
  
  -- 外键约束
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (service_id) REFERENCES services(id)
);
```

#### 应用层面隔离
```typescript
// 所有查询都必须包含 tenant_id 条件
const getBookings = async (tenantId: string) => {
  return await prisma.booking.findMany({
    where: { tenant_id: tenantId },
    include: { customer: true, service: true }
  });
};

// 创建记录时自动添加 tenant_id
const createBooking = async (tenantId: string, data: any) => {
  return await prisma.booking.create({
    data: {
      ...data,
      tenant_id: tenantId
    }
  });
};

// 更新记录时验证权限
const updateBooking = async (tenantId: string, bookingId: string, data: any) => {
  return await prisma.booking.update({
    where: { 
      id: bookingId,
      tenant_id: tenantId  // 确保只能更新自己的记录
    },
    data
  });
};
```

### 6. 错误处理与状态码

#### 统一错误响应格式
```typescript
interface ApiError {
  success: false;
  error: string;
  code?: string;
  details?: any;
}

// 常见错误码
const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',           // 401 - 未认证
  FORBIDDEN: 'FORBIDDEN',                 // 403 - 无权限
  NOT_FOUND: 'NOT_FOUND',                 // 404 - 资源不存在
  VALIDATION_ERROR: 'VALIDATION_ERROR',   // 400 - 验证错误
  SUBSCRIPTION_REQUIRED: 'SUBSCRIPTION_REQUIRED', // 402 - 需要订阅
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',    // 429 - 速率限制
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',       // 403 - 邮箱未验证
  FEATURE_NOT_AVAILABLE: 'FEATURE_NOT_AVAILABLE'  // 403 - 功能不可用
};
```

#### 前端错误处理
```typescript
// 前端统一处理各种错误
const handleApiError = (error) => {
  const status = error.response?.status;
  const code = error.response?.data?.code;
  const message = error.response?.data?.error;
  
  switch (code) {
    case 'UNAUTHORIZED':
      // Token 过期，已在拦截器中处理
      break;
    case 'FORBIDDEN':
      showNotification('权限不足', 'error');
      break;
    case 'SUBSCRIPTION_REQUIRED':
      showSubscriptionModal();
      break;
    case 'EMAIL_NOT_VERIFIED':
      navigate('/verify-email');
      break;
    case 'FEATURE_NOT_AVAILABLE':
      showUpgradeModal();
      break;
    case 'RATE_LIMIT_EXCEEDED':
      showNotification('请求过于频繁，请稍后再试', 'warning');
      break;
    default:
      showNotification(message || '请求失败', 'error');
  }
};
```

## Postman 接口测试指南

### 1. 环境配置

#### 创建 Postman 环境
1. 打开 Postman
2. 点击右上角 "Environment" → "New"
3. 创建环境变量：
   - `base_url`: `http://localhost:3002`
   - `access_token`: (留空，登录后自动填充)
   - `refresh_token`: (留空，登录后自动填充)
   - `tenant_id`: (留空，登录后自动填充)

#### 设置请求头
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer {{access_token}}"
}
```

### 2. 接口测试流程

#### 步骤 1: 用户注册
```http
POST {{base_url}}/api/v1/auth/register
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "Test123456!",
  "storeName": "Test Store",
  "subdomain": "teststore"
}
```

#### 步骤 2: 邮箱验证
```http
POST {{base_url}}/api/v1/auth/verify-email
Content-Type: application/json

{
  "email": "test@example.com",
  "code": "123456"
}
```

#### 步骤 3: 用户登录
```http
POST {{base_url}}/api/v1/auth/login
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "Test123456!"
}
```

#### 步骤 4: 设置环境变量
在 Postman 的 Tests 标签页添加：
```javascript
if (pm.response.code === 200) {
    const response = pm.response.json();
    if (response.success && response.accessToken) {
        pm.environment.set("access_token", response.accessToken);
        pm.environment.set("refresh_token", response.refreshToken);
        pm.environment.set("tenant_id", response.tenantId);
    }
}
```

#### 步骤 5: 测试受保护的接口
```http
GET {{base_url}}/api/v1/tenant/{{tenant_id}}
Authorization: Bearer {{access_token}}
```

## 部署和运维

### 生产环境配置
```bash
# 1. 构建应用
npm run build

# 2. 设置生产环境变量
NODE_ENV=production
JWT_SECRET=your-super-secure-production-secret
DATABASE_URL=postgresql://user:pass@prod-db:5432/auth_db

# 3. 运行数据库迁移
npm run prisma:migrate:deploy

# 4. 启动服务
npm start
```

### 监控和日志
```bash
# 查看服务日志
tail -f logs/app.log

# 监控服务状态
curl http://localhost:3002/health

# 数据库连接检查
npm run prisma:studio
```

### 安全注意事项
1. **生产环境必须更换 JWT 密钥**
2. **使用 HTTPS 和强密码**
3. **定期更新依赖包**
4. **监控异常登录行为**
5. **备份数据库和日志**

---

现在你可以开始测试所有接口了！🎉 