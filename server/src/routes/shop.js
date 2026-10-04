import { Router } from "express";
import { z } from "zod";
import { and, asc, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { members, orderItems, orders, productVariants, products, stockMovements } from "../db/schema.all.js";
import { validate } from "../middleware/validate.js";
import { requireRole } from "../middleware/auth.js";
import { httpError } from "../utils/httpError.js";
import { DAY, dayStartFromDateString } from "../utils/time.js";
import { cancelOrder, findMemberDiscount, itemsSchema, placeOrder } from "../services/shop.service.js";

const router = Router();
const manager = requireRole("owner", "manager");

const idParam = z.object({ id: z.coerce.number().int().positive() });
const paymentMethod = z.enum(["cash", "card", "upi"]);
const category = z.enum(["racket", "ball", "shoes", "accessory", "apparel"]);
const sport = z.enum(["tennis", "cricket", "padel", "badminton"]);

const variantInput = z.object({
  sku: z.string().trim().min(3).max(40).transform((s) => s.toUpperCase()),
  label: z.string().trim().min(1).max(60).default("Standard"),
  price: z.number().min(0),
  stock: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
});

// =============== Orders ===============

// Counter sale: paid immediately, stock leaves the shelf
router.post(
  "/orders",
  validate({
    body: z.object({
      items: itemsSchema,
      memberCode: z.string().trim().min(3).optional(),
      customerName: z.string().trim().min(2).max(120).optional(),
      paymentMethod,
    }),
  }),
  async (req, res) => {
    const b = req.valid.body;
    const order = await db.transaction(async (tx) => {
      const { member, discountPct } = await findMemberDiscount(tx, { memberCode: b.memberCode });
      return placeOrder(tx, {
        channel: "counter", fulfilment: "instore", items: b.items, member, discountPct,
        customerName: member?.fullName ?? b.customerName ?? "Walk-in customer",
        customerPhone: member?.phone, paymentMethod: b.paymentMethod, userId: req.user.id,
      });
    });
    res.status(201).json(order);
  }
);

router.get(
  "/orders",
  validate({
    query: z.object({
      status: z.enum(["placed", "ready", "completed", "cancelled"]).optional(),
      channel: z.enum(["counter", "online"]).optional(),
      date: z.iso.date().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    const dayStart = q.date ? dayStartFromDateString(q.date) : null;
    const rows = await db
      .select({ order: orders, memberCode: members.memberCode })
      .from(orders)
      .leftJoin(members, eq(orders.memberId, members.id))
      .where(and(
        q.status ? eq(orders.status, q.status) : undefined,
        q.channel ? eq(orders.channel, q.channel) : undefined,
        dayStart ? gte(orders.createdAt, dayStart) : undefined,
        dayStart ? lt(orders.createdAt, new Date(dayStart.getTime() + DAY)) : undefined
      ))
      .orderBy(desc(orders.createdAt))
      .limit(q.limit);
    res.json(rows.map((r) => ({ ...r.order, memberCode: r.memberCode })));
  }
);

router.get("/orders/:id", validate({ params: idParam }), async (req, res) => {
  const [row] = await db
    .select({ order: orders, memberCode: members.memberCode })
    .from(orders)
    .leftJoin(members, eq(orders.memberId, members.id))
    .where(eq(orders.id, req.valid.params.id));
  if (!row) throw httpError(404, "Order not found");
  const items = await db.select().from(orderItems).where(eq(orderItems.orderId, row.order.id)).orderBy(orderItems.id);
  res.json({ ...row.order, memberCode: row.memberCode, items });
});

// placed -> ready (packed, or waiting at the front desk)
router.post("/orders/:id/ready", validate({ params: idParam }), async (req, res) => {
  const [row] = await db.update(orders).set({ status: "ready" })
    .where(and(eq(orders.id, req.valid.params.id), eq(orders.status, "placed"))).returning();
  if (!row) throw httpError(409, "Order not found or not in 'placed' status");
  res.json(row);
});

// collected / delivered, and paid
router.post(
  "/orders/:id/complete",
  validate({ params: idParam, body: z.object({ paymentMethod }) }),
  async (req, res) => {
    const [row] = await db.update(orders)
      .set({ status: "completed", paymentStatus: "paid", paymentMethod: req.valid.body.paymentMethod, completedAt: new Date() })
      .where(and(eq(orders.id, req.valid.params.id), sql`${orders.status} in ('placed', 'ready')`))
      .returning();
    if (!row) throw httpError(409, "Order not found or already finished");
    res.json(row);
  }
);

router.post("/orders/:id/cancel", validate({ params: idParam }), async (req, res) => {
  const row = await db.transaction((tx) => cancelOrder(tx, req.valid.params.id, req.user.id));
  res.json(row);
});

// =============== Inventory ===============

router.get(
  "/inventory",
  validate({ query: z.object({ lowOnly: z.enum(["true", "false"]).default("false") }) }),
  async (req, res) => {
    const lowOnly = req.valid.query.lowOnly === "true";
    const rows = await db
      .select({
        variantId: productVariants.id, sku: productVariants.sku, product: products.name, category: products.category,
        label: productVariants.label, price: productVariants.price,
        stock: productVariants.stock, lowStockThreshold: productVariants.lowStockThreshold,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(and(
        eq(productVariants.isActive, true),
        lowOnly ? lte(productVariants.stock, productVariants.lowStockThreshold) : undefined
      ))
      .orderBy(lowOnly ? asc(productVariants.stock) : asc(products.name), asc(productVariants.label));
    res.json(rows);
  }
);

router.get(
  "/inventory/movements",
  validate({
    query: z.object({
      variantId: z.coerce.number().int().positive().optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
  }),
  async (req, res) => {
    const { variantId, limit } = req.valid.query;
    res.json(
      await db
        .select({
          id: stockMovements.id, createdAt: stockMovements.createdAt, sku: productVariants.sku,
          change: stockMovements.change, reason: stockMovements.reason,
          orderNumber: orders.orderNumber, note: stockMovements.note,
        })
        .from(stockMovements)
        .innerJoin(productVariants, eq(stockMovements.variantId, productVariants.id))
        .leftJoin(orders, eq(stockMovements.orderId, orders.id))
        .where(variantId ? eq(stockMovements.variantId, variantId) : undefined)
        .orderBy(desc(stockMovements.id))
        .limit(limit)
    );
  }
);

// =============== Catalog management (owner / manager) ===============

router.post(
  "/products",
  manager,
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(150),
      brand: z.string().trim().max(80).optional(),
      category,
      sport: sport.optional(),
      description: z.string().trim().max(500).optional(),
      variants: z.array(variantInput).min(1).max(30),
    }),
  }),
  async (req, res) => {
    const { variants, ...p } = req.valid.body;
    const created = await db.transaction(async (tx) => {
      const [product] = await tx.insert(products).values(p).returning();
      const vs = await tx.insert(productVariants).values(variants.map((v) => ({ ...v, productId: product.id }))).returning();
      const opening = vs.filter((v) => v.stock > 0);
      if (opening.length) {
        await tx.insert(stockMovements).values(opening.map((v) => ({
          variantId: v.id, change: v.stock, reason: "restock", note: "Opening stock", createdBy: req.user.id,
        })));
      }
      return { ...product, variants: vs };
    });
    res.status(201).json(created);
  }
);

// add another size/colour to an existing product
router.post("/products/:id/variants", manager, validate({ params: idParam, body: variantInput }), async (req, res) => {
  const [product] = await db.select().from(products).where(eq(products.id, req.valid.params.id));
  if (!product) throw httpError(404, "Product not found");
  const created = await db.transaction(async (tx) => {
    const [v] = await tx.insert(productVariants).values({ ...req.valid.body, productId: product.id }).returning();
    if (v.stock > 0) {
      await tx.insert(stockMovements).values({
        variantId: v.id, change: v.stock, reason: "restock", note: "Opening stock", createdBy: req.user.id,
      });
    }
    return v;
  });
  res.status(201).json(created);
});

router.patch(
  "/variants/:id",
  manager,
  validate({
    params: idParam,
    body: z
      .object({
        label: z.string().trim().min(1).max(60),
        price: z.number().min(0),
        lowStockThreshold: z.number().int().min(0),
        isActive: z.boolean(),
      })
      .partial()
      .refine((o) => Object.keys(o).length > 0, "Nothing to update"),
  }),
  async (req, res) => {
    const [row] = await db.update(productVariants).set(req.valid.body)
      .where(eq(productVariants.id, req.valid.params.id)).returning();
    if (!row) throw httpError(404, "Variant not found");
    res.json(row);
  }
);

router.post(
  "/variants/:id/restock",
  manager,
  validate({ params: idParam, body: z.object({ quantity: z.number().int().min(1).max(100000), note: z.string().trim().max(255).optional() }) }),
  async (req, res) => {
    const { quantity, note } = req.valid.body;
    const row = await db.transaction(async (tx) => {
      const [v] = await tx.update(productVariants)
        .set({ stock: sql`${productVariants.stock} + ${quantity}` })
        .where(eq(productVariants.id, req.valid.params.id)).returning();
      if (!v) throw httpError(404, "Variant not found");
      await tx.insert(stockMovements).values({
        variantId: v.id, change: quantity, reason: "restock", note, createdBy: req.user.id,
      });
      return v;
    });
    res.json(row);
  }
);

// stock-take corrections: damaged, lost, miscounted (signed number)
router.post(
  "/variants/:id/adjust",
  manager,
  validate({
    params: idParam,
    body: z.object({
      change: z.number().int().refine((n) => n !== 0, "Change cannot be 0"),
      note: z.string().trim().min(3).max(255),
    }),
  }),
  async (req, res) => {
    const { change, note } = req.valid.body;
    const row = await db.transaction(async (tx) => {
      const [exists] = await tx.select({ id: productVariants.id }).from(productVariants)
        .where(eq(productVariants.id, req.valid.params.id));
      if (!exists) throw httpError(404, "Variant not found");
      const [v] = await tx.update(productVariants)
        .set({ stock: sql`${productVariants.stock} + ${change}` })
        .where(and(eq(productVariants.id, exists.id), sql`${productVariants.stock} + ${change} >= 0`))
        .returning();
      if (!v) throw httpError(409, "Stock cannot go below zero");
      await tx.insert(stockMovements).values({
        variantId: v.id, change, reason: "adjustment", note, createdBy: req.user.id,
      });
      return v;
    });
    res.json(row);
  }
);

export default router;
