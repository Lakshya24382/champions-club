import { query } from '../db.js';
import { HttpError } from '../utils/httpError.js';
import { getSettings } from './settings.service.js';

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const DAY_MS = 86400000;

export const addDays = (s, n) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const spanDays = (a, b) =>
  Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / DAY_MS) + 1;

export const SOURCES = [
  ['courts', 'Court bookings'],
  ['membership', 'Memberships'],
  ['shop', 'Pro shop'],
  ['bar', 'Bar & cafe'],
  ['invoices', 'Business invoices'],
];
const emptyMethods = () => ({ cash: 0, card: 0, upi: 0, unrecorded: 0 });

// Every revenue source in one query: (source, day, method, amount, n).
const REVENUE_SQL = `
  SELECT 'courts' AS source, start_at::date AS day,
         COALESCE(payment_method, 'unrecorded') AS method,
         sum(price) AS amount, count(*)::int AS n
    FROM bookings
   WHERE status = 'confirmed' AND price > 0 AND start_at < now()
     AND start_at::date BETWEEN $1::date AND $2::date
   GROUP BY start_at::date, COALESCE(payment_method, 'unrecorded')
  UNION ALL
  SELECT 'membership', created_at::date, COALESCE(payment_method, 'unrecorded'),
         sum(amount), count(*)::int
    FROM membership_events
   WHERE amount > 0 AND created_at::date BETWEEN $1::date AND $2::date
   GROUP BY created_at::date, COALESCE(payment_method, 'unrecorded')
  UNION ALL
  SELECT 'shop', completed_at::date, payment_method, sum(total), count(*)::int
    FROM orders
   WHERE status = 'completed' AND completed_at::date BETWEEN $1::date AND $2::date
   GROUP BY completed_at::date, payment_method
  UNION ALL
  SELECT 'bar', created_at::date, method, sum(amount), count(DISTINCT order_id)::int
    FROM bar_payments
   WHERE created_at::date BETWEEN $1::date AND $2::date
   GROUP BY created_at::date, method
  UNION ALL
  SELECT 'invoices', p.paid_at::date, p.method, sum(p.amount), count(*)::int
    FROM invoice_payments p JOIN invoices i ON i.id = p.invoice_id
   WHERE i.kind = 'business' AND i.status <> 'void'
     AND p.paid_at::date BETWEEN $1::date AND $2::date
   GROUP BY p.paid_at::date, p.method`;

const collectRows = async (from, to) => (await query(REVENUE_SQL, [from, to])).rows;

// ---------------------------------------------------------------- what we owe (as of now)
export async function owedNow() {
  const { rows: [o] } = await query(`
    SELECT
      (SELECT COALESCE(sum(amount), 0) FROM expenses WHERE status = 'unpaid') AS bills_unpaid,
      (SELECT COALESCE(sum(amount), 0) FROM expenses WHERE status = 'unpaid' AND due_date < current_date) AS bills_overdue,
      (SELECT COALESCE(sum(ps.net_pay), 0) FROM payslips ps
         JOIN payroll_runs r ON r.id = ps.run_id WHERE r.status = 'draft') AS payroll_unpaid,
      (SELECT COALESCE(sum(i.total - COALESCE(p.paid, 0)), 0) FROM invoices i
         LEFT JOIN (SELECT invoice_id, sum(amount) AS paid FROM invoice_payments GROUP BY invoice_id) p
                ON p.invoice_id = i.id
        WHERE i.kind = 'business' AND i.status = 'issued') AS invoices_receivable,
      (SELECT COALESCE(sum(i.total - COALESCE(p.paid, 0)), 0) FROM invoices i
         LEFT JOIN (SELECT invoice_id, sum(amount) AS paid FROM invoice_payments GROUP BY invoice_id) p
                ON p.invoice_id = i.id
        WHERE i.kind = 'business' AND i.status = 'issued' AND i.due_date < current_date) AS invoices_overdue`);
  return o;
}

// ---------------------------------------------------------------- the report
export async function buildReport(from, to) {
  if (to < from) throw new HttpError(400, 'The end date is before the start date');
  const days = spanDays(from, to);
  if (days > 366) throw new HttpError(400, 'Choose a period of one year or less');

  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(days - 1));

  const [settings, rows, prevRows, inv, exp, pay, owed] = await Promise.all([
    getSettings(),
    collectRows(from, to),
    collectRows(prevFrom, prevTo),
    query(
      `SELECT COALESCE(sum(p.amount * i.tax_total / NULLIF(i.total, 0)), 0) AS tax
         FROM invoice_payments p JOIN invoices i ON i.id = p.invoice_id
        WHERE i.kind = 'business' AND i.status <> 'void'
          AND p.paid_at::date BETWEEN $1::date AND $2::date`, [from, to]),
    query(
      `SELECT category, COALESCE(sum(amount - tax_amount), 0) AS net,
              COALESCE(sum(tax_amount), 0) AS tax, COALESCE(sum(amount), 0) AS total, count(*)::int AS n
         FROM expenses WHERE expense_date BETWEEN $1::date AND $2::date
        GROUP BY category ORDER BY total DESC`, [from, to]),
    query(
      `SELECT COALESCE(sum(ps.net_pay), 0) AS cost
         FROM payslips ps JOIN payroll_runs r ON r.id = ps.run_id
        WHERE to_date(r.month || '-01', 'YYYY-MM-DD') BETWEEN $1::date AND $2::date`, [from, to]),
    owedNow(),
  ]);

  const rate = {
    courts: settings.tax_courts, membership: settings.tax_membership,
    shop: settings.tax_shop, bar: settings.tax_bar,
  };

  const sources = SOURCES.map(([key, label]) => ({
    key, label, gross: 0, tax: 0, net: 0, count: 0, by_method: emptyMethods(),
  }));
  const byKey = Object.fromEntries(sources.map((s) => [s.key, s]));
  const dailyMap = {};

  for (const r of rows) {
    const s = byKey[r.source];
    s.gross += r.amount;
    s.count += r.n;
    s.by_method[r.method] += r.amount;
    dailyMap[r.day] ??= {};
    dailyMap[r.day][r.source] = (dailyMap[r.day][r.source] ?? 0) + r.amount;
  }

  const totals = { gross: 0, tax: 0, net: 0, by_method: emptyMethods() };
  for (const s of sources) {
    s.tax = s.key === 'invoices'
      ? round2(inv.rows[0].tax)
      : round2((s.gross * rate[s.key]) / (100 + rate[s.key]));
    s.gross = round2(s.gross);
    s.net = round2(s.gross - s.tax);
    for (const m of Object.keys(s.by_method)) {
      s.by_method[m] = round2(s.by_method[m]);
      totals.by_method[m] = round2(totals.by_method[m] + s.by_method[m]);
    }
    totals.gross = round2(totals.gross + s.gross);
    totals.tax = round2(totals.tax + s.tax);
    totals.net = round2(totals.net + s.net);
  }

  const daily = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    const d = dailyMap[day] ?? {};
    const total = round2(Object.values(d).reduce((a, b) => a + b, 0));
    daily.push({ day, ...d, total });
  }

  const prevGross = round2(prevRows.reduce((a, r) => a + r.amount, 0));
  const expenses = {
    rows: exp.rows,
    net: round2(exp.rows.reduce((a, r) => a + r.net, 0)),
    tax: round2(exp.rows.reduce((a, r) => a + r.tax, 0)),
    total: round2(exp.rows.reduce((a, r) => a + r.total, 0)),
  };
  const payrollCost = round2(pay.rows[0].cost);
  const outputTax = totals.tax;

  return {
    from, to, days,
    sources, totals, daily,
    previous: {
      from: prevFrom, to: prevTo, gross: prevGross,
      change_pct: prevGross > 0 ? round2(((totals.gross - prevGross) / prevGross) * 100) : null,
    },
    expenses,
    payroll: { cost: payrollCost },
    profit: round2(totals.net - expenses.net - payrollCost),
    tax: {
      output: outputTax,
      input: expenses.tax,
      payable: round2(outputTax - expenses.tax),
      rates: rate,
    },
    owed,
    generated_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------- CSV for the accountant
const esc = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function reportToCsv(r) {
  const lines = [];
  const row = (...cells) => lines.push(cells.map(esc).join(','));

  row('Champions Club report', `${r.from} to ${r.to}`);
  row();
  row('Source', 'Transactions', 'Gross (incl GST)', 'GST', 'Net (excl GST)', 'Cash', 'Card', 'UPI', 'Not recorded');
  for (const s of r.sources) {
    row(s.label, s.count, s.gross, s.tax, s.net,
      s.by_method.cash, s.by_method.card, s.by_method.upi, s.by_method.unrecorded);
  }
  const t = r.totals;
  row('TOTAL', '', t.gross, t.tax, t.net, t.by_method.cash, t.by_method.card, t.by_method.upi, t.by_method.unrecorded);
  row();
  row('Costs');
  for (const e of r.expenses.rows) row(`Bills: ${e.category}`, e.n, e.total, e.tax, e.net);
  row('Bills total (excl input GST)', '', '', '', r.expenses.net);
  row('Payroll', '', '', '', r.payroll.cost);
  row('Estimated profit', '', '', '', r.profit);
  row();
  row('GST', 'Output (collected)', r.tax.output, 'Input (on bills)', r.tax.input, 'Estimated payable', r.tax.payable);
  row();
  row('Daily revenue (incl GST)');
  row('Date', 'Total');
  for (const d of r.daily) row(d.day, d.total);
  return lines.join('\n');
}
