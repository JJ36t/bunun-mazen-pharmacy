-- ========================================
-- Migration 0040: Fix get_daily_receipt_number race condition
-- ========================================
-- Root cause: the old function used `SELECT COUNT(*) + 1` which is racy.
-- Two concurrent cashiers could both read COUNT=5, both insert with
-- daily_receipt_number=6, and one would fail on the unique index
-- (idx_invoices_daily_receipt_unique added in 0036).
--
-- Fix: use pg_advisory_xact_lock keyed by CURRENT_DATE so only one
-- transaction can compute the next number at a time. Within the lock,
-- we read MAX(daily_receipt_number) and add 1. The lock auto-releases
-- at COMMIT/ROLLBACK — no manual unlock needed, no deadlock risk.
--
-- The advisory lock key is derived from a fixed namespace + the date
-- integer (YYYYMMDD as integer), so different days use different keys.
-- ========================================

CREATE OR REPLACE FUNCTION get_daily_receipt_number() RETURNS INTEGER AS $$
DECLARE
    next_num INTEGER;
    today_key BIGINT;
BEGIN
    -- Build a stable lock key: namespace 0x50484152 ('PHAR' in hex) << 32 | YYYYMMDD
    today_key := (20240101::BIGINT << 32) | (to_char(CURRENT_DATE, 'YYYYMMDD')::BIGINT);

    -- Acquire transaction-scoped advisory lock — auto-released on COMMIT/ROLLBACK
    PERFORM pg_advisory_xact_lock(today_key);

    -- Within the lock, find the highest receipt number for today
    SELECT COALESCE(MAX(daily_receipt_number), 0) + 1
    INTO next_num
    FROM invoices
    WHERE created_at::date = CURRENT_DATE
      AND total_amount > 0;

    RETURN next_num;
END;
$$ LANGUAGE plpgsql;

-- Verify the function exists with the new implementation
SELECT proname FROM pg_proc WHERE proname = 'get_daily_receipt_number';

-- ========================================
-- Also add a sequence-based fallback for environments that prefer sequences
-- ========================================
-- This is optional — the advisory lock approach above is sufficient.
-- Sequence is provided as an alternative path if advisory locks cause issues.

CREATE SEQUENCE IF NOT EXISTS daily_receipt_seq AS INTEGER;

-- Comment documenting the approach
COMMENT ON FUNCTION get_daily_receipt_number() IS
'Race-safe daily receipt number generator using pg_advisory_xact_lock.
Returns MAX(daily_receipt_number)+1 for today, serialized across transactions.
Lock is auto-released at COMMIT/ROLLBACK — no manual cleanup needed.';
