import {
  pgTable, pgEnum, serial, integer, varchar, text, numeric, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { members, membershipPlans, planTierEnum, users } from "./schema.js";
import { bookings, sportEnum } from "./schema.courts.js";

export const enquiryStatusEnum = pgEnum("enquiry_status", ["new", "contacted", "quote_sent", "won", "lost"]);
export const enquiryTypeEnum = pgEnum("enquiry_type", ["membership", "trial", "corporate", "general"]);
export const enquirySourceEnum = pgEnum("enquiry_source", ["website", "phone", "walk_in"]);
export const noteKindEnum = pgEnum("note_kind", ["note", "status_change", "assignment", "system"]);
export const notifyAudienceEnum = pgEnum("notify_audience", ["staff", "customer"]);
export const notifyChannelEnum = pgEnum("notify_channel", ["email", "sms", "internal"]);

const money = (name) => numeric(name, { precision: 12, scale: 2, mode: "number" });
const ts = (name) => timestamp(name, { withTimezone: true });

export const enquiries = pgTable(
  "enquiries",
  {
    id: serial("id").primaryKey(),
    ref: varchar("ref", { length: 20 }).notNull().unique(),
    type: enquiryTypeEnum("type").notNull().default("general"),
    source: enquirySourceEnum("source").notNull().default("website"),
    status: enquiryStatusEnum("status").notNull().default("new"),

    name: varchar("name", { length: 120 }).notNull(),
    email: varchar("email", { length: 255 }),
    phone: varchar("phone", { length: 20 }).notNull(),
    phoneKey: varchar("phone_key", { length: 10 }).notNull(), // last 10 digits, for matching
    companyName: varchar("company_name", { length: 150 }),
    message: varchar("message", { length: 1000 }),
    interestedPlan: planTierEnum("interested_plan"),
    sport: sportEnum("sport"),

    assignedTo: integer("assigned_to").references(() => users.id),
    followUpAt: ts("follow_up_at"),
    lastContactedAt: ts("last_contacted_at"),
    lostReason: varchar("lost_reason", { length: 255 }),

    memberId: integer("member_id").references(() => members.id),
    trialBookingId: integer("trial_booking_id").references(() => bookings.id),

    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("enquiries_status_idx").on(t.status),
    index("enquiries_phone_idx").on(t.phoneKey),
    index("enquiries_followup_idx").on(t.followUpAt),
  ]
);

export const enquiryNotes = pgTable(
  "enquiry_notes",
  {
    id: serial("id").primaryKey(),
    enquiryId: integer("enquiry_id").notNull().references(() => enquiries.id, { onDelete: "cascade" }),
    authorId: integer("author_id").references(() => users.id), // null = system / website visitor
    kind: noteKindEnum("kind").notNull().default("note"),
    body: varchar("body", { length: 1000 }).notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("enquiry_notes_enquiry_idx").on(t.enquiryId)]
);

export const quotes = pgTable(
  "quotes",
  {
    id: serial("id").primaryKey(),
    quoteNumber: varchar("quote_number", { length: 20 }).notNull().unique(),
    enquiryId: integer("enquiry_id").notNull().references(() => enquiries.id, { onDelete: "cascade" }),
    planId: integer("plan_id").notNull().references(() => membershipPlans.id),
    memberCount: integer("member_count").notNull().default(1),
    durationMonths: integer("duration_months").notNull(),
    unitPrice: money("unit_price").notNull(), // monthly fee at the time of quoting
    discountPct: integer("discount_pct").notNull().default(0),
    subtotal: money("subtotal").notNull(),
    discountAmount: money("discount_amount").notNull(),
    total: money("total").notNull(),
    validUntil: ts("valid_until").notNull(),
    note: varchar("note", { length: 500 }),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("quotes_enquiry_idx").on(t.enquiryId)]
);

// The unique phone key is what enforces "one free trial per phone number"
export const trialClaims = pgTable(
  "trial_claims",
  {
    id: serial("id").primaryKey(),
    phoneKey: varchar("phone_key", { length: 10 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    bookingId: integer("booking_id").references(() => bookings.id),
    enquiryId: integer("enquiry_id").references(() => enquiries.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("trial_claims_phone_unique").on(t.phoneKey)]
);

// Doubles as the staff inbox and the "email/SMS outbox" until real sending is wired in
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    audience: notifyAudienceEnum("audience").notNull(),
    toUserId: integer("to_user_id").references(() => users.id), // null = every staff member
    channel: notifyChannelEnum("channel").notNull(),
    toAddress: varchar("to_address", { length: 255 }),
    subject: varchar("subject", { length: 200 }).notNull(),
    body: text("body").notNull(),
    relatedType: varchar("related_type", { length: 30 }),
    relatedId: integer("related_id"),
    readAt: ts("read_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("notifications_audience_idx").on(t.audience, t.readAt)]
);
