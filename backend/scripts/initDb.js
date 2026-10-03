import { readFile } from 'node:fs/promises';
import { pool } from '../src/db.js';

const sql = await readFile(new URL('../sql/schema.sql', import.meta.url), 'utf8');
await pool.query(sql);
console.log('Schema created (all tables reset).');
await pool.end();
