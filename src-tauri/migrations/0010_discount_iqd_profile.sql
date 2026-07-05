-- ========================================
-- Migration 0010: Discount in IQD + Daily Limit + Profile fields
-- ========================================

-- ===== 1. الخصم: من نسبة إلى مبلغ بالدينار =====
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0;
-- (نترك discount_percentage للتوافق مع الكود القديم، نستخدم discount_amount)

-- ===== 2. حد الخصم اليومي لكل كاشير =====
CREATE TABLE IF NOT EXISTS daily_discount_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_role VARCHAR(50) NOT NULL,
    usage_date DATE DEFAULT CURRENT_DATE,
    total_used DECIMAL(10,2) DEFAULT 0,
    UNIQUE(user_role, usage_date)
);

-- ===== 3. إعدادات الخصم الجديدة =====
INSERT INTO settings (key, value, description) VALUES
    ('max_discount_amount', '1000', 'أقصى مبلغ خصم يومي بالدينار لكل كاشير'),
    ('pharmacy_license_number', '', 'رقم رخصة الصيدلية'),
    ('receipt_footer_message', 'شكراً لزيارتكم', 'رسالة أسفل الإيصال')
ON CONFLICT (key) DO NOTHING;

-- ===== 4. إزالة إعدادات الدولار =====
DELETE FROM settings WHERE key = 'usd_exchange_rate';
DELETE FROM feature_flags WHERE flag_name = 'multi_currency';
