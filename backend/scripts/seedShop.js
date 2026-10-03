import { pool } from '../src/db.js';

const { rows: [{ n }] } = await pool.query('SELECT count(*)::int AS n FROM products');
if (n > 0) {
  console.log('Shop already seeded. Run "npm run db:shop:init" first for a clean slate.');
  await pool.end();
  process.exit(0);
}

await pool.query(`
  INSERT INTO product_categories (name)
  VALUES ('Rackets'), ('Balls'), ('Shoes'), ('Accessories'), ('Apparel')`);

await pool.query(`
  INSERT INTO products (sku, name, category_id, description, price, stock_qty, low_stock_threshold)
  SELECT v.sku, v.name, c.id, v.descr, v.price, v.qty, v.low
    FROM (VALUES
      ('RKT-TEN-01', 'Pro Tennis Racket',      'Rackets',     'Graphite frame, 300g',          6500, 10,  3),
      ('RKT-PAD-01', 'Padel Racket Carbon',    'Rackets',     'Carbon face, round shape',      5200,  6,  2),
      ('RKT-BAD-01', 'Badminton Racket Lite',  'Rackets',     'Lightweight, 82g',              2400, 12,  4),
      ('BAL-TEN-01', 'Tennis Balls (can of 3)','Balls',       'Pressurised, all-court',         450, 40, 10),
      ('BAL-CRK-01', 'Cricket Ball Leather',   'Balls',       'Match quality, red',             650,  3,  5),
      ('SHO-TEN-01', 'Court Shoes Pro',        'Shoes',       'Non-marking sole',              4800,  8,  3),
      ('SHO-BAD-01', 'Indoor Court Shoes',     'Shoes',       'Cushioned, for badminton',      3600,  2,  3),
      ('ACC-STR-01', 'Racket String Set',      'Accessories', 'Quick restring, tennis/padel',   900, 25,  8),
      ('ACC-GRP-01', 'Overgrip (3-pack)',      'Accessories', 'Tacky, sweat-absorbing',         350, 30, 10),
      ('ACC-BAG-01', 'Kit Bag',                'Accessories', '2-compartment racket bag',      2200,  5,  2),
      ('APP-TEE-01', 'Club Dry-Fit T-Shirt',   'Apparel',     'Breathable, club logo',         1100, 20,  5),
      ('APP-CAP-01', 'Club Cap',               'Apparel',     'Adjustable',                     500, 15,  5)
    ) AS v(sku, name, cat, descr, price, qty, low)
    JOIN product_categories c ON c.name = v.cat`);

// Opening stock goes through the same audit trail as everything else.
await pool.query(`
  INSERT INTO stock_movements (product_id, change, reason, note)
  SELECT id, stock_qty, 'restock', 'Opening stock' FROM products WHERE stock_qty > 0`);

console.log('Seeded 5 categories and 12 products (Cricket Ball and Indoor Shoes start low on stock).');
await pool.end();
