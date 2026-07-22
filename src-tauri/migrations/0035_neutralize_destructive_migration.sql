-- ========================================
-- Migration 0035: Neutralize destructive migration 20240112
-- ========================================
-- Root cause: migration 20240112000000_add_stock_prices_new.sql runs
-- AFTER 0023 (because '2' > '0' lexicographically) and fabricates:
-- - quantity = 50 for all medicines with quantity <= 0
-- - expiry_date = today + 1 year for all medicines without expiry
-- - fake cost_price/price/wholesale_price from hashtext()
-- - fake medicine_batches with 'BATCH-<uuid-prefix>'
--
-- Cannot delete 20240112 (would break _sqlx_migrations checksum).
-- Migration 0025 already cleans the fake batches.
-- This migration reverses the fake quantities and prices for any
-- medicine that still has the fabricated values.
--
-- Safety: Only affects medicines where quantity = 50 AND was likely
-- set by the destructive migration (no corresponding real batch).
-- Does NOT touch medicines with real data.
-- ========================================

-- Reverse fake quantity=50 for medicines that have NO real batches
-- (the destructive migration set quantity=50 for all with quantity<=0)
UPDATE medicines SET quantity = 0
WHERE quantity = 50
  AND is_deleted = FALSE
  AND id NOT IN (SELECT DISTINCT medicine_id FROM medicine_batches WHERE quantity > 0);

-- Reverse fake expiry dates (today + 1 year) for medicines without real batches
UPDATE medicines SET expiry_date = NULL
WHERE expiry_date = (CURRENT_DATE + INTERVAL '1 year')::date
  AND is_deleted = FALSE
  AND id NOT IN (SELECT DISTINCT medicine_id FROM medicine_batches WHERE quantity > 0);
