import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../db.js';
import { config } from '../config.js';
import { verifyPassword } from '../utils/password.js';
import { HttpError } from '../utils/httpError.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const loginSchema = z.object({ email: z.email(), password: z.string().min(1) });

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

router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.sub, name: req.user.name, role: req.user.role });
});

export default router;
