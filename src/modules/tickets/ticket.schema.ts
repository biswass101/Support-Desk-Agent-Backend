import { z } from 'zod';
import { TicketStatus } from '@prisma/client';

export const listTicketsQuerySchema = z.object({
  status: z.nativeEnum(TicketStatus).optional(),
  search: z.string().trim().optional(),
});

export const ticketParamSchema = z.object({
  ticketNumber: z
    .string({
      required_error: 'ticketNumber is required',
    })
    .trim()
    .min(1, 'ticketNumber cannot be empty'),
});

export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;
export type TicketParam = z.infer<typeof ticketParamSchema>;

