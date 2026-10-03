import { pool } from '../src/db.js';

const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM employees');
if (n > 0) {
  console.log('Finance already seeded. Run "npm run db:fin:init" first for a clean slate.');
  await pool.end();
  process.exit(0);
}

await pool.query(`
  INSERT INTO employees (user_id, full_name, phone, job_title, monthly_salary, joined_on)
  VALUES
    ((SELECT id FROM users WHERE email = 'desk@champions.club'), 'Front Desk', '9822200010', 'Front desk executive', 25000, current_date - 400),
    (NULL, 'Ravi Kumar',   '9822200011', 'Head coach',          45000, current_date - 500),
    (NULL, 'Sunita Patel', '9822200012', 'Cafe manager',        32000, current_date - 300),
    (NULL, 'Imran Sheikh', '9822200013', 'Groundskeeper',       22000, current_date - 400)`);

await pool.query(`
  INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days, reason, status, decided_by, decided_at)
  SELECT e.id, v.t, v.s, v.s + (v.d - 1), v.d, v.r, v.st,
         CASE WHEN v.st = 'approved' THEN (SELECT id FROM users WHERE role = 'owner' LIMIT 1) END,
         CASE WHEN v.st = 'approved' THEN now() END
    FROM (VALUES
      ('Ravi Kumar',   'casual', current_date + 7,                             2, 'Family function', 'pending'),
      ('Sunita Patel', 'sick',   current_date - 20,                            2, 'Fever',           'approved'),
      ('Imran Sheikh', 'unpaid', (date_trunc('month', current_date)::date - 10), 3, 'Personal work',   'approved')
    ) AS v(emp, t, s, d, r, st)
    JOIN employees e ON e.full_name = v.emp`);

await pool.query(`
  INSERT INTO expenses (expense_date, category, vendor, description, amount, tax_amount, due_date, status, paid_at, payment_method)
  VALUES
    (current_date - 2, 'utilities',   'State Electricity Board', 'Electricity bill',            18400, 2807, current_date - 2,  'unpaid', NULL, NULL),
    (current_date - 1, 'rent',        'Landlord',                'Monthly ground rent',         60000,    0, current_date + 5,  'unpaid', NULL, NULL),
    (current_date - 3, 'equipment',   'SportsPro Supplies',      'Ball machine repair',         12500, 1907, current_date - 3,  'paid',   now(), 'upi'),
    (current_date - 4, 'maintenance', 'CleanCo',                 'Court resurfacing patch work', 9000, 1373, current_date + 10, 'unpaid', NULL, NULL)`);

await pool.query(`
  INSERT INTO clients (name, contact_person, phone, email, gstin, address)
  VALUES ('Acme Wellness Pvt Ltd', 'Neha Sharma', '9822200001', 'accounts@acme.example', '24AAAAA0000A1Z5', '12 Business Park')`);

console.log('Seeded 4 employees (the desk login is linked to "Front Desk"), 3 leave requests, 4 bills and 1 business client.');
await pool.end();
