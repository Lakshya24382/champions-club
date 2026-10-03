import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { query, withTransaction } from '../db.js';
import { rules } from '../config.js';
import { HttpError } from '../utils/httpError.js';
import { isSocialSlot } from '../utils/slots.js';
import { getAvailability, createBooking, cancelBooking } from '../services/booking.service.js';
import { captureLead, normPhone, normEmail, publicQuote } from '../services/lead.service.js';
import { notifyStaff } from '../utils/notify.js';
import { ageOn } from '../utils/dates.js';

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


// ---- public membership signup
const signupSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: phoneStr,
  email: z.string().email().optional().or(z.literal('')),
  dateOfBirth: dateStr,
  gender: z.enum(['male', 'female', 'other']).optional().or(z.literal('')),
  emergencyContact: z.string().trim().max(120).optional(),
  planId: z.number().int().positive(),
});

router.post('/member-signup', writeLimiter, async (req, res) => {
  const d = signupSchema.parse(req.body);
  if (d.dateOfBirth > new Date().toISOString().slice(0, 10)) throw new HttpError(400, 'Date of birth cannot be in the future');
  const phone = normPhone(d.phone);
  const email = d.email ? normEmail(d.email) : null;
  const member = await withTransaction(async (c) => {
    const { rows: [plan] } = await c.query(
      'SELECT * FROM membership_plans WHERE id = $1 AND is_active', [d.planId]);
    if (!plan) throw new HttpError(404, 'Selected membership plan is unavailable');
    if (plan.max_age != null && ageOn(d.dateOfBirth) > plan.max_age) {
      throw new HttpError(400, `${plan.name} is only for members aged ${plan.max_age} or under`);
    }
    const { rows: [existing] } = await c.query(
      `SELECT id FROM members WHERE phone = $1 OR ($2::text IS NOT NULL AND lower(email) = lower($2)) FOR UPDATE`,
      [phone, email]);
    if (existing) throw new HttpError(409, 'A membership already exists with this phone number or email');
    const { rows: [created] } = await c.query(
      `INSERT INTO members (full_name, phone, email, date_of_birth, gender, emergency_contact, plan_id, expires_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7,current_date + $8::int) RETURNING id, member_code, full_name, phone, email, expires_on`,
      [d.fullName, phone, email, d.dateOfBirth, d.gender || null, d.emergencyContact || null, plan.id, plan.duration_days]);
    await c.query(
      `INSERT INTO membership_events (member_id, plan_id, event_type, starts_on, ends_on, amount, created_by)
       VALUES ($1,$2,'joined',current_date,$3,$4,NULL)`,
      [created.id, plan.id, created.expires_on, plan.price]);
    return { ...created, plan_name: plan.name };
  });
  res.status(201).json({ ok: true, member, message: 'Registration successful. Save your member code for portal access.' });
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
  email: z.string().email().nullish(),
  message: z.string().trim().max(1000).nullish(),
  interestedPlanId: z.number().int().positive().nullish(),
  website: z.string().optional(),       // honeypot: real people never fill this in
});

router.post('/enquiries', writeLimiter, async (req, res) => {
  const d = enquirySchema.parse(req.body);
  if (d.website) return res.status(201).json({ ok: true });   // a bot: pretend success, store nothing

  const result = await withTransaction((c) =>
    captureLead(c, { ...d, email: normEmail(d.email), phone: normPhone(d.phone), source: 'website' }));
  const { lead, duplicate } = result ?? {};
  if (lead) {
    notifyStaff('new_enquiry', { id: lead.id, name: lead.name, phone: lead.phone, duplicate }).catch(() => {});
  }
  res.status(201).json({ ok: true, message: "Thanks! We'll get back to you shortly." });
});

// ---- trial session
const trialSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: phoneStr,
  email: z.string().email().nullish(),
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
