import {
  pgTable, pgEnum, serial, integer, varchar, numeric, boolean, timestamp,
  index, uniqueIndex, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { members, users } from "./schema.js";
import { paymentMethodEnum } from "./schema.shop.js";

export const menuCategoryEnum = pgEnum("menu_category", ["drink", "food", "snack", "dessert"]);
export const stationEnum = pgEnum("station", ["bar", "kitchen"]);
export const tabStatusEnum = pgEnum("tab_status", ["open", "paid", "void"]);
export const itemStatusEnum = pgEnum("item_status", ["new", "preparing", "ready", "served", "cancelled"]);

const money = (name) => numeric(name, { precision: 10, scale: 2, mode: "number" });
const ts = (name) => timestamp(name, { withTimezone: true });

export const barTables = pgTable("bar_tables", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 40 }).notNull().unique(),
  seats: integer("seats").notNull().default(4),
  isActive: boolean("is_active").notNull().default(true),
});

export const menuItems = pgTable("menu_items", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  category: menuCategoryEnum("category").notNull(),
  station: stationEnum("station").notNull(),
  price: money("price").notNull(),
  isAvailable: boolean("is_available").notNull().default(true), // "sold out right now"
  isActive: boolean("is_active").notNull().default(true),       // removed from the menu
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const shifts = pgTable(
  "shifts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    startedAt: ts("started_at").notNull().defaultNow(),
    endedAt: ts("ended_at"),
    openingCash: money("opening_cash").notNull().default(0),
    expectedCash: money("expected_cash"),
    closingCash: money("closing_cash"),
    note: varchar("note", { length: 255 }),
  },
  (t) => [
    // a person can only have one shift open at a time
    uniqueIndex("one_open_shift_per_user").on(t.userId).where(sql`${t.endedAt} is null`),
  ]
);

export const barTabs = pgTable(
  "bar_tabs",
  {
    id: serial("id").primaryKey(),
    tabNumber: varchar("tab_number", { length: 20 }).notNull().unique(),
    tableId: integer("table_id").references(() => barTables.id),
    memberId: integer("member_id").references(() => members.id),
    customerName: varchar("customer_name", { length: 120 }).notNull(),
    status: tabStatusEnum("status").notNull().default("open"),
    discountPct: integer("discount_pct").notNull().default(0),

    // frozen when the tab is paid; while open, totals are calculated from the items
    subtotal: money("subtotal").notNull().default(0),
    discountAmount: money("discount_amount").notNull().default(0),
    total: money("total").notNull().default(0),

    openedAt: ts("opened_at").notNull().defaultNow(),
    closedAt: ts("closed_at"),
    openedBy: integer("opened_by").references(() => users.id),
    closedBy: integer("closed_by").references(() => users.id),
    shiftId: integer("shift_id").references(() => shifts.id),
    voidReason: varchar("void_reason", { length: 255 }),
  },
  (t) => [
    uniqueIndex("one_open_tab_per_table").on(t.tableId).where(sql`${t.status} = 'open' and ${t.tableId} is not null`),
    uniqueIndex("one_open_tab_per_member").on(t.memberId).where(sql`${t.status} = 'open' and ${t.memberId} is not null`),
    index("bar_tabs_status_idx").on(t.status),
    index("bar_tabs_closed_idx").on(t.closedAt),
  ]
);

export const barTabItems = pgTable(
  "bar_tab_items",
  {
    id: serial("id").primaryKey(),
    tabId: integer("tab_id").notNull().references(() => barTabs.id, { onDelete: "cascade" }),
    menuItemId: integer("menu_item_id").notNull().references(() => menuItems.id),
    // snapshots, so reports stay right after menu edits
    itemName: varchar("item_name", { length: 100 }).notNull(),
    category: menuCategoryEnum("category").notNull(),
    station: stationEnum("station").notNull(),
    unitPrice: money("unit_price").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotal: money("line_total").notNull(),
    notes: varchar("notes", { length: 200 }),
    status: itemStatusEnum("status").notNull().default("new"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("bar_items_tab_idx").on(t.tabId),
    index("bar_items_queue_idx").on(t.status, t.station),
    check("bar_items_qty_positive", sql`${t.quantity} > 0`),
  ]
);

export const barPayments = pgTable(
  "bar_payments",
  {
    id: serial("id").primaryKey(),
    tabId: integer("tab_id").notNull().references(() => barTabs.id),
    method: paymentMethodEnum("method").notNull(),
    amount: money("amount").notNull(),
    shiftId: integer("shift_id").references(() => shifts.id),
    receivedBy: integer("received_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("bar_payments_tab_idx").on(t.tabId), index("bar_payments_created_idx").on(t.createdAt)]
);
