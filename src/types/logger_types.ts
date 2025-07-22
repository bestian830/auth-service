export interface ErrorContext {
    tenantId?: string;
    sessionId?: string;
    ipAddress?: string;
    operation?: string;
}

export interface ErrorLogData {
    tenantId?: string;
    sessionId?: string;
    ipAddress?: string;
    operation?: string;
    timestamp: string;
    errorMessage: string;
    errorReason: string;
}