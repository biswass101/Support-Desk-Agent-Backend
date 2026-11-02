import { Router } from 'express';
import { agentController } from './agent.controller.js';
import { validateRequest } from '../../common/middleware/validate.middleware.js';
import { z } from 'zod';

const router = Router();

const executionParamSchema = z.object({
  executionId: z.string().uuid('executionId must be a valid UUID'),
});

router.get('/', agentController.listExecutions);

router.get(
  '/:executionId',
  validateRequest({ params: executionParamSchema }),
  agentController.getExecution
);

export const executionRoutes = router;
