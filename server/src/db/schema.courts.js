import {
  pgTable, pgEnum, serial, integer, varchar, numeric, boolean,
  timestamp, index, uniqueIndex, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { members, users } from "./schema.js";

export const sportEnum = pgEnum("sport", ["tennis", "cricket", "padel", "badminton"]);
export const bookingKindEnum = pgEnum("booking_kind", ["regular", "social"]);
export const bookingStatusEnum = pgEnum("booking_status", ["confirmed", "cancelled"]);

const money = (name) => numeric(name, { precision: 10, scale: 2, mode: "number" });
const ts = (name) => timestamp(name, { withTimezone: true });

export const courts = pgTable("courts", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 60 }).notNull().unique(),
  sport: sportEnum("sport").notNull(),
  ratePerHour: money("rate_per_hour").notNull(), // walk-in price
  isActive: boolean("is_active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// One table for everything that occupies a court. "regular" = one party books the court.
// "social" = the court is reserved for a shared session; players join via social_participants.
// The overlap guard (custom SQL migration) applies to ALL confirmed rows here.
export const bookings = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    courtId: integer("court_id").notNull().references(() => courts.id),
    kind: bookingKindEnum("kind").notNull().default("regular"),
    status: bookingStatusEnum("status").notNull().default("confirmed"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at").notNull(),

    memberId: integer("member_id").references(() => members.id), // null for walk-ins and social
    guestName: varchar("guest_name", { length: 120 }),
    guestPhone: varchar("guest_phone", { length: 20 }),
    price: money("price").notNull().default(0), // regular: amount charged. social: 0 (revenue is per player)

    title: varchar("title", { length: 120 }),            // social only
    capacity: integer("capacity"),                       // social only
    pricePerPlayer: money("price_per_player"),           // social only

    cancelledAt: ts("cancelled_at"),
    cancelReason: varchar("cancel_reason", { length: 255 }),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("bookings_court_time_idx").on(t.courtId, t.startsAt),
    index("bookings_member_time_idx").on(t.memberId, t.startsAt),
    check("bookings_time_order", sql`${t.endsAt} > ${t.startsAt}`),
    check(
      "bookings_social_fields",
      sql`${t.kind} = 'regular' or (${t.capacity} is not null and ${t.pricePerPlayer} is not null)`
    ),
  ]
);

export const socialParticipants = pgTable(
  "social_participants",
  {
    id: serial("id").primaryKey(),
    bookingId: integer("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
    memberId: integer("member_id").references(() => members.id),
    guestName: varchar("guest_name", { length: 120 }),
    guestPhone: varchar("guest_phone", { length: 20 }),
    price: money("price").notNull(),
    status: bookingStatusEnum("status").notNull().default("confirmed"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("social_booking_idx").on(t.bookingId),
    // a member can hold only one active spot in a session
    uniqueIndex("social_member_once")
      .on(t.bookingId, t.memberId)
      .where(sql`${t.status} = 'confirmed' and ${t.memberId} is not null`),
  ]
);
