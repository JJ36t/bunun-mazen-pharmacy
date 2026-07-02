-- ========================================
-- Migration 2: Enterprise Enhancements
-- يضيف: RBAC متقدم + Plugin System + Crash Recovery + Session Tracking + Fraud Detection
-- ========================================

-- ===== 1. RBAC المتقدم - 8 أدوار + صلاحيات دقيقة =====
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

-- إدراج الأدوار الأساسية (8 أدوار)
INSERT INTO roles (name, display_name, description, is_system) VALUES
    ('super_admin', 'مدير عام', 'صلاحيات كاملة على النظام', TRUE),
    ('pharmacy_owner', 'مالك الصيدلية', 'إدارة كاملة + التقارير المالية', TRUE),
    ('branch_manager', 'مدير فرع', 'إدارة فرع محدد', TRUE),
    ('pharmacist', 'صيدلي', 'صرف الأدوية + استشارة', TRUE),
    ('cashier', 'كاشير', 'نقاط البيع فقط', TRUE),
    ('inventory_manager', 'مدير مخزون', 'إدارة المخزون والمشتريات', TRUE),
    ('accountant', 'محاسب', 'المحاسبة والمالية', TRUE),
    ('technical_support', 'دعم فني', 'صلاحيات محدودة للدعم', TRUE)
ON CONFLICT (name) DO NOTHING;

-- إدراج الصلاحيات
INSERT INTO permissions (name, display_name, category) VALUES
    -- POS
    ('pos.use', 'استخدام نقاط البيع', 'pos'),
    ('pos.discount', 'تطبيق الخصومات', 'pos'),
    ('pos.refund', 'مرتجع المبيعات', 'pos'),
    ('pos.suspend', 'تعليق الفواتير', 'pos'),
    -- Inventory
    ('inventory.view', 'عرض المخزون', 'inventory'),
    ('inventory.add', 'إضافة أدوية', 'inventory'),
    ('inventory.edit', 'تعديل الأدوية', 'inventory'),
    ('inventory.delete', 'حذف الأدوية', 'inventory'),
    ('inventory.adjust', 'تعديل الكميات', 'inventory'),
    ('inventory.bulk_price', 'تحديث الأسعار بالجملة', 'inventory'),
    -- Accounting
    ('accounting.view', 'عرض المحاسبة', 'accounting'),
    ('accounting.expenses', 'إدارة المصاريف', 'accounting'),
    ('accounting.closing', 'الإغلاق اليومي', 'accounting'),
    ('accounting.debts', 'إدارة الديون', 'accounting'),
    ('accounting.suppliers', 'إدارة الموردين', 'accounting'),
    -- Reports
    ('reports.view', 'عرض التقارير', 'reports'),
    ('reports.export', 'تصدير التقارير', 'reports'),
    -- System
    ('system.users', 'إدارة المستخدمين', 'system'),
    ('system.settings', 'إعدادات النظام', 'system'),
    ('system.backup', 'النسخ الاحتياطي', 'system'),
    ('system.audit', 'سجل التدقيق', 'system'),
    ('system.patients', 'إدارة المرضى', 'system')
ON CONFLICT (name) DO NOTHING;

-- ربط الصلاحيات بالأدوار (super_admin يحصل على كل شيء)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'super_admin'
ON CONFLICT DO NOTHING;

-- pharmacy_owner: كل شيء ما عدا إدارة المستخدمين
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'pharmacy_owner' AND p.name != 'system.users'
ON CONFLICT DO NOTHING;

-- cashier: POS فقط
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'cashier' AND p.name LIKE 'pos.%'
ON CONFLICT DO NOTHING;

-- inventory_manager: المخزون + التقارير
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'inventory_manager' AND (p.name LIKE 'inventory.%' OR p.name LIKE 'reports.%')
ON CONFLICT DO NOTHING;

-- accountant: المحاسبة + التقارير
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'accountant' AND (p.name LIKE 'accounting.%' OR p.name LIKE 'reports.%')
ON CONFLICT DO NOTHING;

-- pharmacist: POS + inventory.view
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'pharmacist' AND p.name IN ('pos.use', 'pos.discount', 'inventory.view', 'reports.view')
ON CONFLICT DO NOTHING;

-- branch_manager: كل شيء ما عدا system.users و system.settings
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'branch_manager' AND p.name NOT IN ('system.users', 'system.settings')
ON CONFLICT DO NOTHING;

-- technical_support: عرض فقط
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'technical_support' AND p.name IN ('inventory.view', 'reports.view', 'system.audit')
ON CONFLICT DO NOTHING;

-- إضافة عمود role_id في users لربطه بجدول roles
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id);
UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'super_admin' LIMIT 1) WHERE role = 'Super Admin';
UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'cashier' LIMIT 1) WHERE role = 'Cashier';

-- ===== 2. Plugin System =====
CREATE TABLE IF NOT EXISTS plugins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    version VARCHAR(20) NOT NULL,
    description TEXT,
    is_enabled BOOLEAN DEFAULT FALSE,
    config JSONB DEFAULT '{}',
    installed_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plugin_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_id UUID REFERENCES plugins(id) ON DELETE CASCADE,
    event_name VARCHAR(100) NOT NULL,
    payload JSONB,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP
);

-- ===== 3. Crash Recovery Journal =====
CREATE TABLE IF NOT EXISTS operation_journal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_type VARCHAR(50) NOT NULL,
    operation_id VARCHAR(100),
    payload JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    user_role VARCHAR(50),
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_journal_status ON operation_journal (status);
CREATE INDEX IF NOT EXISTS idx_journal_type ON operation_journal (operation_type);

-- ===== 4. Session Tracking =====
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(50) NOT NULL,
    login_at TIMESTAMP DEFAULT NOW(),
    logout_at TIMESTAMP,
    ip_address VARCHAR(45),
    device_info TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    last_activity TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_active ON user_sessions (is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions (user_id);

-- ===== 5. Fraud Detection =====
CREATE TABLE IF NOT EXISTS fraud_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    user_role VARCHAR(50),
    description TEXT NOT NULL,
    related_id VARCHAR(100),
    metadata JSONB,
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_by VARCHAR(50),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_resolved ON fraud_alerts (is_resolved);
CREATE INDEX IF NOT EXISTS idx_fraud_type ON fraud_alerts (alert_type);

-- ===== 6. Print Queue =====
CREATE TABLE IF NOT EXISTS print_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(50) NOT NULL DEFAULT 'receipt',
    printer_name VARCHAR(200),
    content TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'queued',
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    error_message TEXT,
    related_invoice_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    processed_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_print_status ON print_jobs (status);

-- ===== 7. Auto-Backup History =====
CREATE TABLE IF NOT EXISTS backup_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_type VARCHAR(20) NOT NULL DEFAULT 'manual',
    file_path TEXT NOT NULL,
    file_size BIGINT,
    status VARCHAR(20) DEFAULT 'success',
    error_message TEXT,
    user_role VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backup_created ON backup_history (created_at);

-- ===== 8. Performance Metrics =====
CREATE TABLE IF NOT EXISTS performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(12,3) NOT NULL,
    unit VARCHAR(20),
    context JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metrics_name ON performance_metrics (metric_name, created_at);

-- ===== 9. Settings extensions (إعدادات متقدمة) =====
INSERT INTO settings (key, value) VALUES
    ('theme', 'purple'),
    ('tax_enabled', 'false'),
    ('tax_rate', '0'),
    ('invoice_footer', 'شكراً لزيارتكم'),
    ('invoice_logo', '/logo.png'),
    ('auto_backup_enabled', 'false'),
    ('auto_backup_interval', '24'),
    ('max_print_retries', '3'),
    ('fraud_detection_enabled', 'true'),
    ('session_timeout', '60'),
    ('low_stock_threshold', '50'),
    ('expiry_alert_days', '90')
ON CONFLICT (key) DO NOTHING;

-- ===== 10. Enhancements للأداء =====
CREATE INDEX IF NOT EXISTS idx_invoices_user_role ON invoices (user_role);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at_user ON invoices (created_at, user_role);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs (user_role);
CREATE INDEX IF NOT EXISTS idx_medicines_scientific ON medicines (scientific_name);
CREATE INDEX IF NOT EXISTS idx_medicines_not_deleted ON medicines (is_deleted) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_debts_unpaid ON customer_debts (is_paid) WHERE is_paid = FALSE;
CREATE INDEX IF NOT EXISTS idx_expenses_created ON expenses (created_at);

-- ===== 11. إضافة عمود is_reversed للمرتجعات (موجود لكن نضيف عمود undo_reason) =====
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS undo_reason TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_percentage DECIMAL(5,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES shifts(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS patient_id UUID REFERENCES patients(id);

-- ===== 12. إضافة تتبع الكميات للمرتجعات =====
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS is_refund BOOLEAN DEFAULT FALSE;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES medicine_batches(id);
