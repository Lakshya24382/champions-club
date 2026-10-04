import { Router } from "express";
import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { employees, leaveRequests, users } from "../db/schema.all.js";
import { env } from "../config/env.js";
import { validate } from "../middleware/validate.js";
import { requireRole } from "../middleware/auth.js";
import { httpError } from "../utils/httpError.js";
import { localDateString } from "../utils/time.js";
import { notifyStaff } from "../services/notify.service.js";

const router = Router();
const manager = requireRole("owner", "manager");
const isManager = (req) => ["owner", "manager"].includes(req.user.role);

const idParam = z.object({ id: z.coerce.number().int().positive() });
const phone = z.string().trim().regex(/^\+?[0-9]{10,13}$/, "Invalid phone number");
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000) + 1;

async function myEmployee(exec, userId) {
  const [e] = await exec.select().from(employees).where(eq(employees.userId, userId));
  return e ?? null;
}

// paid-leave allowance for a calendar year (leave is counted in the year it starts)
export async function leaveBalance(exec, employeeId, year) {
  const rows = await exec
    .select({ status: leaveRequests.status, days: sql`coalesce(sum(${leaveRequests.days}), 0)::int` })
    .from(leaveRequests)
    .where(and(
      eq(leaveRequests.employeeId, employeeId), eq(leaveRequests.type, "paid"),
      inArray(leaveRequests.status, ["approved", "pending"]),
      gte(leaveRequests.startDate, `${year}-01-01`), lte(leaveRequests.startDate, `${year}-12-31`)
    ))
    .groupBy(leaveRequests.status);
  const used = rows.find((r) => r.status === "approved")?.days ?? 0;
  const pending = rows.find((r) => r.status === "pending")?.days ?? 0;
  return { year, allowance: env.LEAVE_PAID_DAYS_PER_YEAR, used, pending, remaining: env.LEAVE_PAID_DAYS_PER_YEAR - used - pending };
}

// =============== Employees ===============

const employeeBody = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.email().optional(),
  phone: phone.optional(),
  title: z.string().trim().min(2).max(80),
  monthlySalary: z.number().min(0).max(10_000_000),
  joinedOn: z.iso.date().optional(),
  userId: z.number().int().positive().optional(),
});

router.post("/employees", manager, validate({ body: employeeBody }), async (req, res) => {
  const b = req.valid.body;
  const created = await db.transaction(async (tx) => {
    if (b.userId) {
      const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, b.userId));
      if (!u) throw httpError(404, "Linked staff login not found");
    }
    const [row] = await tx.insert(employees).values({
      employeeCode: `TMP-${Date.now().toString(36)}`, ...b, joinedOn: b.joinedOn ?? localDateString(new Date()),
    }).returning();
    const employeeCode = `EMP-${String(row.id).padStart(4, "0")}`;
    await tx.update(employees).set({ employeeCode }).where(eq(employees.id, row.id));
    return { ...row, employeeCode };
  });
  res.status(201).json(created);
});

router.get("/employees", manager, validate({ query: z.object({ includeInactive: z.enum(["true", "false"]).default("false") }) }), async (req, res) => {
  const rows = await db.select().from(employees)
    .where(req.valid.query.includeInactive === "true" ? undefined : eq(employees.isActive, true))
    .orderBy(asc(employees.employeeCode));
  const year = Number(localDateString(new Date()).slice(0, 4));
  res.json(await Promise.all(rows.map(async (e) => ({ ...e, leave: await leaveBalance(db, e.id, year) }))));
});

router.patch(
  "/employees/:id",
  manager,
  validate({
    params: idParam,
    body: employeeBody.pick({ email: true, phone: true, title: true, monthlySalary: true, userId: true }).extend({ isActive: z.boolean() }).partial()
      .refine((o) => Object.keys(o).length > 0, "Nothing to update"),
  }),
  async (req, res) => {
    const [row] = await db.update(employees).set(req.valid.body).where(eq(employees.id, req.valid.params.id)).returning();
    if (!row) throw httpError(404, "Employee not found");
    res.json(row);
  }
);

// my own record and leave balance (no salary shown)
router.get("/me", async (req, res) => {
  const e = await myEmployee(db, req.user.id);
  if (!e) throw httpError(404, "No employee record is linked to your login");
  const { monthlySalary, ...safe } = e;
  res.json({ ...safe, leave: await leaveBalance(db, e.id, Number(localDateString(new Date()).slice(0, 4))) });
});

// =============== Leave ===============

router.post(
  "/leave",
  validate({
    body: z.object({
      employeeId: z.number().int().positive().optional(),
      type: z.enum(["paid", "unpaid"]),
      startDate: z.iso.date(),
      endDate: z.iso.date(),
      reason: z.string().trim().max(300).optional(),
    }),
  }),
  async (req, res) => {
    const b = req.valid.body;
    const mine = await myEmployee(db, req.user.id);

    const created = await db.transaction(async (tx) => {
      let emp = mine;
      if (b.employeeId && b.employeeId !== mine?.id) {
        if (!isManager(req)) throw httpError(403, "You can only request leave for yourself");
        [emp] = await tx.select().from(employees).where(eq(employees.id, b.employeeId));
        if (!emp) throw httpError(404, "Employee not found");
      }
      if (!emp) throw httpError(409, "No employee record is linked to your login. Ask a manager.");
      if (!emp.isActive) throw httpError(409, "Employee is not active");

      if (b.endDate < b.startDate) throw httpError(400, "endDate cannot be before startDate");
      if (b.startDate.slice(0, 4) !== b.endDate.slice(0, 4)) throw httpError(400, "Split leave that crosses a year into two requests");
      if (b.startDate < emp.joinedOn) throw httpError(400, "Leave cannot start before the joining date");
      if (!isManager(req) && b.startDate < localDateString(new Date())) throw httpError(400, "Leave cannot start in the past");

      const days = dayDiff(b.startDate, b.endDate);

      const [clash] = await tx.select({ id: leaveRequests.id }).from(leaveRequests)
        .where(and(eq(leaveRequests.employeeId, emp.id), inArray(leaveRequests.status, ["pending", "approved"]),
          lte(leaveRequests.startDate, b.endDate), gte(leaveRequests.endDate, b.startDate)));
      if (clash) throw httpError(409, "This overlaps another pending or approved leave");

      if (b.type === "paid") {
        const bal = await leaveBalance(tx, emp.id, Number(b.startDate.slice(0, 4)));
        if (days > bal.remaining) {
          throw httpError(409, `Only ${bal.remaining} paid day(s) left this year (${bal.used} used, ${bal.pending} pending). Request the rest as unpaid.`);
        }
      }

      const [row] = await tx.insert(leaveRequests).values({
        employeeId: emp.id, type: b.type, startDate: b.startDate, endDate: b.endDate, days, reason: b.reason, createdBy: req.user.id,
      }).returning();

      await notifyStaff(tx, {
        subject: `Leave request from ${emp.fullName} (${days} day${days > 1 ? "s" : ""}, ${b.type})`,
        body: `${b.startDate} to ${b.endDate}. ${b.reason ?? ""}`, relatedType: "leave", relatedId: row.id,
      });
      return { ...row, employee: emp.fullName };
    });
    res.status(201).json(created);
  }
);

router.get(
  "/leave",
  validate({
    query: z.object({
      status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional(),
      employeeId: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    let employeeId = q.employeeId;
    if (!isManager(req)) {
      const mine = await myEmployee(db, req.user.id);
      if (!mine) return res.json([]);
      employeeId = mine.id; // staff only ever see their own
    }
    const rows = await db
      .select({ l: leaveRequests, name: employees.fullName, code: employees.employeeCode })
      .from(leaveRequests).innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
      .where(and(q.status ? eq(leaveRequests.status, q.status) : undefined, employeeId ? eq(leaveRequests.employeeId, employeeId) : undefined))
      .orderBy(desc(leaveRequests.id)).limit(q.limit);
    res.json(rows.map((r) => ({ ...r.l, employee: r.name, code: r.code })));
  }
);

router.post(
  "/leave/:id/decision",
  manager,
  validate({ params: idParam, body: z.object({ decision: z.enum(["approve", "reject"]), note: z.string().trim().max(300).optional() }) }),
  async (req, res) => {
    const { id } = req.valid.params;
    const { decision, note } = req.valid.body;

    const row = await db.transaction(async (tx) => {
      const [l] = await tx.select().from(leaveRequests).where(eq(leaveRequests.id, id)).for("update");
      if (!l) throw httpError(404, "Leave request not found");
      if (l.status !== "pending") throw httpError(409, `Leave is already ${l.status}`);
      const [emp] = await tx.select().from(employees).where(eq(employees.id, l.employeeId));

      if (decision === "approve" && l.type === "paid") {
        const bal = await leaveBalance(tx, l.employeeId, Number(l.startDate.slice(0, 4)));
        if (bal.used + l.days > bal.allowance) throw httpError(409, "Approving this would exceed the paid-leave allowance");
      }
      const [u] = await tx.update(leaveRequests).set({
        status: decision === "approve" ? "approved" : "rejected", decidedBy: req.user.id, decidedAt: new Date(), decisionNote: note,
      }).where(eq(leaveRequests.id, id)).returning();

      if (emp?.userId) {
        await notifyStaff(tx, {
          subject: `Your leave (${l.startDate} to ${l.endDate}) was ${u.status}`, body: note ?? "",
          relatedType: "leave", relatedId: id, toUserId: emp.userId,
        });
      }
      return u;
    });
    res.json(row);
  }
);

router.post("/leave/:id/cancel", validate({ params: idParam }), async (req, res) => {
  const { id } = req.valid.params;
  const mine = await myEmployee(db, req.user.id);
  const [l] = await db.select().from(leaveRequests).where(eq(leaveRequests.id, id));
  if (!l) throw httpError(404, "Leave request not found");
  if (!isManager(req) && l.employeeId !== mine?.id) throw httpError(403, "You can only cancel your own leave");
  if (!["pending", "approved"].includes(l.status)) throw httpError(409, `Leave is already ${l.status}`);
  if (l.status === "approved" && l.startDate <= localDateString(new Date())) throw httpError(409, "Leave has already started");

  const [row] = await db.update(leaveRequests).set({ status: "cancelled" }).where(eq(leaveRequests.id, id)).returning();
  res.json(row);
});

export default router;
