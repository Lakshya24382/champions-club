import { Router } from 'express';
import { z } from 'zod';
import { parseId } from '../utils/httpError.js';
import {
  getAvailability, listBookings, createBooking, cancelBooking,
} from '../services/booking.service.js';

const router = Router();

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const bookingSchema = z.object({
  courtId: z.number().int().positive(),
  date: dateStr,
  time: z.string().regex(/^([01]\d|2[0-3]):(00|30)$/, 'Start time must be on the hour or half hour'),
  memberId: z.number().int().positive().nullish(),
  guestName: z.string().trim().min(2).nullish(),
  guestPhone: z.string().trim().nullish(),
});

router.get('/availability', async (req, res) => {
  const date = dateStr.parse(req.query.date);
  res.json(await getAvailability(date));
});

router.get('/', async (req, res) => {
  const date = dateStr.parse(req.query.date);
  res.json(await listBookings(date));
});

router.post('/', async (req, res) => {
  const input = bookingSchema.parse(req.body);
  res.status(201).json(await createBooking(input, req.user.sub));
});

router.post('/:id/cancel', async (req, res) => {
  const reason = z.object({ reason: z.string().optional() }).parse(req.body ?? {}).reason;
  res.json(await cancelBooking(parseId(req.params.id), reason));
});

export default router;
