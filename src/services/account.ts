// src/services/account.ts
import bcrypt from 'bcryptjs';
import { Account, Device } from '@prisma/client';
import { prisma } from '../infra/prisma.js';
import { env } from '../config/env.js';
import { audit } from '../middleware/audit.js';

/**
 * Account创建请求接口
 */
export interface CreateAccountRequest {
  orgId: string;
  accountType: 'OWNER' | 'MANAGER' | 'STAFF';
  productType: string; // 'beauty' | 'fb'
  username?: string;
  password?: string;
  employeeNumber: string;
  pinCode: string;
  name?: string;
  email?: string;
  phone?: string;
  createdBy: string; // User ID 或 Account ID
}

/**
 * Account Service
 * 负责Account账号管理的核心业务逻辑
 */
export class AccountService {
  /**
   * 验证PIN码格式
   * @param pinCode - PIN码
   * @returns 验证结果
   */
  validatePinCode(pinCode: string): { valid: boolean; error?: string } {
    if (!/^\d{4}$/.test(pinCode)) {
      return { valid: false, error: 'pin_code_must_be_4_digits' };
    }
    return { valid: true };
  }

  /**
   * 验证员工号格式
   * @param employeeNumber - 员工号
   * @returns 验证结果
   */
  validateEmployeeNumber(employeeNumber: string): { valid: boolean; error?: string } {
    if (!employeeNumber || employeeNumber.length < 4 || employeeNumber.length > 8) {
      return { valid: false, error: 'invalid_employee_number' };
    }

    // 检查字符类型：仅字母和数字（使用 i 标志忽略大小写）
    if (!/^[a-z0-9]+$/i.test(employeeNumber)) {
      return { valid: false, error: 'employee_number_invalid_characters' };
    }

    return { valid: true };
  }

  /**
   * 创建新的Account账号
   * @param request - 创建请求
   * @param creatorType - 创建者类型（USER或ACCOUNT）
   * @returns 创建的账号和明文PIN（仅此一次）
   */
  async createAccount(
    request: CreateAccountRequest,
    creatorType: 'USER' | 'ACCOUNT'
  ): Promise<{
    account: any;
    pinCode: string; // 明文PIN，仅创建时返回一次
  }> {
    // 1. 验证员工号格式
    const empValidation = this.validateEmployeeNumber(request.employeeNumber);
    if (!empValidation.valid) {
      throw new Error(empValidation.error);
    }

    // 2. 验证PIN码格式
    const pinValidation = this.validatePinCode(request.pinCode);
    if (!pinValidation.valid) {
      throw new Error(pinValidation.error);
    }

    // 3. 检查组织是否存在且活跃
    const organization = await prisma.organization.findUnique({
      where: { id: request.orgId },
    });

    if (!organization || organization.status !== 'ACTIVE') {
      throw new Error('organization_not_found_or_inactive');
    }

    // 4. OWNER类型的特殊检查
    if (request.accountType === 'OWNER') {
      // 只能在FRANCHISE组织中创建
      if (organization.orgType !== 'FRANCHISE') {
        throw new Error('owner_only_for_franchise');
      }

      // 检查是否已存在OWNER
      const existingOwner = await prisma.account.findFirst({
        where: {
          orgId: request.orgId,
          accountType: 'OWNER',
          status: 'ACTIVE',
        },
      });

      if (existingOwner) {
        throw new Error('franchise_already_has_owner');
      }
    }

    // 5. OWNER/MANAGER需要username和password
    if (['OWNER', 'MANAGER'].includes(request.accountType)) {
      if (!request.username || !request.password) {
        throw new Error('username_password_required');
      }

      // 检查username唯一性（全局唯一，仅ACTIVE状态）
      const existingUsername = await prisma.account.findFirst({
        where: {
          username: request.username,
          status: 'ACTIVE',
        },
      });

      if (existingUsername) {
        throw new Error('username_already_exists');
      }

      // 验证密码强度
      if (request.password.length < 8) {
        throw new Error('password_too_short');
      }
    }

    // 6. 检查员工号在组织内唯一（仅ACTIVE状态）
    const existingEmployee = await prisma.account.findFirst({
      where: {
        orgId: request.orgId,
        employeeNumber: request.employeeNumber,
        status: 'ACTIVE',
      },
    });

    if (existingEmployee) {
      throw new Error('employee_number_exists_in_org');
    }

    // 7. Hash密码和PIN码
    const passwordHash = request.password
      ? await bcrypt.hash(request.password, env.passwordHashRounds)
      : null;

    const pinCodeHash = await bcrypt.hash(request.pinCode, env.passwordHashRounds);

    // 8. 创建Account记录
    const account = await prisma.account.create({
      data: {
        orgId: request.orgId,
        accountType: request.accountType,
        productType: request.productType as any,
        username: request.username || null,
        passwordHash,
        employeeNumber: request.employeeNumber,
        pinCodeHash,
        name: request.name || null,
        email: request.email || null,
        phone: request.phone || null,
        createdBy: request.createdBy,
        status: 'ACTIVE',
      },
    });

    // 9. 记录审计日志
    audit('account_created', {
      accountId: account.id,
      orgId: request.orgId,
      accountType: request.accountType,
      employeeNumber: request.employeeNumber,
      hasUsername: !!request.username,
      createdBy: request.createdBy,
      creatorType,
    });

    // 10. 返回结果（移除hash字段）
    return {
      account: {
        ...account,
        passwordHash: undefined,
        pinCodeHash: undefined,
      },
      pinCode: request.pinCode, // 明文PIN，仅此一次
    };
  }

  /**
   * 后台登录认证（username + password）
   * 仅适用OWNER和MANAGER
   * @param username - 用户名
   * @param password - 密码
   * @param productType - 产品类型
   * @returns 账号信息（包含组织信息）
   */
  async authenticateBackend(
    username: string,
    password: string,
    productType: string
  ): Promise<Account & { organization: any }> {
    // 1. 查询Account
    const account = await prisma.account.findFirst({
      where: {
        username,
        productType: productType as any,
        status: 'ACTIVE',
        accountType: { in: ['OWNER', 'MANAGER'] }, // STAFF不能后台登录
      },
      include: {
        organization: true,
      },
    });

    if (!account) {
      throw new Error('invalid_credentials');
    }

    // 2. 检查是否有密码
    if (!account.passwordHash) {
      throw new Error('account_no_password');
    }

    // 3. 检查账号是否锁定（若锁定已过期则即时解锁）
    const now = new Date();
    if (account.lockedUntil && account.lockedUntil <= now) {
      await prisma.account.update({
        where: { id: account.id },
        data: { lockedUntil: null, lockReason: null },
      });
      audit('account_unlocked', {
        accountId: account.id,
        reason: 'lock_expired',
        previousLockedUntil: account.lockedUntil.toISOString(),
        unlockedAt: new Date().toISOString(),
        context: 'authenticateBackend',
      });
    }
    if (account.lockedUntil && account.lockedUntil > now) {
      throw new Error('account_locked');
    }

    // 4. 验证密码
    const isValid = await bcrypt.compare(password, account.passwordHash);
    if (!isValid) {
      await this.incrementLoginFailure(account.id);
      throw new Error('invalid_credentials');
    }

    // 5. 检查组织状态
    if (account.organization.status !== 'ACTIVE') {
      throw new Error('organization_inactive');
    }

    // 6. 登录成功后更新登录状态（重置失败计数并清锁）
    await this.updateLastLogin(account.id);

    // 7. 返回账号信息
    return account;
  }

  /**
   * POS登录认证（employeeNumber + pinCode + deviceId）
   * 适用所有类型的Account
   * @param employeeNumber - 员工号
   * @param pinCode - PIN码
   * @param deviceId - 设备ID
   * @param productType - 产品类型
   * @returns 账号和设备信息
   */
  async authenticatePOS(
    employeeNumber: string,
    pinCode: string,
    deviceId: string,
    productType: string
  ): Promise<{
    account: Account;
    device: Device & { organization: any };
  }> {
    // 1. 验证设备存在且活跃
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      include: { organization: true },
    });

    if (!device) {
      throw new Error('device_not_found');
    }

    if (device.status !== 'ACTIVE') {
      throw new Error('device_not_active');
    }

    // 2. 查询Account（在设备所属组织内）
    const account = await prisma.account.findFirst({
      where: {
        orgId: device.orgId,
        employeeNumber,
        productType: productType as any,
        status: 'ACTIVE',
      },
    });

    if (!account) {
      throw new Error('invalid_credentials');
    }

    // 3. 检查账号是否锁定（若锁定已过期则即时解锁）
    const now = new Date();
    if (account.lockedUntil && account.lockedUntil <= now) {
      await prisma.account.update({
        where: { id: account.id },
        data: { lockedUntil: null, lockReason: null },
      });
      audit('account_unlocked', {
        accountId: account.id,
        reason: 'lock_expired',
        previousLockedUntil: account.lockedUntil.toISOString(),
        unlockedAt: new Date().toISOString(),
        context: 'authenticatePOS',
        deviceId,
      });
    }
    if (account.lockedUntil && account.lockedUntil > now) {
      throw new Error('account_locked');
    }

    // 4. 验证PIN码
    const isValid = await bcrypt.compare(pinCode, account.pinCodeHash);
    if (!isValid) {
      await this.incrementLoginFailure(account.id);
      throw new Error('invalid_pin_code');
    }

    // 5. 检查组织状态
    if (device.organization.status !== 'ACTIVE') {
      throw new Error('organization_inactive');
    }

    // 6. 登录成功后更新登录状态（重置失败计数并清锁）
    await this.updateLastLogin(account.id);

    // 7. 返回账号和设备信息
    return { account, device };
  }

  /**
   * 重置Account的PIN码（管理员操作）
   * @param accountId - 账号ID
   * @param newPinCode - 新PIN码
   * @param resetBy - 重置操作者ID
   * @returns 新PIN码（明文，仅此一次）
   */
  async resetPinCode(
    accountId: string,
    newPinCode: string,
    resetBy: string
  ): Promise<{
    newPinCode: string; // 明文PIN，仅此一次
  }> {
    // 1. 验证新PIN码格式
    const validation = this.validatePinCode(newPinCode);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // 2. 检查账号是否存在
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new Error('account_not_found');
    }

    // 3. Hash新PIN码
    const pinCodeHash = await bcrypt.hash(newPinCode, env.passwordHashRounds);

    // 4. 更新PIN码
    await prisma.account.update({
      where: { id: accountId },
      data: { pinCodeHash },
    });

    // 5. 记录审计日志
    audit('account_pin_reset', {
      accountId,
      resetBy,
      resetAt: new Date().toISOString(),
    });

    // 6. 返回明文PIN（仅此一次）
    return { newPinCode };
  }

  /**
   * 更新账号的最后登录时间
   * 在登录成功后调用，同时重置失败计数和锁定状态
   * @param accountId - 账号ID
   */
  async updateLastLogin(accountId: string): Promise<void> {
    await prisma.account.update({
      where: { id: accountId },
      data: {
        lastLoginAt: new Date(),
        loginFailureCount: 0,
        lastLoginFailureAt: null,
        lockedUntil: null,
        lockReason: null,
      },
    });
  }

  /**
   * 增加登录失败计数，必要时锁定账号
   * 在登录失败后调用
   * @param accountId - 账号ID
   */
  async incrementLoginFailure(accountId: string): Promise<void> {
    // 1. 获取当前账号
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { loginFailureCount: true },
    });

    if (!account) return;

    // 2. 增加失败计数
    const newCount = account.loginFailureCount + 1;

    // 3. 检查是否需要锁定（10次失败）
    const maxFailures = env.loginLockThreshold || 10;
    const shouldLock = newCount >= maxFailures;

    if (shouldLock) {
      const lockDuration = (env.loginLockMinutes || 30) * 60 * 1000;
      const lockedUntil = new Date(Date.now() + lockDuration);

      await prisma.account.update({
        where: { id: accountId },
        data: {
          loginFailureCount: newCount,
          lastLoginFailureAt: new Date(),
          lockedUntil,
          lockReason: 'max_failures',
        },
      });

      audit('account_locked', {
        accountId,
        reason: 'max_failures',
        failureCount: newCount,
        lockedUntil: lockedUntil.toISOString(),
      });
    } else {
      await prisma.account.update({
        where: { id: accountId },
        data: {
          loginFailureCount: newCount,
          lastLoginFailureAt: new Date(),
        },
      });

      audit('account_login_failure', {
        accountId,
        failureCount: newCount,
        failureAt: new Date().toISOString(),
      });
    }
  }
}

// 导出单例
export const accountService = new AccountService();
