-- WARNING: this file RESETS the database (drops and recreates all tables).
CREATE EXTENSION IF NOT EXISTS btree_gist;

DROP TABLE IF EXISTS bookings, membership_events, members, courts, membership_plans, users CASCADE;
DROP SEQUENCE IF EXISTS member_code_seq;

-- Staff accounts (front desk, admins, owner)
CREATE TABLE users (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'staff')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Gold / Silver / Junior and what each one entitles you to
CREATE TABLE membership_plans (
  id                  INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code                TEXT NOT NULL UNIQUE,
  name                TEXT NOT NULL,
  description         TEXT,
  price               NUMERIC(10,2) NOT NULL,
  duration_days       INT NOT NULL DEFAULT 365,
  court_discount_pct  INT NOT NULL DEFAULT 0 CHECK (court_discount_pct BETWEEN 0 AND 100),
  shop_discount_pct   INT NOT NULL DEFAULT 0 CHECK (shop_discount_pct  BETWEEN 0 AND 100),
  bar_discount_pct    INT NOT NULL DEFAULT 0 CHECK (bar_discount_pct   BETWEEN 0 AND 100),
  max_age             INT,                       -- Junior = 17
  is_active           BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE SEQUENCE member_code_seq START 1;

CREATE TABLE members (
  id                INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_code       TEXT NOT NULL UNIQUE
                    DEFAULT ('CC-' || lpad(nextval('member_code_seq')::text, 5, '0')),
  full_name         TEXT NOT NULL,
  phone             TEXT NOT NULL UNIQUE,
  email             TEXT,
  date_of_birth     DATE NOT NULL,
  gender            TEXT CHECK (gender IN ('male', 'female', 'other')),
  emergency_contact TEXT,
  notes             TEXT,
  plan_id           INT NOT NULL REFERENCES membership_plans(id),
  joined_on         DATE NOT NULL DEFAULT current_date,
  expires_on        DATE NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  password_hash     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_members_expires ON members (expires_on);

-- Member history: joined / renewed / plan_changed
CREATE TABLE membership_events (
  id          INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  member_id   INT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  plan_id     INT NOT NULL REFERENCES membership_plans(id),
  event_type  TEXT NOT NULL CHECK (event_type IN ('joined', 'renewed', 'plan_changed')),
  starts_on   DATE NOT NULL,
  ends_on     DATE NOT NULL,
  amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_by  INT REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE courts (
  id                      INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                    TEXT NOT NULL UNIQUE,
  sport                   TEXT NOT NULL CHECK (sport IN ('tennis', 'cricket', 'padel', 'badminton')),
  price_per_hour          NUMERIC(10,2) NOT NULL,     -- walk-in rate
  social_price_per_person NUMERIC(10,2) NOT NULL,     -- Friday social play
  social_capacity         INT NOT NULL DEFAULT 8,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE bookings (
  id            INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  court_id      INT NOT NULL REFERENCES courts(id),
  member_id     INT REFERENCES members(id),
  guest_name    TEXT,
  guest_phone   TEXT,
  start_at      TIMESTAMPTZ NOT NULL,
  end_at        TIMESTAMPTZ NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'standard' CHECK (kind IN ('standard', 'social')),
  status        TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  price         NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_pct  INT NOT NULL DEFAULT 0,
  created_by    INT REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at  TIMESTAMPTZ,
  cancel_reason TEXT,
  CHECK (end_at > start_at),
  CHECK (member_id IS NOT NULL OR guest_name IS NOT NULL),

  -- THE guarantee: two confirmed standard bookings can never overlap on a court.
  EXCLUDE USING gist (
    court_id WITH =,
    tstzrange(start_at, end_at) WITH &&
  ) WHERE (kind = 'standard' AND status = 'confirmed')
);
CREATE INDEX idx_bookings_member ON bookings (member_id, start_at);
CREATE INDEX idx_bookings_start  ON bookings (start_at);
-- A member can't join the same social slot twice
CREATE UNIQUE INDEX uq_social_member_slot ON bookings (court_id, start_at, member_id)
  WHERE kind = 'social' AND status = 'confirmed' AND member_id IS NOT NULL;
