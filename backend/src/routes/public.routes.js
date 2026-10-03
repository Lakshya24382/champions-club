import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { query, withTransaction } from '../db.js';
import { rules } from '../config.js';
import { HttpError } from '../utils/httpError.js';
import { isSocialSlot } from '../utils/slots.js';
import { getAvailability, createBooking, cancelBooking } from '../services/booking.service.js';
import { captureLead, normPhone, publicQuote } from '../services/lead.service.js';
import { notifyStaff } from '../utils/notify.js';

// PUBLIC routes: no login. Never expose names, member data or exact stock.
const router = Router();

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const phoneStr = z.string().trim().regex(/^[0-9+\-\s()]{7,20}$/, 'Enter a valid phone number');

async function assertWithinWeek(date) {
  try {
    const { rows: [r] } = await query(
      `SELECT ($1::date BETWEEN current_date AND current_date + 7) AS ok`, [date]);
    if (!r.ok) throw new HttpError(400, 'Choose a date within the next 7 days');
  } catch (err) {
    if (String(err.code).startsWith('22')) throw new HttpError(400, 'That is not a valid date');
    throw err;
  }
}

// ---- everything the home page needs, in one call
router.get('/overview', async (_req, res) => {
  const { rows: plans } = await query(
    `SELECT id, code, name, description, price, duration_days,
            court_discount_pct, shop_discount_pct, bar_discount_pct, max_age
       FROM membership_plans WHERE is_active ORDER BY price DESC`);
  const { rows: courts } = await query(
    `SELECT id, name, sport, price_per_hour, social_price_per_person
       FROM courts WHERE is_active ORDER BY sport, name`);
  res.json({
    plans, courts,
    hours: { open: rules.openTime, close: rules.closeTime },
    social: rules.social,
    sessionMin: rules.sessionMin,
  });
});

// ---- "what is free this week": slot states only
router.get('/availability', async (req, res) => {
  const date = dateStr.parse(req.query.date);
  await assertWithinWeek(date);
  res.json(await getAvailability(date));
});

// ---- contact form
const enquirySchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: phoneStr,
  email: z.email().nullish(),
  message: z.string().trim().max(1000).nullish(),
  interestedPlanId: z.number().int().positive().nullish(),
  website: z.string().optional(),       // honeypot: real people never fill this in
});

router.post('/enquiries', writeLimiter, async (req, res) => {
  const d = enquirySchema.parse(req.body);
  if (d.website) return res.status(201).json({ ok: true });   // a bot: pretend success, store nothing

  const { lead, duplicate } = await withTransaction((c) =>
    captureLead(c, { ...d, source: 'website' }));
  notifyStaff('new_enquiry', { id: lead.id, name: lead.name, phone: lead.phone, duplicate });
  res.status(201).json({ ok: true, message: "Thanks! We'll get back to you shortly." });
});

// ---- trial session
const trialSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: phoneStr,
  email: z.email().nullish(),
  courtId: z.number().int().positive(),
  date: dateStr,
  time: z.string().regex(/^([01]\d|2[0-3]):(00|30)$/, 'Start time must be on the hour or half hour'),
  interestedPlanId: z.number().int().positive().nullish(),
  website: z.string().optional(),       // honeypot
});

router.post('/trial', writeLimiter, async (req, res) => {
  const d = trialSchema.parse(req.body);
  if (d.website) return res.status(201).json({ ok: true });

  await assertWithinWeek(d.date);
  if (isSocialSlot(d.date, d.time)) {
    throw new HttpError(400, 'Trials are on regular slots. Friday evening is social play: just come along and ask at the desk');
  }

  const { rows: [court] } = await query('SELECT id, name FROM courts WHERE id = $1 AND is_active', [d.courtId]);
  if (!court) throw new HttpError(404, 'Court not found');

  const phone = normPhone(d.phone);
  const { rows: [isMember] } = await query(
    `SELECT 1 FROM members WHERE regexp_replace(phone, '[^\\d+]', '', 'g') = $1`, [phone]);
  if (isMember) throw new HttpError(409, 'This number belongs to an existing member. Please book through the front desk');

  const { rows: [usedTrial] } = await query(
    `SELECT 1 FROM leads l JOIN bookings b ON b.id = l.trial_booking_id
      WHERE l.phone = $1 AND b.status = 'confirmed'`, [phone]);
  if (usedTrial) throw new HttpError(409, 'A trial session is already booked for this number. Please contact the club for more');

  // Same engine as staff bookings: court lock, overlap guard, opening hours.
  const booking = await createBooking(
    { courtId: court.id, date: d.date, time: d.time, guestName: d.name, guestPhone: phone }, null);

  let lead;
  try {
    ({ lead } = await withTransaction((c) => captureLead(c, {
      name: d.name, phone, email: d.email, source: 'trial', status: 'trial_booked',
      interestedPlanId: d.interestedPlanId, trialBookingId: booking.id,
      message: `Booked a trial: ${court.name} on ${d.date} at ${d.time}`,
    })));
  } catch (err) {
    await cancelBooking(booking.id, 'Could not save the enquiry').catch(() => {});
    throw err;
  }

  notifyStaff('new_trial', { leadId: lead.id, name: d.name, court: court.name, date: d.date, time: d.time });
  res.status(201).json({
    ok: true, reference: `TRIAL-${lead.id}`, court: court.name,
    date: d.date, time: d.time, price: booking.price,
  });
});

// ---- the quote page staff share with a prospect
router.get('/quotes/:token', async (req, res) => {
  const token = z.string().regex(/^[a-f0-9]{32}$/).safeParse(req.params.token);
  if (!token.success) throw new HttpError(404, 'Quote not found');
  res.json(await publicQuote(token.data));
});

export default router;
