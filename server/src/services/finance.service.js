import { and, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import {
  barPayments, barTabs, bookings, collections, courts, expenses, invoicePayments, invoices,
  members, membershipHistory, membershipPlans, orders, payslips, socialParticipants,
} from "../db/schema.all.js";
import { env } from "../config/env.js";
import { httpError } from "../utils/httpError.js";
import { DAY, dayStartFromDateString, localDateString, localDayBounds, localDayOfWeek } from "../utils/time.js";

export const round2 = (n) => Number(Number(n).toFixed(2));
export const cents = (n) => Math.round(n * 100);
// POS prices include GST, so the tax inside an amount is gross * r / (100 + r)
export const taxInside = (gross, rate = env.GST_RATE_PCT) => round2((gross * rate) / (100 + rate));
export const f8 = (col) => sql`coalesce(sum(${col}), 0)::float8`;

// local calendar day (club time) of a timestamptz column
const dayOf = (col) =>
  sql`to_char((${col} at time zone 'UTC') + ${sql.raw(String(env.CLUB_UTC_OFFSET_MINUTES))} * interval '1 minute', 'YYYY-MM-DD')`;

// ---------- Periods ----------
export function periodBounds({ period = "day", date, from, to }) {
  if (from && to) {
    const s = dayStartFromDateString(from);
    const e = new Date(dayStartFromDateString(to).getTime() + DAY);
    if (e <= s) throw httpError(400, "'to' must not be before 'from'");
    return { from: s, to: e };
  }
  const base = date ? dayStartFromDateString(date) : localDayBounds(new Date()).start;
  if (period === "day") return { from: base, to: new Date(base.getTime() + DAY) };
  if (period === "week") {
    const offset = (localDayOfWeek(base) + 6) % 7; // Monday = 0
    const s = new Date(base.getTime() - offset * DAY);
    return { from: s, to: new Date(s.getTime() + 7 * DAY) };
  }
  const [y, m] = localDateString(base).split("-").map(Number);
  return monthBounds(`${y}-${String(m).padStart(2, "0")}`);
}

export function monthBounds(month) {
  const [y, m] = month.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return {
    from: dayStartFromDateString(`${month}-01`),
    to: dayStartFromDateString(`${ny}-${String(nm).padStart(2, "0")}-01`),
  };
}

// ---------- Revenue by local day and source ----------
export async function dailyRevenue(exec, from, to) {
  const now = new Date();
  const upto = to < now ? to : now; // court sessions count once played
  const days = new Map();
  const row = (d) => {
    if (!days.has(d)) days.set(d, { date: d, courts: 0, memberships: 0, shop: 0, bar: 0, corporate: 0, corporateTax: 0 });
    return days.get(d);
  };

  if (upto > from) {
    const d1 = dayOf(bookings.startsAt);
    for (const r of await exec.select({ d: d1, v: f8(bookings.price) }).from(bookings)
      .where(and(eq(bookings.kind, "regular"), eq(bookings.status, "confirmed"), gte(bookings.startsAt, from), lt(bookings.startsAt, upto)))
      .groupBy(d1)) row(r.d).courts += r.v;

    for (const r of await exec.select({ d: d1, v: f8(socialParticipants.price) }).from(socialParticipants)
      .innerJoin(bookings, eq(socialParticipants.bookingId, bookings.id))
      .where(and(eq(socialParticipants.status, "confirmed"), eq(bookings.status, "confirmed"), gte(bookings.startsAt, from), lt(bookings.startsAt, upto)))
      .groupBy(d1)) row(r.d).courts += r.v;
  }

  const d2 = dayOf(membershipHistory.createdAt);
  for (const r of await exec.select({ d: d2, v: f8(membershipHistory.amountPaid) }).from(membershipHistory)
    .where(and(gte(membershipHistory.createdAt, from), lt(membershipHistory.createdAt, to))).groupBy(d2)) row(r.d).memberships += r.v;

  const d3 = dayOf(orders.completedAt);
  for (const r of await exec.select({ d: d3, v: f8(orders.total) }).from(orders)
    .where(and(eq(orders.status, "completed"), gte(orders.completedAt, from), lt(orders.completedAt, to))).groupBy(d3)) row(r.d).shop += r.v;

  const d4 = dayOf(barTabs.closedAt);
  for (const r of await exec.select({ d: d4, v: f8(barTabs.total) }).from(barTabs)
    .where(and(eq(barTabs.status, "paid"), gte(barTabs.closedAt, from), lt(barTabs.closedAt, to))).groupBy(d4)) row(r.d).bar += r.v;

  const d5 = dayOf(invoices.createdAt);
  for (const r of await exec.select({ d: d5, v: f8(invoices.total), t: f8(invoices.taxAmount) }).from(invoices)
    .where(and(sql`${invoices.status} <> 'void'`, gte(invoices.createdAt, from), lt(invoices.createdAt, to))).groupBy(d5)) {
    row(r.d).corporate += r.v;
    row(r.d).corporateTax += r.t;
  }

  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function fillDays(rows, from, to) {
  const m = new Map(rows.map((r) => [r.date, r]));
  const out = [];
  for (let t = from.getTime(); t < to.getTime(); t += DAY) {
    const d = localDateString(new Date(t));
    out.push(m.get(d) ?? { date: d, courts: 0, memberships: 0, shop: 0, bar: 0, corporate: 0, corporateTax: 0 });
  }
  return out;
}

export function rowTotals(r) {
  const inclusive = r.courts + r.memberships + r.shop + r.bar;
  const total = round2(inclusive + r.corporate);
  const tax = round2(taxInside(inclusive) + r.corporateTax);
  return { ...r, total, tax, net: round2(total - tax) };
}

// ---------- Money actually received (by method, recorded payments only) ----------
async function receivedBetween(exec, from, to) {
  const out = { cash: 0, card: 0, upi: 0 };
  const add = (rows) => { for (const r of rows) out[r.method] = round2(out[r.method] + r.amount); };

  add(await exec.select({ method: orders.paymentMethod, amount: f8(orders.total) }).from(orders)
    .where(and(eq(orders.status, "completed"), isNotNull(orders.paymentMethod), gte(orders.completedAt, from), lt(orders.completedAt, to)))
    .groupBy(orders.paymentMethod));
  add(await exec.select({ method: barPayments.method, amount: f8(barPayments.amount) }).from(barPayments)
    .where(and(gte(barPayments.createdAt, from), lt(barPayments.createdAt, to))).groupBy(barPayments.method));
  add(await exec.select({ method: invoicePayments.method, amount: f8(invoicePayments.amount) }).from(invoicePayments)
    .where(and(gte(invoicePayments.paidAt, from), lt(invoicePayments.paidAt, to))).groupBy(invoicePayments.method));
  add(await exec.select({ method: collections.method, amount: f8(collections.amount) }).from(collections)
    .where(and(gte(collections.createdAt, from), lt(collections.createdAt, to))).groupBy(collections.method));

  return { ...out, total: round2(out.cash + out.card + out.upi) };
}

// ---------- Costs: expenses by incurred date, payroll by payslip month ----------
async function costsBetween(exec, from, to) {
  const f = localDateString(from);
  const t = localDateString(to);
  const [{ v: exp }] = await exec.select({ v: f8(expenses.amount) }).from(expenses)
    .where(and(gte(expenses.incurredOn, f), lt(expenses.incurredOn, t)));
  const [{ v: pay }] = await exec.select({ v: f8(payslips.netPay) }).from(payslips)
    .where(and(gte(payslips.month, f), lt(payslips.month, t)));
  return { expenses: round2(exp), payroll: round2(pay), total: round2(exp + pay) };
}

export async function summarize(exec, from, to, { withDaily = false } = {}) {
  const rows = await dailyRevenue(exec, from, to);
  const sum = (k) => round2(rows.reduce((s, r) => s + r[k], 0));

  const revenue = { courts: sum("courts"), memberships: sum("memberships"), shop: sum("shop"), bar: sum("bar"), corporate: sum("corporate") };
  const tax = {
    courts: taxInside(revenue.courts), memberships: taxInside(revenue.memberships),
    shop: taxInside(revenue.shop), bar: taxInside(revenue.bar), corporate: sum("corporateTax"),
  };
  const gross = round2(Object.values(revenue).reduce((a, b) => a + b, 0));
  const taxTotal = round2(Object.values(tax).reduce((a, b) => a + b, 0));
  const costs = await costsBetween(exec, from, to);

  const out = {
    range: { from: localDateString(from), to: localDateString(new Date(to.getTime() - 1)) },
    revenue: { ...revenue, total: gross },
    tax: { ...tax, total: taxTotal },
    netOfTax: round2(gross - taxTotal),
    received: await receivedBetween(exec, from, to),
    costs,
    surplus: round2(gross - taxTotal - costs.total),
  };
  if (withDaily) out.daily = fillDays(rows, from, to).map(rowTotals);
  return out;
}

// ---------- What we owe / what we are owed ----------
export async function liabilities(exec) {
  const today = localDateString(new Date());
  const [pay] = await exec.select({ n: sql`count(*)::int`, amount: f8(payslips.netPay) }).from(payslips).where(eq(payslips.status, "unpaid"));
  const [exp] = await exec
    .select({
      n: sql`count(*)::int`, amount: f8(expenses.amount),
      overdue: sql`coalesce(sum(case when ${expenses.dueDate} < ${today} then ${expenses.amount} end), 0)::float8`,
    })
    .from(expenses).where(isNull(expenses.paidAt));

  const month = monthBounds(today.slice(0, 7));
  const gst = (await summarize(exec, month.from, month.to)).tax.total;

  return {
    payrollPayable: { payslips: pay.n, amount: round2(pay.amount) },
    expensesPayable: { bills: exp.n, amount: round2(exp.amount), overdue: round2(exp.overdue) },
    gstPayableThisMonth: gst,
    total: round2(pay.amount + exp.amount + gst),
  };
}

export async function invoicesOutstanding(exec) {
  const today = localDateString(new Date());
  const [r] = await exec
    .select({
      n: sql`count(*)::int`,
      balance: sql`coalesce(sum(${invoices.total} - ${invoices.amountPaid}), 0)::float8`,
      overdue: sql`coalesce(sum(case when ${invoices.dueDate} < ${today} then ${invoices.total} - ${invoices.amountPaid} end), 0)::float8`,
    })
    .from(invoices).where(sql`${invoices.status} in ('issued', 'partially_paid')`);
  return { count: r.n, balance: round2(r.balance), overdueBalance: round2(r.overdue) };
}

// ---------- Court / membership payments the desk has not recorded yet (last 30 days to next 30) ----------
export async function pendingCollections(exec) {
  const lo = new Date(Date.now() - 30 * DAY);
  const hi = new Date(Date.now() + 30 * DAY);

  const court = await exec
    .select({ refId: bookings.id, when: bookings.startsAt, amount: bookings.price, who: sql`coalesce(${members.fullName}, ${bookings.guestName})`, what: courts.name })
    .from(bookings)
    .innerJoin(courts, eq(bookings.courtId, courts.id))
    .leftJoin(members, eq(bookings.memberId, members.id))
    .leftJoin(collections, and(eq(collections.kind, "court"), eq(collections.refId, bookings.id)))
    .where(and(eq(bookings.kind, "regular"), eq(bookings.status, "confirmed"), sql`${bookings.price} > 0`, isNull(collections.id), gte(bookings.startsAt, lo), lt(bookings.startsAt, hi)));

  const social = await exec
    .select({ refId: socialParticipants.id, when: bookings.startsAt, amount: socialParticipants.price, who: sql`coalesce(${members.fullName}, ${socialParticipants.guestName})`, what: bookings.title })
    .from(socialParticipants)
    .innerJoin(bookings, eq(socialParticipants.bookingId, bookings.id))
    .leftJoin(members, eq(socialParticipants.memberId, members.id))
    .leftJoin(collections, and(eq(collections.kind, "social"), eq(collections.refId, socialParticipants.id)))
    .where(and(eq(socialParticipants.status, "confirmed"), eq(bookings.status, "confirmed"), sql`${socialParticipants.price} > 0`, isNull(collections.id), gte(bookings.startsAt, lo), lt(bookings.startsAt, hi)));

  const membership = await exec
    .select({ refId: membershipHistory.id, when: membershipHistory.createdAt, amount: membershipHistory.amountPaid, who: members.fullName, what: membershipPlans.name })
    .from(membershipHistory)
    .innerJoin(members, eq(membershipHistory.memberId, members.id))
    .innerJoin(membershipPlans, eq(membershipHistory.planId, membershipPlans.id))
    .leftJoin(collections, and(eq(collections.kind, "membership"), eq(collections.refId, membershipHistory.id)))
    .where(and(sql`${membershipHistory.amountPaid} > 0`, isNull(collections.id), gte(membershipHistory.createdAt, lo), lt(membershipHistory.createdAt, hi)));

  const items = [
    ...court.map((r) => ({ kind: "court", ...r })),
    ...social.map((r) => ({ kind: "social", ...r })),
    ...membership.map((r) => ({ kind: "membership", ...r })),
  ].sort((a, b) => a.when - b.when);

  return { count: items.length, amount: round2(items.reduce((s, i) => s + i.amount, 0)), items };
}
