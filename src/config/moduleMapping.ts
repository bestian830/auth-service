/**
 * 资源类型到 Subscription Module Key 的映射
 * 用于调用 subscription-service 检查配额
 */

export const ACCOUNT_MODULE_MAPPING: Record<string, string | null> = {
  // 不需要配额检查
  USER: null,          // 主店/分店老板 - 不需要配额
  OWNER: null,         // 加盟店老板 - Franchise 自带，不需要配额
  
  // 需要配额检查（USER 购买的资源）
  MANAGER: 'manager',  // 管理员 - 需要配额
  STAFF: 'staff',      // 员工 - 需要配额
};

export const DEVICE_MODULE_MAPPING: Record<string, string> = {
  KIOSK: 'kiosk',     // Kiosk 设备 - 需要配额
  POS: 'pos',         // POS 设备 - 需要配额
  TABLET: 'tablet',   // Tablet 设备 - 需要配额
};

/**
 * 获取账号类型对应的 module key
 * @returns module key 或 null（null 表示不需要配额检查）
 */
export function getAccountModuleKey(accountType: string): string | null {
  const normalizedType = accountType.toUpperCase();
  return ACCOUNT_MODULE_MAPPING[normalizedType] ?? null;
}

/**
 * 获取设备类型对应的 module key
 */
export function getDeviceModuleKey(deviceType: string): string | null {
  const normalizedType = deviceType.toUpperCase();
  return DEVICE_MODULE_MAPPING[normalizedType] ?? null;
}

/**
 * 检查账号类型是否需要配额检查
 */
export function accountNeedsQuotaCheck(accountType: string): boolean {
  return getAccountModuleKey(accountType) !== null;
}

/**
 * 检查设备类型是否需要配额检查
 */
export function deviceNeedsQuotaCheck(deviceType: string): boolean {
  return getDeviceModuleKey(deviceType) !== null;
}
