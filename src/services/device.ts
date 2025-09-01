// src/services/device.ts
import { PrismaClient } from '@prisma/client';
import { nanoid } from 'nanoid';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const prisma = new PrismaClient();

export interface DeviceCreateRequest {
  orgId: string;
  locationId?: string;
  type: 'host' | 'kiosk';
  clientId: string;
  name?: string;
  note?: string;
}

export interface DeviceProofJWT {
  iss: string; // device_id
  aud: string; // auth service issuer
  sub: string; // device_id
  iat: number;
  exp: number;
  jti: string;
  device_type: 'host' | 'kiosk';
  proof_mode: 'device_secret' | 'dpop';
}

export class DeviceService {
  /**
   * 创建新设备并生成密钥
   */
  async createDevice(request: DeviceCreateRequest) {
    const deviceId = nanoid();
    const deviceSecret = randomBytes(env.deviceSecretLength).toString('base64url');
    const secretHash = this.hashSecret(deviceSecret);

    const device = await prisma.device.create({
      data: {
        id: deviceId,
        orgId: request.orgId,
        locationId: request.locationId,
        type: request.type,
        clientId: request.clientId,
        name: request.name,
        secretHash,
        note: request.note,
      },
    });

    logger.info('Device created', {
      deviceId,
      orgId: request.orgId,
      type: request.type,
      clientId: request.clientId,
    });

    return {
      device,
      deviceSecret, // 仅创建时返回，后续无法获取
    };
  }

  /**
   * 验证设备密钥证明 JWT
   */
  async verifyDeviceProof(deviceId: string, proofJWT: string): Promise<DeviceProofJWT> {
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        id: true,
        orgId: true,
        type: true,
        status: true,
        secretHash: true,
        clientId: true,
        lastSeenAt: true,
      },
    });

    if (!device) {
      throw new Error('Device not found');
    }

    if (device.status !== 'active') {
      throw new Error('Device is not active');
    }

    if (!device.secretHash) {
      throw new Error('Device has no secret configured');
    }

    // 使用设备密钥验证 JWT
    let payload: DeviceProofJWT;
    try {
      payload = jwt.verify(proofJWT, Buffer.from(device.secretHash, 'hex')) as DeviceProofJWT;
    } catch (error) {
      throw new Error('Invalid device proof JWT');
    }

    // 验证载荷
    if (payload.iss !== deviceId || payload.sub !== deviceId) {
      throw new Error('Invalid device proof claims');
    }

    if (payload.aud !== env.issuerUrl.replace(/\/$/, '')) {
      throw new Error('Invalid audience in device proof');
    }

    // 更新最后见到时间
    await prisma.device.update({
      where: { id: deviceId },
      data: { lastSeenAt: new Date() },
    });

    return payload;
  }

  /**
   * 获取设备信息
   */
  async getDevice(deviceId: string) {
    return await prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        id: true,
        orgId: true,
        locationId: true,
        type: true,
        clientId: true,
        name: true,
        status: true,
        lastSeenAt: true,
        createdAt: true,
        revokedAt: true,
        note: true,
      },
    });
  }

  /**
   * 列出组织的设备
   */
  async listDevices(orgId: string, options?: { clientId?: string; type?: string; status?: string }) {
    const where: any = { orgId };
    
    if (options?.clientId) where.clientId = options.clientId;
    if (options?.type) where.type = options.type;
    if (options?.status) where.status = options.status;

    return await prisma.device.findMany({
      where,
      select: {
        id: true,
        orgId: true,
        locationId: true,
        type: true,
        clientId: true,
        name: true,
        status: true,
        lastSeenAt: true,
        createdAt: true,
        revokedAt: true,
        note: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 撤销设备
   */
  async revokeDevice(deviceId: string, reason?: string) {
    const device = await prisma.device.update({
      where: { id: deviceId },
      data: {
        status: 'revoked',
        revokedAt: new Date(),
        note: reason ? `${reason} (revoked)` : undefined,
      },
    });

    logger.info('Device revoked', {
      deviceId,
      reason,
      orgId: device.orgId,
    });

    return device;
  }

  /**
   * 重新激活设备
   */
  async reactivateDevice(deviceId: string) {
    const device = await prisma.device.update({
      where: { id: deviceId },
      data: {
        status: 'active',
        revokedAt: null,
      },
    });

    logger.info('Device reactivated', {
      deviceId,
      orgId: device.orgId,
    });

    return device;
  }

  /**
   * 重新生成设备密钥
   */
  async regenerateSecret(deviceId: string) {
    const deviceSecret = randomBytes(env.deviceSecretLength).toString('base64url');
    const secretHash = this.hashSecret(deviceSecret);

    const device = await prisma.device.update({
      where: { id: deviceId },
      data: { secretHash },
    });

    logger.info('Device secret regenerated', {
      deviceId,
      orgId: device.orgId,
    });

    return {
      device,
      deviceSecret, // 仅重新生成时返回
    };
  }

  /**
   * 检查是否需要设备证明
   */
  isDeviceProofRequired(clientId: string): boolean {
    const requiredProducts = env.requireDeviceProofFor.split(',').map(p => p.trim());
    
    // 检查 clientId 是否匹配需要设备证明的产品
    for (const product of requiredProducts) {
      if (clientId.includes(product)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 获取设备证明模式
   */
  getProofMode(deviceType: 'host' | 'kiosk'): 'device_secret' | 'dpop' {
    return deviceType === 'host' ? env.proofModeHost as any : env.proofModeKiosk as any;
  }

  /**
   * 哈希设备密钥（用于数据库存储）
   */
  private hashSecret(secret: string): string {
    return createHash('sha256').update(secret, 'utf8').digest('hex');
  }

  /**
   * 安全比较两个密钥
   */
  private compareSecrets(provided: string, stored: string): boolean {
    const providedHash = this.hashSecret(provided);
    const storedBuffer = Buffer.from(stored, 'hex');
    const providedBuffer = Buffer.from(providedHash, 'hex');
    
    return storedBuffer.length === providedBuffer.length &&
           timingSafeEqual(storedBuffer, providedBuffer);
  }
}

export const deviceService = new DeviceService();