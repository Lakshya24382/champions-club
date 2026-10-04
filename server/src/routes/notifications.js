import { Router } from "express";
import { z } from "zod";
import { and, count, desc, eq, isNull, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { notifications } from "../db/schema.all.js";
import { validate } from "../middleware/validate.js";
import { httpError } from "../utils/httpError.js";

const router = Router();
const idParam = z.object({ id: z.coerce.number().int().positive() });

// Staff alerts for everyone, plus the customer message log (manager only)
router.get(
  "/",
  validate({
    query: z.object({
      audience: z.enum(["staff", "customer"]).default("staff"),
      unread: z.enum(["true", "false"]).default("false"),
      limit: z.coerce.number().int().min(1).max(200).default(50),
    }),
  }),
  async (req, res) => {
    const { audience, unread, limit } = req.valid.query;
    if (audience === "customer" && !["owner", "manager"].includes(req.user.role)) {
      throw httpError(403, "Only managers can view the customer message log");
    }

    const mine = and(
      eq(notifications.audience, "staff"),
      or(isNull(notifications.toUserId), eq(notifications.toUserId, req.user.id))
    );
    const base = audience === "staff" ? mine : eq(notifications.audience, "customer");
    const where = unread === "true" ? and(base, isNull(notifications.readAt)) : base;

    const data = await db.select().from(notifications).where(where).orderBy(desc(notifications.id)).limit(limit);
    const [{ n }] = await db.select({ n: count() }).from(notifications).where(and(base, isNull(notifications.readAt)));
    res.json({ unread: n, data });
  }
);

router.post("/read-all", async (req, res) => {
  const rows = await db.update(notifications).set({ readAt: new Date() })
    .where(and(
      eq(notifications.audience, "staff"), isNull(notifications.readAt),
      or(isNull(notifications.toUserId), eq(notifications.toUserId, req.user.id))
    )).returning({ id: notifications.id });
  res.json({ marked: rows.length });
});

router.post("/:id/read", validate({ params: idParam }), async (req, res) => {
  const [row] = await db.update(notifications).set({ readAt: new Date() })
    .where(and(
      eq(notifications.id, req.valid.params.id), eq(notifications.audience, "staff"),
      or(isNull(notifications.toUserId), eq(notifications.toUserId, req.user.id))
    )).returning();
  if (!row) throw httpError(404, "Notification not found");
  res.json(row);
});

export default router;
