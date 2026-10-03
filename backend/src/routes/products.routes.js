import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { HttpError, parseId } from '../utils/httpError.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
const managers = requireRole('owner', 'admin');

const productSchema = z.object({
  sku: z.string().trim().min(2),
  name: z.string().trim().min(2),
  categoryId: z.number().int().positive(),
  description: z.string().trim().nullish(),
  price: z.number().nonnegative(),
  stockQty: z.number().int().nonnegative().default(0),
  lowStockThreshold: z.number().int().nonnegative().default(5),
});

// Stock is NOT editable here on purpose: it changes only through /restock or sales.
const patchSchema = productSchema
  .omit({ stockQty: true, sku: true })
  .partial()
  .extend({ isActive: z.boolean().optional() });

const restockSchema = z.object({
  qty: z.number().int().refine((n) => n !== 0, 'qty cannot be 0'), // negative = write-off/adjustment
  note: z.string().trim().nullish(),
});

router.get('/categories', async (_req, res) => {
  const { rows } = await query('SELECT * FROM product_categories ORDER BY name');
  res.json(rows);
});

// GET /api/products?search=&categoryId=&lowStock=1&includeInactive=1
router.get('/', async (req, res) => {
  const { search = '', categoryId = '', lowStock = '', includeInactive = '' } = req.query;
  const params = [];
  const where = [];
  if (!includeInactive) where.push('p.is_active');
  if (search) {
    params.push(`%${search}%`);
    where.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`);
  }
  if (categoryId) {
    params.push(parseId(categoryId));
    where.push(`p.category_id = $${params.length}`);
  }
  if (lowStock) where.push('p.stock_qty <= p.low_stock_threshold');

  const { rows } = await query(
    `SELECT p.*, c.name AS category_name, (p.stock_qty <= p.low_stock_threshold) AS is_low
       FROM products p JOIN product_categories c ON c.id = p.category_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY c.name, p.name`,
    params);
  res.json(rows);
});

router.post('/', managers, async (req, res) => {
  const d = productSchema.parse(req.body);
  const product = await withTransaction(async (c) => {
    const { rows: [p] } = await c.query(
      `INSERT INTO products (sku, name, category_id, description, price, stock_qty, low_stock_threshold)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [d.sku, d.name, d.categoryId, d.description ?? null, d.price, d.stockQty, d.lowStockThreshold]);
    if (d.stockQty > 0) {
      await c.query(
        `INSERT INTO stock_movements (product_id, change, reason, note, created_by)
         VALUES ($1,$2,'restock','Opening stock',$3)`,
        [p.id, d.stockQty, req.user.sub]);
    }
    return p;
  });
  res.status(201).json(product);
});

router.patch('/:id', managers, async (req, res) => {
  const id = parseId(req.params.id);
  const d = patchSchema.parse(req.body);
  const { rows: [p] } = await query(
    `UPDATE products SET
        name = COALESCE($2, name),
        category_id = COALESCE($3, category_id),
        price = COALESCE($4, price),
        low_stock_threshold = COALESCE($5, low_stock_threshold),
        is_active = COALESCE($6, is_active)
      WHERE id = $1 RETURNING *`,
    [id, d.name ?? null, d.categoryId ?? null, d.price ?? null,
     d.lowStockThreshold ?? null, d.isActive ?? null]);
  if (!p) throw new HttpError(404, 'Product not found');
  res.json(p);
});

// POST /api/products/:id/restock { qty: 20 }  or { qty: -2, note: "Damaged" }
router.post('/:id/restock', managers, async (req, res) => {
  const id = parseId(req.params.id);
  const d = restockSchema.parse(req.body);
  const product = await withTransaction(async (c) => {
    const { rows: [p] } = await c.query(
      `UPDATE products SET stock_qty = stock_qty + $2
        WHERE id = $1 AND stock_qty + $2 >= 0 RETURNING *`,
      [id, d.qty]);
    if (!p) throw new HttpError(409, 'Product not found, or that would take stock below zero');
    await c.query(
      `INSERT INTO stock_movements (product_id, change, reason, note, created_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, d.qty, d.qty > 0 ? 'restock' : 'adjustment', d.note ?? null, req.user.sub]);
    return p;
  });
  res.json(product);
});

router.get('/:id/movements', async (req, res) => {
  const id = parseId(req.params.id);
  const { rows } = await query(
    `SELECT sm.*, o.order_no, u.name AS by_name
       FROM stock_movements sm
       LEFT JOIN orders o ON o.id = sm.order_id
       LEFT JOIN users u ON u.id = sm.created_by
      WHERE sm.product_id = $1 ORDER BY sm.created_at DESC, sm.id DESC LIMIT 100`,
    [id]);
  res.json(rows);
});

export default router;
