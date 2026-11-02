import { Request, Response, NextFunction } from 'express';
import { AgentService, agentService } from './agent.service.js';
import { successResponse } from '../../common/types/api-response.js';

export class AgentController {
  private service: AgentService;

  constructor(service: AgentService = agentService) {
    this.service = service;
  }

  public triageTicket = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { ticketNumber } = req.params;
      const executionResult = await this.service.triageTicket(ticketNumber!);

      res.status(200).json(
        successResponse(executionResult, {
          message: 'Ticket triage executed successfully',
        })
      );
    } catch (error) {
      next(error);
    }
  };

  public getExecution = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { executionId } = req.params;
      const execution = await this.service.getExecutionDetails(executionId!);

      res.status(200).json(successResponse(execution));
    } catch (error) {
      next(error);
    }
  };
}

export const agentController = new AgentController();

