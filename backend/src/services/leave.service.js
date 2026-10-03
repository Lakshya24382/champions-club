import { query, withTransaction } from '../db.js';
import { HttpError } from '../utils/httpError.js';
import { getSettings } from './settings.service.js';

const PAID_TYPES = ['casual', 'sick'];
const isManager = (user) => ['owner', 'admin'].includes(user.role);

async function employeeFor(db, user, requestedId) {
  if (isManager(user) && requestedId) {
    const { rows: [e] } = await db.query('SELECT * FROM employees WHERE id = $1', [requestedId]);
    if (!e) throw new HttpError(404, 'Employee not found');
    return e;
  }
  const { rows: [e] } = await db.query('SELECT * FROM employees WHERE user_id = $1', [user.sub]);
  if (!e) {
    throw new HttpError(404, isManager(user)
      ? 'Choose an employee'
      : 'Your login is not linked to an employee profile. Ask a manager');
  }
  return e;
}

// Paid-leave days already taken (or requested) this year.
async function usedDays(db, employeeId, year, statuses, excludeId = null) {
  const { rows: [r] } = await db.query(
    `SELECT COALESCE(sum(days), 0)::int AS used FROM leave_requests
      WHERE employee_id = $1 AND leave_type IN ('casual', 'sick')
        AND status = ANY($3::text[]) AND EXTRACT(YEAR FROM start_date) = $2
        AND ($4::int IS NULL OR id <> $4)`,
    [employeeId, year, statuses, excludeId]);
  return r.used;
}

const LEAVE_SELECT = `
  SELECT l.*, e.full_name, e.job_title, d.name AS decided_by_name
    FROM leave_requests l
    JOIN employees e ON e.id = l.employee_id
    LEFT JOIN users d ON d.id = l.decided_by`;

async function getLeave(id, db = { query }) {
  const { rows: [l] } = await db.query(`${LEAVE_SELECT} WHERE l.id = $1`, [id]);
  if (!l) throw new HttpError(404, 'Leave request not found');
  return l;
}

export async function listLeave({ status = 'all', mine = false }, user) {
  const params = [];
  const where = [];
  if (status !== 'all') { params.push(status); where.push(`l.status = $${params.length}`); }
  if (mine || !isManager(user)) { params.push(user.sub); where.push(`e.user_id = $${params.length}`); }
  const { rows } = await query(
    `${LEAVE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY (l.status = 'pending') DESC, l.start_date DESC LIMIT 200`, params);
  return rows;
}

export async function balances(user) {
  const s = await getSettings();
  const { rows } = await query(
    `SELECT e.id, e.full_name, e.job_title,
            COALESCE(sum(l.days) FILTER (WHERE l.status = 'approved' AND l.leave_type IN ('casual','sick')), 0)::int AS used,
            COALESCE(sum(l.days) FILTER (WHERE l.status = 'pending'  AND l.leave_type IN ('casual','sick')), 0)::int AS pending,
            COALESCE(sum(l.days) FILTER (WHERE l.status = 'approved' AND l.leave_type = 'unpaid'), 0)::int AS unpaid_taken
       FROM employees e
       LEFT JOIN leave_requests l ON l.employee_id = e.id
            AND EXTRACT(YEAR FROM l.start_date) = EXTRACT(YEAR FROM current_date)
      WHERE e.is_active AND ($1::int IS NULL OR e.user_id = $1)
      GROUP BY e.id ORDER BY e.full_name`,
    [isManager(user) ? null : user.sub]);
  return rows.map((r) => ({
    ...r,
    allowance: s.annual_leave_days,
    remaining: s.annual_leave_days - r.used - r.pending,
  }));
}

export async function requestLeave(d, user) {
  return withTransaction(async (c) => {
    const emp = await employeeFor(c, user, d.employeeId);
    // Lock the employee so two simultaneous requests can't both pass the balance check.
    await c.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [emp.id]);

    const { rows: [r] } = await c.query(
      `SELECT ($2::date - $1::date + 1) AS days,
              EXTRACT(YEAR FROM $1::date)::int AS y1,
              EXTRACT(YEAR FROM $2::date)::int AS y2,
              ($1::date >= current_date - 7) AS recent_enough`,
      [d.startDate, d.endDate]);
    if (r.days > 60) throw new HttpError(400, 'A single request can cover at most 60 days');
    if (!r.recent_enough && !isManager(user)) {
      throw new HttpError(400, 'Leave cannot start more than 7 days in the past. Ask a manager');
    }

    if (PAID_TYPES.includes(d.leaveType)) {
      if (r.y1 !== r.y2) throw new HttpError(400, 'Please split paid leave at the year end into two requests');
      const s = await getSettings(c);
      const used = await usedDays(c, emp.id, r.y1, ['approved', 'pending']);
      if (used + r.days > s.annual_leave_days) {
        throw new HttpError(409, `Only ${Math.max(s.annual_leave_days - used, 0)} paid leave day(s) left this year. Use unpaid leave for the rest`);
      }
    }

    const { rows: [l] } = await c.query(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days, reason, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [emp.id, d.leaveType, d.startDate, d.endDate, r.days, d.reason ?? null, user.sub]);
    return getLeave(l.id, c);
  });
}

export async function decideLeave(id, decision, note, user) {
  return withTransaction(async (c) => {
    const { rows: [l] } = await c.query('SELECT * FROM leave_requests WHERE id = $1 FOR UPDATE', [id]);
    if (!l) throw new HttpError(404, 'Leave request not found');
    if (l.status !== 'pending') throw new HttpError(409, `This request is already ${l.status}`);

    if (decision === 'approved' && PAID_TYPES.includes(l.leave_type)) {
      await c.query('SELECT id FROM employees WHERE id = $1 FOR UPDATE', [l.employee_id]);
      const s = await getSettings(c);
      const year = Number(String(l.start_date).slice(0, 4));
      const used = await usedDays(c, l.employee_id, year, ['approved'], id);
      if (used + l.days > s.annual_leave_days) {
        throw new HttpError(409, `Not enough paid leave left (${s.annual_leave_days - used} day(s)). Reject it or ask for unpaid leave`);
      }
    }
    await c.query(
      `UPDATE leave_requests SET status = $2, decided_by = $3, decided_at = now(), decision_note = $4
        WHERE id = $1`,
      [id, decision, user.sub, note ?? null]);
    return getLeave(id, c);
  });
}

export async function cancelLeave(id, user) {
  return withTransaction(async (c) => {
    const { rows: [l] } = await c.query(
      `SELECT l.*, e.user_id AS owner_user, (l.start_date > current_date) AS in_future
         FROM leave_requests l JOIN employees e ON e.id = l.employee_id
        WHERE l.id = $1 FOR UPDATE OF l`, [id]);
    if (!l) throw new HttpError(404, 'Leave request not found');
    if (!isManager(user) && l.owner_user !== user.sub) throw new HttpError(403, 'You can only cancel your own leave');
    const ok = l.status === 'pending' || (l.status === 'approved' && l.in_future);
    if (!ok) throw new HttpError(409, 'Only pending or upcoming approved leave can be cancelled');
    await c.query(`UPDATE leave_requests SET status = 'cancelled' WHERE id = $1`, [id]);
    return getLeave(id, c);
  });
}
