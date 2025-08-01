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
}

export interface PasswordResetResult {
  success: boolean;
  message?: string;
  resetToken?: string;
}

export interface VerifyResetCodeInput {
  email: string;
  code: string;
}
