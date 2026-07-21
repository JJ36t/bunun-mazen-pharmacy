-- ========================================
-- Migration 0025: Clean up fake batches from migration 20240112000000
-- ========================================
-- Root cause: migration 20240112000000_add_stock_prices_new.sql inserted
-- fake batches with batch_number = 'BATCH-' || SUBSTRING(m.id::text, 1, 8)
-- for every medicine without a batch. This pollutes batch tracking for
-- fresh installs and makes FEFO unreliable.
--
-- Fix: DELETE medicine_batches rows where batch_number starts with 'BATCH-'
-- followed by 8 hex characters (UUID prefix pattern). Real batches have
-- meaningful batch numbers from suppliers, not this pattern.
--
-- Safety:
-- - Only deletes batches matching the EXACT fake pattern (BATCH-<8hex>)
-- - Real supplier batches are preserved
-- - Idempotent: re-running deletes 0 rows if already cleaned
-- - Does NOT delete batches with NULL batch_number (those may be legitimate)
-- ========================================

-- Delete fake batches created by migration 20240112000000
-- Pattern: 'BATCH-' followed by exactly 8 hexadecimal characters (UUID prefix)
DELETE FROM medicine_batches
WHERE batch_number ~ '^BATCH-[0-9a-f]{8}$';

-- Audit log entry for the cleanup (best-effort)
INSERT INTO audit_logs (user_role, action_type, description)
SELECT 'system', 'SECURITY_FIX', 'Cleaned up fake batches from migration 20240112000000 (migration 0025)'
WHERE NOT EXISTS (
    SELECT 1 FROM audit_logs
    WHERE action_type = 'SECURITY_FIX'
      AND description LIKE '%migration 0025%'
);
