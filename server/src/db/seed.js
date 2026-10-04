import "dotenv/config";
import bcrypt from "bcryptjs";
import { db, pool } from "./index.js";
import { courts, membershipPlans, users } from "./schema.all.js";

const plans = [
  { tier: "gold", name: "Gold", description: "Premium, full access", monthlyFee: 3000, courtRatePerHour: 0, courtDiscountPct: 100, shopDiscountPct: 15, barDiscountPct: 15, maxBookingsPerDay: 2 },
  { tier: "silver", name: "Silver", description: "Standard", monthlyFee: 1500, courtRatePerHour: 300, courtDiscountPct: 50, shopDiscountPct: 8, barDiscountPct: 8, maxBookingsPerDay: 2 },
  { tier: "junior", name: "Junior", description: "Under 18, discounted", monthlyFee: 800, courtRatePerHour: 150, courtDiscountPct: 75, shopDiscountPct: 5, barDiscountPct: 5, maxBookingsPerDay: 2 },
];

for (const p of plans) {
  await db.insert(membershipPlans).values(p).onConflictDoUpdate({ target: membershipPlans.tier, set: p });
}

const courtRows = [
  { name: "Tennis Court 1", sport: "tennis", ratePerHour: 600 },
  { name: "Tennis Court 2", sport: "tennis", ratePerHour: 600 },
  { name: "Padel Court 1", sport: "padel", ratePerHour: 800 },
  { name: "Padel Court 2", sport: "padel", ratePerHour: 800 },
  { name: "Badminton Court 1", sport: "badminton", ratePerHour: 400 },
  { name: "Badminton Court 2", sport: "badminton", ratePerHour: 400 },
  { name: "Badminton Court 3", sport: "badminton", ratePerHour: 400 },
  { name: "Cricket Net 1", sport: "cricket", ratePerHour: 700 },
  { name: "Cricket Net 2", sport: "cricket", ratePerHour: 700 },
];
await db.insert(courts).values(courtRows).onConflictDoNothing({ target: courts.name });

const email = process.env.SEED_OWNER_EMAIL ?? "owner@champions.club";
const password = process.env.SEED_OWNER_PASSWORD ?? "ChangeMe123!";
await db.insert(users).values({
  email, fullName: "Club Owner", role: "owner",
  passwordHash: await bcrypt.hash(password, 10),
}).onConflictDoNothing({ target: users.email });

console.log("Seeded plans, courts and owner:", email);
await pool.end();
