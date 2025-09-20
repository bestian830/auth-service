// src/middleware/auditEvents.ts
/**
 * v0.2.8-p2: 审计事件标准化命名规范
 * 
 * 命名约定：
 * - 格式：{domain}_{action}_{result?}
 * - domain: login, register, token, device, admin, quota, plan, config 等
 * - action: attempt, verify, refresh, revoke, check, reload 等  
 * - result: ok/success, fail/error, denied, expired, invalid 等
 * 
 * 标准化映射表：旧名称 → 新名称
 */

// 认证相关事件
export const AUTH_EVENTS = {
  // 登录流程
  'login_attempt': 'auth_login_attempt',
  'login_success': 'auth_login_success', 
  'login_fail': 'auth_login_fail',
  'login_error': 'auth_login_error',
  
  // 注册流程
  'register_requested': 'auth_register_attempt',
  'register_conflict': 'auth_register_conflict',
  'register_invalid_request': 'auth_register_invalid',
  'register_subdomain_conflict': 'auth_register_subdomain_conflict',
  'register_error': 'auth_register_error',
  
  // 邮箱验证
  'email_verified': 'auth_verify_success',
  'verify_failed': 'auth_verify_fail',
  'verify_invalid_request': 'auth_verify_invalid',
  'verify_invalid_format': 'auth_verify_format_error',
  
  // 密码重置
  'reset_requested': 'auth_reset_attempt',
  'reset_requested_nonexistent': 'auth_reset_nonexistent',
  'reset_invalid_request': 'auth_reset_invalid',
  'reset_error': 'auth_reset_error',
  'password_reset': 'auth_password_reset_success',
  'password_reset_failed': 'auth_password_reset_fail',
  
  // 登出
  'logout': 'auth_logout',
  'logout_error': 'auth_logout_error'
} as const;

// Token 相关事件
export const TOKEN_EVENTS = {
  'token_issue': 'token_issue_success',
  'token_denied': 'token_issue_denied',
  'token_refresh': 'token_refresh_success',
  'token_refresh_failed': 'token_refresh_fail',
  'refresh_rotate': 'token_refresh_rotate',
  'refresh_sliding': 'token_refresh_sliding',
  'refresh_reuse': 'token_refresh_reuse',
  'refresh_inactive_logout': 'token_refresh_inactive_logout',
  'revoke': 'token_revoke_success',
  'revoke_token_not_found': 'token_revoke_not_found',
  'revoke_client_mismatch': 'token_revoke_client_mismatch'
} as const;

// 设备验证事件
export const DEVICE_EVENTS = {
  'device_proof_attempt': 'device_proof_attempt',
  'device_proof_ok': 'device_proof_success', 
  'device_proof_fail': 'device_proof_fail',
  'device_proof_verified': 'device_proof_verified',
  'device_proof_failed': 'device_proof_failed'
} as const;

// 用户安全事件  
export const SECURITY_EVENTS = {
  'user_locked': 'security_user_locked',
  'user_unlocked': 'security_user_unlocked',
  'user_failures_reset': 'security_failures_reset',
  'cleanup_expired_locks': 'security_locks_cleanup'
} as const;

// 管理员操作事件
export const ADMIN_EVENTS = {
  'admin_unauthorized': 'admin_access_denied',
  'admin_unlock_user': 'admin_user_unlock_success',
  'admin_unlock_user_error': 'admin_user_unlock_error',
  'admin_config_reload_request': 'admin_config_reload_attempt',
  'admin_config_reload_success': 'admin_config_reload_success',
  'admin_config_reload_fail': 'admin_config_reload_fail',
  'admin_quota_query': 'admin_quota_query_success',
  'admin_quota_query_fail': 'admin_quota_query_fail',
  'admin_health_check': 'admin_health_check',
  'storeType_changed': 'admin_store_type_changed'
} as const;

// 产品线和配额事件
export const PRODUCT_EVENTS = {
  'product_unknown_client': 'product_client_unknown',
  'product_hint_resolved': 'product_hint_resolved',
  'product_access_denied': 'product_access_denied',
  'quota_check': 'quota_check_success',
  'quota_check_fail': 'quota_check_fail',
  'quota_enforce_block': 'quota_enforce_block',
  'quota_enforce_error': 'quota_enforce_error'
} as const;

// 订阅计划事件
export const PLAN_EVENTS = {
  'plan_fetch_remote_ok': 'plan_fetch_remote_success',
  'plan_fetch_remote_fail': 'plan_fetch_remote_fail'
} as const;

// 邮件发送事件
export const EMAIL_EVENTS = {
  'email_sent': 'email_send_success',
  'email_send_failed': 'email_send_fail',
  'email_rejected_recipients': 'email_send_rejected'
} as const;

/**
 * 获取标准化的事件名称
 */
export function getStandardEventName(oldName: string): string {
  // 检查各个事件映射表
  const allMappings = {
    ...AUTH_EVENTS,
    ...TOKEN_EVENTS, 
    ...DEVICE_EVENTS,
    ...SECURITY_EVENTS,
    ...ADMIN_EVENTS,
    ...PRODUCT_EVENTS,
    ...PLAN_EVENTS,
    ...EMAIL_EVENTS
  };
  
  return allMappings[oldName as keyof typeof allMappings] || oldName;
}

/**
 * 标准化审计函数（向后兼容）
 */
export function auditStandard(eventName: string, detail: any) {
  const standardName = getStandardEventName(eventName);
  
  // 这里可以调用原有的 audit 函数
  const { audit } = require('./audit.js');
  audit(standardName, detail);
}