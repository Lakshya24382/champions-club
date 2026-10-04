import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, ilike, lte, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  employees, enquiries, enquiryNotes, expenses, invoiceItems, invoicePayments, invoices,
  leaveRequests, membershipPlans, payslips, quotes,
} from "../db/schema.all.js";
import { env } from "../config/env.js";
import { validate } from "../middleware/validate.js";
import { requireRole } from "../middleware/auth.js";
import { httpError } from "../utils/httpError.js";
import { DAY, dayStartFromDateString, localDateString } from "../utils/time.js";
import { renderDocument } from "../utils/printDoc.js";
import { notifyCustomer } from "../services/notify.service.js";
import {
  cents, fillDays, invoicesOutstanding, liabilities, monthBounds, pendingCollections,
  periodBounds, round2, rowTotals, summarize,
} from "../services/finance.service.js";

const router = Router();
router.use(requireRole("owner", "manager"));

const idParam = z.object({ id: z.coerce.number().int().positive() });
const monthStr = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");
const paymentMethod = z.enum(["cash", "card", "upi"]);
const todayStr = () => localDateString(new Date());

// =============== Dashboard and reports ===============

router.get("/dashboard", async (_req, res) => {
  const t = periodBounds({ period: "day" });
  const w = periodBounds({ period: "week" });
  const m = periodBounds({ period: "month" });
  const [today, thisWeek, thisMonth, weOwe, outstanding, uncollected] = await Promise.all([
    summarize(db, t.from, t.to),
    summarize(db, w.from, w.to),
    summarize(db, m.from, m.to),
    liabilities(db),
    invoicesOutstanding(db),
    pendingCollections(db),
  ]);
  res.json({
    generatedAt: new Date(),
    taxRatePct: env.GST_RATE_PCT,
    today, thisWeek, thisMonth,
    weOwe,
    owedToUs: {
      invoicesOutstanding: outstanding,
      courtAndMembershipPaymentsNotRecorded: { count: uncollected.count, amount: uncollected.amount },
    },
  });
});

router.get(
  "/summary",
  validate({
    query: z.object({
      period: z.enum(["day", "week", "month"]).default("day"),
      date: z.iso.date().optional(),
      from: z.iso.date().optional(),
      to: z.iso.date().optional(),
      daily: z.enum(["true", "false"]).default("false"),
    }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    if (Boolean(q.from) !== Boolean(q.to)) throw httpError(400, "Provide both from and to");
    const { from, to } = periodBounds(q);
    const days = Math.round((to - from) / DAY);
    if (q.daily === "true" && days > 92) throw httpError(400, "Daily breakdown is limited to 92 days");
    res.json(await summarize(db, from, to, { withDaily: q.daily === "true" }));
  }
);

router.get("/reports/tax", validate({ query: z.object({ month: monthStr }) }), async (req, res) => {
  const { month } = req.valid.query;
  const { from, to } = monthBounds(month);
  const s = await summarize(db, from, to);
  const bySource = ["courts", "memberships", "shop", "bar", "corporate"].map((source) => ({
    source, gross: s.revenue[source], taxable: round2(s.revenue[source] - s.tax[source]), tax: s.tax[source],
  }));
  res.json({
    month,
    ratePct: env.GST_RATE_PCT,
    bySource,
    total: { gross: s.revenue.total, taxable: s.netOfTax, tax: s.tax.total },
    note: "Estimate: counter/online prices are treated as GST-inclusive, invoices use their own GST. Confirm rates with your accountant.",
  });
});

router.get(
  "/reports/export",
  validate({ query: z.object({ from: z.iso.date(), to: z.iso.date() }) }),
  async (req, res) => {
    const { from, to } = periodBounds(req.valid.query);
    if (Math.round((to - from) / DAY) > 366) throw httpError(400, "Export is limited to 366 days");
    const { dailyRevenue } = await import("../services/finance.service.js");
    const rows = fillDays(await dailyRevenue(db, from, to), from, to).map(rowTotals);
    const csv = [
      "date,courts,memberships,shop,bar,corporate,total_incl_tax,tax,net_of_tax",
      ...rows.map((r) => [r.date, r.courts, r.memberships, r.shop, r.bar, r.corporate, r.total, r.tax, r.net].map((v) => (typeof v === "number" ? v.toFixed(2) : v)).join(",")),
    ].join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="revenue_${req.valid.query.from}_${req.valid.query.to}.csv"`);
    res.send(csv);
  }
);

// =============== Invoices ===============

async function loadInvoice(exec, id) {
  const [inv] = await exec.select().from(invoices).where(eq(invoices.id, id));
  if (!inv) throw httpError(404, "Invoice not found");
  const items = await exec.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(invoiceItems.id);
  const payments = await exec.select().from(invoicePayments).where(eq(invoicePayments.invoiceId, id)).orderBy(invoicePayments.id);
  return {
    ...inv, items, payments,
    balance: round2(inv.total - inv.amountPaid),
    overdue: ["issued", "partially_paid"].includes(inv.status) && inv.dueDate < todayStr(),
  };
}

async function createInvoice(tx, d, userId) {
  const items = d.items.map((i) => ({ ...i, lineTotal: round2(i.quantity * i.unitPrice) }));
  const subtotal = round2(items.reduce((s, i) => s + i.lineTotal, 0));
  const discountAmount = round2((subtotal * d.discountPct) / 100);
  const taxable = round2(subtotal - discountAmount);
  const taxRatePct = d.taxRatePct ?? env.GST_RATE_PCT;
  const taxAmount = round2((taxable * taxRatePct) / 100);
  const total = round2(taxable + taxAmount);

  const [inv] = await tx.insert(invoices).values({
    invoiceNumber: `TMP-${randomUUID().slice(0, 12)}`,
    quoteId: d.quoteId ?? null, enquiryId: d.enquiryId ?? null,
    clientName: d.clientName, clientCompany: d.clientCompany ?? null, clientEmail: d.clientEmail?.toLowerCase() ?? null,
    clientPhone: d.clientPhone ?? null, clientGstin: d.clientGstin ?? null,
    dueDate: localDateString(new Date(Date.now() + d.dueDays * DAY)),
    subtotal, discountPct: d.discountPct, discountAmount, taxRatePct, taxAmount, total,
    notes: d.notes ?? null, createdBy: userId,
  }).returning();

  const invoiceNumber = `INV-${String(inv.id).padStart(6, "0")}`;
  await tx.update(invoices).set({ invoiceNumber }).where(eq(invoices.id, inv.id));
  await tx.insert(invoiceItems).values(items.map((i) => ({ ...i, invoiceId: inv.id })));

  if (d.clientEmail || d.clientPhone) {
    await notifyCustomer(tx, {
      email: d.clientEmail, phone: d.clientPhone,
      subject: `Invoice ${invoiceNumber} from ${env.CLUB_NAME}`,
      body: `Hi ${d.clientName},\n\nInvoice ${invoiceNumber}\nSubtotal: INR ${subtotal}\nDiscount (${d.discountPct}%): -INR ${discountAmount}\nGST (${taxRatePct}%): INR ${taxAmount}\nTotal: INR ${total}\nDue by: ${localDateString(new Date(Date.now() + d.dueDays * DAY))}`,
      relatedType: "invoice", relatedId: inv.id,
    });
  }
  return inv.id;
}

const invoiceBody = z.object({
  clientName: z.string().trim().min(2).max(150),
  clientCompany: z.string().trim().max(150).optional(),
  clientEmail: z.email().optional(),
  clientPhone: z.string().trim().regex(/^\+?[0-9]{10,13}$/, "Invalid phone number").optional(),
  clientGstin: z.string().trim().toUpperCase().regex(/^[0-9A-Z]{15}$/, "GSTIN must be 15 characters").optional(),
  enquiryId: z.number().int().positive().optional(),
  items: z.array(z.object({
    description: z.string().trim().min(2).max(200),
    quantity: z.number().int().min(1).max(100000),
    unitPrice: z.number().positive().max(10_000_000),
  })).min(1).max(30),
  discountPct: z.number().int().min(0).max(30).default(0),
  taxRatePct: z.number().min(0).max(28).optional(),
  dueDays: z.number().int().min(1).max(90).default(15),
  notes: z.string().trim().max(500).optional(),
});

router.post("/invoices", validate({ body: invoiceBody }), async (req, res) => {
  const out = await db.transaction(async (tx) => loadInvoice(tx, await createInvoice(tx, req.valid.body, req.user.id)));
  res.status(201).json(out);
});

// one-click invoice from a Phase 5 quote
router.post(
  "/invoices/from-quote/:id",
  validate({ params: idParam, body: z.object({ dueDays: z.number().int().min(1).max(90).default(15), clientGstin: invoiceBody.shape.clientGstin }) }),
  async (req, res) => {
    const { id } = req.valid.params;
    const out = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ q: quotes, plan: membershipPlans.name, e: enquiries })
        .from(quotes)
        .innerJoin(membershipPlans, eq(quotes.planId, membershipPlans.id))
        .innerJoin(enquiries, eq(quotes.enquiryId, enquiries.id))
        .where(eq(quotes.id, id));
      if (!row) throw httpError(404, "Quote not found");
      const [dup] = await tx.select({ n: invoices.invoiceNumber }).from(invoices).where(eq(invoices.quoteId, id));
      if (dup) throw httpError(409, `Quote already invoiced (${dup.n})`);

      const { q, plan, e } = row;
      const invId = await createInvoice(tx, {
        quoteId: q.id, enquiryId: e.id,
        clientName: e.name, clientCompany: e.companyName ?? undefined, clientEmail: e.email ?? undefined, clientPhone: e.phone,
        clientGstin: req.valid.body.clientGstin,
        items: [{
          description: `${plan} membership (${q.memberCount} member(s) x ${q.durationMonths} month(s))`,
          quantity: q.memberCount * q.durationMonths, unitPrice: q.unitPrice,
        }],
        discountPct: q.discountPct, dueDays: req.valid.body.dueDays, notes: `Per quote ${q.quoteNumber}`,
      }, req.user.id);

      const inv = await loadInvoice(tx, invId);
      await tx.insert(enquiryNotes).values({ enquiryId: e.id, authorId: req.user.id, kind: "system", body: `Invoice ${inv.invoiceNumber} issued (INR ${inv.total})` });
      return inv;
    });
    res.status(201).json(out);
  }
);

router.get(
  "/invoices",
  validate({
    query: z.object({
      status: z.enum(["issued", "partially_paid", "paid", "void"]).optional(),
      overdue: z.enum(["true"]).optional(),
      q: z.string().trim().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    const rows = await db.select().from(invoices)
      .where(and(
        q.status ? eq(invoices.status, q.status) : undefined,
        q.overdue ? and(sql`${invoices.status} in ('issued', 'partially_paid')`, sql`${invoices.dueDate} < ${todayStr()}`) : undefined,
        q.q ? or(ilike(invoices.clientName, `%${q.q}%`), ilike(invoices.clientCompany, `%${q.q}%`), ilike(invoices.invoiceNumber, `%${q.q}%`)) : undefined
      ))
      .orderBy(desc(invoices.id)).limit(q.limit);
    res.json(rows.map((r) => ({
      ...r, balance: round2(r.total - r.amountPaid),
      overdue: ["issued", "partially_paid"].includes(r.status) && r.dueDate < todayStr(),
    })));
  }
);

router.get("/invoices/:id", validate({ params: idParam }), async (req, res) => {
  res.json(await loadInvoice(db, req.valid.params.id));
});

router.get("/invoices/:id/print", validate({ params: idParam }), async (req, res) => {
  const inv = await loadInvoice(db, req.valid.params.id);
  res.type("html").send(renderDocument({
    title: "Tax Invoice", number: inv.invoiceNumber, date: localDateString(inv.createdAt), dueDate: inv.dueDate, status: inv.status,
    billTo: { name: inv.clientName, company: inv.clientCompany, gstin: inv.clientGstin, contact: [inv.clientEmail, inv.clientPhone].filter(Boolean).join(" | ") },
    items: inv.items, subtotal: inv.subtotal, discountPct: inv.discountPct, discountAmount: inv.discountAmount,
    taxRatePct: inv.taxRatePct, taxAmount: inv.taxAmount, total: inv.total, amountPaid: inv.amountPaid, notes: inv.notes,
  }));
});

router.post(
  "/invoices/:id/payments",
  validate({
    params: idParam,
    body: z.object({ amount: z.number().positive(), method: paymentMethod, reference: z.string().trim().max(100).optional() }),
  }),
  async (req, res) => {
    const { id } = req.valid.params;
    const { amount, method, reference } = req.valid.body;

    const out = await db.transaction(async (tx) => {
      const [inv] = await tx.select().from(invoices).where(eq(invoices.id, id)).for("update");
      if (!inv) throw httpError(404, "Invoice not found");
      if (inv.status === "void") throw httpError(409, "Invoice is void");
      if (inv.status === "paid") throw httpError(409, "Invoice is already fully paid");

      const balance = cents(inv.total) - cents(inv.amountPaid);
      if (cents(amount) > balance) throw httpError(400, `Amount exceeds the balance of ${(balance / 100).toFixed(2)}`);

      await tx.insert(invoicePayments).values({ invoiceId: id, amount, method, reference, receivedBy: req.user.id });
      const paid = round2(inv.amountPaid + amount);
      await tx.update(invoices).set({ amountPaid: paid, status: cents(amount) === balance ? "paid" : "partially_paid" }).where(eq(invoices.id, id));

      if (inv.clientEmail || inv.clientPhone) {
        await notifyCustomer(tx, {
          email: inv.clientEmail, phone: inv.clientPhone,
          subject: `Payment received for ${inv.invoiceNumber}`,
          body: `We received INR ${amount} (${method}) for invoice ${inv.invoiceNumber}. Balance: INR ${round2(inv.total - paid)}.`,
          relatedType: "invoice", relatedId: id,
        });
      }
      return loadInvoice(tx, id);
    });
    res.status(201).json(out);
  }
);

router.post(
  "/invoices/:id/void",
  validate({ params: idParam, body: z.object({ reason: z.string().trim().min(3).max(255) }) }),
  async (req, res) => {
    const { id } = req.valid.params;
    const [row] = await db.update(invoices).set({ status: "void", voidReason: req.valid.body.reason })
      .where(and(eq(invoices.id, id), eq(invoices.status, "issued"), eq(invoices.amountPaid, 0))).returning();
    if (!row) throw httpError(409, "Only an unpaid invoice with no payments can be voided");
    res.json(await loadInvoice(db, id));
  }
);

// =============== Expenses (bills we owe) ===============

router.post(
  "/expenses",
  validate({
    body: z.object({
      category: z.enum(["rent", "utilities", "supplies", "maintenance", "marketing", "other"]),
      description: z.string().trim().min(2).max(200),
      payee: z.string().trim().max(120).optional(),
      amount: z.number().positive().max(100_000_000),
      incurredOn: z.iso.date().optional(),
      dueDate: z.iso.date().optional(),
      paidNow: paymentMethod.optional(),
    }),
  }),
  async (req, res) => {
    const { paidNow, ...b } = req.valid.body;
    const [row] = await db.insert(expenses).values({
      ...b, incurredOn: b.incurredOn ?? todayStr(), createdBy: req.user.id,
      paidAt: paidNow ? new Date() : null, paidMethod: paidNow ?? null,
    }).returning();
    res.status(201).json(row);
  }
);

router.get(
  "/expenses",
  validate({
    query: z.object({
      status: z.enum(["paid", "unpaid"]).optional(),
      category: z.enum(["rent", "utilities", "supplies", "maintenance", "marketing", "other"]).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    const rows = await db.select().from(expenses)
      .where(and(
        q.status === "paid" ? sql`${expenses.paidAt} is not null` : undefined,
        q.status === "unpaid" ? sql`${expenses.paidAt} is null` : undefined,
        q.category ? eq(expenses.category, q.category) : undefined
      ))
      .orderBy(desc(expenses.incurredOn), desc(expenses.id)).limit(q.limit);
    res.json(rows.map((r) => ({ ...r, overdue: !r.paidAt && Boolean(r.dueDate) && r.dueDate < todayStr() })));
  }
);

router.post("/expenses/:id/pay", validate({ params: idParam, body: z.object({ method: paymentMethod }) }), async (req, res) => {
  const [row] = await db.update(expenses).set({ paidAt: new Date(), paidMethod: req.valid.body.method })
    .where(and(eq(expenses.id, req.valid.params.id), sql`${expenses.paidAt} is null`)).returning();
  if (!row) throw httpError(409, "Expense not found or already paid");
  res.json(row);
});

// =============== Payroll ===============

const ymd = (s) => Date.parse(`${s}T00:00:00Z`);
const diffDays = (a, b) => Math.round((ymd(b) - ymd(a)) / DAY) + 1; // inclusive
const overlapDays = (a1, a2, b1, b2) => {
  const lo = a1 > b1 ? a1 : b1;
  const hi = a2 < b2 ? a2 : b2;
  return lo <= hi ? diffDays(lo, hi) : 0;
};

router.post("/payroll/run", validate({ body: z.object({ month: monthStr }) }), async (req, res) => {
  const { month } = req.valid.body;
  if (month >= todayStr().slice(0, 7)) throw httpError(400, "Payroll can only be run for completed months");

  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${month}-${String(daysInMonth).padStart(2, "0")}`;

  const result = await db.transaction(async (tx) => {
    const emps = await tx.select().from(employees).where(and(eq(employees.isActive, true), lte(employees.joinedOn, end)));
    const leaves = await tx.select().from(leaveRequests)
      .where(and(eq(leaveRequests.status, "approved"), eq(leaveRequests.type, "unpaid"), lte(leaveRequests.startDate, end), sql`${leaveRequests.endDate} >= ${start}`));
    const existing = await tx.select({ employeeId: payslips.employeeId }).from(payslips).where(eq(payslips.month, start));
    const done = new Set(existing.map((e) => e.employeeId));

    const created = [];
    for (const e of emps) {
      if (done.has(e.id)) continue;
      const from = e.joinedOn > start ? e.joinedOn : start;
      const daysEmployed = diffDays(from, end);
      const unpaid = leaves.filter((l) => l.employeeId === e.id).reduce((s, l) => s + overlapDays(l.startDate, l.endDate, from, end), 0);
      const earned = round2((e.monthlySalary * daysEmployed) / daysInMonth);
      const deduction = Math.min(earned, round2((e.monthlySalary / daysInMonth) * unpaid));

      const [row] = await tx.insert(payslips).values({
        employeeId: e.id, month: start, baseSalary: e.monthlySalary, daysInMonth, daysEmployed,
        unpaidLeaveDays: unpaid, deduction, bonus: 0, netPay: round2(earned - deduction), createdBy: req.user.id,
      }).onConflictDoNothing().returning();
      if (row) created.push({ employee: e.fullName, code: e.employeeCode, ...row });
    }
    return { created, skippedExisting: done.size };
  });
  res.status(201).json({ month, generated: result.created.length, skippedExisting: result.skippedExisting, payslips: result.created });
});

router.get("/payroll", validate({ query: z.object({ month: monthStr }) }), async (req, res) => {
  const rows = await db
    .select({ p: payslips, name: employees.fullName, code: employees.employeeCode, title: employees.title })
    .from(payslips).innerJoin(employees, eq(payslips.employeeId, employees.id))
    .where(eq(payslips.month, `${req.valid.query.month}-01`)).orderBy(asc(employees.employeeCode));
  const net = round2(rows.reduce((s, r) => s + r.p.netPay, 0));
  const paid = round2(rows.filter((r) => r.p.status === "paid").reduce((s, r) => s + r.p.netPay, 0));
  res.json({
    month: req.valid.query.month,
    totals: { net, paid, unpaid: round2(net - paid) },
    payslips: rows.map((r) => ({ ...r.p, employee: r.name, code: r.code, title: r.title })),
  });
});

router.patch("/payslips/:id", validate({ params: idParam, body: z.object({ bonus: z.number().min(0).max(10_000_000) }) }), async (req, res) => {
  const row = await db.transaction(async (tx) => {
    const [p] = await tx.select().from(payslips).where(eq(payslips.id, req.valid.params.id)).for("update");
    if (!p) throw httpError(404, "Payslip not found");
    if (p.status === "paid") throw httpError(409, "Payslip is already paid");
    const earned = round2((p.baseSalary * p.daysEmployed) / p.daysInMonth);
    const [u] = await tx.update(payslips)
      .set({ bonus: req.valid.body.bonus, netPay: round2(earned - p.deduction + req.valid.body.bonus) })
      .where(eq(payslips.id, p.id)).returning();
    return u;
  });
  res.json(row);
});

router.post("/payslips/:id/pay", validate({ params: idParam, body: z.object({ method: paymentMethod }) }), async (req, res) => {
  const [row] = await db.update(payslips).set({ status: "paid", paidAt: new Date(), paidMethod: req.valid.body.method })
    .where(and(eq(payslips.id, req.valid.params.id), eq(payslips.status, "unpaid"))).returning();
  if (!row) throw httpError(409, "Payslip not found or already paid");
  res.json(row);
});

export default router;
