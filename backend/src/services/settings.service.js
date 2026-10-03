import { query } from '../db.js';

const NUMERIC = ['tax_courts', 'tax_membership', 'tax_shop', 'tax_bar', 'annual_leave_days'];

export async function getSettings(db = { query }) {
  const { rows } = await db.query('SELECT key, value FROM settings');
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  for (const k of NUMERIC) s[k] = Number(s[k] ?? 0);
  return s;
}

export async function updateSettings(patch) {
  for (const [key, value] of Object.entries(patch)) {
    await query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, String(value)]);
  }
  return getSettings();
}
