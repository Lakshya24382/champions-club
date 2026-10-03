import { pool } from '../src/db.js';
import { hashPassword } from '../src/utils/password.js';

const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM users');
if (n > 0) {
  console.log('Already seeded. Run "npm run db:init" first if you want a clean slate.');
  await pool.end();
  process.exit(0);
}

await pool.query(`
  INSERT INTO membership_plans
    (code, name, description, price, duration_days, court_discount_pct, shop_discount_pct, bar_discount_pct, max_age)
  VALUES
    ('GOLD',   'Gold',   'Premium, full access. Courts included',        24000, 365, 100, 15, 15, NULL),
    ('SILVER', 'Silver', 'Standard membership with member court rates',  12000, 365,  40, 10, 10, NULL),
    ('JUNIOR', 'Junior', 'Under 18, discounted',                          6000, 365,  60,  5,  5, 17)
`);

await pool.query(`
  INSERT INTO courts (name, sport, price_per_hour, social_price_per_person, social_capacity) VALUES
    ('Tennis Court 1',    'tennis',    800, 150,  8),
    ('Tennis Court 2',    'tennis',    800, 150,  8),
    ('Padel Court 1',     'padel',    1200, 250,  8),
    ('Badminton Court 1', 'badminton', 500, 100,  8),
    ('Cricket Net 1',     'cricket',  1000, 150, 10)
`);

await pool.query(
  `INSERT INTO users (name, email, password_hash, role) VALUES ($1,$2,$3,'owner'), ($4,$5,$6,'staff')`,
  ['Club Owner', 'owner@champions.club', await hashPassword('Admin@123'),
   'Front Desk', 'desk@champions.club', await hashPassword('Desk@123')],
);

// Demo members: one of each plan, one expired, one expiring soon
await pool.query(`
  INSERT INTO members (full_name, phone, email, date_of_birth, plan_id, joined_on, expires_on)
  SELECT v.full_name, v.phone, v.email, v.dob::date, p.id, v.joined, v.expires
    FROM (VALUES
      ('Aarav Mehta',  '9800000001', 'aarav@example.com', '1988-04-12', 'GOLD',   current_date - 100, current_date + 265),
      ('Diya Shah',    '9800000002', 'diya@example.com',  '1993-09-30', 'SILVER', current_date - 200, current_date + 165),
      ('Kabir Patel',  '9800000003', NULL,                '2012-05-10', 'JUNIOR', current_date - 50,  current_date + 315),
      ('Meera Joshi',  '9800000004', NULL,                '1990-01-20', 'SILVER', current_date - 400, current_date - 35),
      ('Rohan Desai',  '9800000005', NULL,                '1985-11-02', 'GOLD',   current_date - 355, current_date + 10)
    ) AS v(full_name, phone, email, dob, plan_code, joined, expires)
    JOIN membership_plans p ON p.code = v.plan_code
`);
await pool.query(`
  INSERT INTO membership_events (member_id, plan_id, event_type, starts_on, ends_on, amount)
  SELECT m.id, m.plan_id, 'joined', m.joined_on, m.expires_on, p.price
    FROM members m JOIN membership_plans p ON p.id = m.plan_id
`);

console.log('Seeded plans, courts, 2 staff users and 5 demo members.');
console.log('Owner login: owner@champions.club / Admin@123');
console.log('Desk  login: desk@champions.club  / Desk@123');
await pool.end();
