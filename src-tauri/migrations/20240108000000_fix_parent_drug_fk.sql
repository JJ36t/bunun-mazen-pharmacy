-- ========================================
-- Migration 8: Fix parent_drug_id foreign key
-- ========================================

-- إزالة القيد القديم (يreferenced drug_master(id) - خطأ)
ALTER TABLE drug_master DROP CONSTRAINT IF EXISTS drug_master_parent_drug_id_fkey;

-- إضافة قيد صحيح (يreferenced parent_drug_groups(id))
ALTER TABLE drug_master ADD CONSTRAINT drug_master_parent_drug_id_fkey 
    FOREIGN KEY (parent_drug_id) REFERENCES parent_drug_groups(id) ON DELETE SET NULL;

-- تصفير أي قيم خاطئة
UPDATE drug_master SET parent_drug_id = NULL WHERE parent_drug_id IS NOT NULL;

-- إعادة الربط الصحيح
UPDATE drug_master dm
SET parent_drug_id = sub.pg_id
FROM (
  SELECT dm2.id as drug_id, pg.id as pg_id
  FROM drug_master dm2
  JOIN parent_drug_groups pg ON dm2.scientific_name = pg.scientific_name
  WHERE dm2.scientific_name IS NOT NULL 
    AND dm2.scientific_name != ''
    AND dm2.parent_drug_id IS NULL
) sub
WHERE dm.id = sub.drug_id;
