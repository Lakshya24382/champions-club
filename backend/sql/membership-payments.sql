-- Safe, repeatable migration for online membership payments.
CREATE TABLE IF NOT EXISTS membership_payment_orders (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  plan_id INT NOT NULL REFERENCES membership_plans(id),
  razorpay_order_id TEXT NOT NULL UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','paid','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_membership_payment_orders_member ON membership_payment_orders(member_id, created_at DESC);
