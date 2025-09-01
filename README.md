# auth-service v0.2.8

企业级 OAuth2/OpenID Connect 认证服务，支持多租户、设备证明和加密验证码复用。

## ✨ v0.2.8 新特性

### 🔐 设备证明 (Device Proof)
- **设备注册与管理**: 支持 host 和 kiosk 设备类型
- **HS256 设备证明**: 基于共享密钥的设备身份验证
- **JTI 缓存**: 防止设备证明重放攻击
- **产品特定策略**: mopai 和 ploml 产品的独立配置

### 🔄 刷新令牌策略
- **滑动续期**: mopai 产品默认使用，减少用户登录中断
- **轮转阈值**: ploml 产品使用，平衡安全性与可用性
- **生命周期管理**: 支持最大生命周期限制

### 🛡️ 安全增强
- **设备绑定**: 刷新令牌与设备关联
- **重放保护**: JTI 缓存防止证明重复使用
- **限流控制**: 设备证明请求限流保护

## 📋 功能特性

- ✅ OAuth2 授权码流程 (PKCE)
- ✅ OpenID Connect ID Token
- ✅ 刷新令牌家族管理
- ✅ 多租户架构
- ✅ 设备证明与管理
- ✅ 加密验证码复用 (AES-256-GCM)
- ✅ Redis 缓存与限流
- ✅ 审计日志
- ✅ reCAPTCHA 集成
- ✅ 邮件验证

## 🚀 快速开始

### 环境要求

- Node.js 18+
- PostgreSQL 13+
- Redis 6+

### 安装配置

1. **克隆并安装依赖**
```bash
git clone <repository>
cd auth-service
npm install
```

2. **配置环境变量**
```bash
cp .env.example .env
# 编辑 .env 文件配置数据库、Redis 等信息
```

3. **数据库迁移**
```bash
npx prisma migrate dev
npx prisma generate
```

4. **启动服务**
```bash
npm run dev
```

服务将在 http://localhost:8080 启动。

## 📱 设备管理

### 创建设备
```bash
POST /admin/devices
{
  "orgId": "org-123",
  "type": "host",
  "clientId": "web-mopai",
  "name": "Store Terminal 1",
  "locationId": "store-001"
}
```

### 设备证明格式
```javascript
// 设备生成 JWT 证明
const deviceProof = jwt.sign({
  iss: deviceId,
  aud: 'http://localhost:8080',
  sub: deviceId,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 300,
  jti: crypto.randomUUID(),
  device_type: 'host',
  proof_mode: 'device_secret'
}, deviceSecret, { algorithm: 'HS256' });
```

### 带设备证明的刷新请求
```bash
POST /oauth/token
{
  "grant_type": "refresh_token",
  "refresh_token": "rt_xxx",
  "device_proof": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
}
```

## 🔧 配置说明

### 设备证明配置
```env
# 需要设备证明的产品
REQUIRE_DEVICE_PROOF_FOR=mopai,ploml

# 证明模式配置
PROOF_MODE_HOST=device_secret
PROOF_MODE_KIOSK=device_secret

# 设备密钥配置
DEVICE_SECRET_LENGTH=32
DEVICE_JWT_TTL_SEC=300
```

### 刷新策略配置
```env
# 产品特定策略
REFRESH_STRATEGY_MOPAI=sliding_renewal
REFRESH_STRATEGY_PLOML=rotation_threshold

# 策略参数
REFRESH_SLIDING_EXTEND_SEC=604800    # 7天
REFRESH_ROTATION_THRESHOLD_SEC=86400 # 1天
REFRESH_MAX_LIFETIME_SEC=7776000     # 90天
```

### JTI 缓存配置
```env
# 启用产品
JTI_CACHE_ENABLED_PRODUCTS=mopai,ploml

# 缓存参数
JTI_CACHE_TTL_SEC=3600
DEVICE_PROOF_RATE_LIMIT=100
DEVICE_PROOF_RATE_WINDOW_SEC=3600
```

## 🔐 安全特性

### 1. 设备证明验证
- 使用 HS256 算法验证设备密钥
- 检查 JWT 载荷的 iss、sub、aud 字段
- 验证时间戳和过期时间

### 2. 重放攻击防护
- JTI 缓存防止证明重复使用
- 可配置的缓存有效期
- 产品级别的缓存控制

### 3. 刷新策略安全
- 滑动续期有最大生命周期限制
- 轮转阈值避免频繁轮转
- 设备绑定增强安全性

### 4. 限流保护
- 设备证明请求限流
- 基于 Redis 的分布式限流
- 可配置的限流阈值

## 📊 监控与日志

### 审计事件
```javascript
// 设备证明相关事件
'device_proof_verified'    // 设备证明验证成功
'device_proof_failed'      // 设备证明验证失败
'device_proof_replay'      // 检测到重放攻击
'token_refresh_with_device' // 带设备证明的令牌刷新

// 设备管理事件
'device_created'           // 设备创建
'device_revoked'           // 设备撤销
'device_secret_regenerated' // 密钥重新生成
```

### Redis 缓存监控
```bash
# 查看 JTI 缓存
redis-cli keys "authsvc:jti:*"

# 查看限流状态
redis-cli keys "authsvc:rate:*"
```

## 🧪 测试

```bash
# 运行所有测试
npm test

# 运行设备相关测试
npm test -- --grep "device"

# 运行刷新策略测试
npm test -- --grep "refresh"
```

## 🚀 部署

### Docker 部署
```bash
docker build -t auth-service:v0.2.8 .
docker run -d \
  --name auth-service \
  -p 8080:8080 \
  --env-file .env.production \
  auth-service:v0.2.8
```

### 生产环境检查清单
- [ ] 配置强随机 SESSION_SECRET
- [ ] 设置生产数据库连接
- [ ] 配置 Redis 集群
- [ ] 启用 HTTPS (建议使用反向代理)
- [ ] 设置适当的 CORS 策略
- [ ] 配置日志轮转
- [ ] 设置监控告警

## 📖 API 文档

### 设备管理端点

#### 创建设备
- `POST /admin/devices`
- 需要管理员权限
- 返回设备信息和密钥（仅创建时）

#### 列出设备
- `GET /admin/devices?orgId=xxx`
- 支持按组织、客户端、类型、状态筛选

#### 撤销设备
- `POST /admin/devices/:deviceId/revoke`
- 可选撤销原因

#### 重新生成密钥
- `POST /admin/devices/:deviceId/regenerate-secret`
- 返回新密钥（仅生成时）

### OAuth2 端点

#### 令牌端点（增强）
- `POST /oauth/token`
- 支持 `device_proof` 参数
- 根据产品应用不同刷新策略

#### 内省端点
- `POST /oauth/introspect`
- 验证访问令牌有效性
- 返回令牌元数据

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📝 许可证

MIT License

## 📞 支持

- 文档: [内部文档链接]
- Issues: [GitHub Issues]
- 技术支持: [内部联系方式]

---

**auth-service v0.2.8** - 安全、可扩展的企业级认证服务