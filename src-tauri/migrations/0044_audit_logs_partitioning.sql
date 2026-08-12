-- ========================================
-- Migration 0044: audit_logs monthly partitioning
-- ========================================
-- Root cause: audit_logs grows unbounded. After 1-2 years of operation,
-- it can reach millions of rows, slowing audit queries and bloating the
-- table. Partitioning by month allows:
--   - Fast queries that filter by date (partition pruning)
--   - Easy archival (DETACH old partitions, move to cold storage)
--   - VACUUM only affects recent partitions
--
-- Strategy: convert audit_logs to a partitioned table.
--   - Partition key: created_at (range partitioning by month)
--   - Pre-create 12 months of partitions (current + 11 future)
--   - A monthly cron job (pg_cron or external) creates future partitions
--
-- This migration preserves existing data:
--   1. Rename old table to audit_logs_old
--   2. Create new partitioned table
--   3. Copy data from old to new
--   4. Drop old table
-- ========================================

-- Step 1: Rename existing table
DO $$ BEGIN
    ALTER TABLE audit_logs RENAME TO audit_logs_old;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'audit_logs not renamed: %', SQLERRM;
END $$;

-- Step 2: Create new partitioned table
CREATE TABLE IF NOT EXISTS audit_logs (
    id          BIGSERIAL,
    user_role   TEXT,
    action_type TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Tamper-proof fields (added in migration 0031)
    prev_hash   TEXT,
    row_hash    TEXT,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Step 3: Create default partition (catches any out-of-range dates)
CREATE TABLE IF NOT EXISTS audit_logs_default PARTITION OF audit_logs DEFAULT;

-- Step 4: Create monthly partitions for current + 11 future months
-- Use a DO block to generate them dynamically
DO $$
DECLARE
    month_start DATE;
    month_end   DATE;
    partition_name TEXT;
    i INTEGER;
BEGIN
    FOR i IN 0..11 LOOP
        month_start := DATE_TRUNC('month', CURRENT_DATE + (i || ' months')::interval)::DATE;
        month_end := month_start + INTERVAL '1 month';
        partition_name := 'audit_logs_' || to_char(month_start, 'YYYYMM');

        BEGIN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
                partition_name, month_start, month_end
            );
            RAISE NOTICE 'Created partition: %', partition_name;
        EXCEPTION WHEN duplicate_object THEN
            RAISE NOTICE 'Partition % already exists', partition_name;
        END;
    END LOOP;
END $$;

-- Step 5: Copy data from old table
-- Note: we don't preserve the old sequence value, but the new BIGSERIAL
-- will continue from the max id in the copied data.
DO $$
BEGIN
    -- Check if audit_logs_old exists and has data
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs_old') THEN
        -- Copy existing rows
        EXECUTE 'INSERT INTO audit_logs (id, user_role, action_type, description, created_at, prev_hash, row_hash)
                 SELECT id, user_role, action_type, description, created_at, prev_hash, row_hash
                 FROM audit_logs_old
                 ORDER BY created_at';

        -- Sync the sequence
        EXECUTE 'SELECT setval(pg_get_serial_sequence(''audit_logs'', ''id''),
                 COALESCE((SELECT MAX(id) FROM audit_logs), 1), true)';

        -- Drop old table
        DROP TABLE audit_logs_old;
        RAISE NOTICE 'Data copied and old table dropped';
    END IF;
END $$;

-- Step 6: Recreate indexes on partitioned table
-- (Indexes on partitioned tables automatically create indexes on all partitions)
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
    ON audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type
    ON audit_logs(action_type);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_role
    ON audit_logs(user_role);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type_created_at
    ON audit_logs(action_type, created_at DESC);

-- Step 7: Function to create next month's partition (call from cron)
CREATE OR REPLACE FUNCTION create_next_audit_partition()
RETURNS TEXT AS $$
DECLARE
    next_month DATE;
    partition_name TEXT;
BEGIN
    next_month := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month')::DATE;
    partition_name := 'audit_logs_' || to_char(next_month, 'YYYYMM');

    BEGIN
        EXECUTE format(
            'CREATE TABLE %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
            partition_name, next_month, next_month + INTERVAL '1 month'
        );
        RETURN format('Created partition: %s', partition_name);
    EXCEPTION WHEN duplicate_object THEN
        RETURN format('Partition %s already exists', partition_name);
    END;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Function to detach old partition for archival
-- Usage: SELECT detach_audit_partition('202401');
-- This detaches the partition (data is preserved but no longer queryable via audit_logs)
CREATE OR REPLACE FUNCTION detach_audit_partition(p_partition_suffix TEXT)
RETURNS TEXT AS $$
DECLARE
    partition_name TEXT := 'audit_logs_' || p_partition_suffix;
BEGIN
    BEGIN
        EXECUTE format('ALTER TABLE audit_logs DETACH PARTITION %I', partition_name);
        RETURN format('Detached partition: %s (rename or drop as needed)', partition_name);
    EXCEPTION WHEN OTHERS THEN
        RETURN format('Failed to detach %s: %s', partition_name, SQLERRM);
    END;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE audit_logs IS
'Monthly-partitioned audit log. Use create_next_audit_partition() monthly
(via pg_cron or external scheduler) to pre-create future partitions.
Use detach_audit_partition(YYYYMM) to archive old data to cold storage.';
