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

-- تحديث الفواتير الموجودة بأرقام يومية (بدون window functions)
DO $$
DECLARE
    inv RECORD;
    current_num INTEGER;
    current_date_str TEXT;
BEGIN
    current_num := 0;
    current_date_str := '';
    
    FOR inv IN SELECT id, created_at FROM invoices WHERE daily_receipt_number IS NULL AND total_amount > 0 ORDER BY created_at ASC LOOP
        IF current_date_str != inv.created_at::date::text THEN
            current_num := 1;
            current_date_str := inv.created_at::date::text;
        ELSE
            current_num := current_num + 1;
        END IF;
        
        UPDATE invoices SET daily_receipt_number = current_num WHERE id = inv.id;
    END LOOP;
END;
$$;
