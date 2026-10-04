import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  members, membershipPlans, orderItems, orders, productVariants, products, stockMovements,
} from "../db/schema.all.js";
import { env } from "../config/env.js";
import { httpError } from "../utils/httpError.js";

const round2 = (n) => Number(n.toFixed(2));
const digits = (s) => String(s ?? "").replace(/\D/g, "").slice(-10);

export const itemsSchema = z
  .array(z.object({ variantId: z.number().int().positive(), quantity: z.number().int().min(1).max(20) }))
  .min(1)
  .max(30);

// Looks up the member and the shop discount their plan earns (only while membership is active).
// If `phone` is given (online orders), it must match the number on file.
export async function findMemberDiscount(tx, { memberCode, phone }) {
  if (!memberCode) return { member: null, discountPct: 0 };
  const [row] = await tx
    .select({ member: members, plan: membershipPlans })
    .from(members)
    .innerJoin(membershipPlans, eq(members.planId, membershipPlans.id))
    .where(eq(members.memberCode, memberCode.toUpperCase()));
  if (!row) throw httpError(404, "Member not found");
  if (phone && digits(row.member.phone) !== digits(phone)) {
    throw httpError(403, "Phone number does not match this member");
  }
  const active = row.member.expiresAt > new Date();
  return { member: row.member, discountPct: active ? row.plan.shopDiscountPct : 0 };
}

// Takes stock, prices the order and records everything. Call inside db.transaction().
export async function placeOrder(tx, o) {
  // 1. merge duplicate lines; sort ids so concurrent orders lock rows in the same order (no deadlocks)
  const wanted = new Map();
  for (const it of o.items) wanted.set(it.variantId, (wanted.get(it.variantId) ?? 0) + it.quantity);
  const ids = [...wanted.keys()].sort((a, b) => a - b);

  // 2. load active variants
  const rows = await tx
    .select({ v: productVariants, p: products })
    .from(productVariants)
    .innerJoin(products, eq(productVariants.productId, products.id))
    .where(and(inArray(productVariants.id, ids), eq(productVariants.isActive, true), eq(products.isActive, true)));
  if (rows.length !== ids.length) throw httpError(404, "One or more items are unavailable");
  const byId = new Map(rows.map((r) => [r.v.id, r]));

  // 3. take stock atomically. The WHERE guard means we can never go below zero.
  for (const id of ids) {
    const qty = wanted.get(id);
    const [taken] = await tx
      .update(productVariants)
      .set({ stock: sql`${productVariants.stock} - ${qty}` })
      .where(and(eq(productVariants.id, id), gte(productVariants.stock, qty)))
      .returning({ id: productVariants.id });
    if (!taken) {
      const { v, p } = byId.get(id);
      throw httpError(409, `Not enough stock for ${p.name} (${v.label})`);
    }
  }

  // 4. price it
  const lines = ids.map((id) => {
    const { v, p } = byId.get(id);
    const quantity = wanted.get(id);
    return {
      variantId: id, productName: p.name, variantLabel: v.label, sku: v.sku,
      unitPrice: v.price, quantity, lineTotal: round2(v.price * quantity),
    };
  });
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const discountAmount = round2((subtotal * o.discountPct) / 100);
  const net = round2(subtotal - discountAmount);
  const deliveryFee =
    o.fulfilment === "delivery" && net < env.SHOP_FREE_DELIVERY_ABOVE ? env.SHOP_DELIVERY_FEE : 0;
  const total = round2(net + deliveryFee);

  // 5. record it
  const counter = o.channel === "counter";
  const [order] = await tx
    .insert(orders)
    .values({
      orderNumber: `TMP-${randomUUID().slice(0, 12)}`,
      channel: o.channel,
      fulfilment: o.fulfilment,
      status: counter ? "completed" : "placed",
      memberId: o.member?.id ?? null,
      customerName: o.customerName,
      customerPhone: o.customerPhone ?? null,
      deliveryAddress: o.deliveryAddress ?? null,
      subtotal, discountPct: o.discountPct, discountAmount, deliveryFee, total,
      paymentMethod: o.paymentMethod ?? null,
      paymentStatus: o.paymentMethod ? "paid" : "unpaid",
      completedAt: counter ? new Date() : null,
      createdBy: o.userId ?? null,
    })
    .returning();

  const orderNumber = `ORD-${String(order.id).padStart(6, "0")}`;
  await tx.update(orders).set({ orderNumber }).where(eq(orders.id, order.id));
  await tx.insert(orderItems).values(lines.map((l) => ({ ...l, orderId: order.id })));
  await tx.insert(stockMovements).values(
    lines.map((l) => ({
      variantId: l.variantId, change: -l.quantity, reason: "sale", orderId: order.id, createdBy: o.userId ?? null,
    }))
  );

  return { ...order, orderNumber, items: lines };
}

// Cancels an unfinished order and puts the stock back.
export async function cancelOrder(tx, orderId, userId) {
  const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
  if (!o) throw httpError(404, "Order not found");
  if (!["placed", "ready"].includes(o.status)) throw httpError(409, `Cannot cancel an order that is ${o.status}`);

  const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId)).orderBy(orderItems.variantId);
  for (const it of items) {
    await tx.update(productVariants)
      .set({ stock: sql`${productVariants.stock} + ${it.quantity}` })
      .where(eq(productVariants.id, it.variantId));
  }
  await tx.insert(stockMovements).values(
    items.map((it) => ({
      variantId: it.variantId, change: it.quantity, reason: "order_cancelled", orderId, createdBy: userId ?? null,
    }))
  );
  const [row] = await tx.update(orders)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(eq(orders.id, orderId)).returning();
  return row;
}
