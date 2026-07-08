-- Migration 0014: إنشاء الجداول المفقودة التي يحيل إليها الكود لكنها لم تُنشأ
-- Fixes: fraud_alerts, plugins, operation_journal, print_jobs, performance_metrics
-- Fixes: users.role_id column referenced by check_permission_db

-- ===== 1. fraud_alerts =====
CREATE TABLE IF NOT EXISTS fraud_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low','medium','high','critical')),
    user_role VARCHAR(100),
    description TEXT,
    related_id VARCHAR(100),
    metadata TEXT,
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_by VARCHAR(100),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_created ON fraud_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_unresolved ON fraud_alerts(is_resolved, created_at DESC) WHERE is_resolved = FALSE;
CREATE INDEX IF NOT EXISTS idx_fraud_alerts_user ON fraud_alerts(user_role);

-- ===== 2. plugins =====
CREATE TABLE IF NOT EXISTS plugins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(200) NOT NULL,
    version VARCHAR(20) NOT NULL,
    description TEXT,
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    config JSONB DEFAULT '{}'::jsonb,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- إدراج الإضافات الافتراضية
INSERT INTO plugins (name, display_name, version, description, is_enabled) VALUES
    ('cloud-sync', 'المزامنة السحابية', '0.1.0', 'مزامنة البيانات مع السحابة (تجريبي)', FALSE),
    ('whatsapp-integration', 'تكامل واتساب', '1.0.0', 'إرسال الفواتير عبر واتساب', FALSE),
    ('ai-insights', 'رؤى الذكاء الاصطناعي', '0.1.0', 'تحليلات ذكية للمبيعات والمخزون', FALSE)
ON CONFLICT (name) DO NOTHING;

-- ===== 3. operation_journal (Crash Recovery) =====
CREATE TABLE IF NOT EXISTS operation_journal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_type VARCHAR(50) NOT NULL,
    operation_id VARCHAR(100) NOT NULL UNIQUE,
    payload TEXT,
    user_role VARCHAR(100),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed')),
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_journal_status ON operation_journal(status, started_at);
CREATE INDEX IF NOT EXISTS idx_journal_op_id ON operation_journal(operation_id);

-- ===== 4. print_jobs =====
CREATE TABLE IF NOT EXISTS print_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type VARCHAR(50) NOT NULL,
    printer_name VARCHAR(200),
    content TEXT,
    related_invoice_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed','cancelled')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs(status, created_at DESC);

-- ===== 5. performance_metrics =====
CREATE TABLE IF NOT EXISTS performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(14,4) NOT NULL,
    unit VARCHAR(20),
    context TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_perf_metrics_name ON performance_metrics(metric_name, created_at DESC);

-- ===== 6. users.role_id =====
-- إضافة عمود role_id للربط مع جدول roles (يستخدم في check_permission_db)
-- نُبقي عمود role النصي للتوافق مع الكود الحالي، role_id يكون اختيارياً
ALTER TABLE users ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES roles(id) ON DELETE SET NULL;

-- ربط تلقائي للمستخدمين الحاليين بناءً على نص role
UPDATE users u
SET role_id = r.id
FROM roles r
WHERE u.role_id IS NULL
  AND (LOWER(u.role) = LOWER(r.name) OR LOWER(u.role) = LOWER(r.display_name) OR LOWER(u.role) = LOWER(REPLACE(r.name, ' ', '_')));

CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id) WHERE role_id IS NOT NULL;

-- ===== 7. جدول interaction_overrides مكمل (إن لم يكن موجوداً) =====
CREATE TABLE IF NOT EXISTS interaction_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interaction_id UUID,
    user_role VARCHAR(100) NOT NULL,
    reason TEXT NOT NULL,
    invoice_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interaction_overrides_invoice ON interaction_overrides(invoice_id);

-- ===== 8. فهرس مفقود على invoice_items.medicine_id =====
CREATE INDEX IF NOT EXISTS idx_invoice_items_medicine_id ON invoice_items(medicine_id);

-- ===== 9. فهرس مفقود على ledger_entries.transaction_id =====
CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction ON ledger_entries(transaction_id);
