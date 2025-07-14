/**
 * 定期清理任务
 */

import { cleanupExpiredBlacklistTokens } from './token-blacklist';
import { logger } from './logger';

/**
 * 每小时清理过期的黑名单token
 */
export const startTokenCleanupTask = () => {
  const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1小时
  
  setInterval(async () => {
    try {
      const cleanedCount = await cleanupExpiredBlacklistTokens();
      if (cleanedCount > 0) {
        logger.info('Token blacklist cleanup completed', { cleanedCount });
      }
    } catch (error) {
      logger.error('Token blacklist cleanup failed', { error });
    }
  }, CLEANUP_INTERVAL);
  
  logger.info('Token cleanup task started');
};

/**
 * 启动所有定期任务
 */
export const startScheduledTasks = () => {
  startTokenCleanupTask();
}; 