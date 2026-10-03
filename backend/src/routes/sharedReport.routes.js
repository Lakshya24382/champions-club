import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { HttpError } from '../utils/httpError.js';
import { getSettings } from '../services/settings.service.js';

// PUBLIC: anyone holding the unguessable link sees the frozen snapshot, nothing live.
const router = Router();

router.get('/:token', async (req, res) => {
  const token = z.string().regex(/^[a-f0-9]{32}$/).safeParse(req.params.token);
  if (!token.success) throw new HttpError(404, 'This report link is not valid or has expired');
  const { rows: [s] } = await query(
    `SELECT title, from_date, to_date, snapshot, created_at, expires_at
       FROM report_shares WHERE token = $1 AND NOT revoked AND expires_at > now()`,
    [token.data]);
  if (!s) throw new HttpError(404, 'This report link is not valid or has expired');
  const settings = await getSettings();
  res.json({ ...s, club_name: settings.club_name });
});

export default router;
