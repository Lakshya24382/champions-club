import { pool } from '../src/db.js';

const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM leads');
if (n > 0) {
  console.log('CRM already seeded. Run "npm run db:crm:init" first for a clean slate.');
  await pool.end();
  process.exit(0);
}

await pool.query(`
  INSERT INTO leads (name, phone, email, message, source, interested_plan_id, status, next_follow_up)
  SELECT v.name, v.phone, v.email, v.message, v.source, p.id, v.status, current_date + v.fu
    FROM (VALUES
      ('Rahul Verma', '9811100001', 'rahul@example.com', 'Looking for Gold membership for my family', 'website', 'GOLD',   'new',       0),
      ('Sneha Kapoor','9811100002', NULL,                'Do you have padel coaching for beginners?', 'website', 'SILVER', 'contacted', -1),
      ('Vikram Rao',  '9811100003', NULL,                'Interested in a Silver plan',               'walk_in', 'SILVER', 'quoted',    2),
      ('Anita Roy',   '9811100004', NULL,                'Asking about junior programmes',            'phone',   'JUNIOR', 'new',       0)
    ) AS v(name, phone, email, message, source, plan, status, fu)
    LEFT JOIN membership_plans p ON p.code = v.plan`);

await pool.query(`
  INSERT INTO lead_activities (lead_id, kind, body)
  SELECT id, 'enquiry', COALESCE(message, 'Enquiry received') FROM leads`);

await pool.query(`
  INSERT INTO lead_activities (lead_id, kind, body)
  SELECT id, 'call', 'Called: asked to call back tomorrow' FROM leads WHERE name = 'Sneha Kapoor'`);

await pool.query(`
  INSERT INTO quotes (lead_id, plan_id, amount, valid_until, message)
  SELECT l.id, p.id, 10800, current_date + 14, 'Welcome offer: 10% off the Silver plan'
    FROM leads l JOIN membership_plans p ON p.code = 'SILVER' WHERE l.name = 'Vikram Rao'`);

await pool.query(`
  INSERT INTO lead_activities (lead_id, kind, body)
  SELECT id, 'quote', 'Quote sent: Silver for 10800' FROM leads WHERE name = 'Vikram Rao'`);

console.log('Seeded 4 demo enquiries (one with a quote).');
await pool.end();
