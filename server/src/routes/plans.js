import { Router } from "express";
import { asc } from "drizzle-orm";
import { db } from "../db/index.js";
import { membershipPlans } from "../db/schema.js";

const router = Router();

router.get("/", async (_req, res) => {
  res.json(await db.select().from(membershipPlans).orderBy(asc(membershipPlans.monthlyFee)));
});

export default router;
