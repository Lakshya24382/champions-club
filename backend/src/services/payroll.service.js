import { query, withTransaction } from '../db.js';
import { HttpError } from '../utils/httpError.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// ---------------------------------------------------------------- employees
async function resolveLogin(email) {
  if (!email) return null;
  const { rows: [u] } = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (!u) throw new HttpError(404, `No staff login found for ${email}`);
  return u.id;
}

export async function listEmployees() {
  const { rows } = await query(
    `SELECT e.*, u.email AS login_email FROM employees e
       LEFT JOIN users u ON u.id = e.user_id
      ORDER BY e.is_active DESC, e.full_name`);
  return rows;
}

export async function createEmployee(d) {
  const userId = await resolveLogin(d.loginEmail);
  const { rows: [e] } = await query(
    `INSERT INTO employees (user_id, full_name, phone, job_title, monthly_salary, joined_on)
     VALUES ($1,$2,$3,$4,$5, COALESCE($6::date, current_date)) RETURNING *`,
    [userId, d.fullName, d.phone ?? null, d.jobTitle, d.monthlySalary, d.joinedOn ?? null]);
  return e;
}

export async function updateEmployee(id, d) {
  const hasLogin = 'loginEmail' in d;
  const userId = hasLogin ? await resolveLogin(d.loginEmail) : null;
  const { rows: [e] } = await query(
    `UPDATE employees SET
        full_name      = COALESCE($2, full_name),
        phone          = CASE WHEN $3::boolean THEN $4 ELSE phone END,
        job_title      = COALESCE($5, job_title),
        monthly_salary = COALESCE($6, monthly_salary),
        user_id        = CASE WHEN $7::boolean THEN $8 ELSE user_id END,
        is_active      = COALESCE($9::boolean, is_active),
        left_on        = CASE WHEN $9::boolean = false THEN COALESCE(left_on, current_date)
                              WHEN $9::boolean = true  THEN NULL
                              ELSE left_on END
      WHERE id = $1 RETURNING *`,
    [id, d.fullName ?? null, 'phone' in d, d.phone ?? null, d.jobTitle ?? null,
     d.monthlySalary ?? null, hasLogin, userId, d.isActive ?? null]);
  if (!e) throw new HttpError(404, 'Employee not found');
  return e;
}

// ---------------------------------------------------------------- payroll runs
export async function listRuns() {
  const { rows } = await query(
    `SELECT r.*, count(ps.id)::int AS employees, COALESCE(sum(ps.net_pay), 0) AS total
       FROM payroll_runs r LEFT JOIN payslips ps ON ps.run_id = r.id
      GROUP BY r.id ORDER BY r.month DESC`);
  return rows;
}

export async function getRun(id, db = { query }) {
  const { rows: [run] } = await db.query('SELECT * FROM payroll_runs WHERE id = $1', [id]);
  if (!run) throw new HttpError(404, 'Payroll run not found');
  const { rows: payslips } = await db.query(
    `SELECT ps.*, e.full_name, e.job_title FROM payslips ps
       JOIN employees e ON e.id = ps.employee_id
      WHERE ps.run_id = $1 ORDER BY e.full_name`, [id]);
  const total = round2(payslips.reduce((a, p) => a + p.net_pay, 0));
  return { ...run, payslips, total };
}

export async function generatePayroll(month, userId) {
  return withTransaction(async (c) => {
    const monthStart = `${month}-01`;
    const { rows: [chk] } = await c.query(
      `SELECT ($1::date <= date_trunc('month', current_date)::date) AS ok`, [monthStart]);
    if (!chk.ok) throw new HttpError(400, 'You cannot run payroll for a future month');

    let run;
    try {
      ({ rows: [run] } = await c.query(
        'INSERT INTO payroll_runs (month, created_by) VALUES ($1,$2) RETURNING *', [month, userId]));
    } catch (err) {
      if (err.code === '23505') {
        throw new HttpError(409, `Payroll for ${month} already exists. Delete the draft to generate it again`);
      }
      throw err;
    }

    await c.query(
      `INSERT INTO payslips (run_id, employee_id, base_salary, unpaid_leave_days, leave_deduction, net_pay)
       SELECT $1::int, e.id, calc.base, calc.ul, calc.ded, GREATEST(calc.base - calc.ded, 0)
         FROM employees e
         CROSS JOIN LATERAL (
           SELECT $2::date AS ms,
                  (($2::date + interval '1 month') - interval '1 day')::date AS me
         ) m
         CROSS JOIN LATERAL (
           SELECT GREATEST(e.joined_on, m.ms) AS s,
                  LEAST(COALESCE(e.left_on, m.me), m.me) AS f,
                  (m.me - m.ms + 1) AS dim
         ) w
         CROSS JOIN LATERAL (
           SELECT COALESCE((
             SELECT sum(GREATEST(0, LEAST(l.end_date, w.f) - GREATEST(l.start_date, w.s) + 1))
               FROM leave_requests l
              WHERE l.employee_id = e.id AND l.status = 'approved' AND l.leave_type = 'unpaid'
                AND l.start_date <= w.f AND l.end_date >= w.s), 0)::int AS ul
         ) u
         CROSS JOIN LATERAL (
           SELECT round(e.monthly_salary * (w.f - w.s + 1) / w.dim, 2) AS base,
                  u.ul AS ul,
                  round(e.monthly_salary / w.dim * u.ul, 2) AS ded
         ) calc
        WHERE e.joined_on <= m.me AND (e.left_on IS NULL OR e.left_on >= m.ms)`,
      [run.id, monthStart]);

    const { rows: [{ n }] } = await c.query(
      'SELECT count(*)::int AS n FROM payslips WHERE run_id = $1', [run.id]);
    if (n === 0) throw new HttpError(400, 'No employees to pay for that month');
    return getRun(run.id, c);
  });
}

export async function updatePayslip(id, d) {
  return withTransaction(async (c) => {
    const { rows: [ps] } = await c.query(
      `SELECT ps.*, r.status AS run_status FROM payslips ps
         JOIN payroll_runs r ON r.id = ps.run_id
        WHERE ps.id = $1 FOR UPDATE OF ps`, [id]);
    if (!ps) throw new HttpError(404, 'Payslip not found');
    if (ps.run_status !== 'draft') throw new HttpError(409, 'This payroll has been paid and is locked');

    const bonus = d.bonus ?? ps.bonus;
    const other = d.otherDeduction ?? ps.other_deduction;
    const net = Math.max(0, round2(ps.base_salary - ps.leave_deduction + bonus - other));
    await c.query(
      `UPDATE payslips SET bonus = $2, other_deduction = $3, net_pay = $4, note = $5 WHERE id = $1`,
      [id, bonus, other, net, d.note !== undefined ? d.note : ps.note]);
    return getRun(ps.run_id, c);
  });
}

export async function deleteRun(id) {
  const { rows: [r] } = await query(
    `DELETE FROM payroll_runs WHERE id = $1 AND status = 'draft' RETURNING id`, [id]);
  if (!r) throw new HttpError(409, 'Only a draft payroll can be deleted');
  return { deleted: true };
}

export async function payRun(id, method) {
  return withTransaction(async (c) => {
    const { rows: [run] } = await c.query('SELECT * FROM payroll_runs WHERE id = $1 FOR UPDATE', [id]);
    if (!run) throw new HttpError(404, 'Payroll run not found');
    if (run.status === 'paid') throw new HttpError(409, 'This payroll is already paid');
    await c.query(
      `UPDATE payroll_runs SET status = 'paid', paid_at = now(), payment_method = $2 WHERE id = $1`,
      [id, method]);
    return getRun(id, c);
  });
}
