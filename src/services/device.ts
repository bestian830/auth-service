// src/services/device.ts
import { prisma } from '../infra/prisma.js';
import { nanoid } from 'nanoid';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { audit } from '../middleware/audit.js';
import { DeviceType, DeviceStatus } from '@prisma/client';

export interface DeviceCreateRequest {
  organizationId: string;
  type: DeviceType;
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
  device_type: DeviceType;
  proof_mode: 'device_secret';
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
        organizationId: request.organizationId,
        type: request.type,
        clientId: request.clientId,
        name: request.name,
        secretHash,
        note: request.note,
        status: DeviceStatus.ACTIVE,
      },
    });

    audit('device_created', {
      deviceId,
      organizationId: request.organizationId,
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
        organizationId: true,
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

    if (device.status !== DeviceStatus.ACTIVE) {
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
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            status: true,
          }
        }
      }
    });
  }

  /**
   * 列出组织的设备
   */
  async listDevices(organizationId: string, options?: { 
    clientId?: string; 
    type?: DeviceType; 
    status?: DeviceStatus 
  }) {
    const where: any = { organizationId };
    
    if (options?.clientId) where.clientId = options.clientId;
    if (options?.type) where.type = options.type;
    if (options?.status) where.status = options.status;

    return await prisma.device.findMany({
      where,
      select: {
        id: true,
        organizationId: true,
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
        status: DeviceStatus.REVOKED,
        revokedAt: new Date(),
        note: reason ? `${reason} (revoked)` : undefined,
      },
    });

    audit('device_revoked', {
      deviceId,
      reason,
      organizationId: device.organizationId,
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
        status: DeviceStatus.ACTIVE,
        revokedAt: null,
      },
    });

    audit('device_reactivated', {
      deviceId,
      organizationId: device.organizationId,
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

    audit('device_secret_regenerated', {
      deviceId,
      organizationId: device.organizationId,
    });

    return {
      device,
      deviceSecret, // 仅重新生成时返回
    };
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

  /**
   * 检查设备是否属于指定组织
   */
  async checkDeviceOrganization(deviceId: string, organizationId: string): Promise<boolean> {
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: { organizationId: true, status: true }
    });

    return !!(device && 
             device.organizationId === organizationId && 
             device.status === DeviceStatus.ACTIVE);
  }

  /**
   * 获取设备的组织信息
   */
  async getDeviceOrganization(deviceId: string) {
    const device = await prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        organizationId: true,
        organization: {
          select: {
            id: true,
            name: true,
            status: true,
          }
        }
      }
    });

    return device?.organization || null;
  }
}

export const deviceService = new DeviceService();