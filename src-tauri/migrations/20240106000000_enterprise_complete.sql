-- ========================================
-- Migration 6: Enterprise Complete Features
-- يضيف: Financial Ledger + Quarantine + State Recovery + Historical Pricing + 
--        Exchange Rate per Batch + Expiry Sales + Feature Flags + System Health
-- ========================================

-- ===== 1. FINANCIAL LEDGER (Double-Entry) =====
CREATE TABLE IF NOT EXISTS ledger_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_code VARCHAR(50) UNIQUE NOT NULL,
    account_name VARCHAR(200) NOT NULL,
    account_type VARCHAR(50) NOT NULL,  -- asset, liability, equity, revenue, expense
    parent_account_id UUID REFERENCES ledger_accounts(id),
    is_active BOOLEAN DEFAULT TRUE,
    balance DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_date TIMESTAMP DEFAULT NOW(),
    transaction_id UUID,  -- يربط المداخل المتقابلة
    account_id UUID REFERENCES ledger_accounts(id),
    debit_amount DECIMAL(15,2) DEFAULT 0,  -- مدين
    credit_amount DECIMAL(15,2) DEFAULT 0,  -- دائن
    description TEXT,
    reference_type VARCHAR(50),  -- sale, refund, expense, purchase, payment
    reference_id UUID,
    user_role VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON ledger_entries (account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_date ON ledger_entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_ref ON ledger_entries (reference_type, reference_id);

-- حسابات افتراضية
INSERT INTO ledger_accounts (account_code, account_name, account_type) VALUES
    ('1000', 'الصندوق النقدي', 'asset'),
    ('1100', 'الذمم المدينة (الديون)', 'asset'),
    ('1200', 'المخزون', 'asset'),
    ('2000', 'الذمم الدائنة (الموردين)', 'liability'),
    ('3000', 'رأس المال', 'equity'),
    ('4000', 'المبيعات', 'revenue'),
    ('4100', 'مردودات المبيعات', 'revenue'),
    ('5000', 'تكلفة البضاعة المباعة', 'expense'),
    ('6000', 'المصاريف التشغيلية', 'expense'),
    ('7000', 'خصومات', 'expense')
ON CONFLICT (account_code) DO NOTHING;

-- ===== 2. QUARANTINE SYSTEM =====
CREATE TABLE IF NOT EXISTS quarantined_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    batch_number VARCHAR(100),
    quantity INTEGER NOT NULL,
    quarantine_reason VARCHAR(50) NOT NULL,  -- damaged, expired, recalled, suspicious
    quarantine_date TIMESTAMP DEFAULT NOW(),
    notes TEXT,
    quarantined_by VARCHAR(50),
    status VARCHAR(20) DEFAULT 'quarantined',  -- quarantined, disposed, returned, released
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(50),
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_quarantine_medicine ON quarantined_stock (medicine_id);
CREATE INDEX IF NOT EXISTS idx_quarantine_status ON quarantined_stock (status);

-- ===== 3. STATE RECOVERY (Draft Sessions) =====
CREATE TABLE IF NOT EXISTS draft_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_key VARCHAR(100) UNIQUE NOT NULL,  -- 'pos_cart', 'suspended_invoice', etc.
    session_data JSONB NOT NULL,
    user_role VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_draft_sessions_key ON draft_sessions (session_key);

-- ===== 4. HISTORICAL PRICING =====
CREATE TABLE IF NOT EXISTS price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    field_name VARCHAR(50) NOT NULL,  -- price, wholesale_price, cost_price
    old_value DECIMAL(10,2),
    new_value DECIMAL(10,2) NOT NULL,
    change_date TIMESTAMP DEFAULT NOW(),
    changed_by VARCHAR(50),
    reason VARCHAR(200),
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_price_history_medicine ON price_history (medicine_id);
CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history (change_date);

-- ===== 5. EXCHANGE RATE PER BATCH =====
ALTER TABLE medicine_batches ADD COLUMN IF NOT EXISTS purchase_currency VARCHAR(10) DEFAULT 'IQD';
ALTER TABLE medicine_batches ADD COLUMN IF NOT EXISTS exchange_rate_at_purchase DECIMAL(10,4) DEFAULT 1.0000;
ALTER TABLE medicine_batches ADD COLUMN IF NOT EXISTS original_cost DECIMAL(10,2);
ALTER TABLE medicine_batches ADD COLUMN IF NOT EXISTS landed_cost DECIMAL(10,2);

-- ===== 6. EXPIRY SALES ENGINE =====
CREATE TABLE IF NOT EXISTS expiry_sale_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    days_until_expiry INTEGER NOT NULL,
    discount_percentage DECIMAL(5,2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 5,
    created_at TIMESTAMP DEFAULT NOW()
);

-- قواعد افتراضية للخصم التلقائي
INSERT INTO expiry_sale_rules (days_until_expiry, discount_percentage, priority) VALUES
    (180, 5.00, 1),
    (120, 10.00, 2),
    (90, 15.00, 3),
    (60, 20.00, 4),
    (30, 30.00, 5),
    (15, 40.00, 6),
    (7, 50.00, 7)
ON CONFLICT DO NOTHING;

-- ===== 7. FEATURE FLAGS =====
CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    is_enabled BOOLEAN DEFAULT TRUE,
    category VARCHAR(50),  -- pos, inventory, accounting, system
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO feature_flags (flag_name, display_name, category, is_enabled) VALUES
    ('drug_interaction_check', 'فحص التفاعلات الدوائية', 'pos', TRUE),
    ('controlled_medicine_check', 'فحص الأدوية المضبوطة', 'pos', TRUE),
    ('fraud_detection', 'كشف الاحتيال', 'system', TRUE),
    ('auto_backup', 'النسخ الاحتياطي التلقائي', 'system', TRUE),
    ('expiry_auto_discount', 'خصم تلقائي للأدوية قاربت الانتهاء', 'inventory', TRUE),
    ('demand_forecasting', 'التنبؤ بالطلب', 'inventory', TRUE),
    ('multi_currency', 'عملات متعددة', 'system', FALSE),
    ('multi_branch', 'متعدد الفروع', 'system', FALSE),
    ('loyalty_program', 'برنامج الولاء', 'pos', TRUE),
    ('prescription_tracking', 'تتبع الوصفات الطبية', 'pos', TRUE)
ON CONFLICT (flag_name) DO NOTHING;

-- ===== 8. SYSTEM HEALTH MONITORING =====
CREATE TABLE IF NOT EXISTS system_health_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(100) NOT NULL,
    metric_value DECIMAL(12,3) NOT NULL,
    unit VARCHAR(20),
    status VARCHAR(20),  -- healthy, warning, critical
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_health_logs_metric ON system_health_logs (metric_name, created_at);

-- ===== 9. Settings additions =====
INSERT INTO settings (key, value) VALUES
    ('ledger_enabled', 'true'),
    ('quarantine_enabled', 'true'),
    ('state_recovery_enabled', 'true'),
    ('historical_pricing_enabled', 'true'),
    ('expiry_sale_engine_enabled', 'true'),
    ('feature_flags_enabled', 'true'),
    ('system_health_monitoring', 'true')
ON CONFLICT (key) DO NOTHING;
