-- ========================================
-- Migration 0029: Add session cleanup function + index
-- ========================================
-- Root cause: expired sessions accumulate in user_sessions forever.
-- No automatic cleanup. Over time, table grows large.
--
-- Fix: Add a cleanup function that marks expired sessions as inactive.
-- Can be called periodically from the app (e.g., on startup or hourly).
-- ========================================

-- Index for faster cleanup queries
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_sessions_absolute ON user_sessions(absolute_expires_at) WHERE is_active = TRUE AND absolute_expires_at IS NOT NULL;

-- Cleanup function: deactivate all expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions() RETURNS INTEGER AS $$
DECLARE
    affected_count INTEGER;
BEGIN
    UPDATE user_sessions
    SET is_active = FALSE, logout_at = COALESCE(logout_at, NOW())
    WHERE is_active = TRUE
      AND (
        (expires_at IS NOT NULL AND expires_at < NOW())
        OR
        (absolute_expires_at IS NOT NULL AND absolute_expires_at < NOW())
      );
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RETURN affected_count;
END;
$$ LANGUAGE plpgsql;
