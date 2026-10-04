import { Router } from "express";
import { z } from "zod";
import { and, eq, ilike, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { products, productVariants } from "../db/schema.all.js";
import { validate } from "../middleware/validate.js";
import { findMemberDiscount, itemsSchema, placeOrder } from "../services/shop.service.js";

const router = Router();

const category = z.enum(["racket", "ball", "shoes", "accessory", "apparel"]);
const sport = z.enum(["tennis", "cricket", "padel", "badminton"]);
const phone = z.string().trim().regex(/^\+?[0-9]{10,13}$/, "Invalid phone number");

// ---------- Catalog ----------
router.get(
  "/products",
  validate({ query: z.object({ category: category.optional(), sport: sport.optional(), q: z.string().trim().optional() }) }),
  async (req, res) => {
    const { category: c, sport: s, q } = req.valid.query;
    const rows = await db
      .select({ p: products, v: productVariants })
      .from(products)
      .innerJoin(productVariants, eq(productVariants.productId, products.id))
      .where(and(
        eq(products.isActive, true), eq(productVariants.isActive, true),
        c ? eq(products.category, c) : undefined,
        s ? eq(products.sport, s) : undefined,
        q ? or(ilike(products.name, `%${q}%`), ilike(products.brand, `%${q}%`)) : undefined
      ))
      .orderBy(products.name, productVariants.label);

    const grouped = new Map();
    for (const { p, v } of rows) {
      if (!grouped.has(p.id)) {
        grouped.set(p.id, {
          id: p.id, name: p.name, brand: p.brand, category: p.category, sport: p.sport,
          description: p.description, variants: [],
        });
      }
      grouped.get(p.id).variants.push({
        id: v.id, sku: v.sku, label: v.label, price: v.price,
        inStock: v.stock > 0, lowStock: v.stock > 0 && v.stock <= v.lowStockThreshold,
      });
    }
    res.json([...grouped.values()]);
  }
);

// ---------- Order from home: pickup or delivery ----------
router.post(
  "/orders/online",
  validate({
    body: z
      .object({
        items: itemsSchema,
        customerName: z.string().trim().min(2).max(120),
        customerPhone: phone,
        fulfilment: z.enum(["pickup", "delivery"]),
        deliveryAddress: z.string().trim().min(10).max(300).optional(),
        memberCode: z.string().trim().min(3).optional(),
      })
      .refine((b) => b.fulfilment !== "delivery" || b.deliveryAddress, {
        message: "deliveryAddress is required for delivery",
        path: ["deliveryAddress"],
      }),
  }),
  async (req, res) => {
    const b = req.valid.body;
    const order = await db.transaction(async (tx) => {
      const { member, discountPct } = await findMemberDiscount(tx, { memberCode: b.memberCode, phone: b.customerPhone });
      return placeOrder(tx, {
        channel: "online", fulfilment: b.fulfilment, items: b.items, member, discountPct,
        customerName: b.customerName, customerPhone: b.customerPhone,
        deliveryAddress: b.fulfilment === "delivery" ? b.deliveryAddress : null,
      });
    });
    res.status(201).json(order);
  }
);

export default router;
