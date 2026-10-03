import { Router } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { config } from '../config.js';
import { HttpError } from '../utils/httpError.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
router.use(requireRole('member'));
const planSchema = z.object({ planId: z.number().int().positive() });
const verifySchema = z.object({
  orderId: z.string().min(5), paymentId: z.string().min(5), signature: z.string().min(10),
});
const razorpayConfigured = () => {
  if (!config.razorpayKeyId || !config.razorpayKeySecret) throw new HttpError(503, 'Online payments are not configured. Please contact the club.');
};

router.post('/order', async (req, res) => {
  razorpayConfigured();
  const { planId } = planSchema.parse(req.body);
  const { rows: [plan] } = await query('SELECT id, name, price, duration_days FROM membership_plans WHERE id=$1 AND is_active', [planId]);
  if (!plan) throw new HttpError(404, 'Selected membership plan is unavailable');
  const amountPaise = Math.round(Number(plan.price) * 100);
  if (!Number.isSafeInteger(amountPaise) || amountPaise < 100) throw new HttpError(400, 'Plan price is invalid');
  const auth = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST', headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt: `member-${req.user.sub}-${Date.now()}`, notes: { member_id: String(req.user.sub), plan_id: String(plan.id) } }),
  });
  const order = await response.json().catch(() => ({}));
  if (!response.ok) throw new HttpError(502, order.error?.description || 'Could not create payment order');
  await query(`INSERT INTO membership_payment_orders(member_id,plan_id,razorpay_order_id,amount_paise) VALUES($1,$2,$3,$4)`, [req.user.sub, plan.id, order.id, amountPaise]);
  res.status(201).json({ orderId: order.id, amount: amountPaise, currency: 'INR', keyId: config.razorpayKeyId, planName: plan.name });
});

router.post('/verify', async (req, res) => {
  razorpayConfigured();
  const d = verifySchema.parse(req.body);
  const { rows: [paymentOrder] } = await query('SELECT * FROM membership_payment_orders WHERE razorpay_order_id=$1 AND member_id=$2', [d.orderId, req.user.sub]);
  if (!paymentOrder) throw new HttpError(404, 'Payment order not found');
  if (paymentOrder.status === 'paid') return res.json({ ok: true, message: 'Payment already verified' });
  const expected = createHmac('sha256', config.razorpayKeySecret).update(`${d.orderId}|${d.paymentId}`).digest();
  let supplied;
  try { supplied = Buffer.from(d.signature, 'hex'); } catch { supplied = Buffer.alloc(0); }
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new HttpError(400, 'Payment signature verification failed');
  const auth = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString('base64');
  const checkRes = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(d.paymentId)}`, { headers: { Authorization: `Basic ${auth}` } });
  const verified = await checkRes.json().catch(() => ({}));
  if (!checkRes.ok || verified.order_id !== d.orderId || verified.status !== 'captured' || Number(verified.amount) !== Number(paymentOrder.amount_paise) || verified.currency !== 'INR') {
    throw new HttpError(400, 'Payment is not captured or does not match this order');
  }
  await withTransaction(async (c) => {
    const { rows: [locked] } = await c.query('SELECT * FROM membership_payment_orders WHERE id=$1 FOR UPDATE', [paymentOrder.id]);
    if (locked.status === 'paid') return;
    const { rows: [plan] } = await c.query('SELECT * FROM membership_plans WHERE id=$1', [locked.plan_id]);
    const { rows: [member] } = await c.query('SELECT id, expires_on FROM members WHERE id=$1 FOR UPDATE', [locked.member_id]);
    if (!member || !plan) throw new HttpError(404, 'Member or plan no longer exists');
    const { rows: [updated] } = await c.query(`UPDATE members SET plan_id=$2, expires_on=GREATEST(expires_on,current_date)+$3::int, is_active=TRUE WHERE id=$1 RETURNING expires_on`, [member.id, plan.id, plan.duration_days]);
    const { rows: [event] } = await c.query(`INSERT INTO membership_events(member_id,plan_id,event_type,starts_on,ends_on,amount,created_by) VALUES($1,$2,'renewed',GREATEST($3::date,current_date),$4,$5,NULL) RETURNING id`, [member.id, plan.id, member.expires_on, updated.expires_on, plan.price]);
    await c.query(`UPDATE membership_payment_orders SET status='paid',razorpay_payment_id=$2,paid_at=now() WHERE id=$1`, [locked.id, d.paymentId]);
  });
  res.json({ ok: true, message: 'Payment verified and membership updated' });
});
export default router;
