-- WARNING: resets ONLY the bar tables and shifts (Phases 1-2 data is not touched).
DROP TABLE IF EXISTS bar_payments, bar_order_items, bar_orders, bar_tables,
                     menu_items, menu_categories, shifts CASCADE;
DROP SEQUENCE IF EXISTS bar_order_no_seq;
CREATE SEQUENCE bar_order_no_seq START 1;

-- A staff member's working session. Payments are stamped with the shift that took them.
CREATE TABLE shifts (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       INT NOT NULL REFERENCES users(id),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at      TIMESTAMPTZ,
  opening_cash  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
  closing_cash  NUMERIC(10,2),
  expected_cash NUMERIC(10,2),
  note          TEXT
);
-- A person can only have ONE running shift at a time.
CREATE UNIQUE INDEX uq_one_open_shift_per_user ON shifts (user_id) WHERE ended_at IS NULL;

CREATE TABLE menu_categories (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE menu_items (
  id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  category_id  INT NOT NULL REFERENCES menu_categories(id),
  price        NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  station      TEXT NOT NULL DEFAULT 'kitchen' CHECK (station IN ('kitchen', 'bar')),
  is_available BOOLEAN NOT NULL DEFAULT TRUE,   -- the "sold out right now" switch
  is_active    BOOLEAN NOT NULL DEFAULT TRUE    -- removed from the menu entirely
);

CREATE TABLE bar_tables (
  id        INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name      TEXT NOT NULL UNIQUE,
  seats     INT NOT NULL DEFAULT 4,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- A tab. table_id NULL = counter / takeaway.
CREATE TABLE bar_orders (
  id              INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_no        TEXT NOT NULL UNIQUE
                  DEFAULT ('BAR-' || lpad(nextval('bar_order_no_seq')::text, 5, '0')),
  table_id        INT REFERENCES bar_tables(id),
  member_id       INT REFERENCES members(id),
  customer_name   TEXT NOT NULL DEFAULT 'Guest',
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'void')),
  subtotal        NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_pct    INT NOT NULL DEFAULT 0,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  shift_id        INT REFERENCES shifts(id),      -- shift that opened the tab
  opened_by       INT REFERENCES users(id),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at         TIMESTAMPTZ,
  paid_by         INT REFERENCES users(id),
  void_reason     TEXT,
  voided_at       TIMESTAMPTZ
);
-- Only one OPEN tab per table. Paid and void tabs don't count.
CREATE UNIQUE INDEX uq_one_open_tab_per_table ON bar_orders (table_id)
  WHERE status = 'open' AND table_id IS NOT NULL;
CREATE INDEX idx_bar_orders_status ON bar_orders (status, opened_at);
CREATE INDEX idx_bar_orders_paid   ON bar_orders (paid_at);

-- Name and price are copied onto the line, so old bills never change if the menu changes.
CREATE TABLE bar_order_items (
  id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id     INT NOT NULL REFERENCES bar_orders(id) ON DELETE CASCADE,
  menu_item_id INT NOT NULL REFERENCES menu_items(id),
  item_name    TEXT NOT NULL,
  unit_price   NUMERIC(10,2) NOT NULL,
  qty          INT NOT NULL CHECK (qty > 0),
  station      TEXT NOT NULL,
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'new'
               CHECK (status IN ('new', 'preparing', 'ready', 'served', 'cancelled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bar_items_order  ON bar_order_items (order_id);
CREATE INDEX idx_bar_items_status ON bar_order_items (status);

-- One tab can be paid with several payments (split bill).
CREATE TABLE bar_payments (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id   INT NOT NULL REFERENCES bar_orders(id),
  method     TEXT NOT NULL CHECK (method IN ('cash', 'card', 'upi')),
  amount     NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  shift_id   INT REFERENCES shifts(id),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_bar_payments_order ON bar_payments (order_id);
CREATE INDEX idx_bar_payments_shift ON bar_payments (shift_id);
