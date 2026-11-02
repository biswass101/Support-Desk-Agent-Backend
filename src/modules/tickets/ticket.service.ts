import { TicketRepository, ticketRepository } from './ticket.repository.js';
import { TicketStatus } from '@prisma/client';
import { NotFoundError } from '../../common/errors/app-error.js';

export class TicketService {
  private repo: TicketRepository;

  constructor(repo: TicketRepository = ticketRepository) {
    this.repo = repo;
  }

  public async getTickets(filters: { status?: TicketStatus; search?: string }) {
    return this.repo.findAll(filters);
  }

  public async getTicketByNumber(ticketNumber: string) {
    const ticket = await this.repo.findByTicketNumber(ticketNumber);
    if (!ticket) {
      throw new NotFoundError(`Ticket with number '${ticketNumber}' not found`);
    }
    return ticket;
  }

  public async getTicketExecutions(ticketNumber: string) {
    const executions = await this.repo.findExecutionsByTicketNumber(ticketNumber);
    if (!executions) {
      throw new NotFoundError(`Ticket with number '${ticketNumber}' not found`);
    }
    return executions;
  }
}

export const ticketService = new TicketService();

