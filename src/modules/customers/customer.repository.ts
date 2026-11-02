import { PrismaClient, Customer } from '@prisma/client';
import { prisma as defaultPrisma } from '../../config/database.js';

export class CustomerRepository {
  private prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || defaultPrisma;
  }

  public async findById(id: string): Promise<Customer | null> {
    return this.prisma.customer.findUnique({
      where: { id },
    });
  }

  public async findByExternalId(externalId: string): Promise<Customer | null> {
    return this.prisma.customer.findUnique({
      where: { externalId },
    });
  }

  public async upsertCustomer(data: {
    externalId: string;
    name?: string;
    currentTier?: string;
  }): Promise<Customer> {
    return this.prisma.customer.upsert({
      where: { externalId: data.externalId },
      update: {
        ...(data.name && { name: data.name }),
        ...(data.currentTier && { currentTier: data.currentTier }),
      },
      create: {
        externalId: data.externalId,
        name: data.name,
        currentTier: data.currentTier || 'Free',
      },
    });
  }
}

export const customerRepository = new CustomerRepository();

