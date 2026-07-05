-- ========================================
-- Migration 0001: Initial Clean Schema
-- ========================================
-- صيدلية بنين مازن - نظام إدارة الصيدلية
-- Schema نظيف بدون تكرار، يجمع كل الجداول المستخدمة فعلاً
-- ========================================

-- ========================================
-- 1. المصادقة والصلاحيات
-- ========================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    username VARCHAR(50),
    device_info TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP
);

-- ========================================
-- 2. المخزون والأدوية
-- ========================================
CREATE TABLE IF NOT EXISTS parent_drug_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    scientific_name VARCHAR(200),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS medicines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name_ar VARCHAR(200) NOT NULL,
    name_en VARCHAR(200),
    scientific_name VARCHAR(200),
    barcode VARCHAR(13) UNIQUE,
    price DECIMAL(10,2) DEFAULT 0,
    wholesale_price DECIMAL(10,2) DEFAULT 0,
    cost_price DECIMAL(10,2) DEFAULT 0,
    quantity INTEGER DEFAULT 0,
    batch_number VARCHAR(100),
    expiry_date DATE,
    parent_drug_id UUID REFERENCES parent_drug_groups(id) ON DELETE SET NULL,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_medicines_barcode ON medicines (barcode);
CREATE INDEX IF NOT EXISTS idx_medicines_name_ar ON medicines (name_ar);
CREATE INDEX IF NOT EXISTS idx_medicines_scientific ON medicines (scientific_name);

CREATE TABLE IF NOT EXISTS medicine_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    batch_number VARCHAR(100),
    expiry_date DATE,
    quantity INTEGER DEFAULT 0,
    purchase_currency VARCHAR(10) DEFAULT 'IQD',
    exchange_rate_at_purchase DECIMAL(10,4) DEFAULT 1.0000,
    original_cost DECIMAL(10,2),
    landed_cost DECIMAL(10,2),
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_batches_medicine ON medicine_batches (medicine_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON medicine_batches (expiry_date);

CREATE TABLE IF NOT EXISTS medicine_barcodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    barcode VARCHAR(100) NOT NULL,
    barcode_type VARCHAR(20) DEFAULT 'EAN13',
    barcode_scope VARCHAR(20) DEFAULT 'manufacturer',
    batch_number VARCHAR(100),
    expiry_date DATE,
    supplier_id UUID,
    is_active BOOLEAN DEFAULT TRUE,
    learned_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(barcode, barcode_type)
);
CREATE INDEX IF NOT EXISTS idx_barcodes_barcode ON medicine_barcodes (barcode);
CREATE INDEX IF NOT EXISTS idx_barcodes_medicine ON medicine_barcodes (medicine_id);

-- جدول الباركودات الممسوحة (للتحليلات)
CREATE TABLE IF NOT EXISTS barcode_scan_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barcode_scanned VARCHAR(100) NOT NULL,
    scan_mode VARCHAR(20),
    scan_result VARCHAR(20),
    matched_medicine_id UUID,
    scan_duration_ms INTEGER,
    user_role VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scan_logs_created ON barcode_scan_logs (created_at);

-- ========================================
-- 3. الفواتير والمبيعات
-- ========================================
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    total_amount DECIMAL(12,2) NOT NULL,
    profit_amount DECIMAL(12,2) DEFAULT 0,
    discount_percentage DECIMAL(5,2) DEFAULT 0,
    user_role VARCHAR(50),
    daily_receipt_number INTEGER,
    printed_by VARCHAR(50),
    printed_at TIMESTAMP,
    is_reversed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices (created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_daily ON invoices (daily_receipt_number, created_at);

CREATE TABLE IF NOT EXISTS invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    medicine_id UUID REFERENCES medicines(id) ON DELETE SET NULL,
    name_ar VARCHAR(200),
    quantity INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items (invoice_id);

CREATE TABLE IF NOT EXISTS invoice_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    payment_method_id UUID,
    amount DECIMAL(12,2) NOT NULL,
    reference_number VARCHAR(100),
    cheque_date DATE,
    bank_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suspended_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_role VARCHAR(50),
    items_json TEXT NOT NULL,
    total DECIMAL(12,2),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS draft_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_key VARCHAR(100) UNIQUE NOT NULL,
    session_data JSONB NOT NULL,
    user_role VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_draft_sessions_key ON draft_sessions (session_key);

CREATE TABLE IF NOT EXISTS refund_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reason VARCHAR(200) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- 4. المحاسبة
-- ========================================
CREATE TABLE IF NOT EXISTS customer_debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name VARCHAR(255) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    is_paid BOOLEAN NOT NULL DEFAULT FALSE,
    note TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    paid_date TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_debts_unpaid ON customer_debts (is_paid) WHERE is_paid = FALSE;

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    amount DECIMAL(12,2) NOT NULL,
    category VARCHAR(100),
    description TEXT,
    user_role VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(50),
    address TEXT,
    balance DECIMAL(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- 5. المرضى والوصفات
-- ========================================
CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    phone VARCHAR(50),
    age INTEGER,
    gender VARCHAR(10),
    address TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients (name);
CREATE INDEX IF NOT EXISTS idx_patients_phone ON patients (phone);

CREATE TABLE IF NOT EXISTS prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    doctor_name VARCHAR(200),
    doctor_license VARCHAR(100),
    prescription_date DATE,
    diagnosis TEXT,
    notes TEXT,
    is_antibiotic BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prescription_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID REFERENCES prescriptions(id) ON DELETE CASCADE,
    medicine_name VARCHAR(200),
    dosage VARCHAR(100),
    duration VARCHAR(100),
    instructions TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    transaction_type VARCHAR(20),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- 6. الورديات والصندوق
-- ========================================
CREATE TABLE IF NOT EXISTS shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_role VARCHAR(50),
    start_time TIMESTAMP DEFAULT NOW(),
    end_time TIMESTAMP,
    opening_balance DECIMAL(12,2) DEFAULT 0,
    closing_balance DECIMAL(12,2),
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS cash_drawer_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    amount DECIMAL(12,2),
    user_role VARCHAR(50),
    shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
    note TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cash_drawer_balancing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE,
    expected_balance DECIMAL(12,2),
    counted_balance DECIMAL(12,2),
    difference DECIMAL(12,2),
    user_role VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- 7. الجرد والعزل
-- ========================================
CREATE TABLE IF NOT EXISTS stock_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    count_type VARCHAR(50),
    status VARCHAR(20) DEFAULT 'in_progress',
    started_by VARCHAR(50),
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_count_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_count_id UUID REFERENCES stock_counts(id) ON DELETE CASCADE,
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    expected_quantity INTEGER,
    counted_quantity INTEGER,
    medicine_barcode VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quarantined_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    batch_number VARCHAR(100),
    quantity INTEGER NOT NULL,
    quarantine_reason VARCHAR(50) NOT NULL,
    quarantine_date TIMESTAMP DEFAULT NOW(),
    notes TEXT,
    quarantined_by VARCHAR(50),
    status VARCHAR(20) DEFAULT 'quarantined',
    resolved_at TIMESTAMP,
    resolved_by VARCHAR(50),
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- 8. التسعير والانتهاء
-- ========================================
CREATE TABLE IF NOT EXISTS price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    field_name VARCHAR(50) NOT NULL,
    old_value DECIMAL(10,2),
    new_value DECIMAL(10,2) NOT NULL,
    change_date TIMESTAMP DEFAULT NOW(),
    changed_by VARCHAR(50),
    reason VARCHAR(200)
);
CREATE INDEX IF NOT EXISTS idx_price_history_medicine ON price_history (medicine_id);

CREATE TABLE IF NOT EXISTS expiry_sale_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    days_until_expiry INTEGER NOT NULL,
    discount_percentage DECIMAL(5,2) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    priority INTEGER DEFAULT 5,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS expiry_losses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL,
    batch_number VARCHAR(100),
    expiry_date DATE,
    loss_value DECIMAL(12,2),
    user_role VARCHAR(50),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- 9. النظام والإعدادات
-- ========================================
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_role VARCHAR(50),
    action_type VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_type ON audit_logs (action_type);

CREATE TABLE IF NOT EXISTS backup_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path TEXT NOT NULL,
    file_size BIGINT,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,
    is_enabled BOOLEAN DEFAULT TRUE,
    category VARCHAR(50),
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS label_print_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    label_type VARCHAR(50),
    label_size VARCHAR(20) DEFAULT '50x30',
    barcode VARCHAR(100),
    quantity INTEGER DEFAULT 1,
    user_role VARCHAR(50),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- 10. دوال SQL المساعدة
-- ========================================
-- دالة حساب رقم التحقق لـ EAN-13 (GS1 standard)
CREATE OR REPLACE FUNCTION compute_ean13_check_digit(prefix_12 VARCHAR) RETURNS INTEGER AS $$
DECLARE
    total INTEGER := 0;
    i INTEGER;
    digit INTEGER;
    weight INTEGER;
BEGIN
    IF LENGTH(prefix_12) != 12 OR prefix_12 !~ '^[0-9]{12}$' THEN
        RAISE EXCEPTION 'EAN-13 prefix must be exactly 12 digits, got: %', prefix_12;
    END IF;
    FOR i IN 1..12 LOOP
        digit := CAST(SUBSTRING(prefix_12 FROM i FOR 1) AS INTEGER);
        weight := CASE WHEN i % 2 = 1 THEN 1 ELSE 3 END;
        total := total + digit * weight;
    END LOOP;
    RETURN (10 - (total % 10)) % 10;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION generate_ean13_barcode(prefix_12 VARCHAR) RETURNS VARCHAR AS $$
DECLARE
    check_digit INTEGER;
BEGIN
    check_digit := compute_ean13_check_digit(prefix_12);
    RETURN prefix_12 || check_digit::TEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION validate_ean13(barcode VARCHAR) RETURNS BOOLEAN AS $$
DECLARE
    expected_check INTEGER;
    actual_check VARCHAR;
    prefix_12 VARCHAR;
BEGIN
    IF LENGTH(barcode) != 13 OR barcode !~ '^[0-9]{13}$' THEN
        RETURN FALSE;
    END IF;
    prefix_12 := SUBSTRING(barcode FROM 1 FOR 12);
    actual_check := SUBSTRING(barcode FROM 13 FOR 1);
    expected_check := compute_ean13_check_digit(prefix_12);
    RETURN actual_check = expected_check::TEXT;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- دالة توليد رقم وصل يومي
CREATE OR REPLACE FUNCTION get_daily_receipt_number() RETURNS INTEGER AS $$
DECLARE
    next_num INTEGER;
    today_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO today_count
    FROM invoices
    WHERE created_at::date = CURRENT_DATE
    AND total_amount > 0;

    next_num := today_count + 1;
    RETURN next_num;
END;
$$ LANGUAGE plpgsql;
