export const TENANT_UNIQUE_FIELDS = ['email', 'subdomain'] as const;
export const TENANT_STATUS = {
    ACTIVE: 'ACTIVE',
    DISABLED: 'DISABLED',
    DELETED: 'DELETED',
} as const;

export const TENANT_ERRORS = {
    EMAIL_EXISTS: 'Email already registered',
    SUBDOMAIN_EXISTS: 'Subdomain already registered',
    TENANT_NOT_FOUND: 'Tenant not found',
    INVALID_PASSWORD: 'Invalid password',
    NOT_ALLOWED: 'Operation not allowed',
} as const;