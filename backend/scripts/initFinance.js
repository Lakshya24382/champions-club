import { readFile } from 'node:fs/promises';
import { pool } from '../src/db.js';

const sql = await readFile(new URL('../sql/finance.sql', import.meta.url), 'utf8');
await pool.query(sql);
console.log('Finance and HR tables created (finance data reset).');
await pool.end();
