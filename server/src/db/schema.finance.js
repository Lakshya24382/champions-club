import {
  pgTable, pgEnum, serial, integer, varchar, numeric, boolean, date, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./schema.js";
import { paymentMethodEnum } from "./schema.shop.js";
import { enquiries, quotes } from "./schema.crm.js";

export const collectionKindEnum = pgEnum("collection_kind", ["court", "social", "membership"]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["issued", "partially_paid", "paid", "void"]);
export const expenseCategoryEnum = pgEnum("expense_category", ["rent", "utilities", "supplies", "maintenance", "marketing", "other"]);
export const leaveTypeEnum = pgEnum("leave_type", ["paid", "unpaid"]);
export const leaveStatusEnum = pgEnum("leave_status", ["pending", "approved", "rejected", "cancelled"]);
export const payslipStatusEnum = pgEnum("payslip_status", ["unpaid", "paid"]);

const money = (name) => numeric(name, { precision: 12, scale: 2, mode: "number" });
const ts = (name) => timestamp(name, { withTimezone: true });

// How a court booking / social spot / membership was actually paid at the desk
export const collections = pgTable(
  "collections",
  {
    id: serial("id").primaryKey(),
    kind: collectionKindEnum("kind").notNull(),
    refId: integer("ref_id").notNull(),
    method: paymentMethodEnum("method").notNull(),
    amount: money("amount").notNull(),
    receivedBy: integer("received_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("collections_kind_ref_unique").on(t.kind, t.refId), index("collections_created_idx").on(t.createdAt)]
);

export const invoices = pgTable(
  "invoices",
  {
    id: serial("id").primaryKey(),
    invoiceNumber: varchar("invoice_number", { length: 20 }).notNull().unique(),
    quoteId: integer("quote_id").references(() => quotes.id).unique(),
    enquiryId: integer("enquiry_id").references(() => enquiries.id),
    clientName: varchar("client_name", { length: 150 }).notNull(),
    clientCompany: varchar("client_company", { length: 150 }),
    clientEmail: varchar("client_email", { length: 255 }),
    clientPhone: varchar("client_phone", { length: 20 }),
    clientGstin: varchar("client_gstin", { length: 15 }),
    status: invoiceStatusEnum("status").notNull().default("issued"),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    subtotal: money("subtotal").notNull(),
    discountPct: integer("discount_pct").notNull().default(0),
    discountAmount: money("discount_amount").notNull().default(0),
    taxRatePct: numeric("tax_rate_pct", { precision: 5, scale: 2, mode: "number" }).notNull(),
    taxAmount: money("tax_amount").notNull(),
    total: money("total").notNull(),
    amountPaid: money("amount_paid").notNull().default(0),
    notes: varchar("notes", { length: 500 }),
    voidReason: varchar("void_reason", { length: 255 }),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("invoices_status_idx").on(t.status), index("invoices_created_idx").on(t.createdAt)]
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
    description: varchar("description", { length: 200 }).notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: money("unit_price").notNull(),
    lineTotal: money("line_total").notNull(),
  },
  (t) => [index("invoice_items_invoice_idx").on(t.invoiceId)]
);

export const invoicePayments = pgTable(
  "invoice_payments",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id").notNull().references(() => invoices.id),
    amount: money("amount").notNull(),
    method: paymentMethodEnum("method").notNull(),
    reference: varchar("reference", { length: 100 }),
    receivedBy: integer("received_by").references(() => users.id),
    paidAt: ts("paid_at").notNull().defaultNow(),
  },
  (t) => [index("invoice_payments_invoice_idx").on(t.invoiceId), index("invoice_payments_paid_idx").on(t.paidAt)]
);

export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    category: expenseCategoryEnum("category").notNull(),
    description: varchar("description", { length: 200 }).notNull(),
    payee: varchar("payee", { length: 120 }),
    amount: money("amount").notNull(),
    incurredOn: date("incurred_on", { mode: "string" }).notNull(),
    dueDate: date("due_date", { mode: "string" }),
    paidAt: ts("paid_at"),
    paidMethod: paymentMethodEnum("paid_method"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("expenses_incurred_idx").on(t.incurredOn), index("expenses_paid_idx").on(t.paidAt)]
);

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  employeeCode: varchar("employee_code", { length: 20 }).notNull().unique(),
  userId: integer("user_id").references(() => users.id).unique(), // links an employee to a staff login
  fullName: varchar("full_name", { length: 120 }).notNull(),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  title: varchar("title", { length: 80 }).notNull(),
  monthlySalary: money("monthly_salary").notNull(),
  joinedOn: date("joined_on", { mode: "string" }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id").notNull().references(() => employees.id),
    type: leaveTypeEnum("type").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    days: integer("days").notNull(),
    status: leaveStatusEnum("status").notNull().default("pending"),
    reason: varchar("reason", { length: 300 }),
    decidedBy: integer("decided_by").references(() => users.id),
    decidedAt: ts("decided_at"),
    decisionNote: varchar("decision_note", { length: 300 }),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("leave_employee_idx").on(t.employeeId, t.startDate), index("leave_status_idx").on(t.status)]
);

export const payslips = pgTable(
  "payslips",
  {
    id: serial("id").primaryKey(),
    employeeId: integer("employee_id").notNull().references(() => employees.id),
    month: date("month", { mode: "string" }).notNull(), // first day of the month
    baseSalary: money("base_salary").notNull(),
    daysInMonth: integer("days_in_month").notNull(),
    daysEmployed: integer("days_employed").notNull(),
    unpaidLeaveDays: integer("unpaid_leave_days").notNull().default(0),
    deduction: money("deduction").notNull().default(0),
    bonus: money("bonus").notNull().default(0),
    netPay: money("net_pay").notNull(),
    status: payslipStatusEnum("status").notNull().default("unpaid"),
    paidAt: ts("paid_at"),
    paidMethod: paymentMethodEnum("paid_method"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payslips_employee_month_unique").on(t.employeeId, t.month)]
);
