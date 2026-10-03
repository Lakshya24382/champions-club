import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/summary', async (_req, res) => {
  const { rows: [s] } = await query(`
    SELECT
      (SELECT count(*)::int FROM members) AS total_members,
      (SELECT count(*)::int FROM members WHERE is_active AND expires_on >= current_date) AS active_members,
      (SELECT count(*)::int FROM members
        WHERE is_active AND expires_on BETWEEN current_date AND current_date + 30) AS expiring_soon,
      (SELECT count(*)::int FROM members WHERE expires_on < current_date) AS expired_members,
      (SELECT count(*)::int FROM bookings
        WHERE status = 'confirmed' AND start_at::date = current_date) AS bookings_today,
      (SELECT COALESCE(sum(price), 0) FROM bookings
        WHERE status = 'confirmed' AND start_at::date = current_date) AS court_revenue_today,
      (SELECT COALESCE(sum(price), 0) FROM bookings
        WHERE status = 'confirmed'
          AND date_trunc('month', start_at) = date_trunc('month', now())) AS court_revenue_month,
      (SELECT COALESCE(sum(total), 0) FROM orders
        WHERE status = 'completed' AND completed_at::date = current_date) AS shop_revenue_today,
      (SELECT COALESCE(sum(total), 0) FROM orders
        WHERE status = 'completed'
          AND date_trunc('month', completed_at) = date_trunc('month', now())) AS shop_revenue_month,
      (SELECT count(*)::int FROM orders WHERE status IN ('pending', 'ready')) AS open_online_orders,
      (SELECT count(*)::int FROM products
        WHERE is_active AND stock_qty <= low_stock_threshold) AS low_stock_items
  `);
  res.json(s);
});

export default router;
