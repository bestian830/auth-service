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
// 返回：{ success: true, message: "Please check your email for verification" }
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

### 3. 使用Access Token访问保护的资源

```javascript
const response = await fetch('http://localhost:8080/userinfo', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const userInfo = await response.json();
// 返回用户信息和组织角色
```

### 4. 创建组织

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

### 5. 邀请用户到组织

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
    
    throw new Error('Login failed');
  };
  
  const logout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
  };
  
  return { user, login, logout, loading };
}
```

## 🛡️ 错误处理

```javascript
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

// 429: 速率限制
if (response.status === 429) {
  // 显示"请求过于频繁"提示
}
```

## 🎨 优势总结

✅ **前端完全控制UI** - 登录页面、注册表单都是你的设计  
✅ **单页应用体验** - 无页面跳转，体验流畅  
✅ **简单直接** - 标准的REST API调用  
✅ **安全可靠** - 依然使用JWT + Refresh Token  
✅ **灵活定制** - 可以轻松添加自定义字段和逻辑