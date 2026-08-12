-- ========================================
-- Migration 0043: Convert TIMESTAMP to TIMESTAMPTZ where missing
-- ========================================
-- Root cause: many tables use TIMESTAMP (without timezone) which causes
-- subtle bugs when the server timezone differs from the client.
-- PostgreSQL stores TIMESTAMP as naive local time, but TIMESTAMPTZ stores
-- UTC and converts on display. This migration converts critical columns.
--
-- This migration is idempotent (USING ... AT TIME ZONE is reversible).
-- ========================================

-- Convert columns that are likely naive local timestamps to TIMESTAMPTZ.
-- The conversion interprets the existing naive value as local time and
-- stores the UTC equivalent.
--
-- Strategy: ALTER ... TYPE TIMESTAMPTZ USING col AT TIME ZONE 'Asia/Riyadh'
-- (the user's configured timezone per session metadata)

DO $$
DECLARE
    tz TEXT := 'Asia/Riyadh';
    conversion_sql TEXT;
BEGIN
    -- Helper: convert a column to TIMESTAMPTZ if it's currently TIMESTAMP (without tz)
    -- We use a loop over information_schema to find all TIMESTAMP columns
    -- and convert them. This is more robust than hardcoding column names.

    FOR conversion_sql IN
        SELECT format(
            'ALTER TABLE %I.%I ALTER COLUMN %I TYPE TIMESTAMPTZ USING %I AT TIME ZONE %L',
            table_schema, table_name, column_name, column_name, tz
        )
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND data_type = 'timestamp without time zone'
          -- Skip the _sqlx_migrations table (sqlx internal)
          AND table_name <> '_sqlx_migrations'
          -- Skip the app_health table (already TIMESTAMPTZ)
          AND table_name <> 'app_health'
        ORDER BY table_name, column_name
    LOOP
        BEGIN
            EXECUTE conversion_sql;
            RAISE NOTICE 'Converted: %', conversion_sql;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Failed to convert (skipping): % — %', conversion_sql, SQLERRM;
        END;
    END LOOP;
END $$;

-- Verify: count remaining TIMESTAMP (without tz) columns in public schema
SELECT
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND data_type = 'timestamp without time zone'
  AND table_name <> '_sqlx_migrations'
ORDER BY table_name, column_name;
