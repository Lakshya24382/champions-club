import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// Public on purpose: the Phase 4 website will show plans & prices from here.
router.get('/', async (_req, res) => {
  const { rows } = await query('SELECT * FROM membership_plans WHERE is_active ORDER BY price DESC');
  res.json(rows);
});

export default router;
