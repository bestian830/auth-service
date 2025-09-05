import { Router } from 'express';
import { organizationService } from '../services/organization.js';
import { requireBearer } from '../middleware/bearer.js';
import { Request, Response } from 'express';
import { z } from 'zod';

const router = Router();

// All organization endpoints require authentication
router.use(requireBearer);

// Create organization schema
const createOrgSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional()
});

// Add user to organization schema  
const addUserSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['OWNER', 'MANAGER', 'EMPLOYEE'])
});

// Update user role schema
const updateRoleSchema = z.object({
  role: z.enum(['MANAGER', 'EMPLOYEE']) // Can't update to/from OWNER
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
      description: body.description
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
 * POST /organizations/:id/users
 * Add user to organization
 */
router.post('/:id/users', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = addUserSchema.parse(req.body);
    const adminUserId = (req as any).claims?.sub;

    // Check if requesting user is owner or manager
    const permission = await organizationService.checkUserPermission(adminUserId, id, 'MANAGER');
    if (!permission.hasAccess) {
      return res.status(403).json({ error: 'Manager access required' });
    }

    const userRole = await organizationService.addUserToOrganization({
      userId: body.userId,
      organizationId: id,
      role: body.role
    });

    res.status(201).json({ userRole });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    if (error.message === 'User already has a role in this organization') {
      return res.status(409).json({ error: 'User already in organization' });
    }
    console.error('Failed to add user to organization:', error);
    res.status(500).json({ error: 'Failed to add user to organization' });
  }
});

/**
 * PUT /organizations/:id/users/:userId/role
 * Update user role in organization
 */
router.put('/:id/users/:userId/role', async (req: Request, res: Response) => {
  try {
    const { id, userId } = req.params;
    const body = updateRoleSchema.parse(req.body);
    const adminUserId = (req as any).claims?.sub;

    // Check if requesting user is owner or manager
    const permission = await organizationService.checkUserPermission(adminUserId, id, 'MANAGER');
    if (!permission.hasAccess) {
      return res.status(403).json({ error: 'Manager access required' });
    }

    await organizationService.updateUserRole(userId, id, body.role);
    res.json({ success: true });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    if (error.message === 'Cannot modify owner role') {
      return res.status(403).json({ error: 'Cannot modify owner role' });
    }
    console.error('Failed to update user role:', error);
    res.status(500).json({ error: 'Failed to update user role' });
  }
});

/**
 * DELETE /organizations/:id/users/:userId
 * Remove user from organization
 */
router.delete('/:id/users/:userId', async (req: Request, res: Response) => {
  try {
    const { id, userId } = req.params;
    const adminUserId = (req as any).claims?.sub;

    // Check if requesting user is owner or manager
    const permission = await organizationService.checkUserPermission(adminUserId, id, 'MANAGER');
    if (!permission.hasAccess) {
      return res.status(403).json({ error: 'Manager access required' });
    }

    await organizationService.removeUserFromOrganization(userId, id);
    res.json({ success: true });
  } catch (error: any) {
    if (error.message === 'Cannot remove organization owner') {
      return res.status(403).json({ error: 'Cannot remove organization owner' });
    }
    console.error('Failed to remove user from organization:', error);
    res.status(500).json({ error: 'Failed to remove user from organization' });
  }
});

export default router;