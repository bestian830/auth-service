export interface DatabaseConfig {
    maxRetries: number;
    retryDelay: number;
    connectionLimit: number;
    timeout: number;
    idleTimeout: number;
    shutdownTimeout: number;
}

export interface DatabaseConnectionStatus {
    connected: boolean;
    connectionCount?: number;
    maxConnections?: number;
    database?: string;
    host?: string;
    port?: number;
    error?: string;
}