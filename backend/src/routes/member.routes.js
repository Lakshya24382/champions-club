import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';
import { getAvailability, createBooking, listBookings, cancelBooking } from '../services/booking.service.js';
import { HttpError, parseId } from '../utils/httpError.js';
import { query } from '../db.js';

const router = Router();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const bookingSchema = z.object({
  courtId: z.number().int().positive(),
  date: dateStr,
  time: z.string().regex(/^([01]\d|2[0-3]):(00|30)$/),
});

router.use(requireRole('member'));

router.get('/availability', async (req, res) => {
  const date = dateStr.parse(req.query.date);
  res.json(await getAvailability(date));
});

router.get('/bookings', async (req, res) => {
  const { rows } = await query(
    `SELECT b.id, b.kind, b.status, b.price, b.discount_pct,
            to_char(b.start_at, 'YYYY-MM-DD HH24:MI') AS start_at,
            to_char(b.end_at, 'HH24:MI') AS end_time,
            c.name AS court_name, c.sport
       FROM bookings b JOIN courts c ON c.id = b.court_id
      WHERE b.member_id = $1 ORDER BY b.start_at DESC LIMIT 50`, [req.user.sub]);
  res.json(rows);
});

router.post('/bookings', async (req, res) => {
  const d = bookingSchema.parse(req.body);
  const booking = await createBooking({ ...d, memberId: Number(req.user.sub) }, null);
  res.status(201).json(booking);
});

router.post('/bookings/:id/cancel', async (req, res) => {
  const id = parseId(req.params.id);
  const { rows: [owned] } = await query(
    `SELECT id FROM bookings WHERE id = $1 AND member_id = $2`, [id, req.user.sub]);
  if (!owned) throw new HttpError(404, 'Booking not found');
  res.json(await cancelBooking(id, 'Cancelled by member'));
});

export default router;
