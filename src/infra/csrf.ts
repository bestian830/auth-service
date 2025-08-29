import csrf from 'csurf';

export const csrfProtection = csrf({ 
  cookie: false // 使用 session 存储 CSRF token
});