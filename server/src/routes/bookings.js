import { Router } from "express";
import { z } from "zod";
import { and, asc, count, eq, gte, lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { bookings, courts, members, socialParticipants } from "../db/schema.all.js";
import { validate } from "../middleware/validate.js";
import { requireRole } from "../middleware/auth.js";
import { httpError } from "../utils/httpError.js";
import { priceFor } from "../utils/pricing.js";
import { DAY, MIN, dayStartFromDateString, localDayOfWeek, minutesOfLocalDay } from "../utils/time.js";
import { SESSION_MIN, SLOT_STEP_MIN, SOCIAL } from "../utils/rules.js";
import { assertValidSlot, getActiveCourt, loadBookableMember } from "../services/booking.service.js";

const router = Router();

const idParam = z.object({ id: z.coerce.number().int().positive() });
const phone = z.string().trim().regex(/^\+?[0-9]{10,13}$/, "Invalid phone number");
const startsAtSchema = z.iso.datetime({ offset: true }).transform((s) => new Date(s));

const personFields = {
  memberId: z.number().int().positive().optional(),
  memberCode: z.string().trim().min(3).optional(),
  guestName: z.string().trim().min(2).max(120).optional(),
  guestPhone: phone.optional(),
};
const hasPerson = (b) => b.memberId || b.memberCode || (b.guestName && b.guestPhone);
const personMsg = "Provide memberId/memberCode, or walk-in guestName + guestPhone";
const isMember = (b) => Boolean(b.memberId || b.memberCode);

// ---------- Create a regular booking ----------
router.post(
  "/",
  validate({
    body: z
      .object({ courtId: z.number().int().positive(), startsAt: startsAtSchema, ...personFields })
      .refine(hasPerson, personMsg),
  }),
  async (req, res) => {
    const b = req.valid.body;
    assertValidSlot(b.startsAt, SESSION_MIN);
    const endsAt = new Date(b.startsAt.getTime() + SESSION_MIN * MIN);

    const booking = await db.transaction(async (tx) => {
      const court = await getActiveCourt(tx, b.courtId);
      let price = court.ratePerHour;
      let memberId = null;

      if (isMember(b)) {
        const { member, plan } = await loadBookableMember(tx, b, b.startsAt);
        memberId = member.id;
        price = priceFor(court.ratePerHour, plan.courtDiscountPct);
      }

      // If another request grabbed this slot first, Postgres raises 23P01 -> HTTP 409
      const [row] = await tx.insert(bookings).values({
        courtId: court.id, kind: "regular", startsAt: b.startsAt, endsAt, memberId,
        guestName: memberId ? null : b.guestName,
        guestPhone: memberId ? null : b.guestPhone,
        price, createdBy: req.user.id,
      }).returning();

      return { ...row, court: { id: court.id, name: court.name, sport: court.sport } };
    });

    res.status(201).json(booking);
  }
);

// ---------- Create a Friday social session ----------
router.post(
  "/social",
  requireRole("owner", "manager"),
  validate({
    body: z.object({
      courtId: z.number().int().positive(),
      startsAt: startsAtSchema,
      durationMinutes: z.number().int().min(SOCIAL.minMinutes).max(SOCIAL.maxMinutes)
        .refine((v) => v % SLOT_STEP_MIN === 0, "Duration must be a multiple of 30 minutes"),
      capacity: z.number().int().min(2).max(40),
      pricePerPlayer: z.number().min(0),
      title: z.string().trim().max(120).optional(),
    }),
  }),
  async (req, res) => {
    const b = req.valid.body;
    assertValidSlot(b.startsAt, b.durationMinutes);
    if (localDayOfWeek(b.startsAt) !== SOCIAL.dayOfWeek || minutesOfLocalDay(b.startsAt) < SOCIAL.fromHour * 60) {
      throw httpError(400, `Social play runs on Friday evenings, from ${SOCIAL.fromHour}:00`);
    }
    const endsAt = new Date(b.startsAt.getTime() + b.durationMinutes * MIN);

    const row = await db.transaction(async (tx) => {
      const court = await getActiveCourt(tx, b.courtId);
      const [created] = await tx.insert(bookings).values({
        courtId: court.id, kind: "social", startsAt: b.startsAt, endsAt,
        capacity: b.capacity, pricePerPlayer: b.pricePerPlayer,
        title: b.title ?? `Friday Social - ${court.name}`, createdBy: req.user.id,
      }).returning();
      return created;
    });

    res.status(201).json(row);
  }
);

// ---------- List ----------
router.get(
  "/",
  validate({
    query: z.object({
      date: z.iso.date().optional(),
      courtId: z.coerce.number().int().positive().optional(),
      memberId: z.coerce.number().int().positive().optional(),
      status: z.enum(["confirmed", "cancelled"]).optional(),
    }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    const dayStart = q.date ? dayStartFromDateString(q.date) : null;

    const where = and(
      dayStart ? gte(bookings.startsAt, dayStart) : undefined,
      dayStart ? lt(bookings.startsAt, new Date(dayStart.getTime() + DAY)) : undefined,
      q.courtId ? eq(bookings.courtId, q.courtId) : undefined,
      q.memberId ? eq(bookings.memberId, q.memberId) : undefined,
      q.status ? eq(bookings.status, q.status) : undefined
    );

    const rows = await db
      .select({
        booking: bookings,
        court: { id: courts.id, name: courts.name, sport: courts.sport },
        memberName: members.fullName,
        memberCode: members.memberCode,
      })
      .from(bookings)
      .innerJoin(courts, eq(bookings.courtId, courts.id))
      .leftJoin(members, eq(bookings.memberId, members.id))
      .where(where)
      .orderBy(asc(bookings.startsAt))
      .limit(200);

    res.json(rows.map((r) => ({ ...r.booking, court: r.court, memberName: r.memberName, memberCode: r.memberCode })));
  }
);

// ---------- Detail (with participants for social sessions) ----------
router.get("/:id", validate({ params: idParam }), async (req, res) => {
  const { id } = req.valid.params;
  const [row] = await db
    .select({ booking: bookings, court: courts, memberName: members.fullName, memberCode: members.memberCode })
    .from(bookings)
    .innerJoin(courts, eq(bookings.courtId, courts.id))
    .leftJoin(members, eq(bookings.memberId, members.id))
    .where(eq(bookings.id, id));
  if (!row) throw httpError(404, "Booking not found");

  const participants = await db
    .select({
      id: socialParticipants.id,
      memberCode: members.memberCode,
      memberName: members.fullName,
      guestName: socialParticipants.guestName,
      price: socialParticipants.price,
      status: socialParticipants.status,
    })
    .from(socialParticipants)
    .leftJoin(members, eq(socialParticipants.memberId, members.id))
    .where(eq(socialParticipants.bookingId, id))
    .orderBy(asc(socialParticipants.id));

  const joined = participants.filter((p) => p.status === "confirmed").length;
  res.json({
    ...row.booking,
    court: row.court,
    memberName: row.memberName,
    memberCode: row.memberCode,
    participants,
    spotsLeft: row.booking.kind === "social" ? Math.max(0, row.booking.capacity - joined) : null,
  });
});

// ---------- Cancel a booking / session ----------
router.post(
  "/:id/cancel",
  validate({ params: idParam, body: z.object({ reason: z.string().trim().max(255).optional() }) }),
  async (req, res) => {
    const { id } = req.valid.params;
    const now = new Date();

    const updated = await db.transaction(async (tx) => {
      const [b] = await tx.select().from(bookings).where(eq(bookings.id, id)).for("update");
      if (!b) throw httpError(404, "Booking not found");
      if (b.status === "cancelled") throw httpError(409, "Already cancelled");
      if (b.startsAt <= now) throw httpError(409, "Cannot cancel a session that has started");

      const [row] = await tx.update(bookings)
        .set({ status: "cancelled", cancelledAt: now, cancelReason: req.valid.body.reason })
        .where(eq(bookings.id, id)).returning();

      if (b.kind === "social") {
        await tx.update(socialParticipants).set({ status: "cancelled" })
          .where(and(eq(socialParticipants.bookingId, id), eq(socialParticipants.status, "confirmed")));
      }
      return row;
    });

    res.json(updated);
  }
);

// ---------- Join a social session ----------
router.post(
  "/:id/join",
  validate({ params: idParam, body: z.object(personFields).refine(hasPerson, personMsg) }),
  async (req, res) => {
    const { id } = req.valid.params;
    const b = req.valid.body;

    const participant = await db.transaction(async (tx) => {
      // Lock the session row so two people can't take the last spot together
      const [s] = await tx.select().from(bookings)
        .where(and(eq(bookings.id, id), eq(bookings.kind, "social"))).for("update");
      if (!s || s.status !== "confirmed") throw httpError(404, "Social session not found");
      if (s.startsAt <= new Date()) throw httpError(409, "Session has already started");

      const [{ n }] = await tx.select({ n: count() }).from(socialParticipants)
        .where(and(eq(socialParticipants.bookingId, id), eq(socialParticipants.status, "confirmed")));
      if (n >= s.capacity) throw httpError(409, "Session is full");

      let price = s.pricePerPlayer;
      let memberId = null;
      if (isMember(b)) {
        const { member, plan } = await loadBookableMember(tx, b, s.startsAt);
        const [dup] = await tx.select({ id: socialParticipants.id }).from(socialParticipants)
          .where(and(eq(socialParticipants.bookingId, id), eq(socialParticipants.memberId, member.id),
            eq(socialParticipants.status, "confirmed")));
        if (dup) throw httpError(409, "Member has already joined this session");
        memberId = member.id;
        price = priceFor(s.pricePerPlayer, plan.courtDiscountPct);
      }

      const [row] = await tx.insert(socialParticipants).values({
        bookingId: id, memberId,
        guestName: memberId ? null : b.guestName,
        guestPhone: memberId ? null : b.guestPhone,
        price, createdBy: req.user.id,
      }).returning();
      return { ...row, spotsLeft: s.capacity - n - 1 };
    });

    res.status(201).json(participant);
  }
);

// ---------- Leave a social session ----------
router.post(
  "/:id/participants/:participantId/cancel",
  validate({ params: z.object({ id: z.coerce.number().int().positive(), participantId: z.coerce.number().int().positive() }) }),
  async (req, res) => {
    const { id, participantId } = req.valid.params;
    const [s] = await db.select().from(bookings).where(eq(bookings.id, id));
    if (!s) throw httpError(404, "Session not found");
    if (s.startsAt <= new Date()) throw httpError(409, "Session has already started");

    const [row] = await db.update(socialParticipants).set({ status: "cancelled" })
      .where(and(eq(socialParticipants.id, participantId), eq(socialParticipants.bookingId, id),
        eq(socialParticipants.status, "confirmed")))
      .returning();
    if (!row) throw httpError(404, "Participant not found or already cancelled");
    res.json(row);
  }
);

export default router;
