export interface AppConfig {
  NODE_ENV: string;       // 环境类型，development/production/test
  PORT: number;           // 服务监听端口

  database: {             // 数据库连接配置
    url: string;          // 数据库连接URL
    host: string;         // 主机名
    port: number;         // 端口号
    name: string;         // 数据库名
    user: string;         // 用户名
    password: string;     // 密码
  };

  jwt: {                  // JWT配置
    secret: string;             // Access Token密钥
    refreshSecret: string;      // Refresh Token密钥
    accessTokenExpiry: string;  // Access Token过期时间（如'15m'）
    refreshTokenExpiry: string; // Refresh Token过期时间（如'7d'）
  };

  email: {                // 邮件服务配置
    smtp: {
      host: string;       // SMTP服务器地址
      port: number;       // SMTP端口
      secure: boolean;    // 是否SSL
      user: string;       // SMTP登录用户名
      password: string;   // SMTP登录密码/授权码
    };
    from: {               // 邮件发件人配置
      name: string;       // 发件人名称
      address: string;    // 发件人邮箱地址
    };
    templates: {          // 邮件模板配置
      baseUrl: string;    // 前端应用基础URL
      verificationPath: string;  // 邮箱验证路径
      resetPasswordPath: string; // 密码重置路径
      verificationTokenExpiry: string; // 验证令牌过期时间
      resetTokenExpiry: string;        // 重置令牌过期时间
    };
  };

  password: {             // 密码策略配置
    bcryptRounds: number;       // bcrypt加密轮数
    minLength: number;          // 密码最小长度
    requireUppercase: boolean;  // 是否要求大写字母
    requireLowercase: boolean;  // 是否要求小写字母
    requireNumbers: boolean;    // 是否要求数字
    requireSpecialChars: boolean; // 是否要求特殊字符
  };

  rateLimit: {            // 速率限制配置
    windowMs: number;          // 时间窗口（毫秒）
    maxRequests: number;       // 最大请求数
    loginAttempts: number;     // 登录最大尝试次数
    registrationAttempts: number; // 注册最大尝试次数
  };

  log: {                  // 日志配置
    level: string;        // 日志级别
    filePath: string;     // 日志文件路径
  };

  cors: {                 // CORS跨域配置
    origin: string[];     // 允许的来源数组
  };

  security: {             // 其它安全策略
    sessionTimeout: number;         // 会话超时时间（秒）
    maxLoginAttempts: number;       // 单用户最大登录尝试
    lockoutDuration: number;        // 账户锁定时长（秒）
    requireEmailVerification: boolean; // 是否要求邮箱验证
  };
}
