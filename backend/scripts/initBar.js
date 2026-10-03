import { readFile } from 'node:fs/promises';
import { pool } from '../src/db.js';

const sql = await readFile(new URL('../sql/bar.sql', import.meta.url), 'utf8');
await pool.query(sql);
console.log('Bar tables created (bar data reset).');
await pool.end();
