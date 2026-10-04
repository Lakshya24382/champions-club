import { Router } from "express";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { and, desc, eq, gt, inArray, like, lt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { bookings, courts, members, membershipPlans, trialClaims, enquiries } from "../db/schema.all.js";
import { env } from "../config/env.js";
import { validate } from "../middleware/validate.js";
import { httpError } from "../utils/httpError.js";
import { phoneKey } from "../utils/phone.js";
import { hhmm, localDateString, minutesOfLocalDay } from "../utils/time.js";
import { MIN } from "../utils/time.js";
import { SESSION_MIN, SOCIAL } from "../utils/rules.js";
import { assertValidSlot } from "../services/booking.service.js";
import { addNote, createEnquiry } from "../services/enquiry.service.js";
import { notifyCustomer } from "../services/notify.service.js";

const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.PUBLIC_RATE_LIMIT,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const phone = z.string().trim().regex(/^\+?[0-9]{10,13}$/, "Invalid phone number");
const sport = z.enum(["tennis", "cricket", "padel", "badminton"]);
const tier = z.enum(["gold", "silver", "junior"]);

const perksFor = (p) => [
  p.courtDiscountPct === 100 ? "Free court bookings" : `${p.courtDiscountPct}% off court bookings`,
  `${p.shopDiscountPct}% off at the pro shop`,
  `${p.barDiscountPct}% off at the bar and cafe`,
  `Up to ${p.maxBookingsPerDay} sessions a day`,
];

// ---------- Everything the website's front page needs ----------
router.get("/club", async (_req, res) => {
  const plans = await db.select().from(membershipPlans).orderBy(desc(membershipPlans.monthlyFee));
  const sports = await db
    .select({
      sport: courts.sport,
      courts: sql`count(*)::int`,
      fromPricePerHour: sql`min(${courts.ratePerHour})::float8`,
    })
    .from(courts).where(eq(courts.isActive, true)).groupBy(courts.sport).orderBy(courts.sport);

  res.json({
    name: env.CLUB_NAME,
    contact: { phone: env.CLUB_PHONE, email: env.CLUB_EMAIL, address: env.CLUB_ADDRESS },
    hours: { opens: hhmm(env.CLUB_OPEN_HOUR * 60), closes: hhmm(env.CLUB_CLOSE_HOUR * 60), daily: true },
    sports,
    plans: plans.map((p) => ({
      tier: p.tier, name: p.name, description: p.description, monthlyFee: p.monthlyFee,
      courtDiscountPct: p.courtDiscountPct, shopDiscountPct: p.shopDiscountPct, barDiscountPct: p.barDiscountPct,
      perks: perksFor(p),
    })),
    socialPlay: { day: "Friday", from: `${SOCIAL.fromHour}:00`, note: "Shared courts, join a session" },
    freeTrial: { available: true, note: "One free 1-hour trial per person" },
    links: {
      availability: "/api/availability?date=YYYY-MM-DD&days=7",
      shop: "/api/shop/products",
      trial: "POST /api/public/trial",
      enquiry: "POST /api/public/enquiries",
    },
  });
});

// ---------- Contact form ----------
router.post(
  "/enquiries",
  limiter,
  validate({
    body: z
      .object({
        name: z.string().trim().min(2).max(120),
        phone,
        email: z.email().optional(),
        type: z.enum(["membership", "corporate", "general"]).default("general"),
        interestedPlan: tier.optional(),
        sport: sport.optional(),
        companyName: z.string().trim().min(2).max(150).optional(),
        message: z.string().trim().min(5).max(1000),
      })
      .refine((b) => b.type !== "corporate" || b.companyName, {
        message: "companyName is required for corporate enquiries",
        path: ["companyName"],
      }),
  }),
  async (req, res) => {
    const out = await db.transaction((tx) => createEnquiry(tx, { ...req.valid.body, source: "website", createdBy: null }));
    res.status(201).json({
      reference: out.enquiry.ref,
      message: "Thanks for getting in touch. We will contact you within one working day.",
    });
  }
);

// ---------- Book a free trial session ----------
router.post(
  "/trial",
  limiter,
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(120),
      phone,
      email: z.email().optional(),
      sport,
      startsAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s)),
      message: z.string().trim().max(500).optional(),
    }),
  }),
  async (req, res) => {
    const b = req.valid.body;
    const key = phoneKey(b.phone);
    assertValidSlot(b.startsAt, SESSION_MIN);
    const endsAt = new Date(b.startsAt.getTime() + SESSION_MIN * MIN);

    const out = await db.transaction(async (tx) => {
      const [existingMember] = await tx.select({ id: members.id }).from(members).where(like(members.phone, `%${key}`)).limit(1);
      if (existingMember) {
        throw httpError(409, "This number belongs to an existing member. Please book as a member, or ask the front desk.");
      }

      // The unique index on phone_key is what enforces one trial per phone, even under races.
      const [claim] = await tx.insert(trialClaims).values({ phoneKey: key, name: b.name })
        .onConflictDoNothing({ target: trialClaims.phoneKey }).returning();
      if (!claim) {
        throw httpError(409, "A free trial has already been used with this number. Contact us to book a paid session or join.");
      }

      const candidates = await tx.select().from(courts)
        .where(and(eq(courts.sport, b.sport), eq(courts.isActive, true))).orderBy(courts.id);
      if (!candidates.length) throw httpError(404, "No courts available for that sport");

      const busy = await tx.select({ courtId: bookings.courtId }).from(bookings)
        .where(and(
          inArray(bookings.courtId, candidates.map((c) => c.id)), eq(bookings.status, "confirmed"),
          lt(bookings.startsAt, endsAt), gt(bookings.endsAt, b.startsAt)
        ));
      const busyIds = new Set(busy.map((x) => x.courtId));
      const court = candidates.find((c) => !busyIds.has(c.id));
      if (!court) throw httpError(409, "No court of that sport is free at that time. Please pick another slot.");

      // If someone grabs the same court a split second earlier, Postgres rejects this insert
      // (23P01 -> 409) and the whole transaction, including the trial claim, is rolled back.
      const [booking] = await tx.insert(bookings).values({
        courtId: court.id, kind: "regular", startsAt: b.startsAt, endsAt,
        guestName: b.name, guestPhone: b.phone, price: 0,
      }).returning();

      const { enquiry } = await createEnquiry(tx, {
        type: "trial", source: "website", name: b.name, phone: b.phone, email: b.email,
        sport: b.sport, message: b.message ?? `Free ${b.sport} trial`, createdBy: null,
      });
      const when = `${localDateString(b.startsAt)} at ${hhmm(minutesOfLocalDay(b.startsAt))}`;
      await addNote(tx, enquiry.id, null, "system", `Free trial booked: ${court.name}, ${when} (booking #${booking.id})`);

      await tx.update(enquiries).set({ trialBookingId: booking.id, updatedAt: new Date() }).where(eq(enquiries.id, enquiry.id));
      await tx.update(trialClaims).set({ bookingId: booking.id, enquiryId: enquiry.id }).where(eq(trialClaims.id, claim.id));

      await notifyCustomer(tx, {
        email: b.email, phone: b.phone,
        subject: `Your free trial is booked (${court.name}, ${when})`,
        body: `Hi ${b.name},\n\nYour free ${b.sport} trial is confirmed.\nCourt: ${court.name}\nWhen: ${when}\n\nPlease arrive 10 minutes early. See you at ${env.CLUB_NAME}!`,
        relatedType: "booking", relatedId: booking.id,
      });

      return { booking, court, enquiry, when };
    });

    res.status(201).json({
      message: "Your free trial is booked.",
      reference: out.enquiry.ref,
      booking: {
        id: out.booking.id, court: out.court.name, sport: out.court.sport,
        startsAt: out.booking.startsAt, endsAt: out.booking.endsAt, price: 0,
      },
    });
  }
);

export default router;
