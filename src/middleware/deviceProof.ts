// src/middleware/deviceProof.ts
import { Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { deviceService } from '../services/device.js';
import { jtiCache } from '../infra/redis.js';
import { audit } from './audit.js';
import { type ProductType } from '../config/products.js';

declare module 'express' {
  interface Request {
    device?: {
      id: string;
      type: 'host' | 'kiosk';
    };
    product?: ProductType;
  }
}

/**
 * 设备证明验证中间件
 * 
 * 头部约定：
 * - X-Device-Id: 设备注册后分配的 ID
 * - X-JTI: 随机 nonce，单次请求使用
 * - X-TS: 时间戳（秒）
 * - X-Device-Proof: base64url(HMAC_SHA256(device_secret, baseString))
 * 
 * baseString = method + '\n' + path + '\n' + jti + '\n' + timestampSec
 */
export function deviceProof(required: boolean = true) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const deviceId = req.get('x-device-id');
    const jti = req.get('x-jti');
    const timestamp = req.get('x-ts');
    const proof = req.get('x-device-proof');

    const hasHeaders = deviceId && jti && timestamp && proof;

    // 记录设备证明是否存在
    audit('device_proof_attempt', {
      present: !!hasHeaders,
      deviceId,
      required,
      product: req.product,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    if (!hasHeaders) {
      if (required) {
        audit('device_proof_fail', {
          reason: 'missing_headers',
          deviceId,
          product: req.product,
          ip: req.ip
        });
        return res.status(401).json({ 
          error: 'device_proof_required',
          message: 'Device proof headers are required: X-Device-Id, X-JTI, X-TS, X-Device-Proof'
        });
      }
      return next(); // 非必需时直接通过
    }

    try {
      // 验证时间戳（60秒窗口）
      const now = Math.floor(Date.now() / 1000);
      const ts = parseInt(timestamp!);
      const timeDiff = Math.abs(now - ts);

      if (timeDiff > 60) {
        throw new Error('Timestamp out of valid window (±60s)');
      }

      // 检查 JTI 重放
      const jtiKey = `dpop:jti:${deviceId}:${jti}`;
      const jtiExists = await jtiCache.exists(jtiKey);
      
      if (jtiExists) {
        throw new Error('JTI replay detected');
      }

      // 获取设备信息和密钥
      const device = await deviceService.getDevice(deviceId!);
      if (!device || device.status !== 'active') {
        throw new Error('Device not found or inactive');
      }

      // 重构 baseString
      const method = req.method;
      const path = req.path;
      const baseString = `${method}\n${path}\n${jti}\n${timestamp}`;

      // 验证 HMAC
      const expectedProof = await verifyDeviceHmac(deviceId!, baseString, proof!);
      if (!expectedProof) {
        throw new Error('Invalid device proof signature');
      }

      // 缓存 JTI（5分钟）
      await jtiCache.set(jtiKey, '1', 300);

      // 设置设备信息到请求上下文
      req.device = {
        id: deviceId!,
        type: device.type as 'host' | 'kiosk'
      };

      audit('device_proof_ok', {
        deviceId,
        deviceType: device.type,
        jti,
        product: req.product,
        method,
        path
      });

      next();
    } catch (error: any) {
      audit('device_proof_fail', {
        reason: error.message,
        deviceId,
        jti,
        product: req.product,
        ip: req.ip,
        method: req.method,
        path: req.path
      });

      if (required) {
        return res.status(401).json({
          error: 'invalid_device_proof',
          message: error.message
        });
      }

      // 非必需时记录错误但继续处理
      console.warn('Optional device proof failed:', error.message);
      next();
    }
  };
}

/**
 * 验证设备 HMAC 签名
 */
async function verifyDeviceHmac(
  deviceId: string, 
  baseString: string, 
  providedProof: string
): Promise<boolean> {
  try {
    // 从设备服务获取密钥哈希
    const device = await deviceService.getDevice(deviceId);
    if (!device?.secretHash) {
      return false;
    }

    // 使用密钥哈希作为 HMAC 密钥（简化方案）
    const expectedHmac = createHmac('sha256', Buffer.from(device.secretHash, 'hex'))
      .update(baseString, 'utf8')
      .digest();

    // 解码提供的证明
    const providedHmac = Buffer.from(providedProof, 'base64url');

    // 时序安全比较
    return expectedHmac.length === providedHmac.length &&
           timingSafeEqual(expectedHmac, providedHmac);
  } catch (error) {
    console.error('HMAC verification error:', error);
    return false;
  }
}

/**
 * 根据产品线确定设备证明要求
 */
export function requireDeviceProofForProduct() {
  return (req: Request, res: Response, next: NextFunction) => {
    const required = req.product === 'mopai';
    return deviceProof(required)(req, res, next);
  };
}