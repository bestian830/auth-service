export interface AuthJwtPayload {
  tenantId: string;
  email?: string;
  storeName?: string | null;
  subdomain?: string | null;
  subscriptionStatus?: 'ACTIVE' | 'PAST_DUE' | 'CANCELED' | 'UNSUBSCRIBE' | 'TRIAL';
  subscriptionPlan?: 'BASIC' | 'STANDARD' | 'PRO' | 'PREMIUM';
  emailVerified?: boolean;
  sessionId?: string;
  type: 'access' | 'refresh' | 'email_verification' | 'password_reset';
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
  jti?: string;
}

export interface TokenGenerationParams {
  tenantId: string;
  email?: string;
  storeName?: string | null;
  subdomain?: string | null;
  subscriptionStatus?: string;
  subscriptionPlan?: string;
  emailVerified?: boolean;
  sessionId?: string;
}

export interface TokenRefreshResult {
  success: boolean;
  tokens?: {
    accessToken: string;
    refreshToken: string;
    expiresIn: string | number;
    tokenType: 'Bearer';
  };
  error?: string;
  requiresLogin?: boolean;
}