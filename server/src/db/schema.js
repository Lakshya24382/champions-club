import {
  pgTable, pgEnum, serial, integer, varchar, numeric, boolean,
  date, timestamp, index,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["owner", "manager", "staff"]);
export const planTierEnum = pgEnum("plan_tier", ["gold", "silver", "junior"]);

const money = (name) => numeric(name, { precision: 10, scale: 2, mode: "number" });
const ts = (name) => timestamp(name, { withTimezone: true });

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  fullName: varchar("full_name", { length: 120 }).notNull(),
  role: roleEnum("role").notNull().default("staff"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const membershipPlans = pgTable("membership_plans", {
  id: serial("id").primaryKey(),
  tier: planTierEnum("tier").notNull().unique(),
  name: varchar("name", { length: 60 }).notNull(),
  description: varchar("description", { length: 255 }),
  monthlyFee: money("monthly_fee").notNull(),
  courtRatePerHour: money("court_rate_per_hour").notNull(), // 0 = free courts
  shopDiscountPct: integer("shop_discount_pct").notNull().default(0),
  barDiscountPct: integer("bar_discount_pct").notNull().default(0),
  maxBookingsPerDay: integer("max_bookings_per_day").notNull().default(2),
  courtDiscountPct: integer("court_discount_pct").notNull().default(0), // % off court rates, 100 = free
});

export const members = pgTable(
  "members",
  {
    id: serial("id").primaryKey(),
    memberCode: varchar("member_code", { length: 20 }).notNull().unique(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 20 }).notNull(),
    dateOfBirth: date("date_of_birth", { mode: "string" }).notNull(),
    planId: integer("plan_id").notNull().references(() => membershipPlans.id),
    joinedAt: ts("joined_at").notNull().defaultNow(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("members_phone_idx").on(t.phone),
    index("members_name_idx").on(t.fullName),
    index("members_expires_idx").on(t.expiresAt),
  ]
);

export const membershipHistory = pgTable("membership_history", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  planId: integer("plan_id").notNull().references(() => membershipPlans.id),
  startsAt: ts("starts_at").notNull(),
  endsAt: ts("ends_at").notNull(),
  amountPaid: money("amount_paid").notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: ts("created_at").notNull().defaultNow(),
});

