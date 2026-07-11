-- Migration 0021: Unify shifts table schema
UPDATE shifts SET opening_amount = opening_balance WHERE opening_amount IS NULL AND opening_balance IS NOT NULL;
UPDATE shifts SET closing_amount = closing_balance WHERE closing_amount IS NULL AND closing_balance IS NOT NULL;
UPDATE shifts SET status = CASE WHEN is_active = TRUE THEN 'open' ELSE 'closed' END WHERE status IS NULL;
ALTER TABLE shifts ALTER COLUMN opening_amount SET DEFAULT 0;
ALTER TABLE shifts ALTER COLUMN status SET DEFAULT 'open';
CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts(status, user_role) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_shifts_start_time ON shifts(start_time DESC);
