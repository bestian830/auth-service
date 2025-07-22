import path from 'path';

export const LOGGER_CONFIG = {
    LOG_DIR: path.join(__dirname, '../../logs'),
    ARCHIVED_DIR: path.join(__dirname, '../../logs/archived'),
    ERROR_LOG_PATH: path.join(__dirname, '../../logs/error.log'),
    ARCHIVE_RETENTION_DAYS: 30,
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    WINSTON_CONFIG: {
        level: process.env.LOG_LEVEL || 'info',
        timestampFormat: 'YYYY-MM-DD HH:mm:ss',
        maxsize: 10 * 1024 * 1024, // 10MB
        maxFiles: 5,
        tailable: true,
    }
};