import { query, withTransaction } from '../db.js';
import { rules } from '../config.js';
import { HttpError } from '../utils/httpError.js';
import { toMin, slotStarts, isSocialSlot } from '../utils/slots.js';

// ---------- Availability grid for one day ----------
export async function getAvailability(date) {
  const { rows: courts } = await query(
    `SELECT id, name, sport, price_per_hour, social_price_per_person, social_capacity
       FROM courts WHERE is_active ORDER BY sport, name`);

  const { rows: booked } = await query(
    `SELECT court_id, kind, to_char(start_at, 'HH24:MI') AS start_time
       FROM bookings
      WHERE status = 'confirmed'
        AND start_at >= $1::date::timestamptz
        AND start_at <  ($1::date + 1)::timestamptz`,
    [date]);

  const { rows: [now] } = await query(
    `SELECT to_char(now(), 'YYYY-MM-DD') AS today, to_char(now(), 'HH24:MI') AS time`);

  const starts = slotStarts();

  return courts.map((court) => ({
    ...court,
    slots: starts.map((time) => {
      const m = toMin(time);
      // Any booking whose hour overlaps this slot's hour
      const overlapping = booked.filter(
        (b) => b.court_id === court.id && Math.abs(toMin(b.start_time) - m) < rules.sessionMin);
      const social = isSocialSlot(date, time);
      const isPast = date < now.today || (date === now.today && time <= now.time);
      const socialCount = overlapping.filter((b) => b.kind === 'social').length;
      const hasStandard = overlapping.some((b) => b.kind === 'standard');

      let state;
      if (isPast) state = 'past';
      else if (social) state = hasStandard ? 'booked' : socialCount >= court.social_capacity ? 'full' : 'social';
      else state = overlapping.length ? 'booked' : 'available';

      return {
        time,
        state,
        spotsLeft: social ? Math.max(court.social_capacity - socialCount, 0) : undefined,
      };
    }),
  }));
}

// ---------- List of bookings for a day ----------
export async function listBookings(date) {
  const { rows } = await query(
    `SELECT b.id, b.kind, b.status, b.price, b.discount_pct,
            to_char(b.start_at, 'HH24:MI') AS start_time,
            to_char(b.end_at,   'HH24:MI') AS end_time,
            c.name AS court_name,
            COALESCE(m.full_name, b.guest_name) AS player,
            m.member_code,
            (b.member_id IS NULL) AS is_walk_in
       FROM bookings b
       JOIN courts c ON c.id = b.court_id
       LEFT JOIN members m ON m.id = b.member_id
      WHERE b.start_at >= $1::date::timestamptz
        AND b.start_at <  ($1::date + 1)::timestamptz
      ORDER BY b.start_at, c.name`,
    [date]);
  return rows;
}

// ---------- Create a booking ----------
export async function createBooking(input, userId) {
  const { courtId, date, time, memberId, guestName, guestPhone } = input;

  const startMin = toMin(time);
  if (startMin < toMin(rules.openTime) || startMin + rules.sessionMin > toMin(rules.closeTime)) {
    throw new HttpError(400, `Sessions must fit between ${rules.openTime} and ${rules.closeTime}`);
  }

  return withTransaction(async (c) => {
    // 1) Lock the court row: concurrent bookings for this court now queue up.
    const { rows: [court] } = await c.query(
      'SELECT * FROM courts WHERE id = $1 AND is_active FOR UPDATE', [courtId]);
    if (!court) throw new HttpError(404, 'Court not found');

    // 2) Build the exact time window (in the club's timezone)
    const { rows: [w] } = await c.query(
      `SELECT t.start_at,
              t.start_at + make_interval(mins => $3::int) AS end_at,
              t.start_at > now() AS in_future
         FROM (SELECT ($1::date + $2::time)::timestamptz AS start_at) t`,
      [date, time, rules.sessionMin]);
    if (!w.in_future) throw new HttpError(400, 'That slot has already started');

    const kind = isSocialSlot(date, time) ? 'social' : 'standard';

    // 3) Who is playing, and what do they get?
    let discountPct = 0;
    if (memberId) {
      const { rows: [m] } = await c.query(
        `SELECT m.*, p.court_discount_pct
           FROM members m JOIN membership_plans p ON p.id = m.plan_id
          WHERE m.id = $1 FOR UPDATE OF m`,
        [memberId]);
      if (!m) throw new HttpError(404, 'Member not found');
      if (!m.is_active) throw new HttpError(403, 'This membership is inactive');
      if (m.expires_on < date) throw new HttpError(403, `Membership expires on ${m.expires_on}. Please renew first`);

      const { rows: [{ n }] } = await c.query(
        `SELECT count(*)::int AS n FROM bookings
          WHERE member_id = $1 AND status = 'confirmed'
            AND start_at >= $2::date::timestamptz
            AND start_at <  ($2::date + 1)::timestamptz`,
        [memberId, date]);
      if (n >= rules.maxBookingsPerDay) {
        throw new HttpError(409, `Members can book at most ${rules.maxBookingsPerDay} sessions per day`);
      }
      discountPct = m.court_discount_pct;
    } else if (!guestName) {
      throw new HttpError(400, 'Walk-ins need a name');
    }

    // 4) Standard and social bookings may never share a court at the same time
    const otherKind = kind === 'social' ? 'standard' : 'social';
    const { rows: [clash] } = await c.query(
      `SELECT count(*)::int AS n FROM bookings
        WHERE court_id = $1 AND status = 'confirmed' AND kind = $2
          AND tstzrange(start_at, end_at) && tstzrange($3::timestamptz, $4::timestamptz)`,
      [courtId, otherKind, w.start_at, w.end_at]);
    if (clash.n > 0) throw new HttpError(409, 'The court is not available at this time');

    // 5) Social play: respect capacity (conservative: counts everyone overlapping the hour)
    if (kind === 'social') {
      const { rows: [cap] } = await c.query(
        `SELECT count(*)::int AS n FROM bookings
          WHERE court_id = $1 AND status = 'confirmed' AND kind = 'social'
            AND tstzrange(start_at, end_at) && tstzrange($2::timestamptz, $3::timestamptz)`,
        [courtId, w.start_at, w.end_at]);
      if (cap.n >= court.social_capacity) throw new HttpError(409, 'This social session is full');
    }

    // 6) Price: base rate minus plan discount (Gold = 100% off = free)
    const base = kind === 'social' ? court.social_price_per_person : court.price_per_hour;
    const price = Math.round(base * (100 - discountPct)) / 100;

    // 7) Insert. If anything slipped past, the EXCLUDE constraint rejects it (-> 409).
    const { rows: [booking] } = await c.query(
      `INSERT INTO bookings
         (court_id, member_id, guest_name, guest_phone, start_at, end_at, kind, price, discount_pct, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [courtId, memberId ?? null, guestName ?? null, guestPhone ?? null,
       w.start_at, w.end_at, kind, price, discountPct, userId]);
    return booking;
  });
}

// ---------- Cancel ----------
export async function cancelBooking(id, reason) {
  const { rows: [b] } = await query(
    `UPDATE bookings
        SET status = 'cancelled', cancelled_at = now(), cancel_reason = $2
      WHERE id = $1 AND status = 'confirmed' AND start_at > now()
      RETURNING *`,
    [id, reason ?? null]);
  if (!b) throw new HttpError(409, 'Booking not found, already cancelled, or already started');
  return b; // cancelled rows drop out of the constraint, so the slot frees up automatically
}
