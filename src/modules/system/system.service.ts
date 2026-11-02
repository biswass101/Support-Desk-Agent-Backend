import { PrismaClient, TicketStatus } from '@prisma/client';
import { prisma as defaultPrisma } from '../../config/database.js';
import { env } from '../../config/env.js';

export class SystemService {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || defaultPrisma;
  }

  public async getSystemInfo() {
    let dbConnected = true;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      dbConnected = false;
    }

    const [ticketsCount, executionsCount, customersCount] = await Promise.all([
      this.prisma.ticket.count().catch(() => 0),
      this.prisma.agentExecution.count().catch(() => 0),
      this.prisma.customer.count().catch(() => 0),
    ]);

    return {
      status: dbConnected ? 'healthy' : 'degraded',
      database: dbConnected ? 'connected' : 'disconnected',
      geminiModel: env.GEMINI_MODEL,
      nodeEnv: env.NODE_ENV,
      uptimeSeconds: Math.floor(process.uptime()),
      counts: {
        tickets: ticketsCount,
        executions: executionsCount,
        customers: customersCount,
      },
    };
  }

  public async resetToPending() {
    return this.prisma.$transaction(async (tx) => {
      await tx.executionTrace.deleteMany({});
      await tx.agentExecution.deleteMany({});
      await tx.ticket.updateMany({
        data: { status: TicketStatus.PENDING },
      });

      const updatedCount = await tx.ticket.count();
      return {
        message: 'Database reset to pending triage state successfully',
        ticketsCount: updatedCount,
      };
    });
  }

  public async reseedDatabase() {
    return this.prisma.$transaction(async (tx) => {
      await tx.executionTrace.deleteMany({});
      await tx.agentExecution.deleteMany({});
      await tx.ticket.deleteMany({});
      await tx.customer.deleteMany({});

      const customer1 = await tx.customer.create({
        data: {
          externalId: 'USR-101',
          name: 'John Doe',
          currentTier: 'Free',
        },
      });

      const customer2 = await tx.customer.create({
        data: {
          externalId: 'USR-204',
          name: 'Sarah Smith',
          currentTier: 'Free',
        },
      });

      const customer3 = await tx.customer.create({
        data: {
          externalId: 'USR-309',
          name: 'David Lee',
          currentTier: 'Free',
        },
      });

      await tx.ticket.createMany({
        data: [
          {
            ticketNumber: 'TCK-001',
            customerId: customer1.id,
            orderId: 'ORD-9012',
            message: 'Where is my package #ORD-9012? It was supposed to arrive yesterday.',
            status: TicketStatus.PENDING,
          },
          {
            ticketNumber: 'TCK-002',
            customerId: customer2.id,
            orderId: null,
            message: 'Can you upgrade my account to Enterprise tier?',
            status: TicketStatus.PENDING,
          },
          {
            ticketNumber: 'TCK-003',
            customerId: customer3.id,
            orderId: null,
            message: 'How do I update my profile picture?',
            status: TicketStatus.PENDING,
          },
        ],
      });

      return {
        message: 'Evaluation dataset re-seeded successfully',
        seededTickets: 3,
        seededCustomers: 3,
      };
    });
  }

  public async clearAllData() {
    return this.prisma.$transaction(async (tx) => {
      await tx.executionTrace.deleteMany({});
      await tx.agentExecution.deleteMany({});
      await tx.ticket.deleteMany({});
      await tx.customer.deleteMany({});

      return {
        message: 'All database records cleared successfully',
      };
    });
  }
}

export const systemService = new SystemService();

