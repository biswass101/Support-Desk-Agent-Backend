import { z } from 'zod';

export const getOrderStatusInputSchema = z.object({
  order_id: z
    .string({
      required_error: 'order_id is required',
      invalid_type_error: 'order_id must be a string',
    })
    .trim()
    .min(1, 'order_id cannot be empty'),
});

export type GetOrderStatusInput = z.infer<typeof getOrderStatusInputSchema>;

export interface OrderStatusResult {
  order_id: string;
  status: string;
  est_delivery: string;
}

const mockOrderDatabase: Record<string, { status: string; est_delivery: string }> = {
  'ORD-9012': {
    status: 'In Transit',
    est_delivery: 'Tomorrow',
  },
  'ORD-1001': {
    status: 'Delivered',
    est_delivery: 'Delivered Yesterday',
  },
  'ORD-5544': {
    status: 'Processing',
    est_delivery: 'Estimated 3 business days',
  },
};

export async function getOrderStatus(input: unknown): Promise<OrderStatusResult> {
  const parsed = getOrderStatusInputSchema.safeParse(input);
  if (!parsed.success) {
    const errorMsg = parsed.error.errors.map((e) => e.message).join('; ');
    throw new Error(`Invalid arguments for get_order_status: ${errorMsg}`);
  }

  const { order_id } = parsed.data;

  await new Promise((resolve) => setTimeout(resolve, 20));

  const normalizedId = order_id.toUpperCase();
  const found = mockOrderDatabase[normalizedId];

  if (found) {
    return {
      order_id: normalizedId,
      status: found.status,
      est_delivery: found.est_delivery,
    };
  }

  return {
    order_id: normalizedId,
    status: 'In Transit',
    est_delivery: 'Tomorrow',
  };
}
