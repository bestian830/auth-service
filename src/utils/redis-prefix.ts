import { REDIS_CONFIG } from '../constants';

export function withRedisPrefix(key: string): string {
    return REDIS_CONFIG.keyPrefix + key;
}