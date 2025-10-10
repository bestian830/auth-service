// src/controllers/account.ts
import { Request, Response } from 'express';
import { prisma } from '../infra/prisma.js';
import { accountService } from '../services/account.js';
import { audit } from '../middleware/audit.js';
import { signAccessToken, issueRefreshFamily } from '../services/token.js';
import { jtiCache, isRedisConnected } from '../infra/redis.js';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

function getProductType(req: Request): 'beauty' | 'fb' {
  const pt = (req.headers['x-product-type'] || req.headers['X-Product-Type']) as string | undefined;
  if (pt === 'beauty' || pt === 'fb') return pt;
  throw Object.assign(new Error('invalid_product_type'), { status: 400 });
}

export async function loginBackend(req: Request, res: Response) {
  try {
    const productType = getProductType(req);
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'username and password are required' });
    }

    // 验证 username 不能包含 @ 符号
    if (username.includes('@')) {
      return res.status(400).json({ error: 'invalid_username', error_description: 'Username cannot contain @ symbol' });
    }

    try {
      const account = await accountService.authenticateBackend(username, password, productType);

      // 检查 accountType：STAFF 不能后台登录
      if (account.accountType === 'STAFF') {
        await prisma.loginAttempt.create({
          data: {
            loginType: 'ACCOUNT',
            accountId: account.id,
            loginIdentifier: username,
            organizationId: account.orgId,
            ipAddress: req.ip || 'unknown',
            userAgent: req.get('user-agent') || null,
            success: false,
            failureReason: 'staff_no_backend_access',
          },
        });
        return res.status(400).json({
          error: 'staff_no_backend_access',
          detail: 'Staff accounts cannot access the backend system. Please use POS login.'
        });
      }

      // 检查账户状态
      if (account.status !== 'ACTIVE') {
        return res.status(401).json({
          error: 'account_suspended',
          detail: 'This account has been suspended. Please contact your administrator.'
        });
      }

      // 检查组织状态和 productType
      if (account.organization.status !== 'ACTIVE' || account.organization.productType !== productType) {
        return res.status(403).json({
          error: 'org_inactive_or_mismatch',
          detail: 'Organization is inactive or does not match the product type'
        });
      }

      // 成功：记录 login attempt
      await prisma.loginAttempt.create({
        data: {
          loginType: 'ACCOUNT',
          accountId: account.id,
          loginIdentifier: username,
          organizationId: account.orgId,
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('user-agent') || null,
          success: true,
        },
      });

      audit('account_login_backend', {
        accountId: account.id,
        orgId: account.orgId,
        productType,
        ip: req.ip,
      });

      // 返回登录信息（不包含 token，前端需要调用 /oauth/token）
      return res.json({
        success: true,
        account: {
          id: account.id,
          username: account.username,
          employeeNumber: account.employeeNumber,
          accountType: account.accountType,
          productType: account.productType,
          status: account.status,
          lastLoginAt: account.lastLoginAt,
        },
        organization: {
          id: account.organization.id,
          orgName: account.organization.orgName,
          orgType: account.organization.orgType,
          productType: account.organization.productType,
          status: account.organization.status,
        },
      });
    } catch (e: any) {
      // 失败：记录 login attempt
      await prisma.loginAttempt.create({
        data: {
          loginType: 'ACCOUNT',
          accountId: null,
          loginIdentifier: username,
          organizationId: null,
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('user-agent') || null,
          success: false,
          failureReason: e?.message || 'invalid_credentials',
        },
      });
      if (e?.message === 'account_locked') {
        return res.status(401).json({ error: 'account_locked', detail: 'Account is temporarily locked due to too many failed login attempts' });
      }
      return res.status(401).json({ error: 'invalid_credentials', detail: 'Username or password is incorrect' });
    }
  } catch (err: any) {
    const status = err?.status ?? 500;
    return res.status(status).json({ error: status === 400 ? 'invalid_product_type' : 'server_error' });
  }
}

export async function loginPOS(req: Request, res: Response) {
  try {
    const productType = getProductType(req);
    const deviceId = (req.headers['x-device-id'] || req.headers['X-Device-ID']) as string | undefined;
    const deviceFingerprint = (req.headers['x-device-fingerprint'] || req.headers['X-Device-Fingerprint']) as string | undefined;

    if (!deviceId) {
      return res.status(400).json({ error: 'device_id_required', error_description: 'X-Device-ID header is required' });
    }

    const { pinCode } = req.body || {};
    if (!pinCode) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'pinCode is required' });
    }

    try {
      const { account, device } = await accountService.authenticatePOS(pinCode, deviceId, productType);

      // 可选：记录设备指纹变化（不阻止登录）
      if (deviceFingerprint) {
        audit('device_fingerprint_captured', {
          deviceId,
          fingerprint: deviceFingerprint,
          accountId: account.id,
        });
      }

      // 更新设备活跃时间
      const { deviceService } = await import('../services/device.js');
      await deviceService.updateLastActive(deviceId);

      // 成功：记录 login attempt
      await prisma.loginAttempt.create({
        data: {
          loginType: 'ACCOUNT',
          accountId: account.id,
          loginIdentifier: account.employeeNumber, // 使用employeeNumber作为标识
          organizationId: device.orgId,
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('user-agent') || null,
          deviceFingerprint: deviceFingerprint || null,
          success: true,
        },
      });

      audit('account_login_pos', {
        accountId: account.id,
        orgId: account.orgId,
        productType,
        deviceId,
        ip: req.ip,
      });

      // 返回登录信息（不包含 token，前端需要调用 /oauth/token）
      return res.json({
        success: true,
        account: {
          id: account.id,
          employeeNumber: account.employeeNumber,
          accountType: account.accountType,
          productType: account.productType,
          status: account.status,
          lastLoginAt: account.lastLoginAt,
        },
        organization: {
          id: device.organization.id,
          orgName: device.organization.orgName,
          orgType: device.organization.orgType,
          productType: device.organization.productType,
          status: device.organization.status,
        },
        device: {
          id: device.id,
          deviceName: device.deviceName,
          deviceType: device.deviceType,
        },
      });
    } catch (e: any) {
      // 失败：记录 login attempt（无法知道具体用户，只记录设备信息）
      await prisma.loginAttempt.create({
        data: {
          loginType: 'ACCOUNT',
          accountId: null,
          loginIdentifier: 'PIN_LOGIN', // PIN登录失败无法确定具体用户
          organizationId: null,
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('user-agent') || null,
          success: false,
          failureReason: e?.message || 'invalid_credentials',
        },
      });

      if (e?.message === 'account_locked') {
        return res.status(401).json({ error: 'account_locked', detail: 'Account is temporarily locked' });
      }
      if (e?.message === 'device_not_found') {
        return res.status(404).json({ error: 'device_not_found', detail: 'Device not found' });
      }
      if (e?.message === 'device_not_active') {
        return res.status(403).json({ error: 'device_not_authorized', detail: 'This device is not authorized for your organization or is inactive' });
      }
      return res.status(401).json({ error: 'invalid_credentials', detail: 'PIN code is incorrect' });
    }
  } catch (err: any) {
    const status = err?.status ?? 500;
    return res.status(status).json({ error: status === 400 ? 'invalid_product_type' : 'server_error' });
  }
}

export async function logout(req: Request, res: Response) {
  try {
    const claims = (req as any).claims || {};
    const { refresh_token } = req.body || {};
    const jti = claims.jti;
    const deviceId = claims.deviceId;

    // 判断登录类型
    const isPOS = !!deviceId;

    // 后台登录：撤销 refresh_token
    if (!isPOS && refresh_token) {
      try {
        const old = await prisma.refreshToken.findUnique({ where: { id: refresh_token } });
        if (old) {
          await prisma.refreshToken.updateMany({
            where: { familyId: old.familyId },
            data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: 'logout' },
          });
        }
      } catch (_e) {}
    }

    // POS 登录：更新 device.lastActiveAt
    if (isPOS && deviceId) {
      try {
        await prisma.device.update({
          where: { id: deviceId },
          data: { lastActiveAt: new Date() },
        });
      } catch (_e) {}
    }

    // 将 access_token 的 jti 加入 Redis 黑名单（如果 Redis 可用）
    if (jti && isRedisConnected()) {
      try {
        const exp = claims.exp as number;
        const now = Math.floor(Date.now() / 1000);
        const ttl = exp > now ? exp - now : 60; // 至少保留 60 秒
        await jtiCache.set(jti, 'revoked', ttl);
      } catch (_e) {}
    }

    audit('account_logout', {
      accountId: claims.sub,
      loginType: isPOS ? 'POS' : 'BACKEND',
      deviceId: deviceId || null,
      ip: req.ip
    });

    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (_err) {
    return res.json({ success: true, message: 'Logged out successfully' });
  }
}

export async function me(req: Request, res: Response) {
  try {
    const claims = (req as any).claims || {};
    if (claims.userType !== 'ACCOUNT' || !claims.sub) {
      return res.status(401).json({ error: 'invalid_token' });
    }
    const account = await prisma.account.findUnique({
      where: { id: claims.sub as string },
      include: { organization: true },
    });
    if (!account) return res.status(404).json({ error: 'account_not_found' });

    return res.json({
      success: true,
      account: {
        id: account.id,
        accountType: account.accountType,
        productType: account.productType,
        username: account.username,
        employeeNumber: account.employeeNumber,
        status: account.status,
        lastLoginAt: account.lastLoginAt,
      },
      organization: {
        id: account.organization.id,
        orgName: account.organization.orgName,
        orgType: account.organization.orgType,
        productType: account.organization.productType,
        status: account.organization.status,
      },
    });
  } catch (_e) {
    return res.status(500).json({ error: 'server_error' });
  }
}

// ====== Account CRUD ======

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

// 创建账号（返回一次性PIN明文）
export async function createAccount(req: Request, res: Response) {
  try {
    const claims = getClaims(req);
    const { orgId, accountType, productType, username, password, employeeNumber, pinCode, name, email, phone } = req.body || {};

    if (!orgId || !accountType || !productType || !employeeNumber || !pinCode) {
      return res.status(400).json({
        error: 'missing_required_fields',
        detail: 'orgId, accountType, productType, employeeNumber, and pinCode are required'
      });
    }

    // 权限：USER 必须是组织 owner；ACCOUNT 根据自身类型限制
    if (claims.userType === 'USER') {
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org || org.userId !== claims.sub) return forbid(res);

      // 按文档：MAIN/BRANCH 可以创建 MANAGER 和 STAFF；FRANCHISE 只能创建 OWNER（且1个，service已校验）
      if (org.orgType === 'MAIN' || org.orgType === 'BRANCH') {
        if (accountType !== 'MANAGER' && accountType !== 'STAFF') {
          return res.status(403).json({
            error: 'can_not_create_owner',
            detail: 'You can not create OWNER accounts for MAIN and BRANCH organizations'
          });
        }
      }
      if (org.orgType === 'FRANCHISE') {
        if (accountType !== 'OWNER') {
          return res.status(403).json({
            error: 'can_only_create_owner',
            detail: 'You can only create OWNER account for FRANCHISE organizations'
          });
        }
      }
    } else if (claims.userType === 'ACCOUNT') {
      const caller = await getCallerAccount(claims);
      if (!caller || caller.orgId !== orgId) return forbid(res);

      if (caller.accountType === 'OWNER') {
        if (!['MANAGER', 'STAFF'].includes(accountType)) return forbid(res);
      } else if (caller.accountType === 'MANAGER') {
        if (accountType !== 'STAFF') {
          return res.status(403).json({
            error: 'can_only_create_staff',
            detail: 'Managers can only create STAFF accounts'
          });
        }
      } else {
        return forbid(res);
      }
    } else {
      return forbid(res);
    }

    const request = {
      orgId,
      accountType,
      productType,
      username,
      password,
      employeeNumber,
      pinCode,
      name,
      email,
      phone,
      createdBy: claims.sub as string,
    };

    const { account, pinCode: plainPin } = await accountService.createAccount(request as any, claims.userType === 'USER' ? 'USER' : 'ACCOUNT');

    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        id: account.id,
        orgId: account.orgId,
        accountType: account.accountType,
        productType: account.productType,
        username: account.username || undefined,
        employeeNumber: account.employeeNumber,
        pinCode: plainPin,
        status: account.status,
        createdAt: account.createdAt,
      },
      warning: 'Please save the PIN code. It will not be displayed again after this response.'
    });
  } catch (e: any) {
    const errorMap: Record<string, { status: number; detail: string }> = {
      username_already_exists: { status: 409, detail: 'This username is already taken' },
      employee_number_exists_in_org: { status: 409, detail: 'This employee number already exists in this organization' },
      pinCode_already_exists: { status: 409, detail: 'This pin is already taken' },
      organization_not_found_or_inactive: { status: 404, detail: 'Organization not found or inactive' },
      owner_only_for_franchise: { status: 400, detail: 'OWNER accounts can only be created for FRANCHISE organizations' },
      franchise_already_has_owner: { status: 409, detail: 'This franchise organization already has an OWNER account' },
      username_password_required: { status: 400, detail: 'Username and password are required for OWNER and MANAGER accounts' },
    };

    const error = errorMap[e?.message];
    if (error) {
      return res.status(error.status).json({ error: e.message, detail: error.detail });
    }

    return res.status(400).json({ error: 'invalid_request', detail: e?.message || 'Invalid request' });
  }
}

// 获取组织的账号列表
export async function listAccounts(req: Request, res: Response) {
  try {
    const claims = getClaims(req);
    let { orgId, accountType, status } = req.query as any;

    // 对于 ACCOUNT 类型的 token，如果没有提供 orgId，则使用 token 中的 organizationId
    if (!orgId && claims.userType === 'ACCOUNT') {
      orgId = claims.organizationId;
    }

    // 对于 USER 类型的 token，必须提供 orgId（因为 User 可能有多个组织）
    if (!orgId) {
      return res.status(400).json({
        error: 'invalid_request',
        detail: 'orgId is required for User accounts'
      });
    }

    // 权限 + 构建查询条件
    const where: any = { orgId };

    if (claims.userType === 'USER') {
      // User 必须是组织的 owner
      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      if (!org || org.userId !== claims.sub) return forbid(res);

      // 根据组织类型决定可见的 accountType
      if (org.orgType === 'MAIN' || org.orgType === 'BRANCH') {
        // MAIN/BRANCH: User 可以看所有 MANAGER 和 STAFF（直接员工）
        where.accountType = { in: ['MANAGER', 'STAFF'] };
      } else if (org.orgType === 'FRANCHISE') {
        // FRANCHISE: User 只能看 OWNER（MANAGER/STAFF 属于 OWNER，不属于 User）
        where.accountType = 'OWNER';
      }

      // 如果用户明确指定了 accountType 过滤，进一步限制
      if (accountType && ['OWNER', 'MANAGER', 'STAFF'].includes(accountType)) {
        if (org.orgType === 'MAIN' || org.orgType === 'BRANCH') {
          // 只允许过滤 MANAGER 或 STAFF
          if (accountType === 'MANAGER' || accountType === 'STAFF') {
            where.accountType = accountType;
          }
        } else if (org.orgType === 'FRANCHISE') {
          // 只允许过滤 OWNER
          if (accountType === 'OWNER') {
            where.accountType = accountType;
          }
        }
      }
    } else if (claims.userType === 'ACCOUNT') {
      // Account token 必须在同一个组织内
      const caller = await getCallerAccount(claims);
      if (!caller || caller.orgId !== orgId) return forbid(res);

      if (caller.accountType === 'OWNER') {
        // OWNER 可以看所有 MANAGER 和 STAFF
        where.accountType = { in: ['MANAGER', 'STAFF'] };

        // 如果明确指定了 accountType，进一步限制
        if (accountType && (accountType === 'MANAGER' || accountType === 'STAFF')) {
          where.accountType = accountType;
        }
      } else if (caller.accountType === 'MANAGER') {
        // MANAGER 可以看其他 MANAGER 和 STAFF（不能看 OWNER）
        where.accountType = { in: ['MANAGER', 'STAFF'] };

        // 如果明确指定了 accountType，进一步限制
        if (accountType && (accountType === 'MANAGER' || accountType === 'STAFF')) {
          where.accountType = accountType;
        }
      } else if (caller.accountType === 'STAFF') {
        // STAFF 无权限查看任何账号列表
        return forbid(res);
      }
    } else {
      return forbid(res);
    }

    // 状态过滤
    if (status && ['ACTIVE', 'SUSPENDED', 'DELETED'].includes(status)) {
      where.status = status;
    } else {
      // 默认只返回 ACTIVE
      where.status = 'ACTIVE';
    }

    const accounts = await prisma.account.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orgId: true,
        accountType: true,
        productType: true,
        username: true,
        employeeNumber: true,
        status: true,
        lastLoginAt: true,
        createdAt: true
      }
    });

    return res.json({
      success: true,
      data: accounts,
      total: accounts.length
    });
  } catch (_e) {
    return res.status(500).json({ error: 'server_error' });
  }
}

// 获取账号详情
export async function getAccount(req: Request, res: Response) {
  try {
    const claims = getClaims(req);
    const { accountId } = req.params as any;

    const acc = await prisma.account.findUnique({
      where: { id: accountId },
      include: { organization: { select: { orgName: true } } }
    });

    if (!acc) {
      return res.status(404).json({ error: 'account_not_found', detail: 'Account not found' });
    }

    // 权限验证
    if (claims.userType === 'USER') {
      // User 必须是组织的 owner
      const org = await prisma.organization.findUnique({ where: { id: acc.orgId } });
      if (!org || org.userId !== claims.sub) return forbid(res);

      // 根据组织类型决定可见的 accountType
      if (org.orgType === 'MAIN' || org.orgType === 'BRANCH') {
        // MAIN/BRANCH: User 只能看 MANAGER 和 STAFF
        if (acc.accountType !== 'MANAGER' && acc.accountType !== 'STAFF') {
          return forbid(res);
        }
      } else if (org.orgType === 'FRANCHISE') {
        // FRANCHISE: User 只能看 OWNER
        if (acc.accountType !== 'OWNER') {
          return forbid(res);
        }
      }
    } else if (claims.userType === 'ACCOUNT') {
      // Account token 必须在同一个组织内
      const caller = await getCallerAccount(claims);
      if (!caller || caller.orgId !== acc.orgId) return forbid(res);

      if (caller.accountType === 'OWNER') {
        // OWNER 可以看 MANAGER 和 STAFF，不能看其他 OWNER
        if (acc.accountType === 'OWNER') {
          return forbid(res);
        }
      } else if (caller.accountType === 'MANAGER') {
        // MANAGER 可以看其他 MANAGER 和 STAFF，不能看 OWNER
        if (acc.accountType === 'OWNER') {
          return forbid(res);
        }
      } else if (caller.accountType === 'STAFF') {
        // STAFF 无权限查看任何账号
        return forbid(res);
      }
    } else {
      return forbid(res);
    }

    return res.json({
      success: true,
      data: {
        id: acc.id,
        orgId: acc.orgId,
        orgName: acc.organization.orgName,
        accountType: acc.accountType,
        productType: acc.productType,
        username: acc.username || undefined,
        employeeNumber: acc.employeeNumber,
        status: acc.status,
        lastLoginAt: acc.lastLoginAt,
        createdAt: acc.createdAt,
        updatedAt: acc.updatedAt,
        createdBy: acc.createdBy
      }
    });
  } catch (_e) {
    return res.status(500).json({ error: 'server_error' });
  }
}

// 更新账号（仅 username/status）
export async function updateAccount(req: Request, res: Response) {
  try {
    const claims = getClaims(req);
    const { accountId } = req.params as any;
    const { username, status } = req.body || {};

    // 至少要提供一个字段
    if (username === undefined && status === undefined) {
      return res.status(400).json({
        error: 'invalid_request',
        detail: 'At least one field (username or status) must be provided'
      });
    }

    const target = await prisma.account.findUnique({ where: { id: accountId } });
    if (!target) {
      return res.status(404).json({ error: 'account_not_found', detail: 'Account not found' });
    }

    // 权限验证 + 决定可修改的字段
    let canModifyUsername = false;
    let canModifyStatus = false;

    if (claims.userType === 'USER') {
      // USER 可以修改除 FRANCHISE 的 MANAGER/STAFF 外的所有账号
      const org = await prisma.organization.findUnique({ where: { id: target.orgId } });
      if (!org || org.userId !== claims.sub) return forbid(res);

      // 根据组织类型决定可修改的账号
      if (org.orgType === 'MAIN' || org.orgType === 'BRANCH') {
        // MAIN/BRANCH: USER 可以修改 MANAGER 和 STAFF
        if (target.accountType === 'MANAGER' || target.accountType === 'STAFF') {
          canModifyUsername = target.accountType === 'MANAGER'; // STAFF 没有 username
          canModifyStatus = true;
        } else {
          // 不能修改 OWNER
          return forbid(res);
        }
      } else if (org.orgType === 'FRANCHISE') {
        // FRANCHISE: USER 只能修改 OWNER，不能修改 MANAGER/STAFF
        if (target.accountType === 'OWNER') {
          canModifyUsername = true;
          canModifyStatus = true;
        } else {
          return res.status(403).json({
            error: 'cannot_modify_franchise_staff',
            detail: 'You cannot modify MANAGER/STAFF in FRANCHISE organizations. They belong to the OWNER.'
          });
        }
      }
    } else if (claims.userType === 'ACCOUNT') {
      const caller = await getCallerAccount(claims);
      if (!caller || caller.orgId !== target.orgId) return forbid(res);

      // 不能修改自己
      if (caller.id === target.id) {
        return res.status(400).json({
          error: 'cannot_modify_self',
          detail: 'You cannot modify your own account'
        });
      }

      if (caller.accountType === 'OWNER') {
        // OWNER 不能修改其他 OWNER
        if (target.accountType === 'OWNER') {
          return res.status(400).json({
            error: 'cannot_modify_owner',
            detail: 'Cannot modify another OWNER account'
          });
        }
        // OWNER 可以修改 MANAGER 的 username 和 status
        if (target.accountType === 'MANAGER') {
          canModifyUsername = true;
          canModifyStatus = true;
        }
        // OWNER 可以修改 STAFF 的 status（STAFF 没有 username）
        if (target.accountType === 'STAFF') {
          canModifyUsername = false;
          canModifyStatus = true;
        }
      } else if (caller.accountType === 'MANAGER') {
        // MANAGER 只能修改 STAFF
        if (target.accountType !== 'STAFF') {
          return forbid(res);
        }
        // MANAGER 可以修改 STAFF 的 status（STAFF 没有 username）
        canModifyUsername = false;
        canModifyStatus = true;
      } else {
        // STAFF 无权限
        return forbid(res);
      }
    } else {
      return forbid(res);
    }

    // 构建更新数据
    const data: any = {};

    // 处理 username 修改
    if (username !== undefined) {
      if (!canModifyUsername) {
        return res.status(403).json({
          error: 'cannot_modify_username',
          detail: 'You do not have permission to modify username for this account type'
        });
      }
      // STAFF 没有 username，不允许设置
      if (target.accountType === 'STAFF') {
        return res.status(400).json({
          error: 'staff_no_username',
          detail: 'STAFF accounts do not have usernames'
        });
      }
      // 检查 username 唯一性（如果不为空）
      if (username && username.trim().length > 0) {
        const existing = await prisma.account.findFirst({
          where: {
            username: username.trim(),
            status: 'ACTIVE',
            id: { not: accountId }
          }
        });
        if (existing) {
          return res.status(409).json({
            error: 'username_already_exists',
            detail: 'This username is already taken'
          });
        }
        data.username = username.trim();
      } else {
        data.username = null;
      }
    }

    // 处理 status 修改
    if (status !== undefined) {
      if (!canModifyStatus) {
        return res.status(403).json({
          error: 'cannot_modify_status',
          detail: 'You do not have permission to modify status for this account'
        });
      }
      if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
        return res.status(400).json({
          error: 'invalid_status',
          detail: 'Status must be either ACTIVE or SUSPENDED'
        });
      }
      data.status = status;
    }

    // 如果没有实际要更新的字段
    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        error: 'no_changes',
        detail: 'No valid changes to apply'
      });
    }

    // 执行更新
    const updated = await prisma.account.update({
      where: { id: accountId },
      data
    });

    audit('account_updated', {
      accountId,
      by: claims.sub,
      changes: Object.keys(data),
      updatedFields: data
    });

    return res.json({
      success: true,
      message: 'Account updated successfully',
      data: {
        id: updated.id,
        username: updated.username || undefined,
        status: updated.status,
        updatedAt: updated.updatedAt
      }
    });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return res.status(409).json({
        error: 'username_already_exists',
        detail: 'This username is already taken'
      });
    }
    return res.status(500).json({ error: 'server_error' });
  }
}

// 删除账号（软删除）
// User 删除 FRANCHISE 的 OWNER 时级联删除该组织所有 MANAGER/STAFF
// User/OWNER/MANAGER 删除 MANAGER 时不会级联删除该 MANAGER 创建的 STAFF
export async function deleteAccount(req: Request, res: Response) {
  try {
    const claims = getClaims(req);
    const { accountId } = req.params as any;
    const target = await prisma.account.findUnique({ where: { id: accountId } });

    if (!target) {
      return res.status(404).json({ error: 'account_not_found', detail: 'Account not found' });
    }

    // 不能删除自己
    if (claims.sub === target.id) {
      return res.status(400).json({
        error: 'cannot_delete_self',
        detail: 'You cannot delete your own account'
      });
    }

    if (claims.userType === 'USER') {
      // USER 删除权限
      const org = await prisma.organization.findUnique({ where: { id: target.orgId } });
      if (!org || org.userId !== claims.sub) return forbid(res);

      // 根据组织类型决定可删除的账号
      if (org.orgType === 'MAIN' || org.orgType === 'BRANCH') {
        // MAIN/BRANCH: USER 只能删除 MANAGER 和 STAFF（直接员工）
        if (target.accountType !== 'MANAGER' && target.accountType !== 'STAFF') {
          return res.status(403).json({
            error: 'can_only_delete_manager_staff',
            detail: 'You can only delete MANAGER and STAFF in MAIN/BRANCH organizations'
          });
        }
        // 删除 MANAGER 不会级联删除他创建的 STAFF
        await prisma.account.update({
          where: { id: accountId },
          data: { status: 'DELETED' }
        });
        audit('account_deleted', { accountId, by: claims.sub, accountType: target.accountType });
        return res.json({
          success: true,
          message: 'Account deleted successfully'
        });
      } else if (org.orgType === 'FRANCHISE') {
        // FRANCHISE: USER 只能删除 OWNER
        if (target.accountType !== 'OWNER') {
          return res.status(403).json({
            error: 'can_only_delete_owner',
            detail: 'You can only delete OWNER in FRANCHISE organizations. MANAGER and STAFF belong to the OWNER.'
          });
        }
        // 删除 OWNER 时级联删除该组织的所有 MANAGER 和 STAFF
        const result = await prisma.account.updateMany({
          where: {
            orgId: target.orgId,
            status: { in: ['ACTIVE', 'SUSPENDED'] }
          },
          data: { status: 'DELETED' }
        });
        audit('account_cascade_deleted', {
          orgId: target.orgId,
          by: claims.sub,
          deletedCount: result.count,
          reason: 'owner_deleted_in_franchise'
        });
        return res.json({
          success: true,
          message: 'OWNER and all subordinates (MANAGER/STAFF) deleted successfully',
          deletedCount: result.count
        });
      }
    } else if (claims.userType === 'ACCOUNT') {
      // ACCOUNT 删除权限
      const caller = await getCallerAccount(claims);
      if (!caller || caller.orgId !== target.orgId) return forbid(res);

      if (caller.accountType === 'OWNER') {
        // OWNER 可以删除 MANAGER 和 STAFF
        if (target.accountType === 'OWNER') {
          return res.status(400).json({
            error: 'cannot_delete_owner',
            detail: 'Cannot delete another OWNER account'
          });
        }
        // 删除 MANAGER 不会级联删除他创建的 STAFF
        await prisma.account.update({
          where: { id: accountId },
          data: { status: 'DELETED' }
        });
        audit('account_deleted', {
          accountId,
          by: claims.sub,
          accountType: target.accountType,
          deletedBy: 'OWNER'
        });
        return res.json({
          success: true,
          message: 'Account deleted successfully'
        });
      } else if (caller.accountType === 'MANAGER') {
        // MANAGER 只能删除 STAFF
        if (target.accountType !== 'STAFF') {
          return res.status(403).json({
            error: 'can_only_delete_staff',
            detail: 'Managers can only delete STAFF accounts'
          });
        }
        // 删除 STAFF
        await prisma.account.update({
          where: { id: accountId },
          data: { status: 'DELETED' }
        });
        audit('account_deleted', {
          accountId,
          by: claims.sub,
          accountType: 'STAFF',
          deletedBy: 'MANAGER'
        });
        return res.json({
          success: true,
          message: 'STAFF account deleted successfully'
        });
      } else {
        // STAFF 无权限删除任何账号
        return forbid(res);
      }
    } else {
      return forbid(res);
    }

    // 兜底返回（理论上不会到这里）
    return res.status(500).json({ error: 'server_error' });
  } catch (_e) {
    return res.status(500).json({ error: 'server_error' });
  }
}

// 管理员重置密码（3.12）
// USER: 只能为 MAIN/BRANCH 的 MANAGER 重置密码（STAFF 没有密码）
// OWNER: 只能为自己组织的 MANAGER 重置密码
// MANAGER: 无权重置任何人的密码
export async function resetAccountPassword(req: Request, res: Response) {
  try {
    const claims = getClaims(req);
    const { accountId } = req.params as any;
    const { newPassword } = req.body || {};

    if (!newPassword) {
      return res.status(400).json({ error: 'invalid_request', detail: 'newPassword is required' });
    }

    const target = await prisma.account.findUnique({ where: { id: accountId } });
    if (!target) {
      return res.status(404).json({ error: 'account_not_found', detail: 'Account not found' });
    }

    // STAFF 无密码
    if (target.accountType === 'STAFF') {
      return res.status(400).json({
        error: 'staff_no_password',
        detail: 'STAFF accounts do not have passwords'
      });
    }

    // 权限验证
    if (claims.userType === 'USER') {
      // USER 权限
      const org = await prisma.organization.findUnique({ where: { id: target.orgId } });
      if (!org || org.userId !== claims.sub) return forbid(res);

      // 根据组织类型决定可重置密码的账号
      if (org.orgType === 'MAIN' || org.orgType === 'BRANCH') {
        // MAIN/BRANCH: USER 只能为 MANAGER 重置密码（STAFF 没有密码）
        if (target.accountType !== 'MANAGER') {
          return res.status(403).json({
            error: 'can_only_reset_manager_password',
            detail: 'You can only reset MANAGER passwords in MAIN/BRANCH organizations'
          });
        }
      } else if (org.orgType === 'FRANCHISE') {
        // FRANCHISE: USER 无权为任何人重置密码（OWNER/MANAGER/STAFF 都不属于 USER）
        return res.status(403).json({
          error: 'cannot_reset_franchise_passwords',
          detail: 'You cannot reset passwords in FRANCHISE organizations. Accounts belong to the OWNER.'
        });
      }
    } else if (claims.userType === 'ACCOUNT') {
      // ACCOUNT 权限
      const caller = await getCallerAccount(claims);
      if (!caller || caller.orgId !== target.orgId) return forbid(res);

      if (caller.accountType === 'OWNER') {
        // OWNER 只能为 MANAGER 重置密码
        if (target.accountType !== 'MANAGER') {
          return res.status(403).json({
            error: 'owner_can_only_reset_manager_password',
            detail: 'OWNER can only reset MANAGER passwords'
          });
        }
      } else if (caller.accountType === 'MANAGER') {
        // MANAGER 无权重置任何人的密码
        return res.status(403).json({
          error: 'manager_cannot_reset_password',
          detail: 'MANAGER cannot reset passwords'
        });
      } else {
        // STAFF 无权限
        return forbid(res);
      }
    } else {
      return forbid(res);
    }

    // 验证新密码强度
    if (newPassword.length < 8) {
      return res.status(400).json({
        error: 'password_too_short',
        detail: 'Password must be at least 8 characters long'
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, env.passwordHashRounds);
    await prisma.account.update({ where: { id: accountId }, data: { passwordHash } });

    // 撤销该账号所有 refresh_tokens
    await prisma.refreshToken.updateMany({
      where: { subjectAccountId: accountId, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: 'password_reset_by_admin' }
    });

    audit('account_password_reset', { accountId, by: claims.sub, resetBy: claims.userType });
    return res.json({
      success: true,
      message: 'Password has been reset successfully. The account must log in again.'
    });
  } catch (_e) {
    return res.status(500).json({ error: 'server_error' });
  }
}

// 管理员重置 PIN（3.13）
// USER: 可为 MAIN/BRANCH 的 MANAGER/STAFF 重置 PIN，可为 FRANCHISE 的 OWNER 重置 PIN（FRANCHISE 的 MANAGER/STAFF 属于 OWNER）
// OWNER: 可为自己组织的所有人（包括自己）重置 PIN
// MANAGER: 只能为 STAFF 和自己重置 PIN（不能为其他 MANAGER 或 OWNER 重置）
export async function resetAccountPin(req: Request, res: Response) {
  try {
    const claims = getClaims(req);
    const { accountId } = req.params as any;
    const { newPinCode } = req.body || {};

    if (!newPinCode) {
      return res.status(400).json({ error: 'invalid_request', detail: 'newPinCode is required' });
    }

    const target = await prisma.account.findUnique({ where: { id: accountId } });
    if (!target) {
      return res.status(404).json({ error: 'account_not_found', detail: 'Account not found' });
    }

    // 权限验证
    if (claims.userType === 'USER') {
      // USER 权限
      const org = await prisma.organization.findUnique({ where: { id: target.orgId } });
      if (!org || org.userId !== claims.sub) return forbid(res);

      // 根据组织类型决定可重置 PIN 的账号
      if (org.orgType === 'MAIN' || org.orgType === 'BRANCH') {
        // MAIN/BRANCH: USER 可为 MANAGER 和 STAFF 重置 PIN
        if (target.accountType !== 'MANAGER' && target.accountType !== 'STAFF') {
          return res.status(403).json({
            error: 'can_only_reset_manager_staff_pin',
            detail: 'You can only reset PIN for MANAGER and STAFF in MAIN/BRANCH organizations'
          });
        }
      } else if (org.orgType === 'FRANCHISE') {
        // FRANCHISE: USER 只能为 OWNER 重置 PIN（MANAGER/STAFF 属于 OWNER，不属于 USER）
        if (target.accountType !== 'OWNER') {
          return res.status(403).json({
            error: 'can_only_reset_owner_pin',
            detail: 'You can only reset PIN for OWNER in FRANCHISE organizations. MANAGER and STAFF belong to the OWNER.'
          });
        }
      }
    } else if (claims.userType === 'ACCOUNT') {
      // ACCOUNT 权限
      const caller = await getCallerAccount(claims);
      if (!caller || caller.orgId !== target.orgId) return forbid(res);

      if (caller.accountType === 'OWNER') {
        // OWNER 可为组织内所有人重置 PIN（包括自己、MANAGER、STAFF）
        // 不需要额外检查
      } else if (caller.accountType === 'MANAGER') {
        // MANAGER 只能为 STAFF 和自己重置 PIN
        // 不能为其他 MANAGER（平级）或 OWNER（上级）重置
        if (target.accountType === 'OWNER') {
          return res.status(403).json({
            error: 'manager_cannot_reset_owner_pin',
            detail: 'MANAGER cannot reset OWNER PIN'
          });
        }
        if (target.accountType === 'MANAGER' && target.id !== caller.id) {
          return res.status(403).json({
            error: 'manager_cannot_reset_other_manager_pin',
            detail: 'MANAGER cannot reset other MANAGER PINs'
          });
        }
        // 允许：STAFF 或 自己
      } else {
        // STAFF 无权限
        return forbid(res);
      }
    } else {
      return forbid(res);
    }

    const result = await accountService.resetPinCode(accountId, newPinCode, claims.sub as string);
    audit('account_pin_admin_reset', { accountId, by: claims.sub, resetBy: claims.userType });

    return res.json({
      success: true,
      message: 'PIN code has been reset successfully',
      newPinCode: result.newPinCode,
      warning: 'Please save this PIN code. It will not be displayed again.'
    });
  } catch (e: any) {
    if (e?.message === 'account_not_found') {
      return res.status(404).json({ error: 'account_not_found', detail: 'Account not found' });
    }
    if (e?.message === 'pin_code_must_be_4_digits') {
      return res.status(400).json({ error: 'invalid_pin_code', detail: 'PIN code must be exactly 4 digits' });
    }
    return res.status(400).json({ error: 'invalid_request', detail: e?.message || 'Invalid request' });
  }
}

// 自己修改密码（仅 ACCOUNT 且 OWNER/MANAGER）
export async function changeOwnPassword(req: Request, res: Response) {
  try {
    const claims = getClaims(req);

    if (claims.userType !== 'ACCOUNT') {
      return res.status(400).json({
        error: 'only_account_can_change_password',
        detail: 'Only account users can change their password'
      });
    }

    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: 'invalid_request',
        detail: 'currentPassword and newPassword are required'
      });
    }

    const acc = await prisma.account.findUnique({ where: { id: claims.sub as string } });
    if (!acc) {
      return res.status(404).json({ error: 'account_not_found', detail: 'Account not found' });
    }

    if (!acc.passwordHash) {
      return res.status(400).json({
        error: 'staff_no_password',
        detail: 'STAFF accounts do not have passwords'
      });
    }

    const ok = await bcrypt.compare(currentPassword, acc.passwordHash);
    if (!ok) {
      return res.status(400).json({
        error: 'invalid_current_password',
        detail: 'Current password is incorrect'
      });
    }

    // 验证新密码强度
    if (newPassword.length < 8) {
      return res.status(400).json({
        error: 'password_too_short',
        detail: 'New password must be at least 8 characters long'
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, env.passwordHashRounds);
    await prisma.account.update({ where: { id: acc.id }, data: { passwordHash } });

    // 撤销所有 refresh_tokens（强制重新登录）
    await prisma.refreshToken.updateMany({
      where: { subjectAccountId: acc.id, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: 'password_changed' }
    });

    audit('account_change_password', { accountId: acc.id });
    return res.json({
      success: true,
      message: 'Password changed successfully. Please log in again with your new password.'
    });
  } catch (_e) {
    return res.status(500).json({ error: 'server_error' });
  }
}


