CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- WARNING: resets ONLY the finance/HR tables (Phases 1-4 data is not touched).
-- It also adds payment columns to bookings and membership_events (safe to re-run).
-- If you ever re-run the Phase 1 "db:init", re-run Phase 4's and this one afterwards.
CREATE EXTENSION IF NOT EXISTS btree_gist;

DROP TABLE IF EXISTS report_shares, payslips, payroll_runs, leave_requests, employees,
                     expenses, invoice_payments, invoice_items, invoices, clients, settings CASCADE;
DROP SEQUENCE IF EXISTS invoice_no_seq;
CREATE SEQUENCE invoice_no_seq START 1;

-- How was a court booking / membership paid? (NULL = not recorded yet)
ALTER TABLE bookings          ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'upi'));
ALTER TABLE bookings          ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE membership_events ADD COLUMN IF NOT EXISTS payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'upi'));
ALTER TABLE membership_events ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Club-wide settings: tax rates, leave allowance, details printed on invoices
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('club_name', 'Champions Club'),
  ('club_gstin', ''),
  ('club_address', 'Your club address here'),
  ('tax_courts', '18'),
  ('tax_membership', '18'),
  ('tax_shop', '18'),
  ('tax_bar', '5'),
  ('annual_leave_days', '18');

-- ---------------------------------------------------------------- invoicing
CREATE TABLE clients (
  id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  contact_person TEXT,
  phone          TEXT,
  email          TEXT,
  gstin          TEXT,
  address        TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  id                  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_no          TEXT NOT NULL UNIQUE DEFAULT ('INV-' || lpad(nextval('invoice_no_seq')::text, 5, '0')),
  kind                TEXT NOT NULL CHECK (kind IN ('business', 'membership')),
  client_id           INT REFERENCES clients(id),
  member_id           INT REFERENCES members(id),
  membership_event_id INT REFERENCES membership_events(id),
  issue_date          DATE NOT NULL DEFAULT current_date,
  due_date            DATE NOT NULL,
  status              TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'paid', 'void')),
  subtotal            NUMERIC(12,2) NOT NULL,
  tax_total           NUMERIC(12,2) NOT NULL,
  total               NUMERIC(12,2) NOT NULL,
  notes               TEXT,
  void_reason         TEXT,
  voided_at           TIMESTAMPTZ,
  created_by          INT REFERENCES users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((kind = 'business'   AND client_id IS NOT NULL)
      OR (kind = 'membership' AND member_id IS NOT NULL AND membership_event_id IS NOT NULL))
);
-- One live invoice per membership payment (a voided one can be re-issued).
CREATE UNIQUE INDEX uq_invoice_per_event ON invoices (membership_event_id)
  WHERE status <> 'void' AND membership_event_id IS NOT NULL;
CREATE INDEX idx_invoices_status ON invoices (status, due_date);

CREATE TABLE invoice_items (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id    INT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description   TEXT NOT NULL,
  qty           INT NOT NULL CHECK (qty > 0),
  unit_price    NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),   -- excluding tax
  tax_pct       NUMERIC(5,2) NOT NULL DEFAULT 18 CHECK (tax_pct BETWEEN 0 AND 100),
  line_subtotal NUMERIC(12,2) NOT NULL,
  line_tax      NUMERIC(12,2) NOT NULL
);

CREATE TABLE invoice_payments (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invoice_id INT NOT NULL REFERENCES invoices(id),
  method     TEXT NOT NULL CHECK (method IN ('cash', 'card', 'upi')),
  amount     NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  note       TEXT,
  paid_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by INT REFERENCES users(id)
);
CREATE INDEX idx_inv_payments ON invoice_payments (invoice_id);
CREATE INDEX idx_inv_payments_date ON invoice_payments (paid_at);

-- ---------------------------------------------------------------- bills the club owes
CREATE TABLE expenses (
  id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  expense_date   DATE NOT NULL DEFAULT current_date,
  category       TEXT NOT NULL CHECK (category IN
                 ('rent', 'utilities', 'maintenance', 'supplies', 'marketing', 'equipment', 'inventory', 'professional', 'other')),
  vendor         TEXT NOT NULL,
  description    TEXT,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),        -- total, including tax
  tax_amount     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),   -- input GST inside "amount"
  due_date       DATE,
  status         TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid')),
  paid_at        TIMESTAMPTZ,
  payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'upi')),
  created_by     INT REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (tax_amount <= amount)
);
CREATE INDEX idx_expenses_date   ON expenses (expense_date);
CREATE INDEX idx_expenses_status ON expenses (status, due_date);

-- ---------------------------------------------------------------- people
CREATE TABLE employees (
  id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        INT UNIQUE REFERENCES users(id),     -- links a staff login to their HR profile
  full_name      TEXT NOT NULL,
  phone          TEXT,
  job_title      TEXT NOT NULL,
  monthly_salary NUMERIC(12,2) NOT NULL CHECK (monthly_salary >= 0),
  joined_on      DATE NOT NULL DEFAULT current_date,
  left_on        DATE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE leave_requests (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  employee_id   INT NOT NULL REFERENCES employees(id),
  leave_type    TEXT NOT NULL CHECK (leave_type IN ('casual', 'sick', 'unpaid')),
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  days          INT NOT NULL CHECK (days > 0),
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by    INT REFERENCES users(id),
  decided_at    TIMESTAMPTZ,
  decision_note TEXT,
  created_by    INT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date),
  -- THE guarantee: one person can't have two overlapping live leave requests.
  EXCLUDE USING gist (
    employee_id WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  ) WHERE (status IN ('pending', 'approved'))
);
CREATE INDEX idx_leave_emp ON leave_requests (employee_id, start_date);

CREATE TABLE payroll_runs (
  id             INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  month          TEXT NOT NULL UNIQUE CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'paid')),
  paid_at        TIMESTAMPTZ,
  payment_method TEXT CHECK (payment_method IN ('cash', 'card', 'upi')),
  created_by     INT REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payslips (
  id                INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id            INT NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id       INT NOT NULL REFERENCES employees(id),
  base_salary       NUMERIC(12,2) NOT NULL,             -- earned for the month (pro-rated for joiners/leavers)
  unpaid_leave_days INT NOT NULL DEFAULT 0,
  leave_deduction   NUMERIC(12,2) NOT NULL DEFAULT 0,
  bonus             NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (bonus >= 0),
  other_deduction   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (other_deduction >= 0),
  net_pay           NUMERIC(12,2) NOT NULL CHECK (net_pay >= 0),
  note              TEXT,
  UNIQUE (run_id, employee_id)
);

-- ---------------------------------------------------------------- sharing
CREATE TABLE report_shares (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token      TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  title      TEXT NOT NULL,
  from_date  DATE NOT NULL,
  to_date    DATE NOT NULL,
  snapshot   JSONB NOT NULL,          -- frozen numbers: the link never reads live data
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
