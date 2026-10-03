import { pool } from '../src/db.js';

const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM menu_items');
if (n > 0) {
  console.log('Bar already seeded. Run "npm run db:bar:init" first for a clean slate.');
  await pool.end();
  process.exit(0);
}

await pool.query(`
  INSERT INTO menu_categories (name, sort_order) VALUES
    ('Cold Drinks', 1), ('Juices & Shakes', 2), ('Hot Drinks', 3), ('Snacks', 4), ('Meals', 5)`);

// "ord" + ORDER BY guarantees ids are assigned in this exact order.
await pool.query(`
  INSERT INTO menu_items (name, category_id, price, station)
  SELECT v.name, c.id, v.price, v.station
    FROM (VALUES
      (1,  'Cola',                 'Cold Drinks',     90, 'bar'),
      (2,  'Lime Soda',            'Cold Drinks',     80, 'bar'),
      (3,  'Packaged Water',       'Cold Drinks',     30, 'bar'),
      (4,  'Iced Tea',             'Cold Drinks',    120, 'bar'),
      (5,  'Fresh Orange Juice',   'Juices & Shakes',140, 'bar'),
      (6,  'Mango Shake',          'Juices & Shakes',160, 'bar'),
      (7,  'Cold Coffee',          'Juices & Shakes',150, 'bar'),
      (8,  'Masala Chai',          'Hot Drinks',      50, 'bar'),
      (9,  'Filter Coffee',        'Hot Drinks',      70, 'bar'),
      (10, 'French Fries',         'Snacks',         150, 'kitchen'),
      (11, 'Paneer Tikka',         'Snacks',         280, 'kitchen'),
      (12, 'Veg Sandwich',         'Snacks',         180, 'kitchen'),
      (13, 'Samosa (2 pcs)',       'Snacks',          80, 'kitchen'),
      (14, 'Veg Burger',           'Meals',          220, 'kitchen'),
      (15, 'Pasta Arrabbiata',     'Meals',          260, 'kitchen'),
      (16, 'Veg Thali',            'Meals',          300, 'kitchen')
    ) AS v(ord, name, cat, price, station)
    JOIN menu_categories c ON c.name = v.cat
   ORDER BY v.ord`);

await pool.query(`
  INSERT INTO bar_tables (name, seats) VALUES
    ('Table 1', 4), ('Table 2', 4), ('Table 3', 4), ('Table 4', 4),
    ('Table 5', 6), ('Table 6', 6), ('Terrace 1', 4), ('Terrace 2', 4)`);

console.log('Seeded 5 menu categories, 16 menu items and 8 tables.');
await pool.end();
