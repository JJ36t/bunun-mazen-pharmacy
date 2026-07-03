-- ========================================
-- Migration 7: Critical Fixes + Stock + Batches + Auto-link Groups
-- ========================================

-- ===== 1. إضافة 50 كمية + دفعة لكل دواء في medicines =====
UPDATE medicines SET quantity = 50 WHERE quantity = 0 AND is_deleted = FALSE;

-- إضافة دفعة لكل دواء ليس له دفعة
INSERT INTO medicine_batches (medicine_id, batch_number, expiry_date, quantity)
SELECT m.id, COALESCE(m.batch_number, 'BATCH-' || SUBSTRING(m.id::text, 1, 8)), 
       COALESCE(m.expiry_date, (CURRENT_DATE + INTERVAL '1 year')::date),
       50
FROM medicines m
WHERE m.is_deleted = FALSE
  AND NOT EXISTS (
    SELECT 1 FROM medicine_batches mb WHERE mb.medicine_id = m.id
  );

-- تحديث medicines التي لها expiry_date لتستخدم التاريخ الموجود
UPDATE medicines SET expiry_date = (CURRENT_DATE + INTERVAL '1 year')::date 
WHERE expiry_date IS NULL AND is_deleted = FALSE;

-- ===== 2. ربط تلقائي للأدوية بمجموعات حسب الاسم العلمي =====
-- إنشاء مجموعات أساسية حسب الاسم العلمي
INSERT INTO parent_drug_groups (group_name, scientific_name, description)
SELECT DISTINCT scientific_name, scientific_name, 'مجموعة تلقائية حسب الاسم العلمي'
FROM drug_master 
WHERE scientific_name IS NOT NULL AND scientific_name != ''
ON CONFLICT DO NOTHING;

-- ربط كل دواء بمجموعته حسب الاسم العلمي (بشكل آمن - فقط المجموعات الموجودة)
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

-- ===== 3. إضافة عمود deleted_at للأدوية (Soft Delete) =====
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(50);

-- ===== 4. إضافة تفاصيل الفاتورة =====
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS patient_name VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS doctor_name VARCHAR(255);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'cash';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receipt_number VARCHAR(100);

-- توليد رقم فاتورة تلقائي للأدوية الموجودة
UPDATE invoices SET receipt_number = 'INV-' || SUBSTRING(id::text, 1, 8) WHERE receipt_number IS NULL;

-- ===== 5. إضافة عمود quantity_adjusted لـ stock_count_items =====
ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS medicine_name VARCHAR(255);
ALTER TABLE stock_count_items ADD COLUMN IF NOT EXISTS medicine_barcode VARCHAR(100);

-- ===== 6. إصلاح الإعدادات - إزالة الضرائب =====
DELETE FROM settings WHERE key IN ('tax_enabled', 'tax_rate');

-- ===== 7. إضافة إعدادات الفاتورة =====
INSERT INTO settings (key, value) VALUES
    ('receipt_show_logo', 'true'),
    ('receipt_show_pharmacy_name', 'true'),
    ('receipt_show_phone', 'true'),
    ('receipt_show_address', 'true'),
    ('receipt_show_cashier', 'true'),
    ('receipt_show_date', 'true'),
    ('receipt_show_barcode', 'true'),
    ('receipt_show_qr', 'false'),
    ('receipt_width', '80'),
    ('receipt_font_size', '12'),
    ('receipt_footer_text', 'شكراً لزيارتكم'),
    ('receipt_header_text', ''),
    ('dashboard_show_weekly_chart', 'true'),
    ('dashboard_show_top_medicines', 'true'),
    ('dashboard_show_alerts', 'true')
ON CONFLICT (key) DO NOTHING;
