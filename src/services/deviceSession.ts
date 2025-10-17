// src/services/deviceSession.ts
import crypto from 'crypto';
import type { DeviceSession } from '@prisma/client';
import { prisma } from '../infra/prisma.js';
import { audit } from '../middleware/audit.js';

/**
 * DeviceSession Service
 * 负责设备会话管理的核心业务逻辑
 */
export class DeviceSessionService {
  /**
   * 生成随机 sessionToken (256-bit, base64url)
   */
  generateSessionToken(): string {
    const randomBytes = crypto.randomBytes(32);
    return randomBytes.toString('base64url'); // 43 字符
  }

  /**
   * 计算 sessionToken 的 SHA-256 哈希值
   */
  hashSessionToken(sessionToken: string): string {
    return crypto
      .createHash('sha256')
      .update(sessionToken)
      .digest('hex');
  }

  /**
   * 创建或更新设备会话（幂等操作）
   * @param deviceId 设备ID
   * @returns sessionToken (明文) 和 session 记录
   */
  async createOrUpdateSession(deviceId: string): Promise<{ sessionToken: string; session: DeviceSession }> {
    // 1. 生成新的 sessionToken
    const sessionToken = this.generateSessionToken();
    const sessionTokenHash = this.hashSessionToken(sessionToken);

    const now = new Date();

    // 2. 查询是否已存在 session
    const existingSession = await prisma.deviceSession.findUnique({
      where: { deviceId }
    });

    let session: DeviceSession;

    if (existingSession) {
      // 已有 session，覆盖旧的 sessionTokenHash（幂等激活）
      session = await prisma.deviceSession.update({
        where: { deviceId },
        data: {
          sessionTokenHash,
          activatedAt: now,
          lastActiveAt: now,
        }
      });

      audit('device_session_updated', {
        deviceId,
        sessionId: session.id,
        reason: 'reactivation',
        updatedAt: now.toISOString(),
      });
    } else {
      // 首次激活，创建新 session
      session = await prisma.deviceSession.create({
        data: {
          deviceId,
          sessionTokenHash,
          status: 'ACTIVE',
          activatedAt: now,
          lastActiveAt: now,
        }
      });

      audit('device_session_created', {
        deviceId,
        sessionId: session.id,
        createdAt: now.toISOString(),
      });
    }

    return { sessionToken, session };
  }

  /**
   * 验证 sessionToken 是否有效
   * @param deviceId 设备ID
   * @param sessionToken sessionToken 明文
   * @returns 是否有效
   */
  async validateSessionToken(deviceId: string, sessionToken: string): Promise<boolean> {
    const sessionTokenHash = this.hashSessionToken(sessionToken);

    const session = await prisma.deviceSession.findUnique({
      where: { deviceId }
    });

    if (!session) {
      return false;
    }

    if (session.sessionTokenHash !== sessionTokenHash) {
      return false;
    }

    if (session.status !== 'ACTIVE') {
      return false;
    }

    return true;
  }

  /**
   * 获取设备会话（用于查询）
   * @param deviceId 设备ID
   * @returns session 或 null
   */
  async getSession(deviceId: string): Promise<DeviceSession | null> {
    return await prisma.deviceSession.findUnique({
      where: { deviceId }
    });
  }

  /**
   * 更新会话最后活跃时间
   * @param deviceId 设备ID
   */
  async updateLastActive(deviceId: string): Promise<void> {
    const session = await prisma.deviceSession.findUnique({
      where: { deviceId }
    });

    if (!session) {
      return;
    }

    const now = new Date();
    await prisma.deviceSession.update({
      where: { deviceId },
      data: { lastActiveAt: now }
    });

    // 不需要审计每次更新（太频繁）
  }

  /**
   * 删除设备会话
   * @param deviceId 设备ID
   */
  async deleteSession(deviceId: string): Promise<void> {
    const session = await prisma.deviceSession.findUnique({
      where: { deviceId }
    });

    if (!session) {
      return;
    }

    await prisma.deviceSession.delete({
      where: { deviceId }
    });

    audit('device_session_deleted', {
      deviceId,
      sessionId: session.id,
      deletedAt: new Date().toISOString(),
    });
  }
}

// 导出单例
export const deviceSessionService = new DeviceSessionService();

