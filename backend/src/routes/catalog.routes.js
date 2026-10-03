import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { query } from '../db.js';
import { HttpError } from '../utils/httpError.js';
import { orderItems } from '../utils/schemas.js';
import { placeOrder } from '../services/order.service.js';

// PUBLIC routes: no login. Exact stock numbers are never exposed.
const router = Router();

const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/products', async (_req, res) => {
  const { rows } = await query(
    `SELECT p.id, p.sku, p.name, p.description, p.price, c.name AS category_name,
            (p.stock_qty > 0) AS in_stock,
            (p.stock_qty > 0 AND p.stock_qty <= p.low_stock_threshold) AS few_left
       FROM products p JOIN product_categories c ON c.id = p.category_id
      WHERE p.is_active ORDER BY c.name, p.name`);
  res.json(rows);
});

const onlineOrderSchema = z
  .object({
    customerName: z.string().trim().min(2),
    customerPhone: z.string().trim().min(7),
    memberCode: z.string().trim().nullish(),
    fulfilment: z.enum(['pickup', 'delivery']),
    deliveryAddress: z.string().trim().min(5).nullish(),
    items: orderItems,
  })
  .refine((d) => d.fulfilment !== 'delivery' || d.deliveryAddress, {
    message: 'Delivery address is required for delivery',
    path: ['deliveryAddress'],
  });

router.post('/orders', orderLimiter, async (req, res) => {
  const d = onlineOrderSchema.parse(req.body);

  // Member code + phone together act as a light proof of membership (full member login comes in Phase 4).
  let memberId = null;
  if (d.memberCode) {
    const { rows: [m] } = await query(
      'SELECT id FROM members WHERE member_code = upper($1) AND phone = $2',
      [d.memberCode, d.customerPhone]);
    if (!m) throw new HttpError(400, 'Member code and phone number do not match');
    memberId = m.id;
  }

  const order = await placeOrder({
    channel: 'online',
    fulfilment: d.fulfilment,
    memberId,
    customerName: d.customerName,
    customerPhone: d.customerPhone,
    deliveryAddress: d.fulfilment === 'delivery' ? d.deliveryAddress : null,
    items: d.items,
  });
  res.status(201).json({
    orderNo: order.order_no, status: order.status, fulfilment: order.fulfilment,
    subtotal: order.subtotal, discountPct: order.discount_pct,
    discountAmount: order.discount_amount, total: order.total, items: order.items,
  });
});

export default router;
