import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../db.js';
import { config } from '../config.js';
import { verifyPassword, hashPassword } from '../utils/password.js';
import { HttpError } from '../utils/httpError.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// FIX: staff login was missing a rate limiter entirely — brute-force against
// owner/admin accounts was unrestricted. Apply the same pattern as member login.
const staffLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

const memberLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many member login attempts. Please try again later.' },
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

// Staff login — FIX: staffLoginLimiter applied
router.post('/login', staffLoginLimiter, async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const normalizedEmail = email.trim().toLowerCase();
  const { rows: [user] } = await query(
    'SELECT * FROM users WHERE email = $1 AND is_active',
    [normalizedEmail],
  );
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new HttpError(401, 'Wrong email or password');
  }
  const payload = { sub: user.id, name: user.name, role: user.role };
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '12h' });
  res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
});

// Member login: self-registered members use email or phone + password.
// Legacy member-code + phone login remains available for existing accounts without a password.
router.post('/member-login', memberLoginLimiter, async (req, res) => {
  const d = z.object({
    identifier: z.string().trim().min(3).optional(),
    email: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    password: z.string().min(1).optional(),
    memberCode: z.string().trim().min(3).optional(),
  }).parse(req.body);

  let member;
  if (d.password && (d.identifier || d.email || d.phone)) {
    const identifier = (d.identifier || d.email || d.phone).trim();
    const isEmail = identifier.includes('@');
    const { rows: [account] } = await query(
      `SELECT m.*, p.name AS plan_name, p.code AS plan_code,
              p.court_discount_pct, p.shop_discount_pct, p.bar_discount_pct
         FROM members m JOIN membership_plans p ON p.id = m.plan_id
        WHERE ($2::boolean AND lower(m.email) = lower($1))
           OR (NOT $2::boolean AND regexp_replace(m.phone, '[^\\d+]', '', 'g') = regexp_replace($1, '[^\\d+]', '', 'g'))`,
      [identifier, isEmail],
    );
    if (!account || !account.password_hash || !(await verifyPassword(d.password, account.password_hash))) {
      throw new HttpError(401, 'Email/phone or password is incorrect');
    }
    member = account;
  } else if (d.memberCode && d.phone) {
    const { rows: [legacy] } = await query(
      `SELECT m.*, p.name AS plan_name, p.code AS plan_code,
              p.court_discount_pct, p.shop_discount_pct, p.bar_discount_pct
         FROM members m JOIN membership_plans p ON p.id = m.plan_id
        WHERE upper(m.member_code) = upper($1)
          AND regexp_replace(m.phone, '[^\\d+]', '', 'g') = regexp_replace($2, '[^\\d+]', '', 'g')`,
      [d.memberCode, d.phone],
    );
    if (!legacy) throw new HttpError(401, 'Member code and phone number do not match');
    member = legacy;
  } else {
    throw new HttpError(400, 'Enter your email/phone and password');
  }

  if (!member.is_active) throw new HttpError(403, 'This membership is inactive. Please contact the front desk.');
  const payload = { sub: member.id, name: member.full_name, role: 'member', memberCode: member.member_code };
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '24h' });
  const { password_hash, ...safeMember } = member;
  res.json({ token, member: { ...safeMember, token } });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.sub, name: req.user.name, role: req.user.role });
});

const userSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['owner', 'admin', 'staff']),
});

router.get('/users', requireAuth, requireRole('owner', 'admin'), async (_req, res) => {
  const { rows } = await query(
    'SELECT id, name, email, role, is_active, created_at FROM users ORDER BY name'
  );
  res.json(rows);
});

router.post('/users', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  const d = userSchema.parse(req.body);
  const normalizedEmail = d.email.trim().toLowerCase();
  const { rows: [existing] } = await query(
    'SELECT id FROM users WHERE lower(email) = $1', [normalizedEmail]);
  if (existing) throw new HttpError(409, 'A user with this email already exists');

  const hash = await hashPassword(d.password);
  const { rows: [user] } = await query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role, is_active, created_at`,
    [d.name, normalizedEmail, hash, d.role],
  );
  res.status(201).json(user);
});

router.patch('/users/:id', requireAuth, requireRole('owner', 'admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!id) throw new HttpError(400, 'Invalid id');
  const d = z.object({
    name: z.string().trim().min(2).optional(),
    role: z.enum(['owner', 'admin', 'staff']).optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(8).optional(),
  }).parse(req.body);

  const updates = [];
  const params = [id];

  if (d.name)     { params.push(d.name);  updates.push(`name = $${params.length}`); }
  if (d.role)     { params.push(d.role);  updates.push(`role = $${params.length}`); }
  if (d.isActive !== undefined) { params.push(d.isActive); updates.push(`is_active = $${params.length}`); }
  if (d.password) { params.push(await hashPassword(d.password)); updates.push(`password_hash = $${params.length}`); }

  if (!updates.length) throw new HttpError(400, 'Nothing to update');

  const { rows: [user] } = await query(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $1
     RETURNING id, name, email, role, is_active, created_at`,
    params,
  );
  if (!user) throw new HttpError(404, 'User not found');
  res.json(user);
});

export default router;
