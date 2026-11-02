import { PrismaClient, ExecutionStatus, TicketStatus, ResolutionTag } from '@prisma/client';
import { prisma as defaultPrisma } from '../../config/database.js';
import { TriageAgent, triageAgent } from './triage-agent.js';
import { NotFoundError, ConflictError } from '../../common/errors/app-error.js';
import { logger } from '../../config/logger.js';

export class AgentService {
  private prisma: PrismaClient;
  private agent: TriageAgent;

  constructor(prismaClient?: PrismaClient, agentInstance?: TriageAgent) {
    this.prisma = prismaClient || defaultPrisma;
    this.agent = agentInstance || triageAgent;
  }

  public async triageTicket(ticketNumber: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { ticketNumber },
      include: {
        customer: true,
      },
    });

    if (!ticket) {
      throw new NotFoundError(`Ticket with number '${ticketNumber}' not found`);
    }

    if (ticket.status === TicketStatus.PROCESSING) {
      throw new ConflictError(
        `Ticket '${ticketNumber}' is currently being triaged by another active execution. Please wait for it to complete.`
      );
    }

    const execution = await this.prisma.$transaction(async (tx) => {
      const currentTicket = await tx.ticket.findUnique({
        where: { id: ticket.id },
      });

      if (currentTicket?.status === TicketStatus.PROCESSING) {
        throw new ConflictError(
          `Ticket '${ticketNumber}' is currently being triaged by another active execution.`
        );
      }

      await tx.ticket.update({
        where: { id: ticket.id },
        data: { status: TicketStatus.PROCESSING },
      });

      return tx.agentExecution.create({
        data: {
          ticketId: ticket.id,
          status: ExecutionStatus.RUNNING,
          startedAt: new Date(),
        },
      });
    });

    logger.info(
      { executionId: execution.id, ticketNumber },
      'Started autonomous ticket triage execution'
    );

    try {
      const agentResult = await this.agent.executeTriage({
        executionId: execution.id,
        ticketNumber: ticket.ticketNumber,
        customerExternalId: ticket.customer.externalId,
        customerTier: ticket.customer.currentTier,
        orderId: ticket.orderId,
        message: ticket.message,
      });

      await this.prisma.$transaction([
        this.prisma.agentExecution.update({
          where: { id: execution.id },
          data: {
            status: ExecutionStatus.COMPLETED,
            resolutionTag: agentResult.resolutionTag as ResolutionTag,
            customerResponse: agentResult.customerResponse,
            summary: agentResult.summary,
            completedAt: new Date(),
          },
        }),
        this.prisma.ticket.update({
          where: { id: ticket.id },
          data: { status: TicketStatus.RESOLVED },
        }),
      ]);

      logger.info(
        { executionId: execution.id, resolutionTag: agentResult.resolutionTag },
        'Ticket triage completed successfully'
      );

      return await this.getExecutionDetails(execution.id);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      await this.prisma.$transaction([
        this.prisma.agentExecution.update({
          where: { id: execution.id },
          data: {
            status: ExecutionStatus.FAILED,
            errorMessage: errorMsg,
            completedAt: new Date(),
          },
        }),
        this.prisma.ticket.update({
          where: { id: ticket.id },
          data: { status: TicketStatus.FAILED },
        }),
      ]);

      logger.error(
        { executionId: execution.id, error: errorMsg },
        'Ticket triage failed; marked execution and ticket as FAILED'
      );

      throw error;
    }
  }

  public async listExecutions() {
    return this.prisma.agentExecution.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        ticket: {
          include: {
            customer: true,
          },
        },
        traces: {
          orderBy: { step: 'asc' },
        },
      },
    });
  }

  public async getExecutionDetails(executionId: string) {
    const execution = await this.prisma.agentExecution.findUnique({
      where: { id: executionId },
      include: {
        ticket: {
          include: {
            customer: true,
          },
        },
        traces: {
          orderBy: { step: 'asc' },
        },
      },
    });

    if (!execution) {
      throw new NotFoundError(`Agent execution with ID '${executionId}' not found`);
    }

    return execution;
  }
}

export const agentService = new AgentService();
