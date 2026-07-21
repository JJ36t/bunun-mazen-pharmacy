-- ========================================
-- Migration 0024: Remove default admin/admin123 and cashier/cashier123 credentials
-- ========================================
-- Root cause: migration 0002 seeds admin/admin123 and cashier/cashier123
-- with bcrypt cost 8 (below policy of 12). These credentials were published
-- in README.md. The main.rs:2003 random-password code is dead because
-- migration 0002 runs before main.rs setup.
--
-- Fix: DELETE users whose password hash matches the known weak hashes.
-- This causes main.rs:2003 to see admin_count == 0 and generate random
-- passwords on next startup.
--
-- Safety: Only deletes if password EXACTLY matches the known weak hashes.
-- If user already changed password, their account is preserved.
-- Idempotent: re-running is safe (DELETE affects 0 rows if already deleted).
-- ========================================

-- Ensure must_change_password column exists (added by 0019, double-check here)
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;

-- Delete admin and cashier ONLY if they still have the default weak passwords
-- (bcrypt cost 8 hashes of "admin123" and "cashier123" from migration 0002)
DELETE FROM users
WHERE username IN ('admin', 'cashier')
  AND password IN (
    '$2b$08$QzjWMoWhJvXEAuQiVlzllOdysTgwfMdGoXMzoESKPtOWoIkU.jCoe',
    '$2b$08$15JmBd5K2RAW0XU1Jd2JRuKRG.LAg7Ic70YYDrxriENcOh4ji241.'
  );

-- Audit log entry for the removal (best-effort, ignore if audit_logs doesn't exist)
INSERT INTO audit_logs (user_role, action_type, description)
SELECT 'system', 'SECURITY_FIX', 'Removed default admin/cashier credentials with weak passwords (migration 0024)'
WHERE NOT EXISTS (
    SELECT 1 FROM audit_logs
    WHERE action_type = 'SECURITY_FIX'
      AND description LIKE '%migration 0024%'
);
