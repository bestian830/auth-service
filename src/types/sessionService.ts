// types/session.ts

export interface CreateSessionInput {
  tenantId: string;
  refreshToken?: string;
  userAgent?: string;
  ip?: string;
  deviceType?: string;
}

export interface SessionResult {
  sessionId: string;
  expiresAt: Date;
  success: boolean;
}

export interface RefreshSessionResult {
  success: boolean;
  sessionId: string;
  newExpiresAt?: Date;
  message?: string;
}

export interface InvalidateSessionResult {
  success: boolean;
  sessionId: string;
  message?: string;
}