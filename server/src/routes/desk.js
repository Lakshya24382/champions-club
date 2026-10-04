import { Router } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { bookings, collections, members, membershipHistory, membershipPlans, socialParticipants } from "../db/schema.all.js";
import { env } from "../config/env.js";
import { validate } from "../middleware/validate.js";
import { httpError } from "../utils/httpError.js";
import { localDateString } from "../utils/time.js";
import { renderDocument } from "../utils/printDoc.js";
import { pendingCollections, round2 } from "../services/finance.service.js";

const router = Router();

// Court bookings and memberships whose payment method has not been recorded yet
router.get("/collections/pending", async (_req, res) => {
  res.json(await pendingCollections(db));
});

router.post(
  "/collections",
  validate({
    body: z.object({
      kind: z.enum(["court", "social", "membership"]),
      refId: z.number().int().positive(),
      method: z.enum(["cash", "card", "upi"]),
    }),
  }),
  async (req, res) => {
    const { kind, refId, method } = req.valid.body;

    const row = await db.transaction(async (tx) => {
      let amount;
      if (kind === "court") {
        const [b] = await tx.select().from(bookings).where(and(eq(bookings.id, refId), eq(bookings.kind, "regular"), eq(bookings.status, "confirmed")));
        amount = b?.price;
      } else if (kind === "social") {
        const [p] = await tx
          .select({ price: socialParticipants.price })
          .from(socialParticipants).innerJoin(bookings, eq(socialParticipants.bookingId, bookings.id))
          .where(and(eq(socialParticipants.id, refId), eq(socialParticipants.status, "confirmed"), eq(bookings.status, "confirmed")));
        amount = p?.price;
      } else {
        const [h] = await tx.select().from(membershipHistory).where(eq(membershipHistory.id, refId));
        amount = h?.amountPaid;
      }
      if (amount === undefined) throw httpError(404, "Nothing found to collect for that id");
      if (amount <= 0) throw httpError(400, "Nothing to collect (this one is free)");

      const [dup] = await tx.select({ id: collections.id }).from(collections).where(and(eq(collections.kind, kind), eq(collections.refId, refId)));
      if (dup) throw httpError(409, "Payment already recorded");

      const [created] = await tx.insert(collections).values({ kind, refId, method, amount, receivedBy: req.user.id }).returning();
      return created;
    });
    res.status(201).json(row);
  }
);

// Printable membership receipt (price includes GST)
router.get("/receipts/membership/:id", validate({ params: z.object({ id: z.coerce.number().int().positive() }) }), async (req, res) => {
  const [r] = await db
    .select({ h: membershipHistory, m: members, plan: membershipPlans.name })
    .from(membershipHistory)
    .innerJoin(members, eq(membershipHistory.memberId, members.id))
    .innerJoin(membershipPlans, eq(membershipHistory.planId, membershipPlans.id))
    .where(eq(membershipHistory.id, req.valid.params.id));
  if (!r) throw httpError(404, "Membership record not found");

  const rate = env.GST_RATE_PCT;
  const total = r.h.amountPaid;
  const taxable = round2((total * 100) / (100 + rate));
  res.type("html").send(renderDocument({
    title: "Membership Receipt", number: `MR-${String(r.h.id).padStart(6, "0")}`, date: localDateString(r.h.createdAt),
    billTo: { name: r.m.fullName, contact: `${r.m.memberCode} | ${r.m.phone}` },
    items: [{
      description: `${r.plan} membership, ${localDateString(r.h.startsAt)} to ${localDateString(r.h.endsAt)}`,
      quantity: 1, unitPrice: taxable, lineTotal: taxable,
    }],
    subtotal: taxable, discountPct: 0, discountAmount: 0, taxRatePct: rate, taxAmount: round2(total - taxable), total,
    notes: "Amount includes GST.",
  }));
});

export default router;
