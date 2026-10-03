import { query, withTransaction } from '../db.js';
import { HttpError } from '../utils/httpError.js';
import { getSettings } from './settings.service.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const cents = (n) => Math.round(n * 100);

const SELECT = `
  SELECT i.*, c.name AS client_name, c.gstin AS client_gstin, c.address AS client_address,
         c.email AS client_email, c.phone AS client_phone,
         m.full_name AS member_name, m.member_code,
         COALESCE(p.paid, 0) AS paid_amount,
         CASE WHEN i.status = 'issued' THEN i.total - COALESCE(p.paid, 0) ELSE 0 END AS balance,
         (i.status = 'issued' AND i.due_date < current_date) AS is_overdue
    FROM invoices i
    LEFT JOIN clients c ON c.id = i.client_id
    LEFT JOIN members m ON m.id = i.member_id
    LEFT JOIN (SELECT invoice_id, sum(amount) AS paid FROM invoice_payments GROUP BY invoice_id) p
           ON p.invoice_id = i.id`;

// ---------------------------------------------------------------- clients
export async function listClients() {
  const { rows } = await query(
    `SELECT c.*, (SELECT count(*)::int FROM invoices i WHERE i.client_id = c.id) AS invoice_count
       FROM clients c WHERE c.is_active ORDER BY c.name`);
  return rows;
}

export async function createClient(d) {
  const { rows: [c] } = await query(
    `INSERT INTO clients (name, contact_person, phone, email, gstin, address)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [d.name, d.contactPerson ?? null, d.phone ?? null, d.email ?? null, d.gstin ?? null, d.address ?? null]);
  return c;
}

// ---------------------------------------------------------------- reading
export async function listInvoices({ status = 'open', kind = '', clientId = null, search = '' }) {
  const params = [];
  const where = [];
  if (status === 'open') where.push(`i.status = 'issued'`);
  else if (status === 'overdue') where.push(`i.status = 'issued' AND i.due_date < current_date`);
  else if (status !== 'all') { params.push(status); where.push(`i.status = $${params.length}`); }
  if (kind) { params.push(kind); where.push(`i.kind = $${params.length}`); }
  if (clientId) { params.push(clientId); where.push(`i.client_id = $${params.length}`); }
  if (search) {
    params.push(`%${search}%`);
    const n = params.length;
    where.push(`(i.invoice_no ILIKE $${n} OR c.name ILIKE $${n} OR m.full_name ILIKE $${n})`);
  }
  const { rows } = await query(
    `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY i.created_at DESC LIMIT 200`, params);
  return rows;
}

export async function getInvoice(id, db = { query }) {
  const { rows: [inv] } = await db.query(`${SELECT} WHERE i.id = $1`, [id]);
  if (!inv) throw new HttpError(404, 'Invoice not found');
  const { rows: items } = await db.query(
    'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id', [id]);
  const { rows: payments } = await db.query(
    `SELECT p.*, u.name AS by_name FROM invoice_payments p
       LEFT JOIN users u ON u.id = p.created_by
      WHERE p.invoice_id = $1 ORDER BY p.paid_at, p.id`, [id]);
  const s = await getSettings(db);
  return {
    ...inv, items, payments,
    club: { name: s.club_name, gstin: s.club_gstin, address: s.club_address },
  };
}

// ---------------------------------------------------------------- creating
export async function createBusinessInvoice(d, userId) {
  return withTransaction(async (c) => {
    const { rows: [client] } = await c.query(
      'SELECT id FROM clients WHERE id = $1 AND is_active', [d.clientId]);
    if (!client) throw new HttpError(404, 'Client not found');

    const lines = d.items.map((it) => {
      const sub = round2(it.qty * it.unitPrice);
      return { ...it, sub, tax: round2((sub * it.taxPct) / 100) };
    });
    const subtotal = round2(lines.reduce((a, l) => a + l.sub, 0));
    const taxTotal = round2(lines.reduce((a, l) => a + l.tax, 0));
    const total = round2(subtotal + taxTotal);
    if (total <= 0) throw new HttpError(400, 'The invoice total must be more than zero');

    const { rows: [inv] } = await c.query(
      `INSERT INTO invoices (kind, client_id, due_date, subtotal, tax_total, total, notes, created_by)
       VALUES ('business', $1, current_date + $2::int, $3, $4, $5, $6, $7) RETURNING id`,
      [d.clientId, d.dueDays, subtotal, taxTotal, total, d.notes ?? null, userId]);
    for (const l of lines) {
      await c.query(
        `INSERT INTO invoice_items (invoice_id, description, qty, unit_price, tax_pct, line_subtotal, line_tax)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [inv.id, l.description, l.qty, l.unitPrice, l.taxPct, l.sub, l.tax]);
    }
    return getInvoice(inv.id, c);
  });
}

// A tax document for a membership payment that is already recorded. Adds NO revenue.
export async function createMembershipInvoice(eventId, userId) {
  try {
    return await withTransaction(async (c) => {
      const { rows: [e] } = await c.query(
        `SELECT e.*, p.name AS plan_name FROM membership_events e
           JOIN membership_plans p ON p.id = e.plan_id WHERE e.id = $1`, [eventId]);
      if (!e) throw new HttpError(404, 'Membership entry not found');
      if (e.amount <= 0) throw new HttpError(400, 'That entry has no payment amount');

      const s = await getSettings(c);
      const rate = s.tax_membership;
      const taxable = round2((e.amount * 100) / (100 + rate));
      const tax = round2(e.amount - taxable);

      const { rows: [inv] } = await c.query(
        `INSERT INTO invoices
           (kind, member_id, membership_event_id, due_date, status, subtotal, tax_total, total, created_by)
         VALUES ('membership', $1, $2, current_date, 'paid', $3, $4, $5, $6) RETURNING id`,
        [e.member_id, e.id, taxable, tax, e.amount, userId]);
      await c.query(
        `INSERT INTO invoice_items (invoice_id, description, qty, unit_price, tax_pct, line_subtotal, line_tax)
         VALUES ($1,$2,1,$3,$4,$3,$5)`,
        [inv.id, `${e.plan_name} membership (${e.starts_on} to ${e.ends_on})`, taxable, rate, tax]);
      return getInvoice(inv.id, c);
    });
  } catch (err) {
    if (err.code === '23505') throw new HttpError(409, 'An invoice already exists for this membership payment');
    throw err;
  }
}

// ---------------------------------------------------------------- paying / voiding
export async function recordPayment(id, d, userId) {
  return withTransaction(async (c) => {
    const { rows: [inv] } = await c.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [id]);
    if (!inv) throw new HttpError(404, 'Invoice not found');
    if (inv.kind !== 'business') throw new HttpError(400, 'Membership invoices are already paid');
    if (inv.status !== 'issued') throw new HttpError(409, `This invoice is already ${inv.status}`);

    const { rows: [{ paid }] } = await c.query(
      'SELECT COALESCE(sum(amount), 0) AS paid FROM invoice_payments WHERE invoice_id = $1', [id]);
    const outstanding = cents(inv.total) - cents(paid);
    if (cents(d.amount) > outstanding) {
      throw new HttpError(400, `Only ${outstanding / 100} is outstanding on this invoice`);
    }

    await c.query(
      `INSERT INTO invoice_payments (invoice_id, method, amount, note, created_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, d.method, d.amount, d.note ?? null, userId]);
    if (cents(d.amount) === outstanding) {
      await c.query(`UPDATE invoices SET status = 'paid' WHERE id = $1`, [id]);
    }
    return getInvoice(id, c);
  });
}

export async function voidInvoice(id, reason) {
  return withTransaction(async (c) => {
    const { rows: [inv] } = await c.query('SELECT * FROM invoices WHERE id = $1 FOR UPDATE', [id]);
    if (!inv) throw new HttpError(404, 'Invoice not found');
    if (inv.status === 'void') throw new HttpError(409, 'Already void');
    const { rows: [{ n }] } = await c.query(
      'SELECT count(*)::int AS n FROM invoice_payments WHERE invoice_id = $1', [id]);
    if (n > 0) throw new HttpError(409, 'This invoice has payments recorded, so it cannot be voided');
    await c.query(
      `UPDATE invoices SET status = 'void', void_reason = $2, voided_at = now() WHERE id = $1`, [id, reason]);
    return getInvoice(id, c);
  });
}
