import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  barPayments, barTabItems, barTables, barTabs, members, menuItems, shifts, users,
} from "../db/schema.all.js";
import { validate } from "../middleware/validate.js";
import { requireRole } from "../middleware/auth.js";
import { httpError } from "../utils/httpError.js";
import { DAY, dayStartFromDateString, localDateString, localDayBounds } from "../utils/time.js";
import {
  cents, findBarDiscount, loadTab, round2, runningSubtotals, shapeTab, totalsOf,
} from "../services/bar.service.js";

const router = Router();
const manager = requireRole("owner", "manager");

const idParam = z.object({ id: z.coerce.number().int().positive() });
const paymentMethod = z.enum(["cash", "card", "upi"]);
const category = z.enum(["drink", "food", "snack", "dessert"]);
const station = z.enum(["bar", "kitchen"]);
const f8 = (col) => sql`coalesce(sum(${col}), 0)::float8`;

// =============== Tables ===============

router.get("/tables", async (_req, res) => {
  const tables = await db.select().from(barTables).where(eq(barTables.isActive, true)).orderBy(asc(barTables.id));
  const open = await db
    .select({ tab: barTabs, memberCode: members.memberCode })
    .from(barTabs)
    .leftJoin(members, eq(barTabs.memberId, members.id))
    .where(and(eq(barTabs.status, "open"), isNotNull(barTabs.tableId)));
  const run = await runningSubtotals(db, open.map((o) => o.tab.id));
  const byTable = new Map(open.map((o) => [o.tab.tableId, o]));

  res.json(
    tables.map((t) => {
      const o = byTable.get(t.id);
      if (!o) return { ...t, status: "free", tab: null };
      const s = shapeTab(o.tab, run.get(o.tab.id));
      return {
        ...t, status: "occupied",
        tab: {
          id: s.id, tabNumber: s.tabNumber, customerName: s.customerName, memberCode: o.memberCode,
          discountPct: s.discountPct, itemCount: s.itemCount, subtotal: s.subtotal, total: s.total,
          openedAt: s.openedAt,
        },
      };
    })
  );
});

// =============== Menu ===============

router.get(
  "/menu",
  validate({ query: z.object({ category: category.optional(), station: station.optional() }) }),
  async (req, res) => {
    const { category: c, station: s } = req.valid.query;
    res.json(
      await db.select().from(menuItems)
        .where(and(eq(menuItems.isActive, true), c ? eq(menuItems.category, c) : undefined, s ? eq(menuItems.station, s) : undefined))
        .orderBy(menuItems.category, menuItems.name)
    );
  }
);

router.post(
  "/menu",
  manager,
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(100),
      category,
      station: station.optional(),
      price: z.number().min(0),
    }),
  }),
  async (req, res) => {
    const b = req.valid.body;
    const [row] = await db.insert(menuItems)
      .values({ ...b, station: b.station ?? (b.category === "drink" ? "bar" : "kitchen") })
      .returning();
    res.status(201).json(row);
  }
);

router.patch(
  "/menu/:id",
  manager,
  validate({
    params: idParam,
    body: z
      .object({ name: z.string().trim().min(2).max(100), price: z.number().min(0), isAvailable: z.boolean(), isActive: z.boolean() })
      .partial()
      .refine((o) => Object.keys(o).length > 0, "Nothing to update"),
  }),
  async (req, res) => {
    const [row] = await db.update(menuItems).set(req.valid.body).where(eq(menuItems.id, req.valid.params.id)).returning();
    if (!row) throw httpError(404, "Menu item not found");
    res.json(row);
  }
);

// =============== Tabs ===============

router.post(
  "/tabs",
  validate({
    body: z.object({
      tableId: z.number().int().positive().optional(),
      memberCode: z.string().trim().min(3).optional(),
      customerName: z.string().trim().min(2).max(120).optional(),
    }),
  }),
  async (req, res) => {
    const b = req.valid.body;
    const tab = await db.transaction(async (tx) => {
      let table = null;
      if (b.tableId) {
        const [t] = await tx.select().from(barTables).where(and(eq(barTables.id, b.tableId), eq(barTables.isActive, true)));
        if (!t) throw httpError(404, "Table not found");
        const [busy] = await tx.select({ n: barTabs.tabNumber }).from(barTabs)
          .where(and(eq(barTabs.tableId, t.id), eq(barTabs.status, "open")));
        if (busy) throw httpError(409, `${t.name} already has an open tab (${busy.n})`);
        table = t;
      }

      const { member, discountPct } = await findBarDiscount(tx, b.memberCode);
      if (member) {
        const [dup] = await tx.select({ n: barTabs.tabNumber }).from(barTabs)
          .where(and(eq(barTabs.memberId, member.id), eq(barTabs.status, "open")));
        if (dup) throw httpError(409, `${member.fullName} already has an open tab (${dup.n})`);
      }

      const [row] = await tx.insert(barTabs).values({
        tabNumber: `TMP-${randomUUID().slice(0, 12)}`,
        tableId: table?.id ?? null,
        memberId: member?.id ?? null,
        customerName: member?.fullName ?? b.customerName ?? table?.name ?? "Guest",
        discountPct,
        openedBy: req.user.id,
      }).returning();

      await tx.update(barTabs).set({ tabNumber: `BT-${String(row.id).padStart(6, "0")}` }).where(eq(barTabs.id, row.id));
      return loadTab(tx, row.id);
    });
    res.status(201).json(tab);
  }
);

router.get(
  "/tabs",
  validate({
    query: z.object({
      status: z.enum(["open", "paid", "void"]).optional(),
      date: z.iso.date().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    const dayStart = q.date ? dayStartFromDateString(q.date) : null;
    const rows = await db
      .select({ tab: barTabs, tableName: barTables.name, memberCode: members.memberCode })
      .from(barTabs)
      .leftJoin(barTables, eq(barTabs.tableId, barTables.id))
      .leftJoin(members, eq(barTabs.memberId, members.id))
      .where(and(
        q.status ? eq(barTabs.status, q.status) : undefined,
        dayStart ? gte(barTabs.openedAt, dayStart) : undefined,
        dayStart ? lt(barTabs.openedAt, new Date(dayStart.getTime() + DAY)) : undefined
      ))
      .orderBy(desc(barTabs.openedAt))
      .limit(q.limit);
    const run = await runningSubtotals(db, rows.map((r) => r.tab.id));
    res.json(rows.map((r) => ({ ...shapeTab(r.tab, run.get(r.tab.id)), tableName: r.tableName, memberCode: r.memberCode })));
  }
);

router.get("/tabs/:id", validate({ params: idParam }), async (req, res) => {
  res.json(await loadTab(db, req.valid.params.id));
});

// add items to an open tab (as many rounds of orders as you like)
router.post(
  "/tabs/:id/items",
  validate({
    params: idParam,
    body: z.object({
      items: z
        .array(z.object({
          menuItemId: z.number().int().positive(),
          quantity: z.number().int().min(1).max(20),
          notes: z.string().trim().max(200).optional(),
        }))
        .min(1)
        .max(30),
    }),
  }),
  async (req, res) => {
    const { id } = req.valid.params;
    const { items } = req.valid.body;

    const result = await db.transaction(async (tx) => {
      const [tab] = await tx.select().from(barTabs).where(eq(barTabs.id, id)).for("update");
      if (!tab) throw httpError(404, "Tab not found");
      if (tab.status !== "open") throw httpError(409, `Tab is ${tab.status}`);

      const ids = [...new Set(items.map((i) => i.menuItemId))];
      const menu = await tx.select().from(menuItems).where(and(inArray(menuItems.id, ids), eq(menuItems.isActive, true)));
      if (menu.length !== ids.length) throw httpError(404, "One or more menu items do not exist");
      const off = menu.find((m) => !m.isAvailable);
      if (off) throw httpError(409, `${off.name} is not available right now`);
      const byId = new Map(menu.map((m) => [m.id, m]));

      await tx.insert(barTabItems).values(
        items.map((i) => {
          const m = byId.get(i.menuItemId);
          return {
            tabId: id, menuItemId: m.id, itemName: m.name, category: m.category, station: m.station,
            unitPrice: m.price, quantity: i.quantity, lineTotal: round2(m.price * i.quantity),
            notes: i.notes ?? null, createdBy: req.user.id,
          };
        })
      );
      return loadTab(tx, id);
    });
    res.status(201).json(result);
  }
);

// settle: one or several payments that must add up to the bill exactly
router.post(
  "/tabs/:id/pay",
  validate({
    params: idParam,
    body: z.object({
      payments: z.array(z.object({ method: paymentMethod, amount: z.number().positive() })).min(1).max(6),
    }),
  }),
  async (req, res) => {
    const { id } = req.valid.params;
    const { payments } = req.valid.body;

    const result = await db.transaction(async (tx) => {
      const [shift] = await tx.select().from(shifts).where(and(eq(shifts.userId, req.user.id), isNull(shifts.endedAt)));
      if (!shift) throw httpError(409, "Start your shift before taking payments");

      const [tab] = await tx.select().from(barTabs).where(eq(barTabs.id, id)).for("update");
      if (!tab) throw httpError(404, "Tab not found");
      if (tab.status !== "open") throw httpError(409, `Tab is already ${tab.status}`);

      const items = await tx.select().from(barTabItems).where(eq(barTabItems.tabId, id));
      const totals = totalsOf(items, tab.discountPct);
      if (totals.total <= 0) throw httpError(409, "Nothing to charge. Void the tab instead.");

      const paid = payments.reduce((s, p) => s + cents(p.amount), 0);
      if (paid !== cents(totals.total)) {
        throw httpError(400, `Payments add up to ${(paid / 100).toFixed(2)} but the bill is ${totals.total.toFixed(2)}`);
      }

      await tx.insert(barPayments).values(
        payments.map((p) => ({ tabId: id, method: p.method, amount: p.amount, shiftId: shift.id, receivedBy: req.user.id }))
      );
      await tx.update(barTabs).set({
        status: "paid", ...totals, closedAt: new Date(), closedBy: req.user.id, shiftId: shift.id,
      }).where(eq(barTabs.id, id));

      return loadTab(tx, id);
    });
    res.json(result);
  }
);

// void an open tab (manager): clears unprepared items from the queue and frees the table
router.post(
  "/tabs/:id/void",
  manager,
  validate({ params: idParam, body: z.object({ reason: z.string().trim().min(3).max(255) }) }),
  async (req, res) => {
    const { id } = req.valid.params;
    const result = await db.transaction(async (tx) => {
      const [tab] = await tx.select().from(barTabs).where(eq(barTabs.id, id)).for("update");
      if (!tab) throw httpError(404, "Tab not found");
      if (tab.status !== "open") throw httpError(409, `Tab is already ${tab.status}`);

      await tx.update(barTabItems).set({ status: "cancelled", updatedAt: new Date() })
        .where(and(eq(barTabItems.tabId, id), inArray(barTabItems.status, ["new", "preparing"])));
      await tx.update(barTabs).set({
        status: "void", closedAt: new Date(), closedBy: req.user.id, voidReason: req.valid.body.reason,
      }).where(eq(barTabs.id, id));
      return loadTab(tx, id);
    });
    res.json(result);
  }
);

// =============== Kitchen / bar queue ===============

router.get("/queue", validate({ query: z.object({ station: station.optional() }) }), async (req, res) => {
  const { station: s } = req.valid.query;
  const rows = await db
    .select({
      id: barTabItems.id, item: barTabItems.itemName, quantity: barTabItems.quantity, notes: barTabItems.notes,
      station: barTabItems.station, status: barTabItems.status, orderedAt: barTabItems.createdAt,
      tabId: barTabs.id, tabNumber: barTabs.tabNumber, customer: barTabs.customerName, table: barTables.name,
    })
    .from(barTabItems)
    .innerJoin(barTabs, eq(barTabItems.tabId, barTabs.id))
    .leftJoin(barTables, eq(barTabs.tableId, barTables.id))
    .where(and(
      inArray(barTabItems.status, ["new", "preparing", "ready"]),
      ne(barTabs.status, "void"),
      s ? eq(barTabItems.station, s) : undefined
    ))
    .orderBy(asc(barTabItems.createdAt));
  res.json(rows.map((r) => ({ ...r, waitingMinutes: Math.floor((Date.now() - r.orderedAt.getTime()) / 60000) })));
});

// new -> preparing -> ready -> served (one step at a time)
const PREVIOUS = { preparing: "new", ready: "preparing", served: "ready" };

router.patch(
  "/items/:id/status",
  validate({ params: idParam, body: z.object({ status: z.enum(["preparing", "ready", "served"]) }) }),
  async (req, res) => {
    const { status } = req.valid.body;
    const [row] = await db.update(barTabItems).set({ status, updatedAt: new Date() })
      .where(and(eq(barTabItems.id, req.valid.params.id), eq(barTabItems.status, PREVIOUS[status])))
      .returning();
    if (!row) throw httpError(409, `Item not found, or it is not '${PREVIOUS[status]}' yet`);
    res.json(row);
  }
);

// an item can only be cancelled before the kitchen starts it
router.post("/items/:id/cancel", validate({ params: idParam }), async (req, res) => {
  const openTabs = db.select({ id: barTabs.id }).from(barTabs).where(eq(barTabs.status, "open"));
  const [row] = await db.update(barTabItems).set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(barTabItems.id, req.valid.params.id), eq(barTabItems.status, "new"), inArray(barTabItems.tabId, openTabs)))
    .returning();
  if (!row) throw httpError(409, "Item not found, already being prepared, or its tab is closed");
  res.json(row);
});

// =============== Shifts ===============

router.post(
  "/shifts/start",
  validate({ body: z.object({ openingCash: z.number().min(0).default(0) }) }),
  async (req, res) => {
    const [open] = await db.select({ id: shifts.id }).from(shifts)
      .where(and(eq(shifts.userId, req.user.id), isNull(shifts.endedAt)));
    if (open) throw httpError(409, "You already have a shift in progress");
    const [row] = await db.insert(shifts).values({ userId: req.user.id, openingCash: req.valid.body.openingCash }).returning();
    res.status(201).json(row);
  }
);

router.get("/shifts/current", async (req, res) => {
  const [row] = await db.select().from(shifts).where(and(eq(shifts.userId, req.user.id), isNull(shifts.endedAt)));
  res.json(row ?? null);
});

router.post(
  "/shifts/end",
  validate({ body: z.object({ closingCash: z.number().min(0), note: z.string().trim().max(255).optional() }) }),
  async (req, res) => {
    const result = await db.transaction(async (tx) => {
      const [shift] = await tx.select().from(shifts)
        .where(and(eq(shifts.userId, req.user.id), isNull(shifts.endedAt))).for("update");
      if (!shift) throw httpError(409, "You have no shift in progress");

      const [{ cash }] = await tx.select({ cash: f8(barPayments.amount) }).from(barPayments)
        .where(and(eq(barPayments.shiftId, shift.id), eq(barPayments.method, "cash")));
      const expectedCash = round2(shift.openingCash + cash);

      const [row] = await tx.update(shifts).set({
        endedAt: new Date(), closingCash: req.valid.body.closingCash, expectedCash, note: req.valid.body.note,
      }).where(eq(shifts.id, shift.id)).returning();
      return { ...row, cashTaken: cash, variance: round2(req.valid.body.closingCash - expectedCash) };
    });
    res.json(result);
  }
);

// =============== Daily closing report (manager) ===============

router.get(
  "/reports/daily",
  manager,
  validate({ query: z.object({ date: z.iso.date().optional() }) }),
  async (req, res) => {
    const day = req.valid.query.date ? dayStartFromDateString(req.valid.query.date) : localDayBounds(new Date()).start;
    const end = new Date(day.getTime() + DAY);
    const paidToday = and(eq(barTabs.status, "paid"), gte(barTabs.closedAt, day), lt(barTabs.closedAt, end));

    const [{ tabs, gross, discounts, net }] = await db
      .select({ tabs: sql`count(*)::int`, gross: f8(barTabs.subtotal), discounts: f8(barTabs.discountAmount), net: f8(barTabs.total) })
      .from(barTabs).where(paidToday);

    const byMethod = await db
      .select({ method: barPayments.method, amount: f8(barPayments.amount) })
      .from(barPayments)
      .where(and(gte(barPayments.createdAt, day), lt(barPayments.createdAt, end)))
      .groupBy(barPayments.method);

    const liveItem = and(paidToday, ne(barTabItems.status, "cancelled"));
    const byCategory = await db
      .select({ category: barTabItems.category, gross: f8(barTabItems.lineTotal) })
      .from(barTabItems).innerJoin(barTabs, eq(barTabItems.tabId, barTabs.id))
      .where(liveItem).groupBy(barTabItems.category);

    const topItems = await db
      .select({ item: barTabItems.itemName, quantity: sql`sum(${barTabItems.quantity})::int`, gross: f8(barTabItems.lineTotal) })
      .from(barTabItems).innerJoin(barTabs, eq(barTabItems.tabId, barTabs.id))
      .where(liveItem).groupBy(barTabItems.itemName)
      .orderBy(desc(sql`sum(${barTabItems.quantity})`)).limit(5);

    const [open] = await db
      .select({ tabs: sql`count(distinct ${barTabs.id})::int`, amountBeforeDiscount: f8(barTabItems.lineTotal) })
      .from(barTabs)
      .leftJoin(barTabItems, and(eq(barTabItems.tabId, barTabs.id), ne(barTabItems.status, "cancelled")))
      .where(eq(barTabs.status, "open"));

    const shiftRows = await db
      .select({ shift: shifts, staff: users.fullName })
      .from(shifts).innerJoin(users, eq(shifts.userId, users.id))
      .where(and(gte(shifts.startedAt, day), lt(shifts.startedAt, end)))
      .orderBy(shifts.startedAt);
    const shiftIds = shiftRows.map((r) => r.shift.id);
    const perShift = shiftIds.length
      ? await db.select({ shiftId: barPayments.shiftId, method: barPayments.method, amount: f8(barPayments.amount) })
          .from(barPayments).where(inArray(barPayments.shiftId, shiftIds)).groupBy(barPayments.shiftId, barPayments.method)
      : [];

    const toMap = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], r.amount ?? r.gross]));
    res.json({
      date: localDateString(day),
      sales: { paidTabs: tabs, gross, discounts, net },
      byPaymentMethod: toMap(byMethod, "method"),
      byCategory: toMap(byCategory, "category"),
      topItems,
      stillOpen: open,
      shifts: shiftRows.map(({ shift, staff }) => ({
        staff, startedAt: shift.startedAt, endedAt: shift.endedAt,
        openingCash: shift.openingCash, expectedCash: shift.expectedCash, closingCash: shift.closingCash,
        variance: shift.closingCash == null ? null : round2(shift.closingCash - shift.expectedCash),
        takings: Object.fromEntries(perShift.filter((p) => p.shiftId === shift.id).map((p) => [p.method, p.amount])),
      })),
    });
  }
);

export default router;
