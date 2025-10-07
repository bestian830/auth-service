// src/services/device.ts
import { Device, Prisma } from '@prisma/client';
import { prisma } from '../infra/prisma.js';
import { audit } from '../middleware/audit.js';

/**
 * Device Service
 * 负责Device设备管理的核心业务逻辑
 */
export class DeviceService {
  /**
   * 生成9位激活码（大写字母与数字）
   */
  generateActivationCode(): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 9; i++) {
      const idx = Math.floor(Math.random() * charset.length);
      code += charset[idx];
    }
    return code;
  }

  /**
   * 生成唯一激活码（带唯一性检查）
   */
  private async generateUniqueActivationCode(): Promise<string> {
    // 最多尝试20次以避免极低概率的无限循环
    for (let attempt = 0; attempt < 20; attempt++) {
      const code = this.generateActivationCode();
      const exists = await prisma.device.findUnique({ where: { activationCode: code } });
      if (!exists) return code;
    }
    throw new Error('activation_code_generation_failed');
  }

  /**
   * 创建设备（PENDING 状态，生成唯一激活码）
   */
  async createDevice(
    orgId: string,
    deviceType: 'POS' | 'KIOSK' | 'TABLET',
    createdBy: string
  ): Promise<Device> {
    // 1. 校验组织存在与活跃
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new Error('org_not_found');
    }
    if (org.status !== 'ACTIVE') {
      throw new Error('org_inactive');
    }

    // 2. 生成唯一激活码
    const activationCode = await this.generateUniqueActivationCode();

    // 3. 创建设备
    const device = await prisma.device.create({
      data: {
        orgId,
        deviceType,
        activationCode,
        status: 'PENDING',
      },
    });

    // 4. 审计
    audit('device_created', {
      deviceId: device.id,
      orgId,
      deviceType,
      activationCode,
      createdBy,
      createdAt: new Date().toISOString(),
    });

    return device;
  }

  /**
   * 激活设备（id+activationCode+deviceName）
   */
  async activateDevice(
    deviceId: string,
    activationCode: string,
    deviceName: string
  ): Promise<Device> {
    // 1. 校验设备与激活码匹配
    const device = await prisma.device.findFirst({
      where: { id: deviceId, activationCode },
      include: { organization: true },
    });

    if (!device) {
      throw new Error('invalid_device_or_code');
    }

    // 2. 校验组织活跃
    if (!device.organization || device.organization.status !== 'ACTIVE') {
      throw new Error('org_inactive');
    }

    // 3. 状态校验
    if (device.status !== 'PENDING') {
      throw new Error('device_already_activated');
    }

    const now = new Date();
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;

    // 4. 更新为 ACTIVE
    const updated = await prisma.device.update({
      where: { id: device.id },
      data: {
        deviceName,
        status: 'ACTIVE',
        activatedAt: now,
        lastActiveAt: now,
        expiresAt: new Date(now.getTime() + oneYearMs),
      },
    });

    // 5. 审计
    audit('device_activated', {
      deviceId: device.id,
      orgId: device.orgId,
      deviceType: device.deviceType,
      deviceName,
      activatedAt: now.toISOString(),
      expiresAt: updated.expiresAt?.toISOString(),
    });

    return updated;
  }

  /**
   * 更新设备活跃时间；若 DORMANT 则唤醒为 ACTIVE 并延长有效期
   */
  async updateLastActive(deviceId: string): Promise<void> {
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) return;

    const now = new Date();
    if (device.status === 'DORMANT') {
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      await prisma.device.update({
        where: { id: deviceId },
        data: {
          status: 'ACTIVE',
          lastActiveAt: now,
          expiresAt: new Date(now.getTime() + oneYearMs),
          dormantSince: null,
        },
      });

      audit('device_woke_up_from_dormant', {
        deviceId,
        wokeAt: now.toISOString(),
      });
      return;
    }

    await prisma.device.update({
      where: { id: deviceId },
      data: { lastActiveAt: now },
    });

    audit('device_last_active_updated', {
      deviceId,
      lastActiveAt: now.toISOString(),
    });
  }

  /**
   * 更新激活码（仅 ACTIVE 设备；重置为 PENDING 并清空激活相关字段）
   */
  async updateActivationCode(
    deviceId: string,
    orgId: string,
    deviceType: 'POS' | 'KIOSK' | 'TABLET',
    currentActivationCode: string,
    updatedBy: string
  ): Promise<{ device: Device; newActivationCode: string }> {
    // 1. 获取设备
    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) {
      throw new Error('device_not_found');
    }

    // 2. 基本校验
    if (device.orgId !== orgId || device.deviceType !== deviceType || device.activationCode !== currentActivationCode) {
      throw new Error('device_info_mismatch');
    }
    if (device.status !== 'ACTIVE') {
      throw new Error('device_not_active');
    }

    // 3. 生成新激活码（唯一）
    const newCode = await this.generateUniqueActivationCode();

    // 4. 回退为 PENDING 并重置激活相关字段
    const updated = await prisma.device.update({
      where: { id: deviceId },
      data: {
        status: 'PENDING',
        activationCode: newCode,
        deviceName: null,
        activatedAt: null,
        lastActiveAt: null,
        expiresAt: null,
        dormantSince: null,
        deviceFingerprint: Prisma.DbNull,
      },
    });

    // 5. 审计
    audit('device_activation_code_updated', {
      deviceId,
      orgId,
      deviceType,
      previousActivationCode: currentActivationCode,
      newActivationCode: newCode,
      updatedBy,
      updatedAt: new Date().toISOString(),
    });

    return { device: updated, newActivationCode: newCode };
  }

  /**
   * 月度活跃度检查
   * - ACTIVE: lastActiveAt 为 null 或 早于阈值(now-30天) → 置为 DORMANT，记录 dormantSince
   * - ACTIVE: lastActiveAt 晚于阈值(30天内活跃) → 延长 expiresAt = now + 1年
   * - DORMANT: dormantSince 早于或等于阈值(沉睡≥30天) → 回退为 PENDING（保留历史字段）
   */
  async runMonthlyActivityCheck(): Promise<void> {
    const now = new Date();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const threshold = new Date(now.getTime() - thirtyDaysMs);
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;

    // 1) 将超过30天未活跃（或从未活跃）的 ACTIVE 设备设为 DORMANT
    const setDormantResult = await prisma.device.updateMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { lastActiveAt: { lte: threshold } },
          { lastActiveAt: null },
        ],
      },
      data: {
        status: 'DORMANT',
        dormantSince: now,
      },
    });

    // 2) 对30天内活跃的 ACTIVE 设备，延长有效期到 1 年后
    const extendValidityResult = await prisma.device.updateMany({
      where: {
        status: 'ACTIVE',
        lastActiveAt: { gt: threshold },
      },
      data: {
        expiresAt: new Date(now.getTime() + oneYearMs),
      },
    });

    // 3) 对沉睡超过30天的设备回退到 PENDING（保留历史字段，不清空）
    const revertToPendingResult = await prisma.device.updateMany({
      where: {
        status: 'DORMANT',
        dormantSince: { lte: threshold },
      },
      data: {
        status: 'PENDING',
      },
    });

    audit('device_monthly_activity_check', {
      executedAt: now.toISOString(),
      threshold: threshold.toISOString(),
      setDormantCount: setDormantResult.count,
      extendedValidityCount: extendValidityResult.count,
      revertedToPendingCount: revertToPendingResult.count,
    });
  }
}

// 导出单例
export const deviceService = new DeviceService();


