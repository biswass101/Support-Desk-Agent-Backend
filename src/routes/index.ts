import { Router, Request, Response } from 'express';
import { ticketRoutes } from '../modules/tickets/ticket.routes.js';
import { executionRoutes } from '../modules/agent/agent.routes.js';
import { systemRoutes } from '../modules/system/system.routes.js';
import { prisma } from '../config/database.js';
import { successResponse } from '../common/types/api-response.js';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  let dbStatus = 'disconnected';
  let isHealthy = false;

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
    isHealthy = true;
  } catch {
    dbStatus = 'disconnected';
    isHealthy = false;
  }

  const statusCode = isHealthy ? 200 : 503;

  res.status(statusCode).json(
    successResponse({
      status: isHealthy ? 'healthy' : 'degraded',
      database: dbStatus,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      service: 'SupportDesk Agent Backend',
    })
  );
});

router.use('/tickets', ticketRoutes);
router.use('/executions', executionRoutes);
router.use('/system', systemRoutes);

export const appRouter = router;
