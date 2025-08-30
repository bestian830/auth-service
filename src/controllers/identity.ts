import { Request, Response } from 'express';
import { prisma } from '../infra/prisma.js';
import { env } from '../config/env.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendMailDev } from '../services/mailer.js';
import { audit } from '../middleware/audit.js';

function minutesFromNow(mins: number) { 
  return new Date(Date.now() + mins * 60 * 1000); 
}

function buildUrl(base: string, path: string, params: Record<string, string>) {
  const u = new URL(path, base);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }
  return u.toString();
}

export async function register(req: Request, res: Response) {
  // TODO: 速率限制
  const { email, password, tenant_id } = req.body ?? {};
  
  // 基本入参校验
  if (!email || !password) {
    audit('register_invalid_request', { ip: req.ip });
    return res.status(400).json({ error: 'invalid_request' });
  }
  
  // 简单邮箱格式验证
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    audit('register_invalid_email', { email, ip: req.ip });
    return res.status(400).json({ error: 'invalid_email' });
  }
  
  try {
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      // 不暴露用户存在性
      audit('register_conflict', { email, ip: req.ip });
      return res.status(200).json({ ok: true });
    }
    
    const hash = await bcrypt.hash(password, env.passwordHashRounds);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hash,
        tenantId: tenant_id || env.defaultTenantId,
        roles: ['user'],
      }
    });
    
    // 发邮箱验证
    const token = crypto.randomUUID();
    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt: minutesFromNow(30),
      }
    });
    
    const url = buildUrl(env.issuerUrl, '/verify', { token });
    await sendMailDev(user.email, 'Verify your email', `点击验证：<a href="${url}">${url}</a>`);
    
    audit('register', { userId: user.id, tenantId: user.tenantId, ip: req.ip });
    return res.json({ ok: true });
    
  } catch (error) {
    audit('register_error', { email, error: error instanceof Error ? error.message : String(error), ip: req.ip });
    return res.status(500).json({ error: 'server_error' });
  }
}

export async function verifyEmail(req: Request, res: Response) {
  // 支持 GET/POST，GET 用于点击链接
  const token = (req.method === 'GET' ? req.query.token : req.body?.token) as string | undefined;
  
  if (!token) {
    audit('verify_invalid_request', { ip: req.ip });
    return res.status(400).json({ error: 'invalid_request' });
  }
  
  try {
    const t = await prisma.emailVerificationToken.findUnique({ 
      where: { token },
      include: { user: true }
    });
    
    if (!t || t.status !== 'pending' || t.expiresAt < new Date()) {
      audit('verify_fail', { token, ip: req.ip });
      return res.status(400).json({ error: 'invalid_token' });
    }
    
    await prisma.$transaction([
      prisma.user.update({ 
        where: { id: t.userId }, 
        data: { emailVerifiedAt: new Date() }
      }),
      prisma.emailVerificationToken.update({ 
        where: { token }, 
        data: { status: 'used', usedAt: new Date() }
      })
    ]);
    
    audit('verify_success', { userId: t.userId, email: t.user.email, ip: req.ip });
    
    // GET 返回简单 HTML，POST 返回 JSON
    if (req.method === 'GET') { 
      return res.type('html').send('<h1>邮箱已验证</h1><p>您的邮箱已成功验证！</p>'); 
    }
    return res.json({ ok: true });
    
  } catch (error) {
    audit('verify_error', { token, error: error instanceof Error ? error.message : String(error), ip: req.ip });
    return res.status(500).json({ error: 'server_error' });
  }
}

export async function resendVerification(req: Request, res: Response) {
  // TODO: 速率限制
  const { email } = req.body ?? {};
  
  if (!email) {
    audit('resend_verify_invalid_request', { ip: req.ip });
    return res.status(400).json({ error: 'invalid_request' });
  }
  
  try {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u) {
      // 不暴露存在性
      audit('resend_verify_not_found', { email, ip: req.ip });
      return res.json({ ok: true }); 
    }
    
    if (u.emailVerifiedAt) {
      audit('resend_verify_already_verified', { userId: u.id, email, ip: req.ip });
      return res.json({ ok: true });
    }
    
    // 使旧令牌失效
    await prisma.emailVerificationToken.updateMany({
      where: { userId: u.id, status: 'pending' },
      data: { status: 'expired' }
    });
    
    const token = crypto.randomUUID();
    await prisma.emailVerificationToken.create({
      data: { userId: u.id, token, expiresAt: minutesFromNow(30) }
    });
    
    const url = buildUrl(env.issuerUrl, '/verify', { token });
    await sendMailDev(u.email, 'Verify your email', `点击验证：<a href="${url}">${url}</a>`);
    
    audit('verify_resend', { userId: u.id, email, ip: req.ip });
    return res.json({ ok: true });
    
  } catch (error) {
    audit('resend_verify_error', { email, error: error instanceof Error ? error.message : String(error), ip: req.ip });
    return res.status(500).json({ error: 'server_error' });
  }
}

export async function forgotPassword(req: Request, res: Response) {
  // TODO: 速率限制
  const { email } = req.body ?? {};
  
  if (!email) {
    audit('forgot_password_invalid_request', { ip: req.ip });
    return res.status(400).json({ error: 'invalid_request' });
  }
  
  try {
    const u = await prisma.user.findUnique({ where: { email } });
    
    // 统一响应，不暴露存在性
    if (!u) { 
      audit('forgot_password_not_found', { email, ip: req.ip });
      return res.json({ ok: true }); 
    }
    
    // 使旧重置令牌失效
    await prisma.passwordResetToken.updateMany({
      where: { userId: u.id, status: 'pending' },
      data: { status: 'expired' }
    });
    
    const token = crypto.randomUUID();
    await prisma.passwordResetToken.create({
      data: { userId: u.id, token, expiresAt: minutesFromNow(30) }
    });
    
    const url = buildUrl(env.issuerUrl, '/reset-password', { token });
    await sendMailDev(u.email, 'Reset your password', `重置链接：<a href="${url}">${url}</a>`);
    
    audit('forgot_password', { userId: u.id, email, ip: req.ip });
    return res.json({ ok: true });
    
  } catch (error) {
    audit('forgot_password_error', { email, error: error instanceof Error ? error.message : String(error), ip: req.ip });
    return res.status(500).json({ error: 'server_error' });
  }
}

export async function resetPassword(req: Request, res: Response) {
  const { token, new_password } = req.body ?? {};
  
  if (!token || !new_password) {
    audit('reset_password_invalid_request', { ip: req.ip });
    return res.status(400).json({ error: 'invalid_request' });
  }
  
  // 基本密码长度检查
  if (new_password.length < 6) {
    audit('reset_password_weak', { token, ip: req.ip });
    return res.status(400).json({ error: 'password_too_short' });
  }
  
  try {
    const t = await prisma.passwordResetToken.findUnique({ 
      where: { token },
      include: { user: true }
    });
    
    if (!t || t.status !== 'pending' || t.expiresAt < new Date()) {
      audit('reset_password_fail', { token, ip: req.ip });
      return res.status(400).json({ error: 'invalid_token' });
    }
    
    const hash = await bcrypt.hash(new_password, env.passwordHashRounds);
    await prisma.$transaction([
      prisma.user.update({ 
        where: { id: t.userId }, 
        data: { passwordHash: hash }
      }),
      prisma.passwordResetToken.update({ 
        where: { token }, 
        data: { status: 'used', usedAt: new Date() }
      })
    ]);
    
    audit('reset_password_success', { userId: t.userId, email: t.user.email, ip: req.ip });
    return res.json({ ok: true });
    
  } catch (error) {
    audit('reset_password_error', { token, error: error instanceof Error ? error.message : String(error), ip: req.ip });
    return res.status(500).json({ error: 'server_error' });
  }
}

// 需要 Bearer（已实现）保护
export async function changePassword(req: Request, res: Response) {
  // claims 注入自 requireBearer
  const claims = (req as any).claims;
  if (!claims?.sub) {
    audit('change_password_unauthorized', { ip: req.ip });
    return res.status(401).json({ error: 'unauthorized' });
  }
  
  const { current_password, new_password } = req.body ?? {};
  
  if (!current_password || !new_password) {
    audit('change_password_invalid_request', { userId: claims.sub, ip: req.ip });
    return res.status(400).json({ error: 'invalid_request' });
  }
  
  // 基本密码长度检查
  if (new_password.length < 6) {
    audit('change_password_weak', { userId: claims.sub, ip: req.ip });
    return res.status(400).json({ error: 'password_too_short' });
  }
  
  try {
    const u = await prisma.user.findUnique({ where: { id: claims.sub } });
    if (!u?.passwordHash) {
      audit('change_password_no_hash', { userId: claims.sub, ip: req.ip });
      return res.status(401).json({ error: 'unauthorized' });
    }
    
    const ok = await bcrypt.compare(current_password, u.passwordHash);
    if (!ok) {
      audit('change_password_wrong_current', { userId: claims.sub, email: u.email, ip: req.ip });
      return res.status(401).json({ error: 'invalid_current_password' });
    }
    
    // 检查新密码是否与当前密码相同
    const samePassword = await bcrypt.compare(new_password, u.passwordHash);
    if (samePassword) {
      audit('change_password_same', { userId: claims.sub, email: u.email, ip: req.ip });
      return res.status(400).json({ error: 'password_unchanged' });
    }
    
    const hash = await bcrypt.hash(new_password, env.passwordHashRounds);
    await prisma.user.update({ 
      where: { id: u.id }, 
      data: { passwordHash: hash }
    });
    
    audit('change_password', { userId: u.id, email: u.email, ip: req.ip });
    return res.json({ ok: true });
    
  } catch (error) {
    audit('change_password_error', { userId: claims.sub, error: error instanceof Error ? error.message : String(error), ip: req.ip });
    return res.status(500).json({ error: 'server_error' });
  }
}