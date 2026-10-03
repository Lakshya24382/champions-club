import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, parseId } from '../utils/httpError.js';
import { requireRole } from '../middleware/auth.js';
import { paymentMethod } from '../utils/schemas.js';
import * as bar from '../services/bar.service.js';

const router = Router();
const managers = requireRole('owner', 'admin');
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

async function today() {
  const { rows: [r] } = await query(`SELECT to_char(current_date, 'YYYY-MM-DD') AS d`);
  return r.d;
}

// ------------------------------------------------------------ menu
const menuItemSchema = z.object({
  name: z.string().trim().min(2),
  categoryId: z.number().int().positive(),
  price: z.number().nonnegative(),
  station: z.enum(['kitchen', 'bar']),
});

router.get('/menu/categories', async (_req, res) => {
  const { rows } = await query('SELECT * FROM menu_categories ORDER BY sort_order, name');
  res.json(rows);
});

router.get('/menu', async (_req, res) => {
  const { rows } = await query(
    `SELECT mi.*, c.name AS category_name
       FROM menu_items mi JOIN menu_categories c ON c.id = mi.category_id
      WHERE mi.is_active ORDER BY c.sort_order, mi.name`);
  res.json(rows);
});

router.post('/menu/items', managers, async (req, res) => {
  const d = menuItemSchema.parse(req.body);
  const { rows: [item] } = await query(
    `INSERT INTO menu_items (name, category_id, price, station) VALUES ($1,$2,$3,$4) RETURNING *`,
    [d.name, d.categoryId, d.price, d.station]);
  res.status(201).json(item);
});

router.patch('/menu/items/:id', managers, async (req, res) => {
  const id = parseId(req.params.id);
  const d = menuItemSchema.partial().extend({ isActive: z.boolean().optional() }).parse(req.body);
  const { rows: [item] } = await query(
    `UPDATE menu_items SET
        name = COALESCE($2, name), category_id = COALESCE($3, category_id),
        price = COALESCE($4, price), station = COALESCE($5, station),
        is_active = COALESCE($6, is_active)
      WHERE id = $1 RETURNING *`,
    [id, d.name ?? null, d.categoryId ?? null, d.price ?? null, d.station ?? null, d.isActive ?? null]);
  if (!item) throw new HttpError(404, 'Menu item not found');
  res.json(item);
});

// ANY staff member can flip "sold out": the kitchen knows first.
router.post('/menu/items/:id/availability', async (req, res) => {
  const id = parseId(req.params.id);
  const { isAvailable } = z.object({ isAvailable: z.boolean() }).parse(req.body);
  const { rows: [item] } = await query(
    'UPDATE menu_items SET is_available = $2 WHERE id = $1 RETURNING *', [id, isAvailable]);
  if (!item) throw new HttpError(404, 'Menu item not found');
  res.json(item);
});

// ------------------------------------------------------------ tables
router.get('/tables', async (_req, res) => {
  const { rows } = await query('SELECT * FROM bar_tables WHERE is_active ORDER BY id');
  res.json(rows);
});

router.post('/tables', managers, async (req, res) => {
  const d = z.object({ name: z.string().trim().min(1), seats: z.number().int().positive().default(4) })
    .parse(req.body);
  const { rows: [t] } = await query(
    'INSERT INTO bar_tables (name, seats) VALUES ($1,$2) RETURNING *', [d.name, d.seats]);
  res.status(201).json(t);
});

// ------------------------------------------------------------ tabs
const itemSchema = z.object({
  menuItemId: z.number().int().positive(),
  qty: z.number().int().positive().max(50).default(1),
  note: z.string().trim().max(200).nullish(),
});

const openSchema = z.object({
  tableId: z.number().int().positive().nullish(),
  memberId: z.number().int().positive().nullish(),
  customerName: z.string().trim().min(1).nullish(),
  items: z.array(itemSchema).default([]),
});

router.get('/orders', async (req, res) => {
  const q = z.object({
    status: z.enum(['open', 'paid', 'void']).default('open'),
    date: dateStr.optional(),
  }).parse(req.query);
  res.json(await bar.listOrders(q));
});

router.post('/orders', async (req, res) => {
  const d = openSchema.parse(req.body);
  res.status(201).json(await bar.openTab(d, req.user.sub));
});

router.get('/orders/:id', async (req, res) => {
  res.json(await bar.getOrder(parseId(req.params.id)));
});

router.patch('/orders/:id', async (req, res) => {
  const { memberId } = z.object({ memberId: z.number().int().positive().nullable() }).parse(req.body);
  res.json(await bar.setMember(parseId(req.params.id), memberId));
});

router.post('/orders/:id/items', async (req, res) => {
  const { items } = z.object({ items: z.array(itemSchema).min(1) }).parse(req.body);
  res.json(await bar.addItems(parseId(req.params.id), items));
});

router.post('/orders/:id/settle', async (req, res) => {
  const { payments } = z.object({
    payments: z.array(z.object({ method: paymentMethod, amount: z.number().positive() })).min(1),
  }).parse(req.body);
  res.json(await bar.settleTab(parseId(req.params.id), payments, req.user.sub));
});

router.post('/orders/:id/void', async (req, res) => {
  const { reason } = z.object({ reason: z.string().trim().min(2) }).parse(req.body ?? {});
  res.json(await bar.voidTab(parseId(req.params.id), reason, req.user));
});

// ------------------------------------------------------------ items & kitchen
router.post('/items/:id/status', async (req, res) => {
  const { status } = z.object({ status: z.enum(['preparing', 'ready', 'served']) }).parse(req.body);
  res.json(await bar.setItemStatus(parseId(req.params.id), status));
});

router.post('/items/:id/cancel', async (req, res) => {
  res.json(await bar.cancelItem(parseId(req.params.id), req.user));
});

// The kitchen / bar screen: everything not yet served on open tabs.
router.get('/kitchen', async (req, res) => {
  const station = z.enum(['kitchen', 'bar', '']).default('').parse(req.query.station ?? '');
  const { rows } = await query(
    `SELECT i.id, i.item_name, i.qty, i.note, i.status, i.station, i.created_at,
            o.id AS order_id, o.order_no, o.customer_name,
            COALESCE(t.name, 'Takeaway') AS table_name
       FROM bar_order_items i
       JOIN bar_orders o ON o.id = i.order_id
       LEFT JOIN bar_tables t ON t.id = o.table_id
      WHERE o.status = 'open' AND i.status IN ('new', 'preparing', 'ready')
        AND ($1::text = '' OR i.station = $1::text)
      ORDER BY i.created_at, i.id`,
    [station]);
  res.json(rows);
});

// ------------------------------------------------------------ shifts
router.get('/shifts/current', async (req, res) => {
  res.json({ shift: await bar.currentShift(req.user.sub) });
});

router.post('/shifts/start', async (req, res) => {
  const { openingCash } = z.object({ openingCash: z.number().nonnegative().default(0) })
    .parse(req.body ?? {});
  res.status(201).json(await bar.startShift(req.user.sub, openingCash));
});

router.post('/shifts/end', async (req, res) => {
  const d = z.object({
    closingCash: z.number().nonnegative(),
    note: z.string().trim().nullish(),
  }).parse(req.body);
  res.json(await bar.endShift(req.user.sub, d.closingCash, d.note));
});

router.get('/shifts', managers, async (req, res) => {
  const date = req.query.date ? dateStr.parse(req.query.date) : await today();
  res.json(await bar.listShifts(date));
});

// ------------------------------------------------------------ reports
router.get('/reports/daily', managers, async (req, res) => {
  const date = req.query.date ? dateStr.parse(req.query.date) : await today();
  res.json(await bar.dailyReport(date));
});

export default router;
