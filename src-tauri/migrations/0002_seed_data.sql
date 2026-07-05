-- ========================================
-- Migration 0002: Seed Data (Fresh Start)
-- ========================================
-- بيانات أولية: مستخدمين، إعدادات، طرق دفع، قواعد انتهاء، ميزات
-- ========================================

-- ========================================
-- 1. الأدوار والصلاحيات
-- ========================================
INSERT INTO roles (name, description) VALUES
    ('Super Admin', 'صلاحيات كاملة'),
    ('Manager', 'مدير الصيدلية'),
    ('Pharmacist', 'صيدلاني'),
    ('Cashier', 'كاشير')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (name, description) VALUES
    ('pos.use', 'استخدام نقطة البيع'),
    ('pos.refund', 'استرجاع المبيعات'),
    ('inventory.view', 'عرض المخزون'),
    ('inventory.add', 'إضافة أدوية'),
    ('inventory.adjust', 'تعديل الجرد'),
    ('accounting.view', 'عرض المحاسبة'),
    ('accounting.debts', 'إدارة الديون'),
    ('accounting.suppliers', 'إدارة الموردين'),
    ('reports.view', 'عرض التقارير'),
    ('system.settings', 'الإعدادات'),
    ('system.audit', 'سجل التدقيق'),
    ('system.backup', 'النسخ الاحتياطي'),
    ('system.users', 'إدارة المستخدمين'),
    ('system.patients', 'إدارة المرضى')
ON CONFLICT (name) DO NOTHING;

-- Super Admin له كل الصلاحيات
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

-- Manager له كل الصلاحيات ما عدا users
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Manager' AND p.name != 'system.users'
ON CONFLICT DO NOTHING;

-- Pharmacist: pos + inventory + patients + reports
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Pharmacist' AND p.name IN
    ('pos.use', 'pos.refund', 'inventory.view', 'inventory.add',
     'inventory.adjust', 'reports.view', 'system.patients')
ON CONFLICT DO NOTHING;

-- Cashier: pos فقط
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Cashier' AND p.name IN ('pos.use', 'pos.refund')
ON CONFLICT DO NOTHING;

-- ========================================
-- 2. المستخدمون الافتراضيون
-- ========================================
-- كلمات المرور: admin123, cashier123 (مشفرة بـ bcrypt)
INSERT INTO users (username, password, role, is_active) VALUES
    ('admin', '$2b$08$QzjWMoWhJvXEAuQiVlzllOdysTgwfMdGoXMzoESKPtOWoIkU.jCoe', 'Super Admin', TRUE),
    ('cashier', '$2b$08$15JmBd5K2RAW0XU1Jd2JRuKRG.LAg7Ic70YYDrxriENcOh4ji241.', 'Cashier', TRUE)
ON CONFLICT (username) DO NOTHING;

-- ========================================
-- 3. طرق الدفع
-- ========================================
INSERT INTO payment_methods (name, display_name, is_active) VALUES
    ('cash', 'نقدي', TRUE),
    ('card', 'بطاقة (مدى/Visa)', TRUE),
    ('cheque', 'شيك', TRUE),
    ('transfer', 'تحويل بنكي', TRUE),
    ('credit', 'آجل', TRUE),
    ('mixed', 'دفع مقسّم', TRUE)
ON CONFLICT (name) DO NOTHING;

-- ========================================
-- 4. الإعدادات الافتراضية
-- ========================================
INSERT INTO settings (key, value, description) VALUES
    ('pharmacy_name', 'صيدلية بنين مازن', 'اسم الصيدلية'),
    ('pharmacy_address', 'بغداد - العراق', 'عنوان الصيدلية'),
    ('pharmacy_phone', '07700000000', 'هاتف الصيدلية'),
    ('pharmacy_owner', 'بنين مازن', 'اسم المالك'),
    ('currency', 'IQD', 'العملة الافتراضية'),
    ('usd_exchange_rate', '1310', 'سعر صرف الدولار'),
    ('max_discount', '10', 'أقصى خصم مسموح (%)'),
    ('receipt_show_barcode', 'true', 'إظهار الباركود في الإيصال'),
    ('receipt_show_logo', 'true', 'إظهار الشعار في الإيصال'),
    ('auto_print_receipt', 'true', 'طباعة الإيصال تلقائياً بعد البيع'),
    ('low_stock_threshold', '20', 'حد التنبيه لنقص المخزون'),
    ('expiry_warning_days', '90', 'تنبيه قبل الانتهاء (أيام)'),
    ('daily_reset_hour', '00:00', 'ساعة تصفير اليوم')
ON CONFLICT (key) DO NOTHING;

-- ========================================
-- 5. أسباب المرتجع
-- ========================================
INSERT INTO refund_reasons (reason, description, is_active) VALUES
    ('damaged', 'تالف', TRUE),
    ('expired', 'منتهي الصلاحية', TRUE),
    ('wrong_item', 'صنف خاطئ', TRUE),
    ('customer_return', 'استرجاع الزبون', TRUE),
    ('recall', 'مستدعى من الشركة', TRUE),
    ('other', 'أخرى', TRUE)
ON CONFLICT DO NOTHING;

-- ========================================
-- 6. قواعد خصم الانتهاء التلقائي
-- ========================================
INSERT INTO expiry_sale_rules (days_until_expiry, discount_percentage, priority) VALUES
    (180, 5.00, 1),
    (120, 10.00, 2),
    (90, 15.00, 3),
    (60, 20.00, 4),
    (30, 30.00, 5),
    (15, 40.00, 6),
    (7, 50.00, 7)
ON CONFLICT DO NOTHING;

-- ========================================
-- 7. الميزات القابلة للتفعيل
-- ========================================
INSERT INTO feature_flags (flag_name, display_name, description, is_enabled, category) VALUES
    ('expiry_auto_discount', 'خصم تلقائي للأدوية قاربت الانتهاء', NULL, TRUE, 'inventory'),
    ('prescription_tracking', 'تتبع الوصفات الطبية', NULL, TRUE, 'pos'),
    ('loyalty_program', 'برنامج الولاء', NULL, TRUE, 'pos'),
    ('auto_backup', 'النسخ الاحتياطي التلقائي', NULL, TRUE, 'system'),
    ('barcode_smart_lookup', 'البحث الذكي عن الباركود', 'البحث في 9,375 دواء عالمي', TRUE, 'pos'),
    ('ean13_validation', 'التحقق من صحة باركود EAN-13', NULL, TRUE, 'inventory'),
    ('multi_currency', 'عملات متعددة (USD/IQD)', NULL, FALSE, 'system'),
    ('daily_receipt_numbering', 'ترقيم يومي للوصولات', NULL, TRUE, 'pos')
ON CONFLICT (flag_name) DO NOTHING;
