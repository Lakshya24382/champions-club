import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError, parseId } from '../utils/httpError.js';
import { paymentMethod } from '../utils/schemas.js';
import { buildReport, reportToCsv } from '../services/report.service.js';
import { getSettings, updateSettings } from '../services/settings.service.js';

// Mounted behind requireAuth + owner/admin only.
const router = Router();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const rangeSchema = z.object({ from: dateStr, to: dateStr });

// ------------------------------------------------------------ the report
router.get('/report', async (req, res) => {
  const { from, to } = rangeSchema.parse(req.query);
  res.json(await buildReport(from, to));
});

router.get('/report.csv', async (req, res) => {
  const { from, to } = rangeSchema.parse(req.query);
  const csv = reportToCsv(await buildReport(from, to));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="champions-report-${from}_to_${to}.csv"`);
  res.send(csv);
});

// ------------------------------------------------------------ share a frozen snapshot
const shareSchema = rangeSchema.extend({
  title: z.string().trim().min(2).max(120),
  validDays: z.number().int().min(1).max(365).default(30),
});

router.post('/shares', async (req, res) => {
  const d = shareSchema.parse(req.body);
  const snapshot = await buildReport(d.from, d.to);
  const { rows: [s] } = await query(
    `INSERT INTO report_shares (title, from_date, to_date, snapshot, expires_at, created_by)
     VALUES ($1,$2,$3,$4, now() + $5::int * interval '1 day', $6)
     RETURNING id, token, title, expires_at`,
    [d.title, d.from, d.to, JSON.stringify(snapshot), d.validDays, req.user.sub]);
  res.status(201).json(s);
});

router.get('/shares', async (_req, res) => {
  const { rows } = await query(
    `SELECT id, token, title, from_date, to_date, expires_at, revoked, created_at,
            (expires_at < now()) AS expired
       FROM report_shares ORDER BY created_at DESC LIMIT 20`);
  res.json(rows);
});

router.post('/shares/:id/revoke', async (req, res) => {
  const { rows: [s] } = await query(
    'UPDATE report_shares SET revoked = TRUE WHERE id = $1 RETURNING id', [parseId(req.params.id)]);
  if (!s) throw new HttpError(404, 'Share not found');
  res.json({ revoked: true });
});

// ------------------------------------------------------------ settings
const settingsSchema = z.object({
  tax_courts: z.number().min(0).max(100),
  tax_membership: z.number().min(0).max(100),
  tax_shop: z.number().min(0).max(100),
  tax_bar: z.number().min(0).max(100),
  annual_leave_days: z.number().int().min(0).max(365),
  club_name: z.string().trim().min(1).max(100),
  club_gstin: z.string().trim().max(20),
  club_address: z.string().trim().max(300),
}).partial();

router.get('/settings', async (_req, res) => res.json(await getSettings()));
router.patch('/settings', async (req, res) => {
  res.json(await updateSettings(settingsSchema.parse(req.body)));
});

// ------------------------------------------------------------ collections: tag how money was paid
router.get('/collections', async (_req, res) => {
  const { rows: bookings } = await query(
    `SELECT b.id, b.price, b.kind, b.start_at, c.name AS court_name,
            COALESCE(m.full_name, b.guest_name) AS player, m.member_code
       FROM bookings b JOIN courts c ON c.id = b.court_id
       LEFT JOIN members m ON m.id = b.member_id
      WHERE b.status = 'confirmed' AND b.price > 0 AND b.payment_method IS NULL AND b.start_at < now()
      ORDER BY b.start_at DESC LIMIT 200`);
  const { rows: memberships } = await query(
    `SELECT e.id, e.event_type, e.amount, e.created_at, m.full_name, m.member_code, p.name AS plan_name
       FROM membership_events e JOIN members m ON m.id = e.member_id
       JOIN membership_plans p ON p.id = e.plan_id
      WHERE e.amount > 0 AND e.payment_method IS NULL
      ORDER BY e.created_at DESC LIMIT 200`);
  res.json({ bookings, memberships });
});

const payBody = z.object({ method: paymentMethod });

router.post('/collections/bookings/:id/pay', async (req, res) => {
  const { method } = payBody.parse(req.body);
  const { rows: [b] } = await query(
    `UPDATE bookings SET payment_method = $2, paid_at = now()
      WHERE id = $1 AND status = 'confirmed' AND price > 0 AND payment_method IS NULL RETURNING id`,
    [parseId(req.params.id), method]);
  if (!b) throw new HttpError(409, 'Already recorded, cancelled, or free');
  res.json(b);
});

router.post('/collections/memberships/:id/pay', async (req, res) => {
  const { method } = payBody.parse(req.body);
  const { rows: [e] } = await query(
    `UPDATE membership_events SET payment_method = $2, paid_at = now()
      WHERE id = $1 AND amount > 0 AND payment_method IS NULL RETURNING id`,
    [parseId(req.params.id), method]);
  if (!e) throw new HttpError(409, 'Already recorded, or there is no payment on that entry');
  res.json(e);
});

export default router;
