export interface RegisterTenantInput {
    email: string;
    password: string;
    phone?: string;
    storeName?: string;
    subdomain?: string;
    address?: string;
}

export interface UpdateTenantInput {
    tenantId: string;
    storeName?: string;
    subdomain?: string;
    phone?: string;
    address?: string;
    email?: string;
}

export interface ChangeTenantPasswordInput {
    tenantId: string;
    oldPassword: string;
    newPassword: string;
}

export interface TenantInfo {
    id: string;
    email: string;
    phone?: string;
    storeName?: string;
    subdomain?: string;
    address?: string;
    emailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;   
}

export interface TenantCheckResult {
    field: 'email' | 'subdomain';
    value: string;
    unique: boolean;
}

export type TenantField = 'email' | 'subdomain';