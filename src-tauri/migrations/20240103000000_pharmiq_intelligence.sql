-- ========================================
-- Migration 3: PharmIQ Enterprise Intelligence
-- يضيف: Drug Master + Barcode Intelligence + Pricing + Supplier Intelligence +
--        Demand Forecasting + Hardware Abstraction + Multi-Branch + Task Queue
-- ========================================

-- ===== 1. Drug Master Intelligence Layer (منفصل عن المخزون) =====
CREATE TABLE IF NOT EXISTS drug_master (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trade_name VARCHAR(255) NOT NULL,
    scientific_name VARCHAR(255),
    arabic_name VARCHAR(255) NOT NULL,
    normalized_arabic VARCHAR(255),  -- للبحث السريع
    active_ingredients TEXT[],  --.array of ingredients
    dosage_strength VARCHAR(100),  -- "500mg", "5mg/5ml"
    dosage_form VARCHAR(50),  -- tablet, capsule, syrup, injection, cream, drops, ointment, inhaler, suppository
    manufacturer VARCHAR(200),
    country_of_origin VARCHAR(100),
    category VARCHAR(100),  -- antibiotics, analgesics, antihistamines, diabetes, hypertension, pediatric, vitamins, gastrointestinal, neurological, dermatology
    is_otc BOOLEAN DEFAULT FALSE,  -- Over The Counter
    is_prescription BOOLEAN DEFAULT FALSE,
    is_controlled BOOLEAN DEFAULT FALSE,  -- controlled medicines
    storage_conditions JSONB DEFAULT '{}',  -- {refrigeration: false, temp_range: "15-25", light_sensitive: false, humidity_sensitive: false}
    warning_flags TEXT[],
    searchable_tokens TSVECTOR,  -- for full-text search
    parent_drug_id UUID REFERENCES drug_master(id),  -- for Parent Drug Group
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_drug_master_arabic ON drug_master (arabic_name);
CREATE INDEX IF NOT EXISTS idx_drug_master_scientific ON drug_master (scientific_name);
CREATE INDEX IF NOT EXISTS idx_drug_master_normalized ON drug_master (normalized_arabic);
CREATE INDEX IF NOT EXISTS idx_drug_master_category ON drug_master (category);
CREATE INDEX IF NOT EXISTS idx_drug_master_search ON drug_master USING GIN (searchable_tokens);
CREATE INDEX IF NOT EXISTS idx_drug_master_parent ON drug_master (parent_drug_id);

-- ===== 2. Aliases Engine =====
CREATE TABLE IF NOT EXISTS drug_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drug_id UUID REFERENCES drug_master(id) ON DELETE CASCADE,
    alias_name VARCHAR(255) NOT NULL,
    alias_type VARCHAR(50),  -- commercial, arabic, supplier, spelling
    normalized_alias VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aliases_drug ON drug_aliases (drug_id);
CREATE INDEX IF NOT EXISTS idx_aliases_normalized ON drug_aliases (normalized_alias);

-- ===== 3. Substitute Mappings =====
CREATE TABLE IF NOT EXISTS drug_substitutes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drug_id UUID REFERENCES drug_master(id) ON DELETE CASCADE,
    substitute_id UUID REFERENCES drug_master(id) ON DELETE CASCADE,
    compatibility_score INTEGER DEFAULT 100,  -- 0-100
    reason TEXT,  -- "same active ingredient", "same dosage form"
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(drug_id, substitute_id)
);

-- ===== 4. Drug Interactions =====
CREATE TABLE IF NOT EXISTS drug_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drug_a_id UUID REFERENCES drug_master(id) ON DELETE CASCADE,
    drug_b_id UUID REFERENCES drug_master(id) ON DELETE CASCADE,
    severity VARCHAR(20) NOT NULL,  -- severe, moderate, mild
    interaction_type VARCHAR(50),  -- interaction, duplicate_ingredient, allergy, pregnancy_warning, pediatric_warning
    description TEXT,
    clinical_effect TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(drug_a_id, drug_b_id, interaction_type)
);

-- ===== 5. Drug Recall System =====
CREATE TABLE IF NOT EXISTS drug_recalls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drug_id UUID REFERENCES drug_master(id) ON DELETE CASCADE,
    batch_number VARCHAR(100),
    recall_reason TEXT NOT NULL,
    recall_date DATE NOT NULL,
    recalled_by VARCHAR(200),  -- manufacturer or authority
    affected_invoices INTEGER DEFAULT 0,
    affected_quantity INTEGER DEFAULT 0,
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recalls_drug ON drug_recalls (drug_id);
CREATE INDEX IF NOT EXISTS idx_recalls_unresolved ON drug_recalls (is_resolved) WHERE is_resolved = FALSE;

-- ===== 6. Pack Size & Unit Conversion =====
CREATE TABLE IF NOT EXISTS drug_pack_sizes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drug_id UUID REFERENCES drug_master(id) ON DELETE CASCADE,
    pack_type VARCHAR(20) NOT NULL,  -- unit, strip, box, carton
    units_per_pack INTEGER NOT NULL,  -- how many units in this pack
    barcode VARCHAR(100),
    price DECIMAL(10,2),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pack_drug ON drug_pack_sizes (drug_id);

-- ===== 7. Enterprise Barcode System =====
CREATE TABLE IF NOT EXISTS medicine_barcodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    drug_id UUID REFERENCES drug_master(id) ON DELETE CASCADE,
    barcode VARCHAR(100) NOT NULL,
    barcode_type VARCHAR(20) DEFAULT 'EAN13',  -- EAN13, UPC, CODE128, GS1, QR, DATAMATRIX
    barcode_scope VARCHAR(20) DEFAULT 'manufacturer',  -- manufacturer, internal, pack, carton
    batch_number VARCHAR(100),
    expiry_date DATE,
    supplier_id UUID REFERENCES suppliers(id),
    is_active BOOLEAN DEFAULT TRUE,
    learned_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(barcode, barcode_type)
);
CREATE INDEX IF NOT EXISTS idx_barcodes_barcode ON medicine_barcodes (barcode);
CREATE INDEX IF NOT EXISTS idx_barcodes_medicine ON medicine_barcodes (medicine_id);
CREATE INDEX IF NOT EXISTS idx_barcodes_type ON medicine_barcodes (barcode_type);

-- ===== 8. Barcode Analytics =====
CREATE TABLE IF NOT EXISTS barcode_scan_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barcode_scanned VARCHAR(100) NOT NULL,
    scan_mode VARCHAR(20),  -- pos, inventory, receiving, expiry_audit, batch_verification
    scan_result VARCHAR(20),  -- success, unknown, error
    matched_medicine_id UUID,
    scan_duration_ms INTEGER,
    user_role VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scan_logs_created ON barcode_scan_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_scan_logs_barcode ON barcode_scan_logs (barcode_scanned);

-- ===== 9. Pricing Tiers =====
CREATE TABLE IF NOT EXISTS pricing_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,  -- retail, wholesale, vip, insurance, clinic
    display_name VARCHAR(100) NOT NULL,
    discount_percentage DECIMAL(5,2) DEFAULT 0,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Seed default tiers
INSERT INTO pricing_tiers (name, display_name, discount_percentage) VALUES
    ('retail', 'سعر المفرد', 0),
    ('wholesale', 'سعر الجملة', 10),
    ('vip', 'سعر VIP', 15),
    ('insurance', 'سعر التأمين', 20),
    ('clinic', 'سعر العيادات', 12)
ON CONFLICT DO NOTHING;

-- ===== 10. Medicine Pricing per Tier =====
CREATE TABLE IF NOT EXISTS medicine_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    tier_id UUID REFERENCES pricing_tiers(id) ON DELETE CASCADE,
    price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(medicine_id, tier_id)
);

-- ===== 11. Supplier Intelligence =====
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS reliability_score DECIMAL(3,2) DEFAULT 50.00;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS total_orders INTEGER DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS delayed_orders INTEGER DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS returned_orders INTEGER DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS average_delivery_days DECIMAL(3,1);
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS last_order_date TIMESTAMP;

CREATE TABLE IF NOT EXISTS supplier_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    order_date TIMESTAMP DEFAULT NOW(),
    expected_delivery TIMESTAMP,
    actual_delivery TIMESTAMP,
    total_amount DECIMAL(12,2),
    status VARCHAR(20) DEFAULT 'pending',  -- pending, delivered, delayed, cancelled
    items_count INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_supplier ON supplier_orders (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_orders_status ON supplier_orders (status);

-- ===== 12. Purchase Suggestions =====
CREATE TABLE IF NOT EXISTS purchase_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    suggested_quantity INTEGER NOT NULL,
    reason VARCHAR(50),  -- low_stock, seasonal, fast_moving, dead_stock_replacement
    priority VARCHAR(20) DEFAULT 'medium',  -- low, medium, high, critical
    confidence_score DECIMAL(3,2) DEFAULT 50.00,
    metadata JSONB DEFAULT '{}',
    is_dismissed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_suggestions_medicine ON purchase_suggestions (medicine_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_priority ON purchase_suggestions (priority);

-- ===== 13. Demand Forecasting =====
CREATE TABLE IF NOT EXISTS demand_forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    forecast_period VARCHAR(20),  -- daily, weekly, monthly, seasonal
    forecast_date DATE NOT NULL,
    predicted_quantity INTEGER NOT NULL,
    confidence_level DECIMAL(3,2),
    factors JSONB DEFAULT '{}',  -- {season: "flu", trend: "up", confidence: 0.85}
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_forecasts_medicine ON demand_forecasts (medicine_id);
CREATE INDEX IF NOT EXISTS idx_forecasts_date ON demand_forecasts (forecast_date);

-- ===== 14. Dead Stock Analysis =====
CREATE TABLE IF NOT EXISTS dead_stock_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    last_sold_date TIMESTAMP,
    days_without_sale INTEGER,
    frozen_capital DECIMAL(12,2),  -- cost * quantity
    recommendation VARCHAR(50),  -- clearance, return_to_supplier, keep
    analyzed_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_deadstock_medicine ON dead_stock_analysis (medicine_id);

-- ===== 15. Expiry Intelligence =====
CREATE TABLE IF NOT EXISTS expiry_risk_assessment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES medicine_batches(id) ON DELETE CASCADE,
    expiry_date DATE NOT NULL,
    days_until_expiry INTEGER,
    risk_level VARCHAR(20),  -- safe, warning, critical, expired
    estimated_loss DECIMAL(12,2),
    recommended_action VARCHAR(50),  -- sell_fast, discount, return, dispose
    assessed_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expiry_risk_medicine ON expiry_risk_assessment (medicine_id);
CREATE INDEX IF NOT EXISTS idx_expiry_risk_level ON expiry_risk_assessment (risk_level);

-- ===== 16. Hardware Abstraction =====
CREATE TABLE IF NOT EXISTS hardware_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_type VARCHAR(50) NOT NULL,  -- barcode_scanner, receipt_printer, barcode_printer, cash_drawer, display
    device_name VARCHAR(200) NOT NULL,
    connection_type VARCHAR(50),  -- usb, bluetooth, serial, network
    port VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    config JSONB DEFAULT '{}',
    last_connected TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ===== 17. Multi-Branch Architecture =====
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    address TEXT,
    phone VARCHAR(50),
    manager VARCHAR(100),
    is_active BOOLEAN DEFAULT TRUE,
    is_main_branch BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- إضافة branch_id للجداول الموجودة
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- ===== 18. Task Queue System =====
CREATE TABLE IF NOT EXISTS task_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_type VARCHAR(50) NOT NULL,  -- import, analytics, backup, report, sync
    task_name VARCHAR(200) NOT NULL,
    payload JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'queued',  -- queued, running, completed, failed, cancelled
    priority INTEGER DEFAULT 5,  -- 1-10 (1=highest)
    progress INTEGER DEFAULT 0,  -- 0-100
    result JSONB,
    error_message TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_queue_status ON task_queue (status, priority);
CREATE INDEX IF NOT EXISTS idx_task_queue_type ON task_queue (task_type);

-- ===== 19. Smart Notifications =====
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'info',  -- info, success, warning, error, critical
    priority INTEGER DEFAULT 5,  -- 1-10
    category VARCHAR(50),  -- stock, expiry, fraud, system, payment
    is_read BOOLEAN DEFAULT FALSE,
    is_dismissed BOOLEAN DEFAULT FALSE,
    action_data JSONB DEFAULT '{}',  -- {action: "view_medicine", id: "xxx"}
    target_user VARCHAR(50),  -- specific user or null for all
    created_at TIMESTAMP DEFAULT NOW(),
    read_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (is_read, priority) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_category ON notifications (category);

-- ===== 20. Payment Methods (طرق دفع متعددة) =====
CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    icon VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    requires_reference BOOLEAN DEFAULT FALSE,  -- شيك/تحويل يحتاج رقم مرجعي
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO payment_methods (name, display_name, icon, requires_reference, sort_order) VALUES
    ('cash', 'نقدي', 'banknote', FALSE, 1),
    ('card', 'بطاقة (مدى/Visa)', 'credit-card', FALSE, 2),
    ('cheque', 'شيك', 'file-text', TRUE, 3),
    ('transfer', 'تحويل بنكي', 'building', TRUE, 4),
    ('credit', 'آجل', 'clock', FALSE, 5),
    ('mixed', 'دفع مقسّم', 'split', FALSE, 6)
ON CONFLICT DO NOTHING;

-- ===== 21. Invoice Payments (لتتبع طرق الدفع في الفاتورة) =====
CREATE TABLE IF NOT EXISTS invoice_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    payment_method_id UUID REFERENCES payment_methods(id),
    amount DECIMAL(12,2) NOT NULL,
    reference_number VARCHAR(100),  -- رقم الشيك/التحويل
    cheque_date DATE,  -- تاريخ استحقاق الشيك
    bank_name VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments (invoice_id);

-- ===== 22. Customer Loyalty (CRM + نقاط الولاء) =====
ALTER TABLE patients ADD COLUMN IF NOT EXISTS loyalty_points INTEGER DEFAULT 0;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS total_purchases DECIMAL(12,2) DEFAULT 0;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS is_chronic BOOLEAN DEFAULT FALSE;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS chronic_medicines TEXT[];

CREATE TABLE IF NOT EXISTS customer_loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id) ON DELETE CASCADE,
    transaction_type VARCHAR(20),  -- earn, redeem, adjust
    points INTEGER NOT NULL,
    invoice_id UUID REFERENCES invoices(id),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loyalty_patient ON customer_loyalty_transactions (patient_id);

-- ===== 23. Prescriptions (الوصفات الطبية) =====
CREATE TABLE IF NOT EXISTS prescriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES patients(id),
    doctor_name VARCHAR(200),
    doctor_license VARCHAR(100),
    prescription_date DATE,
    diagnosis TEXT,
    notes TEXT,
    is_antibiotic BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'active',  -- active, completed, expired, archived
    invoice_id UUID REFERENCES invoices(id),
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions (patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_antibiotic ON prescriptions (is_antibiotic) WHERE is_antibiotic = TRUE;

CREATE TABLE IF NOT EXISTS prescription_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID REFERENCES prescriptions(id) ON DELETE CASCADE,
    medicine_id UUID REFERENCES medicines(id),
    drug_name VARCHAR(255) NOT NULL,
    dosage VARCHAR(100),
    frequency VARCHAR(100),  -- "مرتين يومياً"
    duration VARCHAR(100),  -- "7 أيام"
    quantity_prescribed INTEGER,
    quantity_dispensed INTEGER DEFAULT 0,
    is_dispensed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rx_items_prescription ON prescription_items (prescription_id);

-- ===== 24. Stock Count / Inventory Audit (الجرد المتقدم) =====
CREATE TABLE IF NOT EXISTS stock_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    count_type VARCHAR(20),  -- full, partial, cycle
    status VARCHAR(20) DEFAULT 'in_progress',  -- in_progress, completed, cancelled
    started_by VARCHAR(50),
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS stock_count_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_count_id UUID REFERENCES stock_counts(id) ON DELETE CASCADE,
    medicine_id UUID REFERENCES medicines(id),
    system_quantity INTEGER NOT NULL,
    counted_quantity INTEGER,
    difference INTEGER,  -- counted - system
    difference_value DECIMAL(12,2),
    is_reconciled BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_count_items ON stock_count_items (stock_count_id);

-- ===== 25. Settings extensions =====
INSERT INTO settings (key, value) VALUES
    ('default_pricing_tier', 'retail'),
    ('loyalty_points_per_dinar', '1'),
    ('loyalty_point_value', '100'),
    ('antibiotic_control_enabled', 'true'),
    ('drug_interaction_check_enabled', 'true'),
    ('demand_forecasting_enabled', 'true'),
    ('auto_purchase_suggestions', 'true'),
    ('sound_feedback_enabled', 'true'),
    ('default_currency', 'IQD'),
    ('usd_exchange_rate', '1310'),
    ('enable_multi_currency', 'false'),
    ('multi_branch_enabled', 'false'),
    ('current_branch_id', '')
ON CONFLICT (key) DO NOTHING;

-- ===== 26. Performance Indexes for existing tables =====
CREATE INDEX IF NOT EXISTS idx_invoices_branch ON invoices (branch_id);
CREATE INDEX IF NOT EXISTS idx_medicines_branch ON medicines (branch_id);
CREATE INDEX IF NOT EXISTS idx_shifts_branch ON shifts (branch_id);
CREATE INDEX IF NOT EXISTS idx_users_branch ON users (branch_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_branch ON invoices (created_at, branch_id);
