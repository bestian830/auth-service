// src/controllers/device.ts
import { Request, Response } from 'express';
import { prisma } from '../infra/prisma.js';
import { deviceService } from '../services/device.js';
import { audit } from '../middleware/audit.js';

function getClaims(req: Request) {
  return (req as any).claims || {};
}

async function getCallerAccount(claims: any) {
  if (claims.userType !== 'ACCOUNT') return null;
  if (!claims.sub) return null;
  return await prisma.account.findUnique({ where: { id: claims.sub as string } });
}

function forbid(res: Response) {
  return res.status(403).json({ error: 'insufficient_permissions' });
}

function getProductType(req: Request): 'beauty' | 'fb' | undefined {
  const pt = (req.headers['x-product-type'] || req.headers['X-Product-Type']) as string | undefined;
  if (pt === 'beauty' || pt === 'fb') return pt;
  return undefined;
}

// 4.1 创建设备（生成激活码） - 仅 USER
export async function createDevice(req: Request, res: Response) {
  try {
    const claims = getClaims(req);
    const { orgId, deviceType, deviceName } = req.body || {};

    // 验证必填字段
    if (!orgId || !deviceType || !deviceName) {
      return res.status(400).json({
        error: 'missing_required_fields',
        detail: 'orgId, deviceType, and deviceName are required'
      });
    }

    // 验证deviceType
    if (!['POS', 'KIOSK', 'TABLET'].includes(deviceType)) {
      return res.status(400).json({
        error: 'invalid_device_type',
        detail: 'deviceType must be POS, KIOSK, or TABLET'
      });
    }

    // 仅 USER 可以创建设备
    if (claims.userType !== 'USER') {
      return res.status(403).json({
        error: 'only_user_can_create_device',
        detail: 'Only User (owner) can create devices'
      });
    }

    // 验证组织权限
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      return res.status(404).json({
        error: 'org_not_found',
        detail: 'Organization not found'
      });
    }

    if (org.userId !== claims.sub) {
      return res.status(403).json({
        error: 'access_denied',
        detail: "You don't have permission to create devices for this organization"
      });
    }

    if (org.status !== 'ACTIVE') {
      return res.status(403).json({
        error: 'org_inactive',
        detail: 'Organization is inactive'
      });
    }

    // 创建设备
    const device = await deviceService.createDevice(orgId, deviceType, deviceName, claims.sub as string);

    return res.status(201).json({
      success: true,
      message: 'Device created successfully',
      data: {
        deviceId: device.id,
        orgId: device.orgId,
        orgName: org.orgName,
        deviceType: device.deviceType,
        deviceName: device.deviceName,
        activationCode: device.activationCode,
        status: device.status,
        createdAt: device.createdAt
      },
      warning: 'Please save the deviceId and activationCode. Both are required to activate the device on-site.'
    });
  } catch (e: any) {
    if (e?.message === 'org_not_found') {
      return res.status(404).json({ error: 'org_not_found', detail: 'Organization not found' });
    }
    if (e?.message === 'org_inactive') {
      return res.status(403).json({ error: 'org_inactive', detail: 'Organization is inactive' });
    }
    if (e?.message === 'access_denied') {
      return res.status(403).json({ error: 'access_denied', detail: "You don't have permission to create devices for this organization" });
    }
    if (e?.message === 'deviceName_repeated') {
      return res.status(403).json({ error: 'deviceName_repeated', detail: 'The device name is occupied.' });
    }
    return res.status(400).json({ error: 'invalid_request', detail: e?.message || 'Invalid request' });
  }
}

// 4.2 激活设备 - 无需认证
export async function activateDevice(req: Request, res: Response) {
  try {
    const productType = getProductType(req);
    const deviceFingerprint = req.headers['x-device-fingerprint'] || req.headers['X-Device-Fingerprint'];
    const { deviceId, activationCode } = req.body || {};

    // 验证必填字段
    if (!deviceId || !activationCode) {
      return res.status(400).json({
        error: 'invalid_request',
        detail: 'deviceId and activationCode are required'
      });
    }

    // productType必须提供
    if (!productType) {
      return res.status(400).json({
        error: 'invalid_request',
        detail: 'X-Product-Type header is required'
      });
    }

    // 解析deviceFingerprint（如果有）
    let fingerprintJson = null;
    if (deviceFingerprint) {
      try {
        fingerprintJson = typeof deviceFingerprint === 'string' ? JSON.parse(deviceFingerprint) : deviceFingerprint;
      } catch (e) {
        // 忽略解析错误
      }
    }

    // 激活设备
    const device = await deviceService.activateDevice(deviceId, activationCode, productType, fingerprintJson);

    // 获取组织名称
    const org = await prisma.organization.findUnique({ where: { id: device.orgId } });

    return res.json({
      success: true,
      message: 'Device activated successfully',
      data: {
        id: device.id,
        orgId: device.orgId,
        orgName: org?.orgName || '',
        deviceType: device.deviceType,
        deviceName: device.deviceName,
        status: device.status,
        activatedAt: device.activatedAt
      }
    });
  } catch (e: any) {
    if (e?.message === 'invalid_device_or_code') {
      return res.status(404).json({
        error: 'invalid_device_or_code',
        detail: 'Invalid deviceId or activationCode, or device already activated'
      });
    }
    if (e?.message === 'device_already_activated') {
      return res.status(400).json({
        error: 'device_already_activated',
        detail: 'This device has already been activated'
      });
    }
    if (e?.message === 'org_inactive') {
      return res.status(403).json({
        error: 'org_inactive',
        detail: 'The organization is inactive. Please contact support.'
      });
    }
    if (e?.message === 'product_type_mismatch') {
      return res.status(403).json({
        error: 'product_type_mismatch',
        detail: 'Product type does not match organization'
      });
    }
    return res.status(400).json({ error: 'invalid_request', detail: e?.message || 'Invalid request' });
  }
}

// 4.3 更新激活码 - 仅 USER
export async function updateActivationCode(req: Request, res: Response) {
  try {
    const claims = getClaims(req);
    const { deviceId } = req.params as any;
    const { orgId, deviceType, currentActivationCode, newDeviceName } = req.body || {};

    // 验证必填字段
    if (!orgId || !deviceType || !currentActivationCode) {
      return res.status(400).json({
        error: 'invalid_request',
        detail: 'orgId, deviceType, and currentActivationCode are required'
      });
    }

    // 仅 USER 可以更新激活码
    if (claims.userType !== 'USER') {
      return res.status(403).json({
        error: 'only_user_can_update_code',
        detail: 'Only User (owner) can update activation code'
      });
    }

    // 验证组织权限
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org || org.userId !== claims.sub) {
      return res.status(403).json({
        error: 'access_denied',
        detail: "You don't have permission to update this device"
      });
    }

    // 更新激活码（可选更新设备名称）
    const { device, newActivationCode } = await deviceService.updateActivationCode(
      deviceId,
      orgId,
      deviceType,
      currentActivationCode,
      claims.sub as string,
      newDeviceName
    );

    return res.json({
      success: true,
      message: 'Activation code updated successfully. The previous device is now deactivated.',
      data: {
        deviceId: device.id,
        orgId: device.orgId,
        deviceType: device.deviceType,
        deviceName: device.deviceName,
        newActivationCode,
        status: device.status
      },
      warning: 'Please save the new activation code. The device must be activated again with this new code.'
    });
  } catch (e: any) {
    if (e?.message === 'device_not_found') {
      return res.status(404).json({ error: 'device_not_found', detail: 'Device not found' });
    }
    if (e?.message === 'device_info_mismatch') {
      return res.status(400).json({
        error: 'device_info_mismatch',
        detail: 'Device orgId, deviceType, or activationCode does not match'
      });
    }
    if (e?.message === 'device_not_active') {
      return res.status(400).json({
        error: 'device_not_active',
        detail: 'Only ACTIVE devices can have their activation code updated'
      });
    }
    if (e?.message === 'deviceName_repeated') {
      return res.status(409).json({
        error: 'device_name_repeated',
        detail: 'Device name is occupied.'
      });
    }
    return res.status(400).json({ error: 'invalid_request', detail: e?.message || 'Invalid request' });
  }
}

// 4.4 获取组织的所有设备
export async function listDevices(req: Request, res: Response) {
  try {
    const claims = getClaims(req);
    let { orgId, deviceType, status } = req.query as any;

    // orgId 必填
    if (!orgId) {
      return res.status(400).json({
        error: 'invalid_request',
        detail: 'orgId is required'
      });
    }

    // 权限验证
    if (claims.userType === 'USER') {
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org) {
        return res.status(404).json({ error: 'org_not_found', detail: 'Organization not found' });
      }
      if (org.userId !== claims.sub) {
        return forbid(res);
      }
    } else if (claims.userType === 'ACCOUNT') {
      const account = await getCallerAccount(claims);
      if (!account || account.orgId !== orgId) {
        return forbid(res);
      }
      if (account.accountType === 'STAFF') {
        return res.status(403).json({
          error: 'staff_no_backend_access',
          detail: 'Staff accounts do not have backend access'
        });
      }
    } else {
      return forbid(res);
    }

    // 构建查询条件
    const where: any = { orgId };

    // 可选过滤
    if (deviceType && ['POS', 'KIOSK', 'TABLET'].includes(deviceType)) {
      where.deviceType = deviceType;
    }

    if (status && ['PENDING', 'ACTIVE', 'DELETED'].includes(status)) {
      where.status = status;
    } else {
      // 默认不返回 DELETED 状态
      where.status = { in: ['PENDING', 'ACTIVE'] };
    }

    // 查询设备列表（不返回activationCode）
    const devices = await prisma.device.findMany({
      where,
      orderBy: [
        { status: 'asc' }, // ACTIVE优先
        { createdAt: 'desc' }
      ],
      select: {
        id: true,
        orgId: true,
        deviceType: true,
        deviceName: true,
        status: true,
        activatedAt: true,
        lastActiveAt: true,
        createdAt: true
      }
    });

    return res.json({
      success: true,
      data: devices,
      total: devices.length
    });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
}

// 4.5 获取单个设备详情
export async function getDevice(req: Request, res: Response) {
  try {
    const claims = getClaims(req);
    const { deviceId } = req.params as any;

    // 查询设备（不包括DELETED）
    const device = await prisma.device.findFirst({
      where: {
        id: deviceId,
        status: { notIn: ['DELETED'] }
      },
      include: { organization: true }
    });

    if (!device) {
      return res.status(404).json({ error: 'device_not_found', detail: 'Device not found' });
    }

    // 权限验证
    if (claims.userType === 'USER') {
      if (device.organization?.userId !== claims.sub) {
        return forbid(res);
      }
    } else if (claims.userType === 'ACCOUNT') {
      const account = await getCallerAccount(claims);
      if (!account || account.orgId !== device.orgId) {
        return forbid(res);
      }
      if (account.accountType === 'STAFF') {
        return res.status(403).json({
          error: 'staff_no_backend_access',
          detail: 'Staff accounts do not have backend access'
        });
      }
    } else {
      return forbid(res);
    }

    // 返回详情（不返回activationCode）
    return res.json({
      success: true,
      data: {
        id: device.id,
        orgId: device.orgId,
        orgName: device.organization?.orgName || '',
        deviceType: device.deviceType,
        deviceName: device.deviceName,
        status: device.status,
        activatedAt: device.activatedAt,
        lastActiveAt: device.lastActiveAt,
        deviceFingerprint: device.deviceFingerprint,
        createdAt: device.createdAt,
        updatedAt: device.updatedAt
      }
    });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
}

// 4.6 更新设备信息
export async function updateDevice(req: Request, res: Response) {
  try {
    const claims = getClaims(req);
    const { deviceId } = req.params as any;
    const { deviceName } = req.body || {};

    // deviceName 不能为空
    if (!deviceName || deviceName.trim().length === 0) {
      return res.status(400).json({
        error: 'invalid_request',
        detail: 'deviceName is required and cannot be empty'
      });
    }

    // 查询设备（不包括DELETED）
    const device = await prisma.device.findFirst({
      where: {
        id: deviceId,
        status: { notIn: ['DELETED'] }
      },
      include: { organization: true }
    });

    if (!device) {
      return res.status(404).json({ error: 'device_not_found', detail: 'Device not found' });
    }

    // 权限验证
    if (claims.userType === 'USER') {
      if (device.organization?.userId !== claims.sub) {
        return forbid(res);
      }
    } else if (claims.userType === 'ACCOUNT') {
      const account = await getCallerAccount(claims);
      if (!account || account.orgId !== device.orgId) {
        return forbid(res);
      }
      if (account.accountType === 'STAFF') {
        return res.status(403).json({
          error: 'staff_no_backend_access',
          detail: 'Staff accounts do not have backend access'
        });
      }
    } else {
      return forbid(res);
    }

    // 更新设备
    const updated = await prisma.device.update({
      where: { id: deviceId },
      data: { deviceName: deviceName.trim() }
    });

    audit('device_updated', { deviceId, by: claims.sub, deviceName });

    return res.json({
      success: true,
      message: 'Device updated successfully',
      data: {
        id: updated.id,
        deviceName: updated.deviceName,
        updatedAt: updated.updatedAt
      }
    });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
}

// 4.7 删除设备（软删除） - 仅 USER
export async function deleteDevice(req: Request, res: Response) {
  try {
    const claims = getClaims(req);
    const { deviceId } = req.params as any;

    // 仅 USER 可以删除设备
    if (claims.userType !== 'USER') {
      return res.status(403).json({
        error: 'only_user_can_delete_device',
        detail: 'Only User (owner) can delete devices'
      });
    }

    // 查询设备（不包括已删除的）
    const device = await prisma.device.findFirst({
      where: {
        id: deviceId,
        status: { notIn: ['DELETED'] }
      },
      include: { organization: true }
    });

    if (!device) {
      return res.status(404).json({ error: 'device_not_found', detail: 'Device not found' });
    }

    // 验证权限
    if (device.organization?.userId !== claims.sub) {
      return forbid(res);
    }

    // 软删除
    await prisma.device.update({
      where: { id: deviceId },
      data: { status: 'DELETED' }
    });

    audit('device_deleted', { deviceId, orgId: device.orgId, by: claims.sub });

    return res.json({
      success: true,
      message: 'Device deleted successfully'
    });
  } catch (e) {
    return res.status(500).json({ error: 'server_error' });
  }
}
