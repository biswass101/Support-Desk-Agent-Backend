import { PrismaClient, TicketStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seeding...');

  const customer1 = await prisma.customer.upsert({
    where: { externalId: 'USR-101' },
    update: {
      currentTier: 'Free',
    },
    create: {
      externalId: 'USR-101',
      name: 'John Doe',
      currentTier: 'Free',
    },
  });

  const customer2 = await prisma.customer.upsert({
    where: { externalId: 'USR-204' },
    update: {
      currentTier: 'Free',
    },
    create: {
      externalId: 'USR-204',
      name: 'Sarah Smith',
      currentTier: 'Free',
    },
  });

  const customer3 = await prisma.customer.upsert({
    where: { externalId: 'USR-309' },
    update: {
      currentTier: 'Free',
    },
    create: {
      externalId: 'USR-309',
      name: 'David Lee',
      currentTier: 'Free',
    },
  });

  console.log(`Upserted 3 customers: ${customer1.externalId}, ${customer2.externalId}, ${customer3.externalId}`);

  const ticket1 = await prisma.ticket.upsert({
    where: { ticketNumber: 'TCK-001' },
    update: {
      customerId: customer1.id,
      orderId: 'ORD-9012',
      message: 'Where is my package #ORD-9012? It was supposed to arrive yesterday.',
      status: TicketStatus.PENDING,
    },
    create: {
      ticketNumber: 'TCK-001',
      customerId: customer1.id,
      orderId: 'ORD-9012',
      message: 'Where is my package #ORD-9012? It was supposed to arrive yesterday.',
      status: TicketStatus.PENDING,
    },
  });

  const ticket2 = await prisma.ticket.upsert({
    where: { ticketNumber: 'TCK-002' },
    update: {
      customerId: customer2.id,
      orderId: null,
      message: 'Can you upgrade my account to Enterprise tier?',
      status: TicketStatus.PENDING,
    },
    create: {
      ticketNumber: 'TCK-002',
      customerId: customer2.id,
      orderId: null,
      message: 'Can you upgrade my account to Enterprise tier?',
      status: TicketStatus.PENDING,
    },
  });

  const ticket3 = await prisma.ticket.upsert({
    where: { ticketNumber: 'TCK-003' },
    update: {
      customerId: customer3.id,
      orderId: null,
      message: 'How do I update my profile picture?',
      status: TicketStatus.PENDING,
    },
    create: {
      ticketNumber: 'TCK-003',
      customerId: customer3.id,
      orderId: null,
      message: 'How do I update my profile picture?',
      status: TicketStatus.PENDING,
    },
  });

  console.log(`Upserted 3 tickets: ${ticket1.ticketNumber}, ${ticket2.ticketNumber}, ${ticket3.ticketNumber}`);
  console.log('Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
