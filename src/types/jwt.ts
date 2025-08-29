export type ACR = 'low' | 'normal' | 'high';

export interface AccessClaims {
  sub: string;
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  tenant_id: string;
  roles?: string[];
  scopes?: string[];
  location_id?: string | null;
  device_id?: string | null;
  acr?: ACR;
  amr?: string[];
}
