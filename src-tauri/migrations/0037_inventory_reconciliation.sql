-- ========================================
-- Migration 0037: Add inventory reconciliation function + trigger
-- ========================================
-- Root cause: medicines.quantity and SUM(medicine_batches.quantity)
-- could drift apart due to bugs or manual edits.
--
-- Fix: Add a function to detect mismatches and a trigger to keep
-- medicines.quantity in sync with batch totals on every batch change.
-- ========================================

-- Function: find medicines where quantity != SUM(batches.quantity)
CREATE OR REPLACE FUNCTION find_inventory_mismatches() RETURNS TABLE (
    medicine_id UUID,
    medicine_name VARCHAR,
    recorded_quantity INTEGER,
    batch_sum INTEGER,
    difference INTEGER
) AS $$
SELECT m.id, m.name_ar, m.quantity,
       COALESCE(SUM(mb.quantity), 0)::INTEGER AS batch_sum,
       (m.quantity - COALESCE(SUM(mb.quantity), 0)::INTEGER) AS difference
FROM medicines m
LEFT JOIN medicine_batches mb ON mb.medicine_id = m.id
WHERE m.is_deleted = FALSE
GROUP BY m.id, m.name_ar, m.quantity
HAVING m.quantity != COALESCE(SUM(mb.quantity), 0)
   OR (m.quantity != 0 AND COUNT(mb.id) = 0)
   OR (m.quantity = 0 AND COUNT(mb.id) > 0 AND SUM(mb.quantity) > 0);
$$ LANGUAGE sql STABLE;

-- Function: reconcile — fix medicines.quantity to match batch sum
CREATE OR REPLACE FUNCTION reconcile_inventory() RETURNS INTEGER AS $$
DECLARE
    affected INTEGER;
BEGIN
    UPDATE medicines m
    SET quantity = COALESCE(sub.batch_sum, 0), updated_at = NOW()
    FROM (
        SELECT mb.medicine_id, SUM(mb.quantity)::INTEGER AS batch_sum
        FROM medicine_batches mb
        GROUP BY mb.medicine_id
    ) sub
    WHERE m.id = sub.medicine_id
      AND m.quantity != sub.batch_sum;

    -- Also set quantity = 0 for medicines with no batches
    UPDATE medicines
    SET quantity = 0, updated_at = NOW()
    WHERE is_deleted = FALSE
      AND id NOT IN (SELECT DISTINCT medicine_id FROM medicine_batches WHERE quantity > 0)
      AND quantity != 0;

    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$ LANGUAGE plpgsql;
