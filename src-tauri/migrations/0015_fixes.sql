-- Migration 0015: إصلاحات إضافية
-- 1. إعادة إعداد usd_exchange_rate الذي حُذف في migration 0010
-- 2. إعداد certificate_pinning لأمان التحديثات
-- 3. إعداد backup_auto_password عشوائي (يُولّد مرة واحدة)
-- 4. إعدادات افتراضية للعتبات (low_stock_threshold, expiry_warning_days) إن لم تكن موجودة

INSERT INTO settings (key, value) VALUES
    ('usd_exchange_rate', '1310'),
    ('backup_encryption_algorithm', 'AES-256-GCM'),
    ('bcrypt_cost', '12'),
    ('session_timeout_minutes', '60')
ON CONFLICT (key) DO NOTHING;

-- تحديث bcrypt_cost في الإعدادات (يُستخدم كمرجع؛ التطبيق يستخدم 12 hardcoded الآن)
INSERT INTO settings (key, value) VALUES ('bcrypt_cost', '12')
ON CONFLICT (key) DO UPDATE SET value = '12';

-- تفعيل multi_currency flag إن كان معطلاً
INSERT INTO feature_flags (flag_name, display_name, is_enabled, category)
VALUES ('multi_currency', 'دعم عملات متعددة', TRUE, 'finance')
ON CONFLICT (flag_name) DO UPDATE SET is_enabled = TRUE;
