// types/auth.ts

export const AUTH_HEADERS = {
  AUTHORIZATION: 'Authorization',
  REFRESH_TOKEN: 'Refresh-Token',
  TENANT_ID: 'Tenant-Id',
  SESSION_ID: 'Session-Id'
} as const;

export type AuthHeaderKey = keyof typeof AUTH_HEADERS;