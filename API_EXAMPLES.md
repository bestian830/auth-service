# Auth Service v0.2.11 - API Usage Examples

## 🎯 纯API模式 - 前端直接调用

### 1. 用户注册

```javascript
const response = await fetch('http://localhost:8080/identity/register', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'user@tymoe.com',
    password: 'SecurePass123',
    organizationName: 'My Beauty Salon' // 可选，会自动创建组织
  })
});

const result = await response.json();
// 返回：{ ok: true }
```

### 2. 用户登录

```javascript  
const response = await fetch('http://localhost:8080/identity/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'user@tymoe.com',
    password: 'SecurePass123'
  })
});

const result = await response.json();
// 返回：
// {
//   "access_token": "eyJ...",
//   "refresh_token": "eyJ...", 
//   "token_type": "Bearer",
//   "expires_in": 1800,
//   "user": {
//     "id": "uuid",
//     "email": "user@tymoe.com",
//     "organizations": [...]
//   }
// }
```

### 3. 获取用户详细信息

```javascript
const response = await fetch('http://localhost:8080/identity/me', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const userInfo = await response.json();
// 返回：{
//   "id": "uuid",
//   "email": "user@tymoe.com",
//   "name": "User Name",
//   "phone": "1234567890",
//   "address": "User Address",
//   "emailVerifiedAt": "2025-01-06T18:10:13.811Z",
//   "createdAt": "2025-01-06T18:09:01.666Z"
// }
```

### 4. 获取OIDC标准用户信息

```javascript
const response = await fetch('http://localhost:8080/userinfo', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const oidcInfo = await response.json();
// 返回：{
//   "sub": "user-uuid",
//   "organizationId": "org-uuid",
//   "roles": ["OWNER"],
//   "scopes": ["openid", "profile", "email"],
//   "acr": "normal"
// }
```

### 5. 创建组织

```javascript
const response = await fetch('http://localhost:8080/organizations', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'My Restaurant',
    description: 'Best restaurant in town'
  })
});

const organization = await response.json();
```

### 6. 邀请用户到组织

```javascript
const response = await fetch(`http://localhost:8080/organizations/${orgId}/members`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'employee@example.com',
    role: 'EMPLOYEE' // OWNER, MANAGER, EMPLOYEE
  })
});
```

### 7. 邮箱验证

```javascript
const response = await fetch('http://localhost:8080/identity/verify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'user@tymoe.com',
    code: '123456' // 6位验证码
  })
});

const result = await response.json();
// 返回：{ ok: true } 或 { error: "invalid_code" }
```

### 8. 密码重置

```javascript
// 发起密码重置请求
const resetRequest = await fetch('http://localhost:8080/identity/forgot-password', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'user@tymoe.com'
  })
});

// 使用验证码重置密码
const resetPassword = await fetch('http://localhost:8080/identity/reset-password', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'user@tymoe.com',
    code: '123456', // 6位验证码
    password: 'NewSecurePass123!'
  })
});

const result = await resetPassword.json();
// 返回：{ ok: true } 或 { error: "invalid_code" }
```

## 🔄 Token刷新

```javascript
const response = await fetch('http://localhost:8080/oauth/token', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  })
});

const tokens = await response.json();
// 返回新的access_token和refresh_token
```

## 🚫 注销

```javascript
// 撤销refresh token
await fetch('http://localhost:8080/oauth/revoke', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: new URLSearchParams({
    token: refreshToken,
    token_type_hint: 'refresh_token'
  })
});
```

## 📱 前端集成示例

### React Hook Example

```javascript
// useAuth.js
import { useState, useEffect } from 'react';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const login = async (email, password) => {
    const response = await fetch('http://localhost:8080/identity/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (response.ok) {
      const data = await response.json();
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      setUser(data.user);
      return data;
    }
    
    const error = await response.json();
    throw new Error(error.error || 'Login failed');
  };
  
  const verifyEmail = async (email, code) => {
    const response = await fetch('http://localhost:8080/identity/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });
    
    if (response.ok) {
      return await response.json();
    }
    
    const error = await response.json();
    throw new Error(error.error || 'Verification failed');
  };
  
  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
  };
  
  return { user, login, verifyEmail, logout, loading };
}
```

## 🛡️ 错误处理

```javascript
// 400: 请求参数错误
if (response.status === 400) {
  const error = await response.json();
  switch (error.error) {
    case 'missing_required_fields':
      // 显示"请填写必填字段"
      break;
    case 'invalid_email_format':
      // 显示"邮箱格式不正确"
      break;
    case 'password_too_short':
      // 显示"密码太短"
      break;
    case 'invalid_code':
      // 显示"验证码错误"
      break;
  }
}

// 401: Token过期，需要刷新
if (response.status === 401) {
  // 尝试刷新token
  const refreshResult = await refreshToken();
  if (refreshResult.ok) {
    // 重试原请求
    return fetch(originalUrl, originalOptions);
  } else {
    // 刷新失败，跳转到登录页
    window.location.href = '/login';
  }
}

// 403: 权限不足
if (response.status === 403) {
  const error = await response.json();
  if (error.error === 'email_not_verified') {
    // 显示"请先验证邮箱"
  } else if (error.error === 'insufficient_scope') {
    // 显示"权限不足"
  }
}

// 409: 冲突
if (response.status === 409) {
  const error = await response.json();
  if (error.error === 'email_already_registered') {
    // 显示"邮箱已被注册"
  } else if (error.error === 'subdomain_taken') {
    // 显示"子域名已被占用"
  }
}

// 429: 速率限制
if (response.status === 429) {
  // 显示"请求过于频繁，请稍后再试"
}

// 500: 服务器错误
if (response.status === 500) {
  // 显示"服务器错误，请稍后再试"
}
```

## 🎨 优势总结

✅ **前端完全控制UI** - 登录页面、注册表单都是你的设计  
✅ **单页应用体验** - 无页面跳转，体验流畅  
✅ **简单直接** - 标准的REST API调用  
✅ **安全可靠** - 依然使用JWT + Refresh Token  
✅ **灵活定制** - 可以轻松添加自定义字段和逻辑