import pg from 'pg';
import { config } from './config.js';

const { Pool, types } = pg;

// DATE (oid 1082) -> plain 'YYYY-MM-DD' string, avoids JS timezone shifts
types.setTypeParser(1082, (v) => v);
// NUMERIC (oid 1700) -> JS number (prices, amounts)
types.setTypeParser(1700, (v) => parseFloat(v));

export const pool = new Pool({
  ...config.db,
  // Every connection runs in the club's timezone, so current_date,
  // to_char(start_at, 'HH24:MI') and date maths are all "club local time".
  options: `-c TimeZone=${config.tz}`,
});

export const query = (text, params) => pool.query(text, params);

// Run several statements atomically: all succeed or all roll back.
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
