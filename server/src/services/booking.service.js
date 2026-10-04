import { and, count, eq, gte, lt } from "drizzle-orm";
import { bookings, courts, members, membershipPlans, socialParticipants } from "../db/schema.all.js";
import { env } from "../config/env.js";
import { httpError } from "../utils/httpError.js";
import { DAY, hhmm, localDayBounds, minutesOfLocalDay } from "../utils/time.js";
import { MAX_DAYS_AHEAD, SLOT_STEP_MIN } from "../utils/rules.js";

export function assertValidSlot(startsAt, durationMin, now = new Date()) {
  if (startsAt.getUTCSeconds() !== 0 || startsAt.getUTCMilliseconds() !== 0) {
    throw httpError(400, "Start time must have no seconds");
  }
  const startMin = minutesOfLocalDay(startsAt);
  if (startMin % SLOT_STEP_MIN !== 0) throw httpError(400, "Slots start on the hour or half hour");
  if (startsAt <= now) throw httpError(400, "Cannot book a slot in the past");
  if (startsAt.getTime() - now.getTime() > MAX_DAYS_AHEAD * DAY) {
    throw httpError(400, `Bookings open up to ${MAX_DAYS_AHEAD} days ahead`);
  }
  const open = env.CLUB_OPEN_HOUR * 60;
  const close = env.CLUB_CLOSE_HOUR * 60;
  if (startMin < open || startMin + durationMin > close) {
    throw httpError(400, `Outside opening hours (${hhmm(open)} to ${hhmm(close)})`);
  }
}

export async function getActiveCourt(tx, courtId) {
  const [court] = await tx.select().from(courts).where(and(eq(courts.id, courtId), eq(courts.isActive, true)));
  if (!court) throw httpError(404, "Court not found or inactive");
  return court;
}

// How many sessions a member is already playing in [start, end): own bookings + social spots
export async function playsBetween(tx, memberId, start, end) {
  const [{ n: own }] = await tx
    .select({ n: count() })
    .from(bookings)
    .where(and(
      eq(bookings.memberId, memberId), eq(bookings.kind, "regular"), eq(bookings.status, "confirmed"),
      gte(bookings.startsAt, start), lt(bookings.startsAt, end)
    ));
  const [{ n: social }] = await tx
    .select({ n: count() })
    .from(socialParticipants)
    .innerJoin(bookings, eq(socialParticipants.bookingId, bookings.id))
    .where(and(
      eq(socialParticipants.memberId, memberId), eq(socialParticipants.status, "confirmed"),
      eq(bookings.status, "confirmed"), gte(bookings.startsAt, start), lt(bookings.startsAt, end)
    ));
  return own + social;
}

// Locks the member, then checks expiry and the daily limit. Returns member + plan.
export async function loadBookableMember(tx, ref, startsAt) {
  const cond = ref.memberId
    ? eq(members.id, ref.memberId)
    : eq(members.memberCode, ref.memberCode.toUpperCase());
  const [member] = await tx.select().from(members).where(cond).for("update");
  if (!member) throw httpError(404, "Member not found");

  if (member.expiresAt <= startsAt) {
    throw httpError(409, `Membership ends ${member.expiresAt.toISOString().slice(0, 10)}; renew before booking`);
  }

  const [plan] = await tx.select().from(membershipPlans).where(eq(membershipPlans.id, member.planId));
  const { start, end } = localDayBounds(startsAt);
  const played = await playsBetween(tx, member.id, start, end);
  if (played >= plan.maxBookingsPerDay) {
    throw httpError(409, `Daily limit reached (${plan.maxBookingsPerDay} sessions per day on the ${plan.name} plan)`);
  }
  return { member, plan };
}
