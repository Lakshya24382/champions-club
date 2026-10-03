import { readFile } from 'node:fs/promises';
import { pool } from '../src/db.js';

const sql = await readFile(new URL('../sql/shop.sql', import.meta.url), 'utf8');
await pool.query(sql);
console.log('Shop tables created (shop data reset).');
await pool.end();
