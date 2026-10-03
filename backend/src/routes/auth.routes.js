import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../db.js';
import { config } from '../config.js';
import { verifyPassword, hashPassword } from '../utils/password.js';
import { HttpError } from '../utils/httpError.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

// FIX 1 & 7: Use z.string().email() (Zod v3/v4 compatible) instead of z.email()
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

// Staff login
router.post('/login', async (req, res) => {
  const { email, password } = loginSchema.parse(req.body);
  const { rows: [user] } = await query(
    'SELECT * FROM users WHERE email = $1 AND is_active',
    [email.toLowerCase()],
  );
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    throw new HttpError(401, 'Wrong email or password');
  }
  const payload = { sub: user.id, name: user.name, role: user.role };
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '12h' });
  res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
});

// FIX 7: Member login — members log in with member_code + phone (no password)
// Returns a limited-scope token for the member portal
router.post('/member-login', async (req, res) => {
  const d = z.object({
    memberCode: z.string().trim().min(3),
    phone: z.string().trim().min(7),
  }).parse(req.body);

  const { rows: [member] } = await query(
    `SELECT m.id, m.member_code, m.full_name, m.phone, m.email, m.expires_on, m.is_active,
            p.name AS plan_name, p.code AS plan_code,
            p.court_discount_pct, p.shop_discount_pct, p.bar_discount_pct
       FROM members m JOIN membership_plans p ON p.id = m.plan_id
      WHERE upper(m.member_code) = upper($1)
        AND regexp_replace(m.phone, '[^\\d+]', '', 'g') = regexp_replace($2, '[^\\d+]', '', 'g')`,
    [d.memberCode, d.phone],
  );
  if (!member) throw new HttpError(401, 'Member code and phone number do not match');
  if (!member.is_active) throw new HttpError(403, 'This membership is inactive. Please contact the front desk.');

  const payload = { sub: member.id, name: member.full_name, role: 'member', memberCode: member.member_code };
  const token = jwt.sign(payload, config.jwtSecret, { expiresIn: '24h' });
  res.json({ token, member: { ...member, token } });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.sub, name: req.user.name, role: req.user.role });
});

// FIX 1: User management endpoints (owner/admin only)
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
  const hash = await hashPassword(d.password);
  const { rows: [user] } = await query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role, is_active, created_at`,
    [d.name, d.email.toLowerCase(), hash, d.role],
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
