import { and, eq, inArray, ne, sql } from "drizzle-orm";
import {
  barPayments, barTabItems, barTables, barTabs, members, membershipPlans,
} from "../db/schema.all.js";
import { httpError } from "../utils/httpError.js";

export const round2 = (n) => Number(n.toFixed(2));
export const cents = (n) => Math.round(n * 100);

export function totalsOf(items, discountPct) {
  const live = items.filter((i) => i.status !== "cancelled");
  const subtotal = round2(live.reduce((s, i) => s + i.lineTotal, 0));
  const discountAmount = round2((subtotal * discountPct) / 100);
  return { subtotal, discountAmount, total: round2(subtotal - discountAmount) };
}

// Member's bar discount, only while the membership is active
export async function findBarDiscount(tx, memberCode) {
  if (!memberCode) return { member: null, discountPct: 0 };
  const [row] = await tx
    .select({ member: members, plan: membershipPlans })
    .from(members)
    .innerJoin(membershipPlans, eq(members.planId, membershipPlans.id))
    .where(eq(members.memberCode, memberCode.toUpperCase()));
  if (!row) throw httpError(404, "Member not found");
  const active = row.member.expiresAt > new Date();
  return { member: row.member, discountPct: active ? row.plan.barDiscountPct : 0 };
}

// running subtotal + item count for many tabs in one query
export async function runningSubtotals(exec, tabIds) {
  const map = new Map();
  if (!tabIds.length) return map;
  const rows = await exec
    .select({
      tabId: barTabItems.tabId,
      subtotal: sql`coalesce(sum(${barTabItems.lineTotal}), 0)::float8`,
      itemCount: sql`coalesce(sum(${barTabItems.quantity}), 0)::int`,
    })
    .from(barTabItems)
    .where(and(inArray(barTabItems.tabId, tabIds), ne(barTabItems.status, "cancelled")))
    .groupBy(barTabItems.tabId);
  for (const r of rows) map.set(r.tabId, { subtotal: r.subtotal, itemCount: r.itemCount });
  return map;
}

export function shapeTab(tab, run = { subtotal: 0, itemCount: 0 }) {
  if (tab.status === "paid") return { ...tab, itemCount: run.itemCount };
  const discountAmount = round2((run.subtotal * tab.discountPct) / 100);
  return {
    ...tab,
    subtotal: round2(run.subtotal),
    discountAmount,
    total: round2(run.subtotal - discountAmount),
    itemCount: run.itemCount,
  };
}

// Full tab with items and payments
export async function loadTab(exec, id) {
  const [row] = await exec
    .select({ tab: barTabs, tableName: barTables.name, memberCode: members.memberCode })
    .from(barTabs)
    .leftJoin(barTables, eq(barTabs.tableId, barTables.id))
    .leftJoin(members, eq(barTabs.memberId, members.id))
    .where(eq(barTabs.id, id));
  if (!row) throw httpError(404, "Tab not found");

  const items = await exec.select().from(barTabItems).where(eq(barTabItems.tabId, id)).orderBy(barTabItems.id);
  const payments = await exec.select().from(barPayments).where(eq(barPayments.tabId, id)).orderBy(barPayments.id);
  const totals =
    row.tab.status === "paid"
      ? { subtotal: row.tab.subtotal, discountAmount: row.tab.discountAmount, total: row.tab.total }
      : totalsOf(items, row.tab.discountPct);

  return { ...row.tab, ...totals, tableName: row.tableName, memberCode: row.memberCode, items, payments };
}
