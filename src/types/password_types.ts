export interface ChangePasswordInput {
  tenantId: string;
  oldPassword: string;
  newPassword: string;
}

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

export interface InitiateResetInput {
  email: string;
  tenantId: string;
}

export interface PasswordResetResult {
  success: boolean;
  message?: string;
}
