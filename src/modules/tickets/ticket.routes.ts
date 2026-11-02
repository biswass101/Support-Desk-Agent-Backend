import { Router } from 'express';
import { ticketController } from './ticket.controller.js';
import { agentController } from '../agent/agent.controller.js';
import { validateRequest } from '../../common/middleware/validate.middleware.js';
import { listTicketsQuerySchema, ticketParamSchema } from './ticket.schema.js';

const router = Router();

router.get(
  '/',
  validateRequest({ query: listTicketsQuerySchema }),
  ticketController.listTickets
);

router.get(
  '/:ticketNumber',
  validateRequest({ params: ticketParamSchema }),
  ticketController.getTicketByNumber
);

router.post(
  '/:ticketNumber/triage',
  validateRequest({ params: ticketParamSchema }),
  agentController.triageTicket
);

router.get(
  '/:ticketNumber/executions',
  validateRequest({ params: ticketParamSchema }),
  ticketController.getTicketExecutions
);

export const ticketRoutes = router;
