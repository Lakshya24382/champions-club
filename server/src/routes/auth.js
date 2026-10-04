import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { env } from "../config/env.js";
import { validate } from "../middleware/validate.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { httpError } from "../utils/httpError.js";

const router = Router();

const publicUser = ({ passwordHash, ...rest }) => rest;

router.post(
  "/login",
  validate({ body: z.object({ email: z.email(), password: z.string().min(1) }) }),
  async (req, res) => {
    const { email, password } = req.valid.body;
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
      throw httpError(401, "Invalid email or password");
    }
    const token = jwt.sign({ sub: String(user.id), role: user.role }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    });
    res.json({ token, user: publicUser(user) });
  }
);

router.get("/me", requireAuth, async (req, res) => {
  const [user] = await db.select().from(users).where(eq(users.id, req.user.id));
  res.json(publicUser(user));
});

router.post(
  "/staff",
  requireAuth,
  requireRole("owner", "manager"),
  validate({
    body: z.object({
      email: z.email(),
      fullName: z.string().trim().min(2).max(120),
      password: z.string().min(8),
      role: z.enum(["manager", "staff"]).default("staff"),
    }),
  }),
  async (req, res) => {
    const { email, fullName, password, role } = req.valid.body;
    const [created] = await db
      .insert(users)
      .values({ email: email.toLowerCase(), fullName, role, passwordHash: await bcrypt.hash(password, 10) })
      .returning();
    res.status(201).json(publicUser(created));
  }
);

export default router;
