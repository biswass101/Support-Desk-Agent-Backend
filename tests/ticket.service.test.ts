import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TicketService } from '../src/modules/tickets/ticket.service.js';
import { TicketRepository } from '../src/modules/tickets/ticket.repository.js';
import { TicketStatus } from '@prisma/client';
import { NotFoundError } from '../src/common/errors/app-error.js';

describe('Ticket Service', () => {
  let mockRepo: TicketRepository;
  let service: TicketService;

  const sampleTicket = {
    id: 'ticket-uuid-1',
    ticketNumber: 'TCK-001',
    customerId: 'cust-uuid-1',
    orderId: 'ORD-9012',
    message: 'Where is my order?',
    status: TicketStatus.PENDING,
    createdAt: new Date(),
    updatedAt: new Date(),
    customer: {
      id: 'cust-uuid-1',
      externalId: 'USR-101',
      name: 'John Doe',
      currentTier: 'Free',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  beforeEach(() => {
    mockRepo = {
      findAll: vi.fn(),
      findByTicketNumber: vi.fn(),
      updateStatus: vi.fn(),
      findExecutionsByTicketNumber: vi.fn(),
    } as unknown as TicketRepository;

    service = new TicketService(mockRepo);
  });

  it('should list all tickets with filters', async () => {
    (mockRepo.findAll as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([sampleTicket]);

    const result = await service.getTickets({ status: TicketStatus.PENDING, search: 'TCK' });

    expect(mockRepo.findAll).toHaveBeenCalledWith({ status: TicketStatus.PENDING, search: 'TCK' });
    expect(result).toHaveLength(1);
    expect(result[0]?.ticketNumber).toBe('TCK-001');
  });

  it('should return ticket details when ticket exists', async () => {
    (mockRepo.findByTicketNumber as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(sampleTicket);

    const result = await service.getTicketByNumber('TCK-001');

    expect(mockRepo.findByTicketNumber).toHaveBeenCalledWith('TCK-001');
    expect(result.ticketNumber).toBe('TCK-001');
    expect(result.customer.externalId).toBe('USR-101');
  });

  it('should throw NotFoundError when ticket does not exist', async () => {
    (mockRepo.findByTicketNumber as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service.getTicketByNumber('TCK-999')).rejects.toThrow(NotFoundError);
  });

  it('should return executions for a ticket', async () => {
    const mockExecutions = [
      {
        id: 'exec-1',
        ticketId: 'ticket-uuid-1',
        status: 'COMPLETED',
        traces: [],
      },
    ];
    (mockRepo.findExecutionsByTicketNumber as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockExecutions);

    const result = await service.getTicketExecutions('TCK-001');

    expect(result).toEqual(mockExecutions);
  });

  it('should throw NotFoundError when getting executions for non-existent ticket', async () => {
    (mockRepo.findExecutionsByTicketNumber as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service.getTicketExecutions('TCK-NONEXISTENT')).rejects.toThrow(NotFoundError);
  });
});

