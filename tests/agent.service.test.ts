import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentService } from '../src/modules/agent/agent.service.js';
import { TriageAgent } from '../src/modules/agent/triage-agent.js';
import { PrismaClient, TicketStatus, ExecutionStatus, ResolutionTag } from '@prisma/client';
import { ConflictError, NotFoundError } from '../src/common/errors/app-error.js';

describe('Agent Service & Concurrency Control', () => {
  let mockPrisma: any;
  let mockAgent: TriageAgent;
  let service: AgentService;

  const sampleTicket = {
    id: 'ticket-1',
    ticketNumber: 'TCK-001',
    customerId: 'cust-1',
    orderId: 'ORD-9012',
    message: 'Package status?',
    status: TicketStatus.PENDING,
    customer: {
      id: 'cust-1',
      externalId: 'USR-101',
      currentTier: 'Free',
    },
  };

  const sampleExecution = {
    id: 'exec-1',
    ticketId: 'ticket-1',
    status: ExecutionStatus.RUNNING,
    startedAt: new Date(),
  };

  beforeEach(() => {
    mockPrisma = {
      ticket: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      agentExecution: {
        create: vi.fn().mockResolvedValue(sampleExecution),
        update: vi.fn(),
        findUnique: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation(async (arg) => {
        if (typeof arg === 'function') {
          return await arg(mockPrisma);
        }
        return await Promise.all(arg);
      }),
    };

    mockAgent = {
      executeTriage: vi.fn(),
    } as unknown as TriageAgent;

    service = new AgentService(mockPrisma as PrismaClient, mockAgent);
  });

  it('should throw NotFoundError if ticket to triage does not exist', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue(null);

    await expect(service.triageTicket('TCK-UNKNOWN')).rejects.toThrow(NotFoundError);
  });

  it('should throw ConflictError to prevent duplicate concurrent executions if ticket is already PROCESSING', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValue({
      ...sampleTicket,
      status: TicketStatus.PROCESSING,
    });

    await expect(service.triageTicket('TCK-001')).rejects.toThrow(ConflictError);
  });

  it('should transition ticket through PROCESSING -> RESOLVED and execution to COMPLETED on success', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValueOnce(sampleTicket);
    mockPrisma.ticket.findUnique.mockResolvedValueOnce(sampleTicket);

    (mockAgent.executeTriage as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      customerResponse: 'Your parcel is in transit.',
      resolutionTag: 'AUTO_RESOLVE',
      summary: 'Status provided.',
    });

    const completedExecution = {
      ...sampleExecution,
      status: ExecutionStatus.COMPLETED,
      resolutionTag: ResolutionTag.AUTO_RESOLVE,
      customerResponse: 'Your parcel is in transit.',
      summary: 'Status provided.',
      traces: [],
      ticket: sampleTicket,
    };
    mockPrisma.agentExecution.findUnique.mockResolvedValue(completedExecution);

    const result = await service.triageTicket('TCK-001');

    expect(mockAgent.executeTriage).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketNumber: 'TCK-001',
        customerExternalId: 'USR-101',
      })
    );
    expect(result.status).toBe(ExecutionStatus.COMPLETED);
    expect(result.resolutionTag).toBe(ResolutionTag.AUTO_RESOLVE);
  });

  it('should mark execution as FAILED and ticket as FAILED on error, allowing retry', async () => {
    mockPrisma.ticket.findUnique.mockResolvedValueOnce(sampleTicket);
    mockPrisma.ticket.findUnique.mockResolvedValueOnce(sampleTicket);

    (mockAgent.executeTriage as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Gemini API rate limit exceeded')
    );

    await expect(service.triageTicket('TCK-001')).rejects.toThrow('Gemini API rate limit exceeded');

    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it('should return full execution details with traces', async () => {
    const fullExec = {
      id: 'exec-123',
      ticketId: 'ticket-1',
      traces: [
        { id: 't-1', step: 1, eventType: 'AGENT_DECISION' },
        { id: 't-2', step: 2, eventType: 'TOOL_CALL' },
      ],
      ticket: sampleTicket,
    };
    mockPrisma.agentExecution.findUnique.mockResolvedValue(fullExec);

    const result = await service.getExecutionDetails('exec-123');

    expect(result.id).toBe('exec-123');
    expect(result.traces).toHaveLength(2);
  });

  it('should throw NotFoundError when executionId does not exist', async () => {
    mockPrisma.agentExecution.findUnique.mockResolvedValue(null);

    await expect(service.getExecutionDetails('exec-not-found')).rejects.toThrow(NotFoundError);
  });
});
