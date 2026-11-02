import { PrismaClient, Ticket, TicketStatus, Prisma } from '@prisma/client';
import { prisma as defaultPrisma } from '../../config/database.js';

export class TicketRepository {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || defaultPrisma;
  }

  public async findAll(filters: {
    status?: TicketStatus;
    search?: string;
  }) {
    const where: Prisma.TicketWhereInput = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.search) {
      const query = filters.search.trim();
      where.OR = [
        { ticketNumber: { contains: query, mode: 'insensitive' } },
        { message: { contains: query, mode: 'insensitive' } },
        { orderId: { contains: query, mode: 'insensitive' } },
        { customer: { externalId: { contains: query, mode: 'insensitive' } } },
        { customer: { name: { contains: query, mode: 'insensitive' } } },
      ];
    }

    return this.prisma.ticket.findMany({
      where,
      include: {
        customer: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  public async findByTicketNumber(ticketNumber: string) {
    return this.prisma.ticket.findUnique({
      where: { ticketNumber },
      include: {
        customer: true,
        executions: {
          orderBy: { createdAt: 'desc' },
          include: {
            traces: {
              orderBy: { step: 'asc' },
            },
          },
        },
      },
    });
  }

  public async updateStatus(ticketId: string, status: TicketStatus): Promise<Ticket> {
    return this.prisma.ticket.update({
      where: { id: ticketId },
      data: { status },
    });
  }

  public async findExecutionsByTicketNumber(ticketNumber: string) {
    const ticket = await this.prisma.ticket.findUnique({
      where: { ticketNumber },
      select: {
        id: true,
        ticketNumber: true,
        executions: {
          orderBy: { createdAt: 'desc' },
          include: {
            traces: {
              orderBy: { step: 'asc' },
            },
          },
        },
      },
    });

    return ticket?.executions || null;
  }
}

export const ticketRepository = new TicketRepository();

