-- ========================================
-- Migration 0028: Add absolute_expires_at to user_sessions
-- ========================================
-- Root cause: verify_session_token extends expires_at on every request
-- (sliding window). Sessions never expire as long as they're used.
-- Pharmacy compliance requires an absolute maximum session lifetime.
--
-- Fix: Add absolute_expires_at column (set at login, never extended).
-- verify_session_token checks BOTH:
--   - expires_at (sliding 8h, extended on activity)
--   - absolute_expires_at (fixed 24h from login, never extended)
-- ========================================

ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS absolute_expires_at TIMESTAMP;

-- Backfill: set absolute_expires_at = expires_at for existing sessions
UPDATE user_sessions SET absolute_expires_at = expires_at WHERE absolute_expires_at IS NULL;
