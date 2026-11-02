import { Router } from 'express';
import { systemController } from './system.controller.js';

const router = Router();

router.get('/info', systemController.getSystemInfo);
router.post('/reset-to-pending', systemController.resetToPending);
router.post('/reseed', systemController.reseedDatabase);
router.post('/clear-all', systemController.clearAllData);

export const systemRoutes = router;

