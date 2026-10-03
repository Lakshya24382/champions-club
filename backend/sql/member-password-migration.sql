-- Safe, non-destructive migration for password-based member accounts.
ALTER TABLE members ADD COLUMN IF NOT EXISTS password_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_email_unique_lower ON members (lower(email)) WHERE email IS NOT NULL;
