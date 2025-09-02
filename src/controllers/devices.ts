// src/controllers/devices.ts
import { Request, Response } from 'express';
import { deviceService } from '../services/device.js';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { assertCanAddDevice } from '../middleware/subscription.js';
import { getEffectivePlanForOrg } from '../services/subscriptionPlan.js';
import { resolveProductType } from '../config/products.js';

const createDeviceSchema = z.object({
  orgId: z.string().min(1),
  locationId: z.string().optional(),
  type: z.enum(['host', 'kiosk']),
  clientId: z.string().min(1),
  name: z.string().optional(),
  note: z.string().optional(),
});

const listDevicesSchema = z.object({
  orgId: z.string().min(1),
  clientId: z.string().optional(),
  type: z.enum(['host', 'kiosk']).optional(),
  status: z.enum(['active', 'revoked']).optional(),
});

const revokeDeviceSchema = z.object({
  reason: z.string().optional(),
});

export class DevicesController {
  /**
   * POST /admin/devices
   * 创建新设备
   */
  async createDevice(req: Request, res: Response) {
    try {
      // 双重鉴权验证（防止路由配置错误）
      if (!(req as any).user || !(req as any).user.roles?.includes('admin')) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const body = createDeviceSchema.parse(req.body);
      
      // 获取真实的订阅计划
      const productType = await resolveProductType(body.clientId);
      const effectivePlan = await getEffectivePlanForOrg(body.orgId, productType, body.locationId);
      
      // 配额校验
      await assertCanAddDevice(body.orgId, effectivePlan);
      
      const result = await deviceService.createDevice(body);
      
      logger.info('Device created via API', {
        deviceId: result.device.id,
        orgId: body.orgId,
        adminUser: (req as any).claims?.sub,
      });

      res.status(201).json({
        device: result.device,
        deviceSecret: result.deviceSecret,
        warning: 'Device secret will not be shown again. Store it securely.',
      });
    } catch (error: any) {
      logger.error('Failed to create device', { error: error.message });
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      
      if (error.code === 'QUOTA_EXCEEDED') {
        return res.status(error.status || 422).json({ 
          error: 'quota_exceeded',
          message: error.message,
          type: 'device_quota'
        });
      }
      
      res.status(500).json({ error: 'Failed to create device' });
    }
  }

  /**
   * GET /admin/devices
   * 列出设备
   */
  async listDevices(req: Request, res: Response) {
    try {
      // 双重鉴权验证
      if (!(req as any).user || !(req as any).user.roles?.includes('admin')) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const query = listDevicesSchema.parse(req.query);
      
      const devices = await deviceService.listDevices(query.orgId, {
        clientId: query.clientId,
        type: query.type,
        status: query.status,
      });

      res.json({ devices });
    } catch (error: any) {
      logger.error('Failed to list devices', { error: error.message });
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid query parameters', details: error.errors });
      }
      
      res.status(500).json({ error: 'Failed to list devices' });
    }
  }

  /**
   * GET /admin/devices/:deviceId
   * 获取单个设备信息
   */
  async getDevice(req: Request, res: Response) {
    try {
      // 双重鉴权验证
      if (!(req as any).user || !(req as any).user.roles?.includes('admin')) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { deviceId } = req.params;
      
      const device = await deviceService.getDevice(deviceId);
      
      if (!device) {
        return res.status(404).json({ error: 'Device not found' });
      }

      res.json({ device });
    } catch (error: any) {
      logger.error('Failed to get device', { error: error.message, deviceId: req.params.deviceId });
      res.status(500).json({ error: 'Failed to get device' });
    }
  }

  /**
   * POST /admin/devices/:deviceId/revoke
   * 撤销设备
   */
  async revokeDevice(req: Request, res: Response) {
    try {
      // 双重鉴权验证
      if (!(req as any).user || !(req as any).user.roles?.includes('admin')) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { deviceId } = req.params;
      const body = revokeDeviceSchema.parse(req.body);
      
      const device = await deviceService.revokeDevice(deviceId, body.reason);
      
      logger.info('Device revoked via API', {
        deviceId,
        reason: body.reason,
        adminUser: (req as any).claims?.sub,
      });

      res.json({ device, message: 'Device revoked successfully' });
    } catch (error: any) {
      logger.error('Failed to revoke device', { error: error.message, deviceId: req.params.deviceId });
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid request data', details: error.errors });
      }
      
      res.status(500).json({ error: 'Failed to revoke device' });
    }
  }

  /**
   * POST /admin/devices/:deviceId/reactivate
   * 重新激活设备
   */
  async reactivateDevice(req: Request, res: Response) {
    try {
      // 双重鉴权验证
      if (!(req as any).user || !(req as any).user.roles?.includes('admin')) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { deviceId } = req.params;
      
      const device = await deviceService.reactivateDevice(deviceId);
      
      logger.info('Device reactivated via API', {
        deviceId,
        adminUser: (req as any).claims?.sub,
      });

      res.json({ device, message: 'Device reactivated successfully' });
    } catch (error: any) {
      logger.error('Failed to reactivate device', { error: error.message, deviceId: req.params.deviceId });
      res.status(500).json({ error: 'Failed to reactivate device' });
    }
  }

  /**
   * POST /admin/devices/:deviceId/regenerate-secret
   * 重新生成设备密钥
   */
  async regenerateSecret(req: Request, res: Response) {
    try {
      // 双重鉴权验证
      if (!(req as any).user || !(req as any).user.roles?.includes('admin')) {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { deviceId } = req.params;
      
      const result = await deviceService.regenerateSecret(deviceId);
      
      logger.info('Device secret regenerated via API', {
        deviceId,
        adminUser: (req as any).claims?.sub,
      });

      res.json({
        device: result.device,
        deviceSecret: result.deviceSecret,
        warning: 'New device secret will not be shown again. Store it securely.',
      });
    } catch (error: any) {
      logger.error('Failed to regenerate device secret', { error: error.message, deviceId: req.params.deviceId });
      res.status(500).json({ error: 'Failed to regenerate device secret' });
    }
  }

  /**
   * POST /devices/:deviceId/verify-proof
   * 验证设备证明（内部使用）
   */
  async verifyProof(req: Request, res: Response) {
    try {
      const { deviceId } = req.params;
      const { proof } = req.body;
      
      if (!proof) {
        return res.status(400).json({ error: 'Device proof is required' });
      }
      
      const payload = await deviceService.verifyDeviceProof(deviceId, proof);
      
      res.json({ 
        valid: true,
        payload: {
          deviceId: payload.sub,
          deviceType: payload.device_type,
          proofMode: payload.proof_mode,
          jti: payload.jti,
        }
      });
    } catch (error: any) {
      logger.warn('Device proof verification failed', { 
        error: error.message,
        deviceId: req.params.deviceId,
        ip: req.ip,
      });
      
      res.status(401).json({ 
        valid: false, 
        error: 'Invalid device proof',
        details: error.message,
      });
    }
  }
}

export const devicesController = new DevicesController();