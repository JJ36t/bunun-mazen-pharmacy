-- ========================================
-- Migration 20240114000000: Undo fabrications from 20240112000000_add_stock_prices_new
-- ========================================
-- Root cause (audit 3.1, P0): migration 20240112 fabricates business data:
--   quantity = 50 for non-positive stock, expiry = today+1y when missing,
--   hash-derived prices, and 'BATCH-<uuid8>' mirror batches.
-- 0035 tried to reverse this but runs BEFORE 20240112 numerically
-- (0035 < 20240112000000), so on every fresh database the reversal is a
-- no-op and the fabricated data survives.
--
-- This migration runs AFTER 20240112 (and after 20240113) and undoes the
-- fabrications on both fresh and existing databases. It follows 0035's
-- conservative guards: only medicines whose batches are ALL fabricated
-- (BATCH-<8-hex> pattern) are touched, so real stock is never modified.
-- Hash-derived prices are NOT reversed: they overwrote seed values
-- (0/700/1000/900) with no way to tell the original apart — same
-- decision 0035 made. Record real cost/price via inventory instead.
-- ========================================

-- 1) Drop fabricated mirror batches (provably pattern-derived from uuid prefix)
DELETE FROM medicine_batches
WHERE batch_number ~ '^BATCH-[0-9a-f]{8}$';

-- 2) Reverse fake quantity=50 only for medicines with NO real batch left
UPDATE medicines SET quantity = 0
WHERE quantity = 50
  AND is_deleted = FALSE
  AND NOT EXISTS (SELECT 1 FROM medicine_batches mb WHERE mb.medicine_id = medicines.id);

-- 3) Reverse fake expiry (exactly today+1y) only for medicines with NO real batch left
UPDATE medicines SET expiry_date = NULL
WHERE expiry_date = (CURRENT_DATE + INTERVAL '1 year')::date
  AND is_deleted = FALSE
  AND NOT EXISTS (SELECT 1 FROM medicine_batches mb WHERE mb.medicine_id = medicines.id);
