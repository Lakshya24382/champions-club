import { Router } from "express";
import { z } from "zod";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, like, lte, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { enquiries, enquiryNotes, members, membershipPlans, quotes, users } from "../db/schema.all.js";
import { env } from "../config/env.js";
import { validate } from "../middleware/validate.js";
import { httpError } from "../utils/httpError.js";
import { phoneKey } from "../utils/phone.js";
import { localDateString } from "../utils/time.js";
import { OPEN, addNote, createEnquiry } from "../services/enquiry.service.js";
import { notifyCustomer } from "../services/notify.service.js";
import { registerMember } from "../services/member.service.js";

const router = Router();

const DAY = 86_400_000;
const idParam = z.object({ id: z.coerce.number().int().positive() });
const phone = z.string().trim().regex(/^\+?[0-9]{10,13}$/, "Invalid phone number");
const tier = z.enum(["gold", "silver", "junior"]);
const sport = z.enum(["tennis", "cricket", "padel", "badminton"]);
const isoDate = z.iso.datetime({ offset: true }).transform((s) => new Date(s));
const isManager = (req) => ["owner", "manager"].includes(req.user.role);
const round2 = (n) => Number(n.toFixed(2));

// ---------- Pipeline summary (before /:id) ----------
router.get("/summary", async (_req, res) => {
  const now = new Date();
  const byStatus = await db.select({ status: enquiries.status, n: count() }).from(enquiries).groupBy(enquiries.status);
  const [{ overdue }] = await db.select({ overdue: count() }).from(enquiries)
    .where(and(lte(enquiries.followUpAt, now), inArray(enquiries.status, OPEN)));
  const [{ unassigned }] = await db.select({ unassigned: count() }).from(enquiries)
    .where(and(isNull(enquiries.assignedTo), inArray(enquiries.status, OPEN)));
  const [{ newThisWeek }] = await db.select({ newThisWeek: count() }).from(enquiries)
    .where(gte(enquiries.createdAt, new Date(now.getTime() - 7 * DAY)));
  const closed = await db.select({ status: enquiries.status, n: count() }).from(enquiries)
    .where(and(inArray(enquiries.status, ["won", "lost"]), gte(enquiries.updatedAt, new Date(now.getTime() - 30 * DAY))))
    .groupBy(enquiries.status);

  const won = closed.find((c) => c.status === "won")?.n ?? 0;
  const lost = closed.find((c) => c.status === "lost")?.n ?? 0;
  res.json({
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.n])),
    followUpsOverdue: overdue,
    unassignedOpen: unassigned,
    newThisWeek,
    last30Days: { won, lost, conversionRate: won + lost ? round2((won / (won + lost)) * 100) : null },
  });
});

// ---------- List / inbox ----------
router.get(
  "/",
  validate({
    query: z.object({
      status: z.enum(["new", "contacted", "quote_sent", "won", "lost"]).optional(),
      type: z.enum(["membership", "trial", "corporate", "general"]).optional(),
      assigned: z.enum(["me", "unassigned"]).optional(),
      due: z.enum(["true"]).optional(),
      q: z.string().trim().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    const where = and(
      q.status ? eq(enquiries.status, q.status) : undefined,
      q.type ? eq(enquiries.type, q.type) : undefined,
      q.assigned === "me" ? eq(enquiries.assignedTo, req.user.id) : undefined,
      q.assigned === "unassigned" ? isNull(enquiries.assignedTo) : undefined,
      q.due ? and(lte(enquiries.followUpAt, new Date()), inArray(enquiries.status, OPEN)) : undefined,
      q.q ? or(
        ilike(enquiries.name, `%${q.q}%`), ilike(enquiries.phone, `%${q.q}%`),
        ilike(enquiries.ref, `%${q.q}%`), ilike(enquiries.companyName, `%${q.q}%`)
      ) : undefined
    );

    const rows = await db
      .select({ e: enquiries, assignee: users.fullName })
      .from(enquiries)
      .leftJoin(users, eq(enquiries.assignedTo, users.id))
      .where(where)
      .orderBy(q.due ? asc(enquiries.followUpAt) : desc(enquiries.createdAt))
      .limit(q.limit)
      .offset((q.page - 1) * q.limit);
    const [{ total }] = await db.select({ total: count() }).from(enquiries).where(where);

    res.json({
      page: q.page, limit: q.limit, total,
      data: rows.map((r) => ({
        ...r.e, assignee: r.assignee,
        followUpOverdue: Boolean(r.e.followUpAt && r.e.followUpAt <= new Date() && OPEN.includes(r.e.status)),
      })),
    });
  }
);

// ---------- Log a phone / walk-in enquiry ----------
router.post(
  "/",
  validate({
    body: z
      .object({
        source: z.enum(["phone", "walk_in"]),
        name: z.string().trim().min(2).max(120),
        phone,
        email: z.email().optional(),
        type: z.enum(["membership", "corporate", "general"]).default("general"),
        interestedPlan: tier.optional(),
        sport: sport.optional(),
        companyName: z.string().trim().min(2).max(150).optional(),
        message: z.string().trim().max(1000).optional(),
      })
      .refine((b) => b.type !== "corporate" || b.companyName, {
        message: "companyName is required for corporate enquiries",
        path: ["companyName"],
      }),
  }),
  async (req, res) => {
    const out = await db.transaction((tx) => createEnquiry(tx, { ...req.valid.body, createdBy: req.user.id }));
    res.status(out.duplicate ? 200 : 201).json({ ...out.enquiry, duplicate: out.duplicate });
  }
);

// ---------- Detail: timeline + quotes ----------
router.get("/:id", validate({ params: idParam }), async (req, res) => {
  const { id } = req.valid.params;
  const [row] = await db
    .select({ e: enquiries, assignee: users.fullName, memberCode: members.memberCode })
    .from(enquiries)
    .leftJoin(users, eq(enquiries.assignedTo, users.id))
    .leftJoin(members, eq(enquiries.memberId, members.id))
    .where(eq(enquiries.id, id));
  if (!row) throw httpError(404, "Enquiry not found");

  const notes = await db
    .select({ id: enquiryNotes.id, kind: enquiryNotes.kind, body: enquiryNotes.body, createdAt: enquiryNotes.createdAt, author: users.fullName })
    .from(enquiryNotes)
    .leftJoin(users, eq(enquiryNotes.authorId, users.id))
    .where(eq(enquiryNotes.enquiryId, id))
    .orderBy(desc(enquiryNotes.id));

  const quoteRows = await db
    .select({ q: quotes, plan: membershipPlans.name })
    .from(quotes)
    .innerJoin(membershipPlans, eq(quotes.planId, membershipPlans.id))
    .where(eq(quotes.enquiryId, id))
    .orderBy(desc(quotes.id));

  res.json({
    ...row.e, assignee: row.assignee, memberCode: row.memberCode,
    notes,
    quotes: quoteRows.map((r) => ({ ...r.q, plan: r.plan, expired: r.q.validUntil < new Date() })),
  });
});

// ---------- Assign (claim it yourself, or a manager assigns someone) ----------
router.post(
  "/:id/assign",
  validate({ params: idParam, body: z.object({ userId: z.number().int().positive().optional() }) }),
  async (req, res) => {
    const { id } = req.valid.params;
    const targetId = req.valid.body.userId ?? req.user.id;
    if (targetId !== req.user.id && !isManager(req)) throw httpError(403, "Only a manager can assign to someone else");

    const row = await db.transaction(async (tx) => {
      const [target] = await tx.select().from(users).where(and(eq(users.id, targetId), eq(users.isActive, true)));
      if (!target) throw httpError(404, "Staff member not found");
      const [updated] = await tx.update(enquiries).set({ assignedTo: targetId, updatedAt: new Date() })
        .where(eq(enquiries.id, id)).returning();
      if (!updated) throw httpError(404, "Enquiry not found");
      await addNote(tx, id, req.user.id, "assignment", `Assigned to ${target.fullName}`);
      return updated;
    });
    res.json(row);
  }
);

// ---------- Log a call / note, optionally set the next follow-up ----------
router.post(
  "/:id/notes",
  validate({
    params: idParam,
    body: z.object({
      body: z.string().trim().min(2).max(1000),
      contacted: z.boolean().default(false),
      followUpAt: isoDate.optional(),
    }),
  }),
  async (req, res) => {
    const { id } = req.valid.params;
    const { body, contacted, followUpAt } = req.valid.body;

    const row = await db.transaction(async (tx) => {
      const [e] = await tx.select().from(enquiries).where(eq(enquiries.id, id)).for("update");
      if (!e) throw httpError(404, "Enquiry not found");
      await addNote(tx, id, req.user.id, "note", body);

      const now = new Date();
      const open = OPEN.includes(e.status);
      const patch = { updatedAt: now };
      if (contacted) {
        patch.lastContactedAt = now;
        if (e.status === "new") patch.status = "contacted";
      }
      if (open && followUpAt) patch.followUpAt = followUpAt;
      else if (open && contacted) patch.followUpAt = new Date(now.getTime() + 2 * DAY);

      const [updated] = await tx.update(enquiries).set(patch).where(eq(enquiries.id, id)).returning();
      return updated;
    });
    res.status(201).json(row);
  }
);

// ---------- Status changes ----------
router.post(
  "/:id/status",
  validate({
    params: idParam,
    body: z.object({
      status: z.enum(["new", "contacted", "won", "lost"]),
      lostReason: z.string().trim().min(3).max(255).optional(),
      note: z.string().trim().max(500).optional(),
    }),
  }),
  async (req, res) => {
    const { id } = req.valid.params;
    const { status, lostReason, note } = req.valid.body;

    const row = await db.transaction(async (tx) => {
      const [e] = await tx.select().from(enquiries).where(eq(enquiries.id, id)).for("update");
      if (!e) throw httpError(404, "Enquiry not found");

      const closed = ["won", "lost"].includes(e.status);
      if (closed && !isManager(req)) throw httpError(403, "Only a manager can change a closed enquiry");
      if (status === "new" && !isManager(req)) throw httpError(403, "Only a manager can reopen an enquiry");
      if (status === e.status) throw httpError(409, `Already ${status}`);
      if (status === "lost" && !lostReason) throw httpError(400, "lostReason is required");
      if (status === "won" && ["membership", "trial"].includes(e.type) && !e.memberId) {
        throw httpError(400, "Use POST /enquiries/:id/convert to turn this into a member");
      }

      const now = new Date();
      const open = ["new", "contacted"].includes(status);
      const [updated] = await tx.update(enquiries).set({
        status,
        updatedAt: now,
        lostReason: status === "lost" ? lostReason : null,
        lastContactedAt: status === "contacted" ? now : e.lastContactedAt,
        followUpAt: open ? (e.followUpAt ?? new Date(now.getTime() + DAY)) : null,
      }).where(eq(enquiries.id, id)).returning();

      await addNote(tx, id, req.user.id, "status_change",
        `${e.status} -> ${status}${lostReason ? ` (${lostReason})` : ""}${note ? `: ${note}` : ""}`);
      return updated;
    });
    res.json(row);
  }
);

// ---------- Send a quote ----------
router.post(
  "/:id/quotes",
  validate({
    params: idParam,
    body: z.object({
      planTier: tier,
      durationMonths: z.number().int().min(1).max(24),
      memberCount: z.number().int().min(1).max(200).default(1),
      discountPct: z.number().int().min(0).max(30).default(0),
      validDays: z.number().int().min(1).max(60).default(14),
      note: z.string().trim().max(500).optional(),
    }),
  }),
  async (req, res) => {
    const { id } = req.valid.params;
    const b = req.valid.body;
    if (b.discountPct > 10 && !isManager(req)) throw httpError(403, "Discounts above 10% need a manager");

    const quote = await db.transaction(async (tx) => {
      const [e] = await tx.select().from(enquiries).where(eq(enquiries.id, id)).for("update");
      if (!e) throw httpError(404, "Enquiry not found");
      if (!OPEN.includes(e.status)) throw httpError(409, `Enquiry is ${e.status}; reopen it first`);

      const [plan] = await tx.select().from(membershipPlans).where(eq(membershipPlans.tier, b.planTier));
      const subtotal = round2(plan.monthlyFee * b.durationMonths * b.memberCount);
      const discountAmount = round2((subtotal * b.discountPct) / 100);
      const total = round2(subtotal - discountAmount);
      const now = new Date();
      const validUntil = new Date(now.getTime() + b.validDays * DAY);

      const [q] = await tx.insert(quotes).values({
        quoteNumber: `TMP-${Date.now().toString(36)}`,
        enquiryId: id, planId: plan.id, memberCount: b.memberCount, durationMonths: b.durationMonths,
        unitPrice: plan.monthlyFee, discountPct: b.discountPct, subtotal, discountAmount, total,
        validUntil, note: b.note, createdBy: req.user.id,
      }).returning();
      const quoteNumber = `QT-${String(q.id).padStart(6, "0")}`;
      await tx.update(quotes).set({ quoteNumber }).where(eq(quotes.id, q.id));

      await tx.update(enquiries).set({
        status: "quote_sent", lastContactedAt: now, updatedAt: now,
        followUpAt: new Date(now.getTime() + 3 * DAY),
        assignedTo: e.assignedTo ?? req.user.id,
      }).where(eq(enquiries.id, id));

      await addNote(tx, id, req.user.id, "system",
        `Quote ${quoteNumber} sent: ${plan.name} x ${b.memberCount} for ${b.durationMonths} month(s), total INR ${total}`);

      await notifyCustomer(tx, {
        email: e.email, phone: e.phone,
        subject: `Your quote ${quoteNumber} from ${env.CLUB_NAME}`,
        body: [
          `Hi ${e.name},`, "",
          `Quote ${quoteNumber}`,
          `Plan: ${plan.name} x ${b.memberCount} member(s) for ${b.durationMonths} month(s)`,
          `Subtotal: INR ${subtotal}`,
          `Discount (${b.discountPct}%): -INR ${discountAmount}`,
          `Total: INR ${total}`,
          `Valid until: ${localDateString(validUntil)}`,
          b.note ? `\n${b.note}` : "",
        ].join("\n"),
        relatedType: "quote", relatedId: q.id,
      });

      return { ...q, quoteNumber, plan: plan.name };
    });
    res.status(201).json(quote);
  }
);

// ---------- Convert to member ----------
router.post(
  "/:id/convert",
  validate({
    params: idParam,
    body: z.object({ planTier: tier, durationMonths: z.number().int().min(1).max(24).default(1), dateOfBirth: z.iso.date() }),
  }),
  async (req, res) => {
    const { id } = req.valid.params;
    const b = req.valid.body;

    const out = await db.transaction(async (tx) => {
      const [e] = await tx.select().from(enquiries).where(eq(enquiries.id, id)).for("update");
      if (!e) throw httpError(404, "Enquiry not found");
      if (e.memberId) throw httpError(409, "Already converted to a member");
      if (e.status === "lost") throw httpError(409, "Enquiry is lost; a manager must reopen it first");
      if (e.type === "corporate") {
        throw httpError(400, "Corporate enquiries are not single members. A manager marks them won once agreed.");
      }

      const [dup] = await tx.select({ code: members.memberCode }).from(members)
        .where(like(members.phone, `%${phoneKey(e.phone)}`)).limit(1);
      if (dup) throw httpError(409, `This phone already belongs to member ${dup.code}`);

      const member = await registerMember(tx, {
        fullName: e.name, email: e.email, phone: e.phone, dateOfBirth: b.dateOfBirth,
        planTier: b.planTier, durationMonths: b.durationMonths,
      }, req.user.id);

      await tx.update(enquiries).set({
        status: "won", memberId: member.id, followUpAt: null, lostReason: null,
        assignedTo: e.assignedTo ?? req.user.id, updatedAt: new Date(),
      }).where(eq(enquiries.id, id));

      await addNote(tx, id, req.user.id, "status_change",
        `Converted to member ${member.memberCode} (${member.plan.name}, ${b.durationMonths} month(s))`);

      await notifyCustomer(tx, {
        email: e.email, phone: e.phone,
        subject: `Welcome to ${env.CLUB_NAME}, ${e.name}!`,
        body: `Hi ${e.name},\n\nYour ${member.plan.name} membership is active until ${localDateString(member.expiresAt)}.\nYour member code is ${member.memberCode}. Quote it at the front desk, the shop and the bar.\n\nSee you on court!`,
        relatedType: "member", relatedId: member.id,
      });

      return member;
    });
    res.status(201).json(out);
  }
);

export default router;
