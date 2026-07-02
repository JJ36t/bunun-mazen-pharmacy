-- ========================================
-- Migration 4: PharmIQ Complete Intelligence
-- يكمل: 11 ميزة غير منفذة + 12 ميزة جزئية
-- ========================================

-- ===== 1. Drug Aliases Management (إكمال جزئي) =====
-- الجدول موجود، نضيف seed للأسماء البديلة الشائعة
INSERT INTO drug_aliases (drug_id, alias_name, alias_type, normalized_alias)
SELECT dm.id, dm.trade_name, 'commercial', LOWER(dm.trade_name)
FROM drug_master dm WHERE dm.trade_name IS NOT NULL
ON CONFLICT DO NOTHING;

-- ===== 2. Refund Reasons (غير منفذة) =====
CREATE TABLE IF NOT EXISTS refund_reasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reason_code VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(200) NOT NULL,
    category VARCHAR(50),  -- defective, expired, customer_change, wrong_item, other
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO refund_reasons (reason_code, display_name, category) VALUES
    ('defective', 'منتج معيب', 'defective'),
    ('expired', 'منتهي الصلاحية', 'expired'),
    ('customer_change', 'تغيّر رأي الزبون', 'customer_change'),
    ('wrong_item', 'صنف خاطئ', 'wrong_item'),
    ('duplicate', 'فاتورة مكررة', 'duplicate'),
    ('price_dispute', 'خلاف على السعر', 'price_dispute'),
    ('quality_issue', 'مشكلة جودة', 'quality_issue'),
    ('other', 'أخرى', 'other')
ON CONFLICT (reason_code) DO NOTHING;

-- إضافة أعمدة لجدول invoices لتتبع المرتجع
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS refund_reason_code VARCHAR(50);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS refund_approved_by VARCHAR(50);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS refund_notes TEXT;

-- ===== 3. Supplier Pricing History (غير منفذة) =====
CREATE TABLE IF NOT EXISTS supplier_pricing_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    old_price DECIMAL(10,2),
    new_price DECIMAL(10,2) NOT NULL,
    change_percentage DECIMAL(5,2),
    recorded_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_supplier_pricing_supplier ON supplier_pricing_history (supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_pricing_medicine ON supplier_pricing_history (medicine_id);

-- ===== 4. Supplier Returns Tracking (غير منفذة) =====
CREATE TABLE IF NOT EXISTS supplier_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
    invoice_id UUID,
    total_amount DECIMAL(12,2) NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'pending',  -- pending, approved, completed, rejected
    requested_by VARCHAR(50),
    approved_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_supplier_returns_supplier ON supplier_returns (supplier_id);

-- ===== 5. Expiry Loss Analytics (غير منفذة) =====
CREATE TABLE IF NOT EXISTS expiry_losses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    batch_number VARCHAR(100),
    expiry_date DATE NOT NULL,
    quantity_lost INTEGER NOT NULL,
    cost_per_unit DECIMAL(10,2) NOT NULL,
    total_loss DECIMAL(12,2) NOT NULL,
    disposal_method VARCHAR(50),  -- destroyed, returned_to_supplier, donated
    disposal_date DATE,
    disposal_notes TEXT,
    recorded_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expiry_losses_medicine ON expiry_losses (medicine_id);
CREATE INDEX IF NOT EXISTS idx_expiry_losses_date ON expiry_losses (expiry_date);

-- ===== 6. Expiry Transfer Suggestions (غير منفذة) =====
CREATE TABLE IF NOT EXISTS expiry_transfer_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    current_branch_id UUID REFERENCES branches(id),
    target_branch_id UUID REFERENCES branches(id),
    suggested_quantity INTEGER NOT NULL,
    days_until_expiry INTEGER NOT NULL,
    urgency_level VARCHAR(20),  -- low, medium, high, critical
    reason TEXT,
    is_dismissed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transfer_suggestions_medicine ON expiry_transfer_suggestions (medicine_id);

-- ===== 7. Stop Purchase Suggestions (غير منفذة) =====
CREATE TABLE IF NOT EXISTS stop_purchase_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    reason VARCHAR(50),  -- slow_moving, expiring_soon, low_demand, recall
    days_without_sale INTEGER,
    current_stock INTEGER,
    estimated_loss DECIMAL(12,2),
    recommendation VARCHAR(200),
    is_dismissed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stop_purchase_medicine ON stop_purchase_suggestions (medicine_id);

-- ===== 8. Cash Drawer Events (غير منفذة) =====
CREATE TABLE IF NOT EXISTS cash_drawer_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,  -- open, close, cash_in, cash_out, sale, refund, expense, adjustment
    amount DECIMAL(12,2) NOT NULL,
    balance_after DECIMAL(12,2),
    description TEXT,
    user_role VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cash_events_shift ON cash_drawer_events (shift_id);

-- ===== 9. Cash Drawer Balancing (غير منفذة) =====
CREATE TABLE IF NOT EXISTS cash_drawer_balancing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_id UUID REFERENCES shifts(id) ON DELETE CASCADE,
    system_amount DECIMAL(12,2) NOT NULL,  -- ما يجب أن يكون
    counted_amount DECIMAL(12,2) NOT NULL,  -- المعدود فعلاً
    difference DECIMAL(12,2) NOT NULL DEFAULT 0,
    difference_type VARCHAR(20),  -- balanced, shortage, excess
    notes TEXT,
    balanced_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ===== 10. Label Print Jobs (غير منفذة) =====
CREATE TABLE IF NOT EXISTS label_print_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label_type VARCHAR(50) NOT NULL,  -- barcode, shelf, medicine, batch
    medicine_id UUID REFERENCES medicines(id),
    barcode VARCHAR(100),
    label_count INTEGER DEFAULT 1,
    label_size VARCHAR(20) DEFAULT '30x20',  -- 30x20, 50x30, 70x50
    print_data JSONB,  -- بيانات الطباعة
    status VARCHAR(20) DEFAULT 'pending',  -- pending, printing, completed, failed
    printer_name VARCHAR(200),
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_label_print_status ON label_print_jobs (status);

-- ===== 11. Scan Modes Configuration (إكمال جزئي) =====
CREATE TABLE IF NOT EXISTS scan_mode_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mode_name VARCHAR(50) UNIQUE NOT NULL,  -- pos, inventory, receiving, expiry_audit, batch_verification
    display_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    sound_on_success BOOLEAN DEFAULT TRUE,
    sound_on_failure BOOLEAN DEFAULT TRUE,
    auto_add_to_invoice BOOLEAN DEFAULT FALSE,
    config JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO scan_mode_config (mode_name, display_name, auto_add_to_invoice) VALUES
    ('pos', 'نقاط البيع', TRUE),
    ('inventory', 'المخزون', FALSE),
    ('receiving', 'استلام البضائع', FALSE),
    ('expiry_audit', 'تدقيق الصلاحية', FALSE),
    ('batch_verification', 'تدقيق الدفعات', FALSE)
ON CONFLICT (mode_name) DO NOTHING;

-- ===== 12. Demand Forecasting Algorithm Storage (إكمال جزئي) =====
CREATE TABLE IF NOT EXISTS demand_forecast_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    model_type VARCHAR(50),  -- moving_average, exponential, seasonal
    historical_data JSONB,  -- آخر 90 يوم من المبيعات
    predicted_data JSONB,  -- التوقع لـ 30 يوم
    accuracy_score DECIMAL(5,2),  -- دقة النموذج
    seasonality_detected BOOLEAN DEFAULT FALSE,
    trend_direction VARCHAR(20),  -- up, down, stable
    calculated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_forecast_models_medicine ON demand_forecast_models (medicine_id);

-- ===== 13. Parent Drug Group Management (إكمال جزئي) =====
CREATE TABLE IF NOT EXISTS parent_drug_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_name VARCHAR(255) NOT NULL,
    scientific_name VARCHAR(255),
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_parent_groups_name ON parent_drug_groups (group_name);

-- ===== 14. Dosage Compatibility Matrix (إكمال جزئي) =====
CREATE TABLE IF NOT EXISTS dosage_compatibility (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_dosage_form VARCHAR(50) NOT NULL,
    to_dosage_form VARCHAR(50) NOT NULL,
    compatibility_level VARCHAR(20),  -- exact, acceptable, not_recommended, incompatible
    notes TEXT,
    UNIQUE(from_dosage_form, to_dosage_form)
);

-- قواعد التوافق الافتراضية
INSERT INTO dosage_compatibility (from_dosage_form, to_dosage_form, compatibility_level) VALUES
    ('tablet', 'capsule', 'acceptable'),
    ('tablet', 'syrup', 'acceptable'),
    ('capsule', 'tablet', 'acceptable'),
    ('syrup', 'syrup', 'exact'),
    ('injection', 'injection', 'exact'),
    ('cream', 'ointment', 'acceptable'),
    ('drops', 'drops', 'exact'),
    ('inhaler', 'inhaler', 'exact')
ON CONFLICT DO NOTHING;

-- ===== 15. GS1 Barcode Parsing Log (إكمال جزئي) =====
CREATE TABLE IF NOT EXISTS gs1_parsed_barcodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_barcode TEXT NOT NULL,
    gtin VARCHAR(50),
    batch_number VARCHAR(100),
    expiry_date DATE,
    serial_number VARCHAR(100),
    parsed_successfully BOOLEAN DEFAULT FALSE,
    parse_errors TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gs1_parsed_gtin ON gs1_parsed_barcodes (gtin);

-- ===== 16. Multi-Pack Barcode Mappings (إكمال جزئي) =====
CREATE TABLE IF NOT EXISTS multi_pack_barcodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    medicine_id UUID REFERENCES medicines(id) ON DELETE CASCADE,
    pack_type VARCHAR(20) NOT NULL,  -- unit, strip, box, carton
    barcode VARCHAR(100) NOT NULL,
    units_in_pack INTEGER NOT NULL DEFAULT 1,
    price_per_pack DECIMAL(10,2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(barcode)
);
CREATE INDEX IF NOT EXISTS idx_multi_pack_medicine ON multi_pack_barcodes (medicine_id);
CREATE INDEX IF NOT EXISTS idx_multi_pack_barcode ON multi_pack_barcodes (barcode);

-- ===== 17. Smart Profit Calculations (إكمال جزئي) =====
CREATE TABLE IF NOT EXISTS profit_calculations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    medicine_id UUID REFERENCES medicines(id),
    quantity INTEGER NOT NULL,
    selling_price DECIMAL(10,2) NOT NULL,
    cost_price DECIMAL(10,2) NOT NULL,
    real_cost DECIMAL(10,2),  -- يشمل تكاليف إضافية
    currency_rate DECIMAL(10,4) DEFAULT 1,
    gross_profit DECIMAL(12,2),
    net_profit DECIMAL(12,2),
    profit_margin DECIMAL(5,2),
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profit_invoice ON profit_calculations (invoice_id);

-- ===== 18. Settings additions =====
INSERT INTO settings (key, value) VALUES
    ('refund_requires_approval', 'true'),
    ('refund_approval_threshold', '50000'),
    ('cash_drawer_balance_required', 'true'),
    ('label_default_size', '30x20'),
    ('label_default_printer', ''),
    ('scan_sound_enabled', 'true'),
    ('expiry_loss_tracking', 'true'),
    ('supplier_pricing_history_days', '365'),
    ('stop_purchase_threshold_days', '180'),
    ('demand_forecast_horizon_days', '30'),
    ('demand_forecast_min_data_points', '30')
ON CONFLICT (key) DO NOTHING;

-- ===== 19. Performance Indexes =====
CREATE INDEX IF NOT EXISTS idx_invoices_refund_reason ON invoices (refund_reason_code) WHERE refund_reason_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expiry_losses_date_range ON expiry_losses (disposal_date, expiry_date);
CREATE INDEX IF NOT EXISTS idx_cash_events_type ON cash_drawer_events (event_type, created_at);
