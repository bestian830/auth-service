export interface LoginInput {
  email: string;
  password: string;
  ip: string;
  userAgent?: string;
  deviceType?: string;
}

export interface AuthResult {
  success: boolean;
  tenantId?: string;
  accessToken?: string;
  refreshToken?: string;
  sessionId?: string;
  emailVerified?: boolean;
  error?: string;
  lockReason?: string;
  lockRemainSeconds?: number;
}

export interface LogoutInput {
  token: string;
}

export interface RefreshInput {
  refreshToken: string;
}