import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { HttpError, parseId } from '../utils/httpError.js';
import { ageOn } from '../utils/dates.js';
// FIX: import shared phone normaliser so staff-created members store phones in
// the same format as public-signup members and lead conversions.
import { normPhone } from '../utils/phone.js';

const router = Router();

const STATUS_SQL = `CASE
  WHEN NOT m.is_active THEN 'inactive'
  WHEN m.expires_on < current_date THEN 'expired'
  WHEN m.expires_on <= current_date + 30 THEN 'expiring'
  ELSE 'active' END`;

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const createSchema = z.object({
  fullName: z.string().trim().min(2),
  phone: z.string().trim().min(7),
  email: z.string().email().nullish(),
  dateOfBirth: dateStr,
  gender: z.enum(['male', 'female', 'other']).nullish(),
  emergencyContact: z.string().trim().nullish(),
  planId: z.number().int().positive(),
  amountPaid: z.number().nonnegative().optional(),
});

const updateSchema = z.object({
  fullName: z.string().trim().min(2),
  phone: z.string().trim().min(7),
  email: z.string().email().nullable(),
  emergencyContact: z.string().trim().nullable(),
  notes: z.string().trim().nullable(),
  isActive: z.boolean(),
}).partial();

const renewSchema = z.object({
  planId: z.number().int().positive().optional(),
  amountPaid: z.number().nonnegative().optional(),
});

function assertPlanFits(plan, dateOfBirth) {
  if (plan.max_age != null && ageOn(dateOfBirth) > plan.max_age) {
    throw new HttpError(400, `${plan.name} is only for members aged ${plan.max_age} or under`);
  }
}

router.get('/', async (req, res) => {
  const { search = '', status = '', planId = '', limit = '200' } = req.query;
  const params = [];
  const where = [];

  if (search) {
    params.push(`%${search}%`);
    const i = params.length;
    where.push(`(m.full_name ILIKE $${i} OR m.phone ILIKE $${i} OR m.member_code ILIKE $${i})`);
  }
  if (planId) {
    params.push(Number(planId));
    where.push(`m.plan_id = $${params.length}`);
  }

  let outerWhere = '';
  if (status) {
    params.push(status);
    outerWhere = `WHERE membership_status = $${params.length}`;
  }
  params.push(Math.min(Number(limit) || 200, 200));

  const { rows } = await query(
    `SELECT * FROM (
       SELECT m.id, m.member_code, m.full_name, m.phone, m.email, m.expires_on, m.is_active,
              p.code AS plan_code, p.name AS plan_name,
              ${STATUS_SQL} AS membership_status
         FROM members m
         JOIN membership_plans p ON p.id = m.plan_id
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ) x
     ${outerWhere}
     ORDER BY full_name
     LIMIT $${params.length}`,
    params,
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const { rows: [member] } = await query(
    `SELECT m.*, ${STATUS_SQL} AS membership_status,
            p.code AS plan_code, p.name AS plan_name,
            p.court_discount_pct, p.shop_discount_pct, p.bar_discount_pct
       FROM members m JOIN membership_plans p ON p.id = m.plan_id
      WHERE m.id = $1`,
    [id],
  );
  if (!member) throw new HttpError(404, 'Member not found');

  const { rows: events } = await query(
    `SELECT e.*, p.name AS plan_name
       FROM membership_events e JOIN membership_plans p ON p.id = e.plan_id
      WHERE e.member_id = $1 ORDER BY e.created_at DESC`,
    [id],
  );
  const { rows: bookings } = await query(
    `SELECT b.id, b.kind, b.status, b.price, b.start_at, c.name AS court_name
       FROM bookings b JOIN courts c ON c.id = b.court_id
      WHERE b.member_id = $1 ORDER BY b.start_at DESC LIMIT 20`,
    [id],
  );
  res.json({ ...member, events, bookings });
});

// POST /api/members — front-desk sign-up
// FIX: normalise phone before insert so it matches the format used by public
// signup and the regexp_replace comparisons in DB queries.
router.post('/', async (req, res) => {
  const d = createSchema.parse(req.body);
  const phone = normPhone(d.phone);   // FIX

  const member = await withTransaction(async (c) => {
    const { rows: [plan] } = await c.query(
      'SELECT * FROM membership_plans WHERE id = $1 AND is_active', [d.planId]);
    if (!plan) throw new HttpError(404, 'Plan not found');
    assertPlanFits(plan, d.dateOfBirth);

    // FIX: check for existing member by normalised phone before inserting,
    // giving a clean 409 instead of a cryptic unique-constraint error.
    const { rows: [dup] } = await c.query(
      'SELECT member_code FROM members WHERE phone = $1', [phone]);
    if (dup) throw new HttpError(409, `A member with this phone number already exists (${dup.member_code})`);

    const { rows: [m] } = await c.query(
      `INSERT INTO members
         (full_name, phone, email, date_of_birth, gender, emergency_contact, plan_id, expires_on)
       VALUES ($1,$2,$3,$4,$5,$6,$7, current_date + $8::int)
       RETURNING *`,
      [d.fullName, phone, d.email ?? null, d.dateOfBirth, d.gender ?? null,
       d.emergencyContact ?? null, plan.id, plan.duration_days],
    );
    await c.query(
      `INSERT INTO membership_events (member_id, plan_id, event_type, starts_on, ends_on, amount, created_by)
       VALUES ($1,$2,'joined', current_date, $3, $4, $5)`,
      [m.id, plan.id, m.expires_on, d.amountPaid ?? plan.price, req.user.sub],
    );
    return m;
  });
  res.status(201).json(member);
});

// PATCH /api/members/:id
// FIX: normalise phone on update too.
router.patch('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  const d = updateSchema.parse(req.body);

  // FIX: normalise phone if it's being updated
  const phone = d.phone != null ? normPhone(d.phone) : null;

  const { rows: [m] } = await query(
    `UPDATE members SET
        full_name         = COALESCE($2, full_name),
        phone             = COALESCE($3, phone),
        email             = CASE WHEN $4::boolean THEN $5 ELSE email END,
        emergency_contact = CASE WHEN $6::boolean THEN $7 ELSE emergency_contact END,
        notes             = CASE WHEN $8::boolean THEN $9 ELSE notes END,
        is_active         = COALESCE($10, is_active)
      WHERE id = $1 RETURNING *`,
    [id, d.fullName ?? null, phone,
     'email' in d, d.email ?? null,
     'emergencyContact' in d, d.emergencyContact ?? null,
     'notes' in d, d.notes ?? null,
     d.isActive ?? null],
  );
  if (!m) throw new HttpError(404, 'Member not found');
  res.json(m);
});

router.post('/:id/renew', async (req, res) => {
  const id = parseId(req.params.id);
  const d = renewSchema.parse(req.body);

  const updated = await withTransaction(async (c) => {
    const { rows: [member] } = await c.query('SELECT * FROM members WHERE id = $1 FOR UPDATE', [id]);
    if (!member) throw new HttpError(404, 'Member not found');

    const planId = d.planId ?? member.plan_id;
    const { rows: [plan] } = await c.query(
      'SELECT * FROM membership_plans WHERE id = $1 AND is_active', [planId]);
    if (!plan) throw new HttpError(404, 'Plan not found');
    assertPlanFits(plan, member.date_of_birth);

    const eventType = planId !== member.plan_id ? 'plan_changed' : 'renewed';
    const { rows: [m] } = await c.query(
      `UPDATE members
          SET plan_id = $2, is_active = TRUE,
              expires_on = GREATEST(expires_on, current_date) + $3::int
        WHERE id = $1 RETURNING *`,
      [id, plan.id, plan.duration_days],
    );
    await c.query(
      `INSERT INTO membership_events (member_id, plan_id, event_type, starts_on, ends_on, amount, created_by)
       VALUES ($1,$2,$3, current_date, $4, $5, $6)`,
      [id, plan.id, eventType, m.expires_on, d.amountPaid ?? plan.price, req.user.sub],
    );
    return m;
  });
  res.json(updated);
});

export default router;
