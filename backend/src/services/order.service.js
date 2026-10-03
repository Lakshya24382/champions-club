import { withTransaction } from '../db.js';
import { HttpError } from '../utils/httpError.js';

const round2 = (n) => Math.round(n * 100) / 100;

export async function placeOrder(input, userId = null) {
  const {
    channel, fulfilment, memberId, customerName, customerPhone,
    deliveryAddress, paymentMethod, items,
  } = input;
  const isCounter = channel === 'counter';

  // Same product twice in a cart? Merge. Then sort so every order locks rows in the same order.
  const merged = new Map();
  for (const it of items) merged.set(it.productId, (merged.get(it.productId) ?? 0) + it.qty);
  const lines = [...merged]
    .map(([productId, qty]) => ({ productId, qty }))
    .sort((a, b) => a.productId - b.productId);

  return withTransaction(async (c) => {
    // 1) Member and discount (expired or inactive members simply pay full price)
    let member = null;
    let discountPct = 0;
    if (memberId) {
      const { rows: [m] } = await c.query(
        `SELECT m.id, m.full_name, m.phone, m.is_active,
                (m.expires_on >= current_date) AS valid, p.shop_discount_pct
           FROM members m JOIN membership_plans p ON p.id = m.plan_id
          WHERE m.id = $1`,
        [memberId]);
      if (!m) throw new HttpError(404, 'Member not found');
      member = m;
      if (m.is_active && m.valid) discountPct = m.shop_discount_pct;
    }

    // 2) Take stock atomically. The WHERE clause is the oversell guard.
    const orderLines = [];
    let subtotal = 0;
    for (const { productId, qty } of lines) {
      const { rows: [p] } = await c.query(
        `UPDATE products SET stock_qty = stock_qty - $2
          WHERE id = $1 AND is_active AND stock_qty >= $2
          RETURNING id, name, price`,
        [productId, qty]);
      if (!p) {
        const { rows: [existing] } = await c.query(
          'SELECT name, stock_qty FROM products WHERE id = $1 AND is_active', [productId]);
        if (!existing) throw new HttpError(404, `Product ${productId} not found`);
        throw new HttpError(409, `Only ${existing.stock_qty} left of ${existing.name}`);
      }
      const lineTotal = round2(p.price * qty);
      subtotal += lineTotal;
      orderLines.push({ productId: p.id, name: p.name, unitPrice: p.price, qty, lineTotal });
    }

    // 3) Totals
    subtotal = round2(subtotal);
    const discountAmount = round2((subtotal * discountPct) / 100);
    const total = round2(subtotal - discountAmount);

    // 4) The order itself. Counter sales are paid and done; online orders start as pending.
    const status = isCounter ? 'completed' : 'pending';
    const name = member?.full_name ?? customerName ?? 'Walk-in customer';
    const { rows: [order] } = await c.query(
      `INSERT INTO orders
         (channel, fulfilment, status, member_id, customer_name, customer_phone, delivery_address,
          subtotal, discount_pct, discount_amount, total, payment_method, paid_at, completed_at, created_by)
       VALUES ($1,$2,$3::text,$4,$5,$6,$7,$8,$9,$10,$11,$12,
               CASE WHEN $3::text = 'completed' THEN now() END,
               CASE WHEN $3::text = 'completed' THEN now() END,
               $13)
       RETURNING *`,
      [channel, fulfilment, status, member?.id ?? null, name,
       customerPhone ?? member?.phone ?? null, deliveryAddress ?? null,
       subtotal, discountPct, discountAmount, total,
       isCounter ? paymentMethod : null, userId]);

    // 5) Lines + audit trail
    for (const l of orderLines) {
      await c.query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price, qty, line_total)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [order.id, l.productId, l.name, l.unitPrice, l.qty, l.lineTotal]);
      await c.query(
        `INSERT INTO stock_movements (product_id, change, reason, order_id, created_by)
         VALUES ($1,$2,$3,$4,$5)`,
        [l.productId, -l.qty, isCounter ? 'counter_sale' : 'online_order', order.id, userId]);
    }

    return { ...order, items: orderLines };
  });
}

// pending -> ready -> completed (payment taken), or cancelled (stock returns to the shelf)
export async function changeOrderStatus(id, status, paymentMethod, userId) {
  return withTransaction(async (c) => {
    const { rows: [o] } = await c.query('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [id]);
    if (!o) throw new HttpError(404, 'Order not found');
    if (o.status === 'completed' || o.status === 'cancelled') {
      throw new HttpError(409, `Order is already ${o.status}`);
    }

    if (status === 'ready') {
      if (o.status !== 'pending') throw new HttpError(409, 'Only pending orders can be marked ready');
      const { rows: [u] } = await c.query(
        `UPDATE orders SET status = 'ready' WHERE id = $1 RETURNING *`, [id]);
      return u;
    }

    if (status === 'completed') {
      const { rows: [u] } = await c.query(
        `UPDATE orders
            SET status = 'completed', payment_method = $2, paid_at = now(), completed_at = now()
          WHERE id = $1 RETURNING *`,
        [id, paymentMethod]);
      return u;
    }

    // cancelled: put every item back and record it
    const { rows: items } = await c.query(
      'SELECT product_id, qty FROM order_items WHERE order_id = $1 ORDER BY product_id', [id]);
    for (const it of items) {
      await c.query('UPDATE products SET stock_qty = stock_qty + $2 WHERE id = $1', [it.product_id, it.qty]);
      await c.query(
        `INSERT INTO stock_movements (product_id, change, reason, order_id, created_by)
         VALUES ($1,$2,'order_cancelled',$3,$4)`,
        [it.product_id, it.qty, id, userId]);
    }
    const { rows: [u] } = await c.query(
      `UPDATE orders SET status = 'cancelled' WHERE id = $1 RETURNING *`, [id]);
    return u;
  });
}
