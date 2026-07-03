-- ========================================
-- Migration 9: Daily Receipt Numbering
-- ========================================

-- إضافة رقم يومي للفواتير
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS daily_receipt_number INTEGER;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS printed_by VARCHAR(50);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS printed_at TIMESTAMP;

-- إنشاء sequence يومي
CREATE SEQUENCE IF NOT EXISTS daily_receipt_seq START 1;

-- دالة لتوليد رقم يومي
CREATE OR REPLACE FUNCTION get_daily_receipt_number() RETURNS INTEGER AS $$
DECLARE
    next_num INTEGER;
    today_count INTEGER;
BEGIN
    -- عدد الفواتير اليوم
    SELECT COUNT(*) INTO today_count 
    FROM invoices 
    WHERE created_at::date = CURRENT_DATE 
    AND total_amount > 0;
    
    next_num := today_count + 1;
    RETURN next_num;
END;
$$ LANGUAGE plpgsql;

-- تحديث الفواتير الموجودة بأرقام يومية
UPDATE invoices SET daily_receipt_number = ROW_NUMBER() OVER (PARTITION BY created_at::date ORDER BY created_at)
WHERE daily_receipt_number IS NULL AND total_amount > 0;
