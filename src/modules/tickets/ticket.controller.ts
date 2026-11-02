import { Request, Response, NextFunction } from 'express';
import { TicketService, ticketService } from './ticket.service.js';
import { successResponse } from '../../common/types/api-response.js';
import { TicketStatus } from '@prisma/client';

export class TicketController {
  private service: TicketService;

  constructor(service: TicketService = ticketService) {
    this.service = service;
  }

  public listTickets = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { status, search } = req.query;
      const tickets = await this.service.getTickets({
        status: status as TicketStatus | undefined,
        search: search as string | undefined,
      });

      res.status(200).json(
        successResponse(tickets, {
          count: tickets.length,
          filters: { status: status || null, search: search || null },
        })
      );
    } catch (error) {
      next(error);
    }
  };

  public getTicketByNumber = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { ticketNumber } = req.params;
      const ticket = await this.service.getTicketByNumber(ticketNumber!);

      res.status(200).json(successResponse(ticket));
    } catch (error) {
      next(error);
    }
  };

  public getTicketExecutions = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { ticketNumber } = req.params;
      const executions = await this.service.getTicketExecutions(ticketNumber!);

      res.status(200).json(
        successResponse(executions, {
          count: executions.length,
          ticketNumber,
        })
      );
    } catch (error) {
      next(error);
    }
  };
}

export const ticketController = new TicketController();

