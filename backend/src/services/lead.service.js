import { query, withTransaction } from '../db.js';
import { HttpError } from '../utils/httpError.js';
import { createMember } from './member.service.js';

// "98765 43210" and "+91-98765-43210" must count as the same kind of thing: keep digits and "+".
export const normPhone = (p) => p.replace(/[^\d+]/g, '');

export async function logActivity(db, leadId, kind, body, userId = null) {
  await db.query(
    'INSERT INTO lead_activities (lead_id, kind, body, created_by) VALUES ($1,$2,$3,$4)',
    [leadId, kind, body, userId]);
}

// ------------------------------------------------------------ capture (public form, trial, staff)
export async function captureLead(db, d, userId = null) {
  const phone = normPhone(d.phone);
  const kind = d.trialBookingId ? 'trial' : 'enquiry';
  const text = d.message || 'Enquiry received';

  const { rows: [created] } = await db.query(
    `INSERT INTO leads
       (name, phone, email, message, source, interested_plan_id, status, trial_booking_id, next_follow_up)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, current_date)
     ON CONFLICT (phone) WHERE status NOT IN ('converted', 'lost') DO NOTHING
     RETURNING *`,
    [d.name, phone, d.email ?? null, d.message ?? null, d.source ?? 'website',
     d.interestedPlanId ?? null, d.status ?? 'new', d.trialBookingId ?? null]);

  if (created) {
    await logActivity(db, created.id, kind, text, userId);
    return { lead: created, duplicate: false };
  }

  // Already has an open lead: add to it instead of creating a second one.
  const { rows: [lead] } = await db.query(
    `UPDATE leads SET
        email = COALESCE(email, $2),
        interested_plan_id = COALESCE($3, interested_plan_id),
        trial_booking_id = COALESCE($4, trial_booking_id),
        status = CASE WHEN $4::int IS NOT NULL AND status IN ('new', 'contacted') THEN 'trial_booked' ELSE status END,
        next_follow_up = current_date,
        updated_at = now()
      WHERE phone = $1 AND status NOT IN ('converted', 'lost')
      RETURNING *`,
    [phone, d.email ?? null, d.interestedPlanId ?? null, d.trialBookingId ?? null]);
  if (!lead) throw new HttpError(409, 'Please try again');
  await logActivity(db, lead.id, kind, `Contacted us again: ${text}`, userId);
  return { lead, duplicate: true };
}

// ------------------------------------------------------------ reading
export async function leadSummary() {
  const { rows: [s] } = await query(`
    SELECT
      count(*) FILTER (WHERE status = 'new')::int AS new_count,
      count(*) FILTER (WHERE status NOT IN ('converted', 'lost'))::int AS open_count,
      count(*) FILTER (WHERE status NOT IN ('converted', 'lost') AND next_follow_up <= current_date)::int AS due_count,
      count(*) FILTER (WHERE status NOT IN ('converted', 'lost')
                         AND (status = 'new' OR next_follow_up <= current_date))::int AS attention_count,
      count(*) FILTER (WHERE status = 'converted'
                         AND converted_at >= date_trunc('month', now()))::int AS converted_month
    FROM leads`);
  const { rows } = await query('SELECT status, count(*)::int AS n FROM leads GROUP BY status');
  return { ...s, by_status: Object.fromEntries(rows.map((r) => [r.status, r.n])) };
}

export async function listLeads({ status = 'open', search = '', due = false, mine = false }, userId) {
  const params = [];
  const where = [];
  if (status === 'open') where.push(`l.status NOT IN ('converted', 'lost')`);
  else if (status !== 'all') { params.push(status); where.push(`l.status = $${params.length}`); }
  if (search) {
    params.push(`%${search}%`);
    const i = params.length;
    where.push(`(l.name ILIKE $${i} OR l.phone ILIKE $${i} OR l.email ILIKE $${i})`);
  }
  if (due) where.push(`l.status NOT IN ('converted', 'lost') AND l.next_follow_up <= current_date`);
  if (mine) { params.push(userId); where.push(`l.assigned_to = $${params.length}`); }

  const { rows } = await query(
    `SELECT l.*, p.name AS plan_name, u.name AS assigned_name
       FROM leads l
       LEFT JOIN membership_plans p ON p.id = l.interested_plan_id
       LEFT JOIN users u ON u.id = l.assigned_to
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY (l.status = 'new') DESC, l.next_follow_up ASC NULLS LAST, l.created_at DESC
      LIMIT 200`,
    params);
  return rows;
}

export async function getLead(id, db = { query }) {
  const { rows: [lead] } = await db.query(
    `SELECT l.*, p.name AS plan_name, u.name AS assigned_name, m.member_code,
            b.start_at AS trial_start, b.status AS trial_status, c.name AS trial_court
       FROM leads l
       LEFT JOIN membership_plans p ON p.id = l.interested_plan_id
       LEFT JOIN users u ON u.id = l.assigned_to
       LEFT JOIN members m ON m.id = l.member_id
       LEFT JOIN bookings b ON b.id = l.trial_booking_id
       LEFT JOIN courts c ON c.id = b.court_id
      WHERE l.id = $1`, [id]);
  if (!lead) throw new HttpError(404, 'Enquiry not found');

  const { rows: activities } = await db.query(
    `SELECT a.*, u.name AS by_name
       FROM lead_activities a LEFT JOIN users u ON u.id = a.created_by
      WHERE a.lead_id = $1 ORDER BY a.created_at DESC, a.id DESC`, [id]);
  const { rows: quotes } = await db.query(
    `SELECT q.*, p.name AS plan_name, (q.status = 'sent' AND q.valid_until < current_date) AS is_expired
       FROM quotes q JOIN membership_plans p ON p.id = q.plan_id
      WHERE q.lead_id = $1 ORDER BY q.created_at DESC`, [id]);
  return { ...lead, activities, quotes };
}

// ------------------------------------------------------------ changing
async function lockLead(c, id) {
  const { rows: [lead] } = await c.query('SELECT * FROM leads WHERE id = $1 FOR UPDATE', [id]);
  if (!lead) throw new HttpError(404, 'Enquiry not found');
  return lead;
}

export async function updateLead(id, d, userId) {
  try {
    return await withTransaction(async (c) => {
      const cur = await lockLead(c, id);
      if (cur.status === 'converted') throw new HttpError(409, 'This enquiry is already a member');
      if (d.status === 'lost' && !d.lostReason) {
        throw new HttpError(400, 'Please give a reason for losing this lead');
      }

      await c.query(
        `UPDATE leads SET
            status         = COALESCE($2, status),
            assigned_to    = CASE WHEN $3::boolean THEN $4 ELSE assigned_to END,
            next_follow_up = CASE WHEN $2 = 'lost' THEN NULL
                                  WHEN $5::boolean THEN $6 ELSE next_follow_up END,
            lost_reason    = CASE WHEN $2 = 'lost' THEN $7 ELSE lost_reason END,
            updated_at     = now()
          WHERE id = $1`,
        [id, d.status ?? null, 'assignedTo' in d, d.assignedTo ?? null,
         'nextFollowUp' in d, d.nextFollowUp ?? null, d.lostReason ?? null]);

      if (d.status && d.status !== cur.status) {
        const why = d.status === 'lost' ? ` (${d.lostReason})` : '';
        await logActivity(c, id, 'status', `Status: ${cur.status} → ${d.status}${why}`, userId);
      }
      if ('assignedTo' in d) {
        let who = 'nobody';
        if (d.assignedTo) {
          const { rows: [u] } = await c.query('SELECT name FROM users WHERE id = $1', [d.assignedTo]);
          who = u?.name ?? 'someone';
        }
        await logActivity(c, id, 'note', `Assigned to ${who}`, userId);
      }
      return getLead(id, c);
    });
  } catch (err) {
    // Re-opening a lost lead when the same phone already has another open lead
    if (err.code === '23505') throw new HttpError(409, 'Another open enquiry already exists for this phone number');
    throw err;
  }
}

export async function addNote(id, d, userId) {
  return withTransaction(async (c) => {
    await lockLead(c, id);
    await logActivity(c, id, d.kind, d.body, userId);
    await c.query(
      `UPDATE leads SET
          status = CASE WHEN $2 = 'call' AND status = 'new' THEN 'contacted' ELSE status END,
          next_follow_up = CASE WHEN $3::boolean THEN $4 ELSE next_follow_up END,
          updated_at = now()
        WHERE id = $1`,
      [id, d.kind, 'nextFollowUp' in d, d.nextFollowUp ?? null]);
    return getLead(id, c);
  });
}

export async function createQuote(leadId, d, userId) {
  return withTransaction(async (c) => {
    const lead = await lockLead(c, leadId);
    if (['converted', 'lost'].includes(lead.status)) {
      throw new HttpError(409, `This enquiry is ${lead.status}. Reopen it before quoting`);
    }
    const { rows: [plan] } = await c.query(
      'SELECT * FROM membership_plans WHERE id = $1 AND is_active', [d.planId]);
    if (!plan) throw new HttpError(404, 'Plan not found');

    const amount = d.amount ?? plan.price;
    const { rows: [q] } = await c.query(
      `INSERT INTO quotes (lead_id, plan_id, amount, valid_until, message, created_by)
       VALUES ($1,$2,$3, current_date + $4::int, $5, $6) RETURNING *`,
      [leadId, plan.id, amount, d.validDays, d.message ?? null, userId]);

    await logActivity(c, leadId, 'quote',
      `Quote ${q.quote_no}: ${plan.name} for ₹${amount}, valid until ${q.valid_until}`, userId);
    await c.query(
      `UPDATE leads SET
          status = CASE WHEN status IN ('new', 'contacted', 'trial_booked') THEN 'quoted' ELSE status END,
          next_follow_up = current_date + 3,
          updated_at = now()
        WHERE id = $1`, [leadId]);
    return q;
  });
}

export async function convertLead(leadId, d, userId) {
  return withTransaction(async (c) => {
    const lead = await lockLead(c, leadId);
    if (lead.status === 'converted') throw new HttpError(409, 'Already converted to a member');

    // Phones are stored raw on members, so compare them normalised.
    const { rows: [dup] } = await c.query(
      `SELECT member_code FROM members WHERE regexp_replace(phone, '[^\\d+]', '', 'g') = $1`,
      [lead.phone]);
    if (dup) throw new HttpError(409, `A member with this phone number already exists (${dup.member_code})`);

    let planId = d.planId;
    let amount = d.amountPaid;
    let quote = null;
    if (d.quoteId) {
      const { rows: [q] } = await c.query(
        `SELECT *, (valid_until < current_date) AS expired
           FROM quotes WHERE id = $1 AND lead_id = $2 FOR UPDATE`, [d.quoteId, leadId]);
      if (!q) throw new HttpError(404, 'Quote not found for this enquiry');
      if (q.expired) throw new HttpError(409, 'That quote has expired. Create a new one');
      quote = q;
      planId = q.plan_id;
      amount = d.amountPaid ?? q.amount;
    }
    if (!planId) throw new HttpError(400, 'Choose a plan or a quote');

    const { member, plan } = await createMember(c, {
      fullName: lead.name, phone: lead.phone, email: lead.email,
      dateOfBirth: d.dateOfBirth, gender: d.gender, emergencyContact: d.emergencyContact,
      planId, amountPaid: amount,
    }, userId);

    if (quote) await c.query(`UPDATE quotes SET status = 'accepted' WHERE id = $1`, [quote.id]);
    await c.query(
      `UPDATE leads SET status = 'converted', member_id = $2, converted_at = now(),
                        next_follow_up = NULL, updated_at = now()
        WHERE id = $1`, [leadId, member.id]);
    await logActivity(c, leadId, 'converted',
      `Became member ${member.member_code} on the ${plan.name} plan`, userId);

    return { member, lead: await getLead(leadId, c) };
  });
}

// ------------------------------------------------------------ public quote page
export async function publicQuote(token) {
  const { rows: [q] } = await query(
    `SELECT q.quote_no, q.amount, q.valid_until, q.message, q.status,
            (q.status = 'sent' AND q.valid_until < current_date) AS is_expired,
            l.name AS lead_name,
            p.name AS plan_name, p.description, p.duration_days, p.price AS list_price,
            p.court_discount_pct, p.shop_discount_pct, p.bar_discount_pct
       FROM quotes q
       JOIN leads l ON l.id = q.lead_id
       JOIN membership_plans p ON p.id = q.plan_id
      WHERE q.token = $1`, [token]);
  if (!q) throw new HttpError(404, 'Quote not found');
  return q;
}
