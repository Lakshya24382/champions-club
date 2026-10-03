import { z } from 'zod';

export const paymentMethod = z.enum(['cash', 'card', 'upi']);

export const orderItems = z
  .array(z.object({
    productId: z.number().int().positive(),
    qty: z.number().int().positive().max(100),
  }))
  .min(1, 'Add at least one item');
