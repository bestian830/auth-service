import { Router } from 'express';
import { organizationService } from '../services/organization.js';
import { requireBearer } from '../middleware/bearer.js';
import { Request, Response } from 'express';
import { z } from 'zod';

const router = Router();

// All organization endpoints require authentication
router.use(requireBearer);

// Create organization schema - 支持新的字段
const createOrgSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  location: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional()
});

// Update organization schema
const updateOrgSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  location: z.string().optional(), 
  phone: z.string().optional(),
  email: z.string().email().optional()
});

/**
 * POST /organizations
 * Create new organization
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = createOrgSchema.parse(req.body);
    const userId = (req as any).claims?.sub;
    
    if (!userId) {
      return res.status(401).json({ error: 'User ID not found in token' });
    }

    const organization = await organizationService.createOrganization({
      name: body.name,
      ownerId: userId,
      description: body.description,
      location: body.location,
      phone: body.phone,
      email: body.email
    });

    res.status(201).json({ organization });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    console.error('Failed to create organization:', error);
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

/**
 * GET /organizations/:id
 * Get organization details
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).claims?.sub;

    // Check if user has access to this organization
    const permission = await organizationService.checkUserPermission(userId, id);
    if (!permission.hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const organization = await organizationService.getOrganization(id);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json({ organization });
  } catch (error: any) {
    console.error('Failed to get organization:', error);
    res.status(500).json({ error: 'Failed to get organization' });
  }
});

/**
 * PUT /organizations/:id
 * Update organization details
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = updateOrgSchema.parse(req.body);
    const userId = (req as any).claims?.sub;

    // Check if user has access to this organization
    const permission = await organizationService.checkUserPermission(userId, id);
    if (!permission.hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const organization = await organizationService.updateOrganization(id, body);
    res.json({ organization });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    console.error('Failed to update organization:', error);
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

/**
 * GET /organizations
 * Get user's organizations
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).claims?.sub;
    const organizations = await organizationService.getUserOrganizations(userId);
    res.json({ organizations });
  } catch (error: any) {
    console.error('Failed to get user organizations:', error);
    res.status(500).json({ error: 'Failed to get organizations' });
  }
});

/**
 * DELETE /organizations/:id
 * Delete organization (soft delete)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).claims?.sub;

    // Check if user has access to this organization  
    const permission = await organizationService.checkUserPermission(userId, id);
    if (!permission.hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await organizationService.deleteOrganization(id);
    res.json({ success: true, message: 'Organization deleted successfully' });
  } catch (error: any) {
    console.error('Failed to delete organization:', error);
    res.status(500).json({ error: 'Failed to delete organization' });
  }
});

// ===== 以下API已移到employee-service =====

/**
 * @deprecated 用户角色管理API已移到employee-service
 * 请使用employee-service的对应API端点
 */
router.post('/:id/users', async (req: Request, res: Response) => {
  res.status(410).json({ 
    error: 'API moved', 
    message: 'User role management has been moved to employee-service. Please use employee-service API instead.',
    newEndpoint: 'POST /employee-service/organizations/:id/employees'
  });
});

/**
 * @deprecated 用户角色管理API已移到employee-service
 */
router.put('/:id/users/:userId/role', async (req: Request, res: Response) => {
  res.status(410).json({ 
    error: 'API moved',
    message: 'User role management has been moved to employee-service. Please use employee-service API instead.',
    newEndpoint: 'PUT /employee-service/organizations/:id/employees/:userId/role'
  });
});

/**
 * @deprecated 用户角色管理API已移到employee-service
 */
router.delete('/:id/users/:userId', async (req: Request, res: Response) => {
  res.status(410).json({ 
    error: 'API moved',
    message: 'User role management has been moved to employee-service. Please use employee-service API instead.',
    newEndpoint: 'DELETE /employee-service/organizations/:id/employees/:userId'
  });
});

export default router;