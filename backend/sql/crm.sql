CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- WARNING: resets ONLY the CRM tables (Phases 1-3 data is not touched).
-- If you ever re-run the Phase 1 "db:init", re-run this one too (it references members and bookings).
DROP TABLE IF EXISTS lead_activities, quotes, leads CASCADE;
DROP SEQUENCE IF EXISTS quote_no_seq;
CREATE SEQUENCE quote_no_seq START 1;

CREATE TABLE leads (
  id                 INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name               TEXT NOT NULL,
  phone              TEXT NOT NULL,                 -- stored normalised: digits and "+" only
  email              TEXT,
  message            TEXT,
  source             TEXT NOT NULL DEFAULT 'website'
                     CHECK (source IN ('website', 'trial', 'phone', 'walk_in', 'referral', 'other')),
  interested_plan_id INT REFERENCES membership_plans(id),
  status             TEXT NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new', 'contacted', 'quoted', 'trial_booked', 'converted', 'lost')),
  assigned_to        INT REFERENCES users(id),
  next_follow_up     DATE,
  trial_booking_id   INT REFERENCES bookings(id),
  member_id          INT REFERENCES members(id),
  lost_reason        TEXT,
  converted_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- ONE open lead per phone number: the database itself prevents duplicates.
CREATE UNIQUE INDEX uq_open_lead_per_phone ON leads (phone)
  WHERE status NOT IN ('converted', 'lost');
CREATE INDEX idx_leads_status   ON leads (status, created_at DESC);
CREATE INDEX idx_leads_followup ON leads (next_follow_up);

-- The timeline: every message, call, status change and quote in one place.
CREATE TABLE lead_activities (
  id         INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lead_id    INT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('enquiry', 'trial', 'note', 'call', 'status', 'quote', 'converted')),
  body       TEXT NOT NULL,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_lead_activities ON lead_activities (lead_id, created_at DESC);

CREATE TABLE quotes (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  quote_no    TEXT NOT NULL UNIQUE DEFAULT ('Q-' || lpad(nextval('quote_no_seq')::text, 5, '0')),
  token       TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),   -- unguessable public link
  lead_id     INT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  plan_id     INT NOT NULL REFERENCES membership_plans(id),
  amount      NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  valid_until DATE NOT NULL,
  message     TEXT,
  status      TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'accepted', 'declined')),
  created_by  INT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quotes_lead ON quotes (lead_id);
