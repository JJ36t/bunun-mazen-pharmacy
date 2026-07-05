-- ========================================
-- Migration 0005: Fix Schema — add missing columns and tables
-- ========================================
-- إضافة الأعمدة والجداول الناقصة التي تحتاجها الأوامر الموجودة
-- ========================================

-- ===== 1. users: إضافة deleted_at و deleted_by (للحذف الناعم) =====
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(50);

-- ===== 2. patients: إضافة national_id =====
ALTER TABLE patients ADD COLUMN IF NOT EXISTS national_id VARCHAR(50);
CREATE INDEX IF NOT EXISTS idx_patients_national_id ON patients (national_id);

-- ===== 3. shifts: إضافة الأعمدة التي يستخدمها الكود =====
-- الكود يستخدم opening_amount, closing_amount, status
-- لكن الـ schema استخدم opening_balance, closing_balance, is_active
-- نضيف الأعمدة الجديدة للتوافق
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS opening_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS closing_amount DECIMAL(12,2);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'open';

-- مزامنة البيانات: لو opening_balance معبأ، انسخه ل opening_amount
UPDATE shifts SET opening_amount = opening_balance WHERE opening_amount IS NULL AND opening_balance IS NOT NULL;
UPDATE shifts SET closing_amount = closing_balance WHERE closing_amount IS NULL AND closing_balance IS NOT NULL;
UPDATE shifts SET status = CASE WHEN is_active = TRUE THEN 'open' ELSE 'closed' END WHERE status IS NULL;

-- ===== 4. ledger_accounts: جدول الحسابات المحاسبية (للدفتر مزدوج القيد) =====
CREATE TABLE IF NOT EXISTS ledger_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_code VARCHAR(50) UNIQUE NOT NULL,
    account_name VARCHAR(200) NOT NULL,
    account_type VARCHAR(50) NOT NULL,
    parent_account_id UUID REFERENCES ledger_accounts(id),
    is_active BOOLEAN DEFAULT TRUE,
    balance DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

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

-- ===== 5. ledger_entries: قيود الدفتر (مزدوج القيد) =====
CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_date TIMESTAMP DEFAULT NOW(),
    transaction_id UUID,
    account_id UUID REFERENCES ledger_accounts(id),
    debit_amount DECIMAL(15,2) DEFAULT 0,
    credit_amount DECIMAL(15,2) DEFAULT 0,
    description TEXT,
    reference_type VARCHAR(50),
    reference_id UUID,
    user_role VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account ON ledger_entries (account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_date ON ledger_entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_ref ON ledger_entries (reference_type, reference_id);

-- ===== 6. cash_drawer_events: إضافة balance_after و description =====
ALTER TABLE cash_drawer_events ADD COLUMN IF NOT EXISTS balance_after DECIMAL(12,2);
ALTER TABLE cash_drawer_events ADD COLUMN IF NOT EXISTS description TEXT;
-- نسخ البيانات من note إلى description لو موجود
UPDATE cash_drawer_events SET description = note WHERE description IS NULL AND note IS NOT NULL;

-- ===== 7. cash_drawer_balancing: إضافة الأعمدة الناقصة =====
ALTER TABLE cash_drawer_balancing ADD COLUMN IF NOT EXISTS system_amount DECIMAL(12,2);
ALTER TABLE cash_drawer_balancing ADD COLUMN IF NOT EXISTS counted_amount DECIMAL(12,2);
ALTER TABLE cash_drawer_balancing ADD COLUMN IF NOT EXISTS difference_type VARCHAR(20);
ALTER TABLE cash_drawer_balancing ADD COLUMN IF NOT EXISTS balanced_by VARCHAR(50);
-- نسخ البيانات من الأعمدة القديمة
UPDATE cash_drawer_balancing SET system_amount = expected_balance WHERE system_amount IS NULL AND expected_balance IS NOT NULL;
UPDATE cash_drawer_balancing SET counted_amount = counted_balance WHERE counted_amount IS NULL AND counted_balance IS NOT NULL;
UPDATE cash_drawer_balancing SET balanced_by = user_role WHERE balanced_by IS NULL AND user_role IS NOT NULL;

-- ===== 8. label_print_jobs: إضافة الأعمدة الناقصة =====
ALTER TABLE label_print_jobs ADD COLUMN IF NOT EXISTS label_count INTEGER;
ALTER TABLE label_print_jobs ADD COLUMN IF NOT EXISTS print_data TEXT;
ALTER TABLE label_print_jobs ADD COLUMN IF NOT EXISTS printer_name VARCHAR(100);
-- نسخ البيانات من quantity إلى label_count
UPDATE label_print_jobs SET label_count = quantity WHERE label_count IS NULL AND quantity IS NOT NULL;

-- ===== 9. backup_history: إضافة الأعمدة الناقصة =====
ALTER TABLE backup_history ADD COLUMN IF NOT EXISTS backup_type VARCHAR(20) DEFAULT 'manual';
ALTER TABLE backup_history ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'success';
ALTER TABLE backup_history ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE backup_history ADD COLUMN IF NOT EXISTS user_role VARCHAR(50);
-- نسخ البيانات من created_by إلى user_role
UPDATE backup_history SET user_role = created_by WHERE user_role IS NULL AND created_by IS NOT NULL;

-- ===== 10. roles: إضافة display_name و is_system =====
ALTER TABLE roles ADD COLUMN IF NOT EXISTS display_name VARCHAR(100);
ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE;
UPDATE roles SET display_name = name WHERE display_name IS NULL;
-- تحديد الأدوار الأساسية كـ system
UPDATE roles SET is_system = TRUE WHERE name IN ('Super Admin', 'Manager', 'Pharmacist', 'Cashier');

-- ===== 11. permissions: إضافة display_name و category =====
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS display_name VARCHAR(200);
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS category VARCHAR(50);
UPDATE permissions SET display_name = description WHERE display_name IS NULL AND description IS NOT NULL;
-- تصنيف الصلاحيات
UPDATE permissions SET category = 'pos' WHERE name LIKE 'pos.%';
UPDATE permissions SET category = 'inventory' WHERE name LIKE 'inventory.%';
UPDATE permissions SET category = 'accounting' WHERE name LIKE 'accounting.%';
UPDATE permissions SET category = 'reports' WHERE name LIKE 'reports.%';
UPDATE permissions SET category = 'system' WHERE name LIKE 'system.%';
