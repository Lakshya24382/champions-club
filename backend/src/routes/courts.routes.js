import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, parseId } from '../utils/httpError.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

const courtSchema = z.object({
  name: z.string().trim().min(2),
  sport: z.enum(['tennis', 'cricket', 'padel', 'badminton']),
  pricePerHour: z.number().nonnegative(),
  socialPricePerPerson: z.number().nonnegative(),
  socialCapacity: z.number().int().positive().default(8),
});

router.get('/', async (_req, res) => {
  const { rows } = await query('SELECT * FROM courts ORDER BY sport, name');
  res.json(rows);
});

router.post('/', requireRole('owner', 'admin'), async (req, res) => {
  const d = courtSchema.parse(req.body);
  const { rows: [court] } = await query(
    `INSERT INTO courts (name, sport, price_per_hour, social_price_per_person, social_capacity)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [d.name, d.sport, d.pricePerHour, d.socialPricePerPerson, d.socialCapacity],
  );
  res.status(201).json(court);
});

router.patch('/:id', requireRole('owner', 'admin'), async (req, res) => {
  const id = parseId(req.params.id);
  const d = courtSchema.partial().extend({ isActive: z.boolean().optional() }).parse(req.body);
  const { rows: [court] } = await query(
    `UPDATE courts SET
        name = COALESCE($2, name),
        price_per_hour = COALESCE($3, price_per_hour),
        social_price_per_person = COALESCE($4, social_price_per_person),
        social_capacity = COALESCE($5, social_capacity),
        is_active = COALESCE($6, is_active)
      WHERE id = $1 RETURNING *`,
    [id, d.name ?? null, d.pricePerHour ?? null, d.socialPricePerPerson ?? null,
     d.socialCapacity ?? null, d.isActive ?? null],
  );
  if (!court) throw new HttpError(404, 'Court not found');
  res.json(court);
});

export default router;
