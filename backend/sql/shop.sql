-- WARNING: resets ONLY the shop tables (Phase 1 data is not touched).
DROP TABLE IF EXISTS order_items, stock_movements, orders, products, product_categories CASCADE;
DROP SEQUENCE IF EXISTS order_no_seq;
CREATE SEQUENCE order_no_seq START 1;

CREATE TABLE product_categories (
  id   INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE products (
  id                  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku                 TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  category_id         INT NOT NULL REFERENCES product_categories(id),
  description         TEXT,
  price               NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  stock_qty           INT NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),   -- can never go negative
  low_stock_threshold INT NOT NULL DEFAULT 5,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Counter sales AND online orders live in the same table; "channel" tells them apart.
CREATE TABLE orders (
  id               INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_no         TEXT NOT NULL UNIQUE
                   DEFAULT ('ORD-' || lpad(nextval('order_no_seq')::text, 5, '0')),
  channel          TEXT NOT NULL CHECK (channel IN ('counter', 'online')),
  fulfilment       TEXT NOT NULL CHECK (fulfilment IN ('counter', 'pickup', 'delivery')),
  status           TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'completed', 'cancelled')),
  member_id        INT REFERENCES members(id),
  customer_name    TEXT NOT NULL,
  customer_phone   TEXT,
  delivery_address TEXT,
  subtotal         NUMERIC(10,2) NOT NULL,
  discount_pct     INT NOT NULL DEFAULT 0,
  discount_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  total            NUMERIC(10,2) NOT NULL,
  payment_method   TEXT CHECK (payment_method IN ('cash', 'card', 'upi')),
  paid_at          TIMESTAMPTZ,
  created_by       INT REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ,
  CHECK (fulfilment <> 'delivery' OR delivery_address IS NOT NULL)
);
CREATE INDEX idx_orders_status  ON orders (status, created_at);
CREATE INDEX idx_orders_created ON orders (created_at);

-- Name and price are copied onto the line, so old receipts never change if prices change later.
CREATE TABLE order_items (
  id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id     INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   INT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  unit_price   NUMERIC(10,2) NOT NULL,
  qty          INT NOT NULL CHECK (qty > 0),
  line_total   NUMERIC(10,2) NOT NULL
);

-- The audit trail of every stock change.
CREATE TABLE stock_movements (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id),
  change     INT NOT NULL CHECK (change <> 0),
  reason     TEXT NOT NULL CHECK (reason IN
             ('restock', 'counter_sale', 'online_order', 'order_cancelled', 'adjustment')),
  order_id   INT REFERENCES orders(id),
  note       TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_movements_product ON stock_movements (product_id, created_at DESC);
