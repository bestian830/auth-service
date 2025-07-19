/**
 * 错误日志接口
 * 定义错误日志必须包含的字段
 */
export interface ErrorLogData {
  tenantId?: string;        // 租户ID
  timestamp: string;        // 错误发生时间
  sessionId?: string;       // 相关会话ID
  errorMessage: string;     // 错误消息
  errorReason: string;      // 错误原因/堆栈
  ipAddress?: string;       // 客户端IP地址
  operation: string;        // 执行的操作
}

/**
 * 错误上下文接口
 * 用于传递当前操作的上下文信息
 */
export interface ErrorContext {
  tenantId?: string;
  sessionId?: string;
  operation?: string;
  ipAddress?: string;
} 