import { Router } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { courts } from "../db/schema.all.js";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { httpError } from "../utils/httpError.js";

const router = Router();
const sport = z.enum(["tennis", "cricket", "padel", "badminton"]);
const idParam = z.object({ id: z.coerce.number().int().positive() });

router.get("/", validate({ query: z.object({ sport: sport.optional() }) }), async (req, res) => {
  const { sport: s } = req.valid.query;
  res.json(
    await db.select().from(courts)
      .where(and(eq(courts.isActive, true), s ? eq(courts.sport, s) : undefined))
      .orderBy(courts.sport, courts.name)
  );
});

router.post(
  "/",
  requireAuth,
  requireRole("owner", "manager"),
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(60),
      sport,
      ratePerHour: z.number().min(0).max(100000),
    }),
  }),
  async (req, res) => {
    const [row] = await db.insert(courts).values(req.valid.body).returning();
    res.status(201).json(row);
  }
);

router.patch(
  "/:id",
  requireAuth,
  requireRole("owner", "manager"),
  validate({
    params: idParam,
    body: z
      .object({
        name: z.string().trim().min(2).max(60),
        ratePerHour: z.number().min(0).max(100000),
        isActive: z.boolean(),
      })
      .partial()
      .refine((o) => Object.keys(o).length > 0, "Nothing to update"),
  }),
  async (req, res) => {
    const [row] = await db.update(courts).set(req.valid.body).where(eq(courts.id, req.valid.params.id)).returning();
    if (!row) throw httpError(404, "Court not found");
    res.json(row);
  }
);

export default router;
