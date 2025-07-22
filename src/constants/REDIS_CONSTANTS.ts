export const REDIS_CONFIG = {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    connectTimeout: 10000,
    maxRetries: 5,
    retryDelay: 2000,
    keyPrefix: 'authsvc:',
};