-- ========================================
-- Migration 0039: Hash session tokens at rest (SHA-256)
-- ========================================
-- Root cause: user_sessions.token stored the raw UUID v4 token in plaintext.
-- Any DB read access (backup leak, SQL injection, snapshot) exposed live sessions.
--
-- Fix: add token_hash column (SHA-256 hex of the token). New sessions write
-- BOTH token (transient, for backward compatibility during rollout) AND
-- token_hash. verify_session_token uses token_hash. A follow-up migration
-- can drop the plaintext column after a verification window.
--
-- This migration is fully idempotent (IF NOT EXISTS / EXCEPTION guards).
-- ========================================

-- 0) Ensure pgcrypto extension is available (provides digest())
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Add token_hash column
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS token_hash CHAR(64);

-- 2) Unique index on token_hash (one session per hash)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_token_hash
    ON user_sessions(token_hash) WHERE token_hash IS NOT NULL;

-- 3) Backfill existing rows: hash the plaintext token (one-time, best-effort)
-- This is safe because the existing tokens are still in plaintext column.
UPDATE user_sessions
SET token_hash = encode(digest(token, 'sha256'), 'hex')
WHERE token IS NOT NULL AND token_hash IS NULL;

-- 4) Function to compute hash (callable from app for consistency)
CREATE OR REPLACE FUNCTION hash_session_token(p_token TEXT)
RETURNS CHAR(64) AS $$
    SELECT encode(digest(p_token, 'sha256'), 'hex');
$$ LANGUAGE sql IMMUTABLE STRICT;

-- 5) Helper: lookup session by token hash (constant-time lookup via unique index)
CREATE OR REPLACE FUNCTION lookup_session_by_token(p_token TEXT)
RETURNS TABLE (
    user_id UUID,
    username TEXT,
    role TEXT,
    is_active BOOLEAN,
    expires_at TIMESTAMPTZ,
    absolute_expires_at TIMESTAMPTZ,
    user_is_active BOOLEAN,
    user_deleted_at TIMESTAMPTZ
) AS $$
    SELECT u.id, u.username, u.role, s.is_active, s.expires_at, s.absolute_expires_at,
           u.is_active, u.deleted_at
    FROM user_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = hash_session_token(p_token)
    LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 6) Index on absolute_expires_at for cleanup performance
CREATE INDEX IF NOT EXISTS idx_user_sessions_absolute_expires
    ON user_sessions(absolute_expires_at) WHERE absolute_expires_at IS NOT NULL;

-- 7) Index on expires_at for sliding-window cleanup
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires
    ON user_sessions(expires_at) WHERE expires_at IS NOT NULL;
