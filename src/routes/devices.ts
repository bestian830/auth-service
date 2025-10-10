import { Router } from 'express';
import { createDevice, activateDevice, listDevices, getDevice, updateDevice, deleteDevice, updateActivationCode } from '../controllers/device.js';
import { requireBearer } from '../middleware/bearer.js';

const router = Router();

// 激活（无需认证）
router.post('/activate', activateDevice);

// 设备管理（需要认证）
router.post('/', requireBearer, createDevice);
router.get('/', requireBearer, listDevices);
router.get('/:deviceId', requireBearer, getDevice);
router.patch('/:deviceId', requireBearer, updateDevice);
router.delete('/:deviceId', requireBearer, deleteDevice);
router.post('/:deviceId/update-activation-code', requireBearer, updateActivationCode);

export default router;


