import {
  pgTable, pgEnum, serial, integer, varchar, numeric, boolean, timestamp, index, check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { members, users } from "./schema.js";
import { sportEnum } from "./schema.courts.js";

export const productCategoryEnum = pgEnum("product_category", ["racket", "ball", "shoes", "accessory", "apparel"]);
export const orderChannelEnum = pgEnum("order_channel", ["counter", "online"]);
export const fulfilmentEnum = pgEnum("fulfilment", ["instore", "pickup", "delivery"]);
export const orderStatusEnum = pgEnum("order_status", ["placed", "ready", "completed", "cancelled"]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "card", "upi"]);
export const paymentStatusEnum = pgEnum("payment_status", ["unpaid", "paid"]);
export const stockReasonEnum = pgEnum("stock_reason", ["restock", "sale", "order_cancelled", "adjustment"]);

const money = (name) => numeric(name, { precision: 10, scale: 2, mode: "number" });
const ts = (name) => timestamp(name, { withTimezone: true });

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 150 }).notNull(),
    brand: varchar("brand", { length: 80 }),
    category: productCategoryEnum("category").notNull(),
    sport: sportEnum("sport"),
    description: varchar("description", { length: 500 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("products_category_idx").on(t.category)]
);

// A variant is the thing that is actually sold and counted (e.g. "Nike Court Shoes, UK 8")
export const productVariants = pgTable(
  "product_variants",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    sku: varchar("sku", { length: 40 }).notNull().unique(),
    label: varchar("label", { length: 60 }).notNull().default("Standard"),
    price: money("price").notNull(),
    stock: integer("stock").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("variants_product_idx").on(t.productId),
    check("variants_stock_non_negative", sql`${t.stock} >= 0`),
    check("variants_price_non_negative", sql`${t.price} >= 0`),
  ]
);

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    orderNumber: varchar("order_number", { length: 20 }).notNull().unique(),
    channel: orderChannelEnum("channel").notNull(),
    fulfilment: fulfilmentEnum("fulfilment").notNull(),
    status: orderStatusEnum("status").notNull().default("placed"),

    memberId: integer("member_id").references(() => members.id),
    customerName: varchar("customer_name", { length: 120 }).notNull(),
    customerPhone: varchar("customer_phone", { length: 20 }),
    deliveryAddress: varchar("delivery_address", { length: 300 }),

    subtotal: money("subtotal").notNull(),
    discountPct: integer("discount_pct").notNull().default(0),
    discountAmount: money("discount_amount").notNull().default(0),
    deliveryFee: money("delivery_fee").notNull().default(0),
    total: money("total").notNull(),

    paymentMethod: paymentMethodEnum("payment_method"),
    paymentStatus: paymentStatusEnum("payment_status").notNull().default("unpaid"),

    completedAt: ts("completed_at"),
    cancelledAt: ts("cancelled_at"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("orders_status_idx").on(t.status), index("orders_created_idx").on(t.createdAt)]
);

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    variantId: integer("variant_id").notNull().references(() => productVariants.id),
    // snapshots, so old orders stay correct after renames or price changes
    productName: varchar("product_name", { length: 150 }).notNull(),
    variantLabel: varchar("variant_label", { length: 60 }).notNull(),
    sku: varchar("sku", { length: 40 }).notNull(),
    unitPrice: money("unit_price").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotal: money("line_total").notNull(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId), check("order_items_qty_positive", sql`${t.quantity} > 0`)]
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    variantId: integer("variant_id").notNull().references(() => productVariants.id),
    change: integer("change").notNull(), // + in, - out
    reason: stockReasonEnum("reason").notNull(),
    orderId: integer("order_id").references(() => orders.id),
    note: varchar("note", { length: 255 }),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("movements_variant_idx").on(t.variantId, t.createdAt)]
);
