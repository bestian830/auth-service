export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors?: ValidationError[];
}

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}