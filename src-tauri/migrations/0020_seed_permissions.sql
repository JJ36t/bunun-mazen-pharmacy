-- Migration 0020: Seed RBAC permissions and roles
INSERT INTO roles (name, display_name, is_system) VALUES
    ('Super Admin', 'مدير عام', TRUE),
    ('Pharmacy Owner', 'مالك الصيدلية', TRUE),
    ('Branch Manager', 'مدير فرع', TRUE),
    ('Pharmacist', 'صيدلي', TRUE),
    ('Cashier', 'كاشير', TRUE),
    ('Inventory Manager', 'مدير مخزون', TRUE),
    ('Accountant', 'محاسب', TRUE),
    ('Technical Support', 'دعم فني', TRUE)
ON CONFLICT (name) DO UPDATE SET display_name = EXCLUDED.display_name, is_system = TRUE;

INSERT INTO permissions (name, display_name, category) VALUES
    ('pos.use', 'استخدام نقاط البيع', 'pos'),
    ('pos.discount', 'تطبيق الخصومات', 'pos'),
    ('pos.refund', 'مرتجع المبيعات', 'pos'),
    ('pos.suspend', 'تعليق الفواتير', 'pos'),
    ('inventory.view', 'عرض المخزون', 'inventory'),
    ('inventory.add', 'إضافة أدوية', 'inventory'),
    ('inventory.edit', 'تعديل الأدوية', 'inventory'),
    ('inventory.delete', 'حذف الأدوية', 'inventory'),
    ('inventory.adjust', 'تعديل الكميات', 'inventory'),
    ('inventory.bulk_price', 'تحديث الأسعار بالجملة', 'inventory'),
    ('accounting.view', 'عرض المحاسبة', 'accounting'),
    ('accounting.expenses', 'إدارة المصاريف', 'accounting'),
    ('accounting.closing', 'الإغلاق اليومي', 'accounting'),
    ('accounting.debts', 'إدارة الديون', 'accounting'),
    ('accounting.suppliers', 'إدارة الموردين', 'accounting'),
    ('reports.view', 'عرض التقارير', 'reports'),
    ('reports.export', 'تصدير التقارير', 'reports'),
    ('system.users', 'إدارة المستخدمين', 'system'),
    ('system.settings', 'إعدادات النظام', 'system'),
    ('system.backup', 'النسخ الاحتياطي', 'system'),
    ('system.audit', 'سجل التدقيق', 'system'),
    ('system.patients', 'إدارة المرضى', 'system')
ON CONFLICT (name) DO UPDATE SET display_name = EXCLUDED.display_name, category = EXCLUDED.category;

-- Super Admin: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'Super Admin'
ON CONFLICT DO NOTHING;

-- Pharmacy Owner: all except system.users
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'Pharmacy Owner' AND p.name != 'system.users'
ON CONFLICT DO NOTHING;

-- Cashier: POS only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'Cashier' AND p.name IN ('pos.use', 'pos.discount', 'pos.refund', 'pos.suspend')
ON CONFLICT DO NOTHING;

-- Link existing users to roles
UPDATE users u SET role_id = r.id
FROM roles r
WHERE u.role_id IS NULL
  AND (LOWER(u.role) = LOWER(r.name) OR LOWER(u.role) = LOWER(r.display_name));
