import { Router } from "express";
import { z } from "zod";
import { and, count, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { bookings, courts, socialParticipants } from "../db/schema.all.js";
import { validate } from "../middleware/validate.js";
import { env } from "../config/env.js";
import { DAY, MIN, dayStartFromDateString, hhmm, localDateString } from "../utils/time.js";
import { SESSION_MIN, SLOT_STEP_MIN } from "../utils/rules.js";

const router = Router();

router.get(
  "/",
  validate({
    query: z.object({
      date: z.iso.date(),
      days: z.coerce.number().int().min(1).max(7).default(1),
      sport: z.enum(["tennis", "cricket", "padel", "badminton"]).optional(),
    }),
  }),
  async (req, res) => {
    const { date, days, sport } = req.valid.query;
    const firstDay = dayStartFromDateString(date);
    const rangeEnd = new Date(firstDay.getTime() + days * DAY);
    const now = new Date();

    const courtRows = await db.select().from(courts)
      .where(and(eq(courts.isActive, true), sport ? eq(courts.sport, sport) : undefined))
      .orderBy(courts.sport, courts.name);
    const ids = courtRows.map((c) => c.id);

    const busy = ids.length
      ? await db
          .select({
            id: bookings.id, courtId: bookings.courtId, kind: bookings.kind, title: bookings.title,
            capacity: bookings.capacity, startsAt: bookings.startsAt, endsAt: bookings.endsAt,
          })
          .from(bookings)
          .where(and(
            inArray(bookings.courtId, ids), eq(bookings.status, "confirmed"),
            lt(bookings.startsAt, rangeEnd), gt(bookings.endsAt, firstDay)
          ))
      : [];

    const socialIds = busy.filter((b) => b.kind === "social").map((b) => b.id);
    const joined = socialIds.length
      ? await db
          .select({ bookingId: socialParticipants.bookingId, n: count() })
          .from(socialParticipants)
          .where(and(inArray(socialParticipants.bookingId, socialIds), eq(socialParticipants.status, "confirmed")))
          .groupBy(socialParticipants.bookingId)
      : [];
    const joinedMap = new Map(joined.map((j) => [j.bookingId, j.n]));

    const result = [];
    for (let d = 0; d < days; d++) {
      const dayStart = new Date(firstDay.getTime() + d * DAY);
      result.push({
        date: localDateString(dayStart),
        courts: courtRows.map((c) => {
          const slots = [];
          for (let t = env.CLUB_OPEN_HOUR * 60; t + SESSION_MIN <= env.CLUB_CLOSE_HOUR * 60; t += SLOT_STEP_MIN) {
            const s = new Date(dayStart.getTime() + t * MIN);
            const e = new Date(s.getTime() + SESSION_MIN * MIN);
            const hit = busy.find((b) => b.courtId === c.id && b.startsAt < e && b.endsAt > s);

            let slot = { startsAt: s.toISOString(), time: hhmm(t), state: "free" };
            if (hit?.kind === "social") {
              slot = {
                ...slot, state: "social", bookingId: hit.id, title: hit.title,
                spotsLeft: Math.max(0, hit.capacity - (joinedMap.get(hit.id) ?? 0)),
              };
            } else if (hit) slot.state = "booked";
            else if (s <= now) slot.state = "past";
            slots.push(slot);
          }
          return { id: c.id, name: c.name, sport: c.sport, ratePerHour: c.ratePerHour, slots };
        }),
      });
    }
    res.json(result);
  }
);

export default router;
