import { query, withTransaction } from '../db.js';
import { HttpError } from '../utils/httpError.js';

const round2 = (n) => Math.round(n * 100) / 100;
const cents = (n) => Math.round(n * 100);   // compare money as integers, never floats
const isManager = (user) => ['owner', 'admin'].includes(user.role);

// ---------------------------------------------------------------- reading tabs
const ORDER_SELECT = `
  SELECT o.*, t.name AS table_name, m.member_code, m.full_name AS member_name,
    COALESCE((SELECT json_agg(json_build_object(
        'id', i.id, 'name', i.item_name, 'qty', i.qty, 'unit_price', i.unit_price,
        'status', i.status, 'station', i.station, 'note', i.note) ORDER BY i.id)
      FROM bar_order_items i WHERE i.order_id = o.id), '[]'::json) AS items,
    COALESCE((SELECT json_agg(json_build_object('method', p.method, 'amount', p.amount) ORDER BY p.id)
      FROM bar_payments p WHERE p.order_id = o.id), '[]'::json) AS payments
  FROM bar_orders o
  LEFT JOIN bar_tables t ON t.id = o.table_id
  LEFT JOIN members m ON m.id = o.member_id`;

export async function getOrder(id, db = { query }) {
  const { rows: [o] } = await db.query(`${ORDER_SELECT} WHERE o.id = $1`, [id]);
  if (!o) throw new HttpError(404, 'Tab not found');
  return o;
}

export async function listOrders({ status = 'open', date } = {}) {
  const params = [status];
  let where = 'WHERE o.status = $1';
  if (date) {
    params.push(date);
    where += ' AND COALESCE(o.paid_at, o.voided_at, o.opened_at)::date = $2::date';
  }
  const { rows } = await query(
    `${ORDER_SELECT} ${where} ORDER BY o.opened_at DESC LIMIT 100`, params);
  return rows;
}

// ---------------------------------------------------------------- helpers
async function requireShift(db, userId) {
  const { rows: [s] } = await db.query(
    'SELECT * FROM shifts WHERE user_id = $1 AND ended_at IS NULL', [userId]);
  if (!s) throw new HttpError(409, 'Start your shift first (Bar page, "Start shift")');
  return s;
}

async function lockOpenOrder(c, id) {
  const { rows: [o] } = await c.query('SELECT * FROM bar_orders WHERE id = $1 FOR UPDATE', [id]);
  if (!o) throw new HttpError(404, 'Tab not found');
  if (o.status !== 'open') throw new HttpError(409, `This tab is already ${o.status}`);
  return o;
}

// Recompute subtotal / discount / total from the lines + the member's CURRENT plan.
async function recalc(c, orderId) {
  const { rows: [o] } = await c.query('SELECT member_id FROM bar_orders WHERE id = $1', [orderId]);
  let pct = 0;
  if (o.member_id) {
    const { rows: [m] } = await c.query(
      `SELECT p.bar_discount_pct, (mb.is_active AND mb.expires_on >= current_date) AS valid
         FROM members mb JOIN membership_plans p ON p.id = mb.plan_id
        WHERE mb.id = $1`, [o.member_id]);
    if (m?.valid) pct = m.bar_discount_pct;
  }
  const { rows: [{ sub }] } = await c.query(
    `SELECT COALESCE(sum(unit_price * qty), 0) AS sub
       FROM bar_order_items WHERE order_id = $1 AND status <> 'cancelled'`, [orderId]);
  const subtotal = round2(sub);
  const discountAmount = round2((subtotal * pct) / 100);
  const total = round2(subtotal - discountAmount);
  const { rows: [u] } = await c.query(
    `UPDATE bar_orders
        SET subtotal = $2, discount_pct = $3, discount_amount = $4, total = $5
      WHERE id = $1 RETURNING *`,
    [orderId, subtotal, pct, discountAmount, total]);
  return u;
}

async function insertItems(c, orderId, items) {
  for (const it of items) {
    const { rows: [mi] } = await c.query(
      'SELECT id, name, price, station, is_available FROM menu_items WHERE id = $1 AND is_active',
      [it.menuItemId]);
    if (!mi) throw new HttpError(404, `Menu item ${it.menuItemId} not found`);
    if (!mi.is_available) throw new HttpError(409, `${mi.name} is sold out right now`);

    const note = it.note || null;
    // Same item, same note, not started yet? Just bump the quantity.
    const { rowCount } = await c.query(
      `UPDATE bar_order_items SET qty = qty + $3, updated_at = now()
        WHERE id = (SELECT id FROM bar_order_items
                     WHERE order_id = $1 AND menu_item_id = $2 AND status = 'new'
                       AND note IS NOT DISTINCT FROM $4
                     LIMIT 1)`,
      [orderId, mi.id, it.qty, note]);
    if (!rowCount) {
      await c.query(
        `INSERT INTO bar_order_items (order_id, menu_item_id, item_name, unit_price, qty, station, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [orderId, mi.id, mi.name, mi.price, it.qty, mi.station, note]);
    }
  }
}

// ---------------------------------------------------------------- tabs
export async function openTab(input, userId) {
  const { tableId, memberId, customerName, items = [] } = input;
  return withTransaction(async (c) => {
    const shift = await requireShift(c, userId);

    if (tableId) {
      // Lock the table row so two people can't open it at the same moment.
      const { rows: [t] } = await c.query(
        'SELECT id FROM bar_tables WHERE id = $1 AND is_active FOR UPDATE', [tableId]);
      if (!t) throw new HttpError(404, 'Table not found');
      const { rows: [open] } = await c.query(
        `SELECT order_no FROM bar_orders WHERE table_id = $1 AND status = 'open'`, [tableId]);
      if (open) throw new HttpError(409, `That table already has an open tab (${open.order_no})`);
    }

    let name = customerName ?? null;
    if (memberId) {
      const { rows: [m] } = await c.query('SELECT full_name FROM members WHERE id = $1', [memberId]);
      if (!m) throw new HttpError(404, 'Member not found');
      name = name ?? m.full_name;
    }

    const { rows: [o] } = await c.query(
      `INSERT INTO bar_orders (table_id, member_id, customer_name, shift_id, opened_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [tableId ?? null, memberId ?? null, name ?? 'Guest', shift.id, userId]);

    if (items.length) await insertItems(c, o.id, items);
    await recalc(c, o.id);
    return getOrder(o.id, c);
  });
}

export async function addItems(orderId, items) {
  return withTransaction(async (c) => {
    await lockOpenOrder(c, orderId);
    await insertItems(c, orderId, items);
    await recalc(c, orderId);
    return getOrder(orderId, c);
  });
}

// Attach (or remove) a member mid-tab: the discount appears automatically.
export async function setMember(orderId, memberId) {
  return withTransaction(async (c) => {
    const order = await lockOpenOrder(c, orderId);
    let name = order.customer_name;
    if (memberId) {
      const { rows: [m] } = await c.query('SELECT full_name FROM members WHERE id = $1', [memberId]);
      if (!m) throw new HttpError(404, 'Member not found');
      if (name === 'Guest') name = m.full_name;
    }
    await c.query('UPDATE bar_orders SET member_id = $2, customer_name = $3 WHERE id = $1',
      [orderId, memberId, name]);
    await recalc(c, orderId);
    return getOrder(orderId, c);
  });
}

// ---------------------------------------------------------------- items
const FLOW = ['new', 'preparing', 'ready', 'served'];

export async function setItemStatus(itemId, status) {
  return withTransaction(async (c) => {
    const { rows: [i] } = await c.query(
      `SELECT i.*, o.status AS order_status
         FROM bar_order_items i JOIN bar_orders o ON o.id = i.order_id
        WHERE i.id = $1 FOR UPDATE OF i`, [itemId]);
    if (!i) throw new HttpError(404, 'Item not found');
    if (i.order_status !== 'open') throw new HttpError(409, `That tab is already ${i.order_status}`);
    if (i.status === 'cancelled') throw new HttpError(409, 'That item was cancelled');
    if (FLOW.indexOf(status) <= FLOW.indexOf(i.status)) {
      throw new HttpError(409, `Item is already ${i.status}`);
    }
    const { rows: [u] } = await c.query(
      'UPDATE bar_order_items SET status = $2, updated_at = now() WHERE id = $1 RETURNING *',
      [itemId, status]);
    return u;
  });
}

export async function cancelItem(itemId, user) {
  return withTransaction(async (c) => {
    const { rows: [peek] } = await c.query('SELECT order_id FROM bar_order_items WHERE id = $1', [itemId]);
    if (!peek) throw new HttpError(404, 'Item not found');

    await lockOpenOrder(c, peek.order_id);   // always lock the tab first (avoids deadlocks)
    const { rows: [i] } = await c.query(
      'SELECT * FROM bar_order_items WHERE id = $1 FOR UPDATE', [itemId]);
    if (i.status === 'cancelled') throw new HttpError(409, 'Already cancelled');
    if (i.status !== 'new' && !isManager(user)) {
      throw new HttpError(403, 'This item is already being made. Ask a manager to cancel it');
    }
    await c.query(
      `UPDATE bar_order_items SET status = 'cancelled', updated_at = now() WHERE id = $1`, [itemId]);
    await recalc(c, i.order_id);
    return getOrder(i.order_id, c);
  });
}

// ---------------------------------------------------------------- paying / voiding
export async function settleTab(orderId, payments, userId) {
  return withTransaction(async (c) => {
    const shift = await requireShift(c, userId);
    await lockOpenOrder(c, orderId);
    const order = await recalc(c, orderId);          // freeze the final numbers
    if (order.total <= 0) throw new HttpError(400, 'Nothing to pay: the tab has no items');

    const paid = payments.reduce((s, p) => s + cents(p.amount), 0);
    if (paid !== cents(order.total)) {
      throw new HttpError(400, `Payments add up to ${paid / 100} but the bill is ${order.total}`);
    }
    for (const p of payments) {
      await c.query(
        `INSERT INTO bar_payments (order_id, method, amount, shift_id, created_by)
         VALUES ($1,$2,$3,$4,$5)`,
        [orderId, p.method, p.amount, shift.id, userId]);
    }
    await c.query(
      `UPDATE bar_orders SET status = 'paid', paid_at = now(), paid_by = $2 WHERE id = $1`,
      [orderId, userId]);
    return getOrder(orderId, c);
  });
}

export async function voidTab(orderId, reason, user) {
  return withTransaction(async (c) => {
    await lockOpenOrder(c, orderId);
    const { rows: [{ n }] } = await c.query(
      `SELECT count(*)::int AS n FROM bar_order_items
        WHERE order_id = $1 AND status IN ('preparing', 'ready', 'served')`, [orderId]);
    if (n > 0 && !isManager(user)) {
      throw new HttpError(403, 'Food or drinks were already made. Ask a manager to void this tab');
    }
    await c.query(
      `UPDATE bar_orders SET status = 'void', void_reason = $2, voided_at = now() WHERE id = $1`,
      [orderId, reason]);
    return getOrder(orderId, c);
  });
}

// ---------------------------------------------------------------- shifts
async function shiftTotals(db, shift) {
  const { rows } = await db.query(
    `SELECT method, COALESCE(sum(amount), 0) AS total
       FROM bar_payments WHERE shift_id = $1 GROUP BY method`, [shift.id]);
  const by = { cash: 0, card: 0, upi: 0 };
  for (const r of rows) by[r.method] = r.total;
  return {
    by_method: by,
    sales_total: round2(by.cash + by.card + by.upi),
    expected_cash: round2(shift.opening_cash + by.cash),
  };
}

export async function currentShift(userId) {
  const { rows: [s] } = await query(
    'SELECT * FROM shifts WHERE user_id = $1 AND ended_at IS NULL', [userId]);
  if (!s) return null;
  return { ...s, ...(await shiftTotals({ query }, s)) };
}

export async function startShift(userId, openingCash) {
  const { rows: [existing] } = await query(
    'SELECT id FROM shifts WHERE user_id = $1 AND ended_at IS NULL', [userId]);
  if (existing) throw new HttpError(409, 'You already have a shift running');
  const { rows: [s] } = await query(
    'INSERT INTO shifts (user_id, opening_cash) VALUES ($1,$2) RETURNING *', [userId, openingCash]);
  return s;
}

export async function endShift(userId, closingCash, note) {
  return withTransaction(async (c) => {
    const { rows: [s] } = await c.query(
      'SELECT * FROM shifts WHERE user_id = $1 AND ended_at IS NULL FOR UPDATE', [userId]);
    if (!s) throw new HttpError(409, 'You have no running shift');

    const totals = await shiftTotals(c, s);
    const { rows: [ended] } = await c.query(
      `UPDATE shifts SET ended_at = now(), closing_cash = $2, expected_cash = $3, note = $4
        WHERE id = $1 RETURNING *`,
      [s.id, closingCash, totals.expected_cash, note ?? null]);
    const { rows: [{ n }] } = await c.query(`SELECT count(*)::int AS n FROM bar_orders WHERE status = 'open'`);

    return {
      shift: ended,
      ...totals,
      variance: round2(closingCash - totals.expected_cash),   // negative = cash is short
      open_tabs: n,                                           // tabs left for the next shift
    };
  });
}

export async function listShifts(date) {
  const { rows } = await query(
    `SELECT s.*, u.name AS staff_name,
            round((EXTRACT(EPOCH FROM (COALESCE(s.ended_at, now()) - s.started_at)) / 3600)::numeric, 2) AS hours,
            COALESCE((SELECT sum(amount) FROM bar_payments p WHERE p.shift_id = s.id AND p.method = 'cash'), 0) AS cash_sales,
            COALESCE((SELECT sum(amount) FROM bar_payments p WHERE p.shift_id = s.id AND p.method = 'card'), 0) AS card_sales,
            COALESCE((SELECT sum(amount) FROM bar_payments p WHERE p.shift_id = s.id AND p.method = 'upi'),  0) AS upi_sales
       FROM shifts s JOIN users u ON u.id = s.user_id
      WHERE s.started_at::date = $1::date
      ORDER BY s.started_at`, [date]);
  return rows;
}

// ---------------------------------------------------------------- the owner's question
export async function dailyReport(date) {
  const { rows: [tot] } = await query(
    `SELECT count(*)::int AS orders_paid,
            COALESCE(sum(subtotal), 0)        AS gross,
            COALESCE(sum(discount_amount), 0) AS discounts,
            COALESCE(sum(total), 0)           AS net
       FROM bar_orders WHERE status = 'paid' AND paid_at::date = $1::date`, [date]);

  const { rows: byMethod } = await query(
    `SELECT method, COALESCE(sum(amount), 0) AS total, count(*)::int AS payments
       FROM bar_payments WHERE created_at::date = $1::date
      GROUP BY method ORDER BY method`, [date]);

  const { rows: topItems } = await query(
    `SELECT i.item_name AS name, sum(i.qty)::int AS qty, sum(i.qty * i.unit_price) AS revenue
       FROM bar_order_items i JOIN bar_orders o ON o.id = i.order_id
      WHERE o.status = 'paid' AND o.paid_at::date = $1::date AND i.status <> 'cancelled'
      GROUP BY i.item_name ORDER BY qty DESC, revenue DESC LIMIT 10`, [date]);

  const { rows: [open] } = await query(
    `SELECT count(*)::int AS count, COALESCE(sum(total), 0) AS amount
       FROM bar_orders WHERE status = 'open'`);
  const { rows: [v] } = await query(
    `SELECT count(*)::int AS n FROM bar_orders WHERE status = 'void' AND voided_at::date = $1::date`, [date]);

  return { date, ...tot, by_method: byMethod, top_items: topItems, open_tabs: open, voided_tabs: v.n };
}
