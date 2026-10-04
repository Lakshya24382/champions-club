import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, gt, gte, ilike, lte, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { members, membershipHistory, membershipPlans } from "../db/schema.js";
import { validate } from "../middleware/validate.js";
import { httpError } from "../utils/httpError.js";
import { addMonths, ageOn } from "../utils/dates.js";

const router = Router();

const tier = z.enum(["gold", "silver", "junior"]);
const idParam = z.object({ id: z.coerce.number().int().positive() });

const withStatus = (m, now = new Date()) => ({
  ...m,
  status: m.expiresAt > now ? "active" : "expired",
  daysLeft: Math.ceil((m.expiresAt - now) / 86_400_000),
});

function assertTierMatchesAge(planTier, dob) {
  const age = ageOn(dob);
  if (planTier === "junior" && age >= 18) throw httpError(400, "Junior plan is for members under 18");
  if (planTier !== "junior" && age < 18) throw httpError(400, "Members under 18 must be on the Junior plan");
}

const money = (n) => Number(n.toFixed(2));

// ---------- Create ----------
router.post(
  "/",
  validate({
    body: z.object({
      fullName: z.string().trim().min(2).max(120),
      email: z.email().optional(),
      phone: z.string().trim().regex(/^\+?[0-9]{10,13}$/, "Invalid phone number"),
      dateOfBirth: z.iso.date(),
      planTier: tier,
      durationMonths: z.number().int().min(1).max(24).default(1),
    }),
  }),
  async (req, res) => {
    const b = req.valid.body;
    assertTierMatchesAge(b.planTier, b.dateOfBirth);

    const created = await db.transaction(async (tx) => {
      const [plan] = await tx.select().from(membershipPlans).where(eq(membershipPlans.tier, b.planTier));
      const startsAt = new Date();
      const endsAt = addMonths(startsAt, b.durationMonths);

      const [m] = await tx
        .insert(members)
        .values({
          memberCode: `TMP-${randomUUID().slice(0, 12)}`,
          fullName: b.fullName,
          email: b.email?.toLowerCase(),
          phone: b.phone,
          dateOfBirth: b.dateOfBirth,
          planId: plan.id,
          joinedAt: startsAt,
          expiresAt: endsAt,
        })
        .returning();

      const memberCode = `CC-${String(m.id).padStart(6, "0")}`;
      await tx.update(members).set({ memberCode }).where(eq(members.id, m.id));

      await tx.insert(membershipHistory).values({
        memberId: m.id,
        planId: plan.id,
        startsAt,
        endsAt,
        amountPaid: money(plan.monthlyFee * b.durationMonths),
        createdBy: req.user.id,
      });

      return { ...m, memberCode, plan: { tier: plan.tier, name: plan.name } };
    });

    res.status(201).json(withStatus(created));
  }
);

// ---------- List / search ----------
router.get(
  "/",
  validate({
    query: z.object({
      q: z.string().trim().optional(),
      status: z.enum(["active", "expired"]).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }),
  }),
  async (req, res) => {
    const { q, status, page, limit } = req.valid.query;
    const now = new Date();

    const where = and(
      q
        ? or(
            ilike(members.fullName, `%${q}%`),
            ilike(members.phone, `%${q}%`),
            ilike(members.memberCode, `%${q}%`)
          )
        : undefined,
      status === "active" ? gt(members.expiresAt, now) : undefined,
      status === "expired" ? lte(members.expiresAt, now) : undefined
    );

    const rows = await db
      .select({ member: members, plan: { tier: membershipPlans.tier, name: membershipPlans.name } })
      .from(members)
      .innerJoin(membershipPlans, eq(members.planId, membershipPlans.id))
      .where(where)
      .orderBy(desc(members.createdAt))
      .limit(limit)
      .offset((page - 1) * limit);

    const [{ total }] = await db.select({ total: count() }).from(members).where(where);

    res.json({
      page,
      limit,
      total,
      data: rows.map((r) => withStatus({ ...r.member, plan: r.plan }, now)),
    });
  }
);

// ---------- Expiring soon (must be before /:id) ----------
router.get(
  "/expiring",
  validate({ query: z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }) }),
  async (req, res) => {
    const now = new Date();
    const until = new Date(now.getTime() + req.valid.query.days * 86_400_000);
    const rows = await db
      .select({ member: members, plan: { tier: membershipPlans.tier, name: membershipPlans.name } })
      .from(members)
      .innerJoin(membershipPlans, eq(members.planId, membershipPlans.id))
      .where(and(gte(members.expiresAt, now), lte(members.expiresAt, until)))
      .orderBy(members.expiresAt);

    res.json(rows.map((r) => withStatus({ ...r.member, plan: r.plan }, now)));
  }
);

// ---------- Detail (profile + history) ----------
router.get("/:id", validate({ params: idParam }), async (req, res) => {
  const { id } = req.valid.params;
  const [row] = await db
    .select({ member: members, plan: membershipPlans })
    .from(members)
    .innerJoin(membershipPlans, eq(members.planId, membershipPlans.id))
    .where(eq(members.id, id));
  if (!row) throw httpError(404, "Member not found");

  const history = await db
    .select({
      id: membershipHistory.id,
      plan: membershipPlans.name,
      startsAt: membershipHistory.startsAt,
      endsAt: membershipHistory.endsAt,
      amountPaid: membershipHistory.amountPaid,
    })
    .from(membershipHistory)
    .innerJoin(membershipPlans, eq(membershipHistory.planId, membershipPlans.id))
    .where(eq(membershipHistory.memberId, id))
    .orderBy(desc(membershipHistory.startsAt));

  res.json({ ...withStatus({ ...row.member, plan: row.plan }), history });
});

// ---------- Update contact details ----------
router.patch(
  "/:id",
  validate({
    params: idParam,
    body: z
      .object({
        fullName: z.string().trim().min(2).max(120),
        email: z.email(),
        phone: z.string().trim().regex(/^\+?[0-9]{10,13}$/),
      })
      .partial()
      .refine((o) => Object.keys(o).length > 0, "Nothing to update"),
  }),
  async (req, res) => {
    const [updated] = await db.update(members).set(req.valid.body).where(eq(members.id, req.valid.params.id)).returning();
    if (!updated) throw httpError(404, "Member not found");
    res.json(withStatus(updated));
  }
);

// ---------- Renew / change plan ----------
router.post(
  "/:id/renew",
  validate({
    params: idParam,
    body: z.object({
      planTier: tier.optional(),
      durationMonths: z.number().int().min(1).max(24).default(1),
    }),
  }),
  async (req, res) => {
    const { id } = req.valid.params;
    const { planTier, durationMonths } = req.valid.body;

    const result = await db.transaction(async (tx) => {
      const [m] = await tx.select().from(members).where(eq(members.id, id)).for("update");
      if (!m) throw httpError(404, "Member not found");

      const [plan] = planTier
        ? await tx.select().from(membershipPlans).where(eq(membershipPlans.tier, planTier))
        : await tx.select().from(membershipPlans).where(eq(membershipPlans.id, m.planId));

      assertTierMatchesAge(plan.tier, m.dateOfBirth);

      const now = new Date();
      const startsAt = m.expiresAt > now ? m.expiresAt : now;
      const endsAt = addMonths(startsAt, durationMonths);

      const [updated] = await tx
        .update(members)
        .set({ planId: plan.id, expiresAt: endsAt })
        .where(eq(members.id, id))
        .returning();

      await tx.insert(membershipHistory).values({
        memberId: id,
        planId: plan.id,
        startsAt,
        endsAt,
        amountPaid: money(plan.monthlyFee * durationMonths),
        createdBy: req.user.id,
      });

      return { ...updated, plan: { tier: plan.tier, name: plan.name } };
    });

    res.json(withStatus(result));
  }
);

export default router;

