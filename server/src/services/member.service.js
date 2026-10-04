import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { members, membershipHistory, membershipPlans } from "../db/schema.all.js";
import { httpError } from "../utils/httpError.js";
import { addMonths, ageOn } from "../utils/dates.js";

export function assertTierMatchesAge(planTier, dob) {
  const age = ageOn(dob);
  if (planTier === "junior" && age >= 18) throw httpError(400, "Junior plan is for members under 18");
  if (planTier !== "junior" && age < 18) throw httpError(400, "Members under 18 must be on the Junior plan");
}

// Creates a member + first history row. Call inside db.transaction().
export async function registerMember(tx, b, userId) {
  assertTierMatchesAge(b.planTier, b.dateOfBirth);

  const [plan] = await tx.select().from(membershipPlans).where(eq(membershipPlans.tier, b.planTier));
  if (!plan) throw httpError(400, "Unknown plan");

  const startsAt = new Date();
  const endsAt = addMonths(startsAt, b.durationMonths);

  const [m] = await tx.insert(members).values({
    memberCode: `TMP-${randomUUID().slice(0, 12)}`,
    fullName: b.fullName,
    email: b.email?.toLowerCase(),
    phone: b.phone,
    dateOfBirth: b.dateOfBirth,
    planId: plan.id,
    joinedAt: startsAt,
    expiresAt: endsAt,
  }).returning();

  const memberCode = `CC-${String(m.id).padStart(6, "0")}`;
  await tx.update(members).set({ memberCode }).where(eq(members.id, m.id));

  const amountPaid = Number((plan.monthlyFee * b.durationMonths).toFixed(2));
  await tx.insert(membershipHistory).values({
    memberId: m.id, planId: plan.id, startsAt, endsAt, amountPaid, createdBy: userId ?? null,
  });

  return { ...m, memberCode, plan: { tier: plan.tier, name: plan.name }, amountPaid };
}
