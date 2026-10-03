import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, parseId } from '../utils/httpError.js';
import { paymentMethod } from '../utils/schemas.js';

// Mounted behind requireAuth + owner/admin only.
const router = Router();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const CATEGORIES = ['rent', 'utilities', 'maintenance', 'supplies', 'marketing', 'equipment', 'inventory', 'professional', 'other'];

router.get('/', async (req, res) => {
  const { status } = z.object({ status: z.enum(['unpaid', 'paid', 'all']).default('unpaid') }).parse(req.query);
  const { rows } = await query(
    `SELECT e.*, (e.status = 'unpaid' AND e.due_date < current_date) AS is_overdue
       FROM expenses e
      WHERE ($1 = 'all' OR e.status = $1)
      ORDER BY (e.status = 'unpaid') DESC, e.due_date NULLS LAST, e.expense_date DESC LIMIT 300`,
    [status]);
  res.json(rows);
});

const createSchema = z.object({
  expenseDate: dateStr.optional(),
  category: z.enum(CATEGORIES),
  vendor: z.string().trim().min(2).max(120),
  description: z.string().trim().max(300).nullish(),
  amount: z.number().positive(),
  taxAmount: z.number().nonnegative().default(0),
  dueDate: dateStr.nullish(),
  paidWith: paymentMethod.nullish(),          // set this if it was paid on the spot
}).refine((d) => d.taxAmount <= d.amount, { message: 'Tax cannot be more than the total', path: ['taxAmount'] });

router.post('/', async (req, res) => {
  const d = createSchema.parse(req.body);
  const { rows: [e] } = await query(
    `INSERT INTO expenses
       (expense_date, category, vendor, description, amount, tax_amount, due_date,
        status, paid_at, payment_method, created_by)
     VALUES (COALESCE($1::date, current_date), $2, $3, $4, $5, $6, $7,
             CASE WHEN $8::text IS NULL THEN 'unpaid' ELSE 'paid' END,
             CASE WHEN $8::text IS NULL THEN NULL ELSE now() END,
             $8::text, $9)
     RETURNING *`,
    [d.expenseDate ?? null, d.category, d.vendor, d.description ?? null, d.amount, d.taxAmount,
     d.dueDate ?? null, d.paidWith ?? null, req.user.sub]);
  res.status(201).json(e);
});

router.post('/:id/pay', async (req, res) => {
  const { method } = z.object({ method: paymentMethod }).parse(req.body);
  const { rows: [e] } = await query(
    `UPDATE expenses SET status = 'paid', paid_at = now(), payment_method = $2
      WHERE id = $1 AND status = 'unpaid' RETURNING *`,
    [parseId(req.params.id), method]);
  if (!e) throw new HttpError(409, 'Bill not found or already paid');
  res.json(e);
});

router.delete('/:id', async (req, res) => {
  const { rows: [e] } = await query(
    `DELETE FROM expenses WHERE id = $1 AND status = 'unpaid' RETURNING id`, [parseId(req.params.id)]);
  if (!e) throw new HttpError(409, 'Only unpaid bills can be deleted');
  res.json({ deleted: true });
});

export default router;
