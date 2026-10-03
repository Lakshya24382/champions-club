import { readFile } from 'node:fs/promises';
import { pool } from '../src/db.js';

const sql = await readFile(new URL('../sql/crm.sql', import.meta.url), 'utf8');
await pool.query(sql);
console.log('CRM tables created (CRM data reset).');
await pool.end();
