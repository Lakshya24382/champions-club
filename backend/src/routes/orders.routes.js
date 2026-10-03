import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { parseId } from '../utils/httpError.js';
import { paymentMethod, orderItems } from '../utils/schemas.js';
import { placeOrder, changeOrderStatus } from '../services/order.service.js';

const router = Router();

// GET /api/orders?status=pending&channel=online
router.get('/', async (req, res) => {
  const { status = '', channel = '' } = req.query;
  const params = [];
  const where = [];
  if (status) { params.push(status);  where.push(`o.status = $${params.length}`); }
  if (channel) { params.push(channel); where.push(`o.channel = $${params.length}`); }

  const { rows } = await query(
    `SELECT o.*, m.member_code,
            COALESCE(
              json_agg(json_build_object('name', i.product_name, 'qty', i.qty, 'line_total', i.line_total)
                       ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL),
              '[]') AS items
       FROM orders o
       LEFT JOIN members m ON m.id = o.member_id
       LEFT JOIN order_items i ON i.order_id = o.id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      GROUP BY o.id, m.member_code
      ORDER BY o.created_at DESC
      LIMIT 100`,
    params);
  res.json(rows);
});

// Counter sale: paid immediately, stock taken immediately
const counterSchema = z.object({
  memberId: z.number().int().positive().nullish(),
  customerName: z.string().trim().min(2).nullish(),
  paymentMethod,
  items: orderItems,
});

router.post('/', async (req, res) => {
  const d = counterSchema.parse(req.body);
  const order = await placeOrder({ ...d, channel: 'counter', fulfilment: 'counter' }, req.user.sub);
  res.status(201).json(order);
});

const statusSchema = z
  .object({ status: z.enum(['ready', 'completed', 'cancelled']), paymentMethod: paymentMethod.optional() })
  .refine((d) => d.status !== 'completed' || d.paymentMethod, {
    message: 'paymentMethod is required to complete an order',
    path: ['paymentMethod'],
  });

router.post('/:id/status', async (req, res) => {
  const d = statusSchema.parse(req.body);
  res.json(await changeOrderStatus(parseId(req.params.id), d.status, d.paymentMethod, req.user.sub));
});

export default router;
