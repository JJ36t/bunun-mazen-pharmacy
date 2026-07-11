-- Migration 0018: Real session tokens
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS token VARCHAR(100) UNIQUE;
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_activity TIMESTAMP DEFAULT NOW();
ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS logout_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token) WHERE is_active = TRUE;
