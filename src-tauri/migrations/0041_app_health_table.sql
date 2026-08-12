-- ========================================
-- Migration 0041: Add app_health table for /health endpoint
-- ========================================
-- Provides a lightweight health-check surface that an HTTP /health handler
-- can query without running expensive aggregations. The app writes a row
-- here every 60s from a background tokio task; the /health endpoint reads
-- the latest row. If the latest row is older than 5 minutes, the app is
-- considered unhealthy.
-- ========================================

CREATE TABLE IF NOT EXISTS app_health (
    id              BIGSERIAL PRIMARY KEY,
    checked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    app_version     TEXT NOT NULL,
    db_ok           BOOLEAN NOT NULL,
    db_latency_ms   INTEGER,
    active_sessions INTEGER,
    error           TEXT
);

-- Keep only the last 1000 health checks (autovacuum-friendly)
CREATE INDEX IF NOT EXISTS idx_app_health_checked_at
    ON app_health(checked_at DESC);

-- Helper: latest health row
CREATE OR REPLACE FUNCTION get_latest_health()
RETURNS TABLE (
    checked_at TIMESTAMPTZ,
    app_version TEXT,
    db_ok BOOLEAN,
    db_latency_ms INTEGER,
    active_sessions INTEGER,
    error TEXT,
    is_stale BOOLEAN
) AS $$
    SELECT checked_at, app_version, db_ok, db_latency_ms, active_sessions, error,
           (checked_at < NOW() - INTERVAL '5 minutes') AS is_stale
    FROM app_health
    ORDER BY checked_at DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;

-- Auto-prune old rows (keep last 1000) via trigger
CREATE OR REPLACE FUNCTION prune_app_health() RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM app_health WHERE id NOT IN (
        SELECT id FROM app_health ORDER BY checked_at DESC LIMIT 1000
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prune_app_health ON app_health;
CREATE TRIGGER trg_prune_app_health
    AFTER INSERT ON app_health
    FOR EACH ROW EXECUTE FUNCTION prune_app_health();
