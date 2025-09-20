export type ACR = 'low' | 'normal' | 'high';

export interface AccessClaims {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  organizationId?: string | null;
  roles?: string[];
  scopes?: string[];
  deviceId?: string | null;
  acr?: ACR;
  amr?: string[];
}
