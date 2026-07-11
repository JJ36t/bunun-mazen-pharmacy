-- Migration 0019: Security hardening
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_audit_login_failed
    ON audit_logs(user_role, action_type, created_at)
    WHERE action_type IN ('LOGIN_FAILED', 'ROLE_SPOOFING_ATTEMPT');

CREATE TABLE IF NOT EXISTS daily_closings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    closing_date DATE NOT NULL UNIQUE,
    total_sales DECIMAL(12,2) DEFAULT 0,
    total_profit DECIMAL(12,2) DEFAULT 0,
    total_discount DECIMAL(12,2) DEFAULT 0,
    invoice_count INTEGER DEFAULT 0,
    closed_by VARCHAR(50),
    closed_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_invoices_archived ON invoices(is_archived) WHERE is_archived = TRUE;

INSERT INTO settings (key, value, description)
VALUES ('max_discount_amount', '100000', 'الحد الأقصى للخصم المطلق بالدينار العراقي')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value, description)
VALUES ('session_timeout_minutes', '480', 'مدة صلاحية الجلسة بالدقائق')
ON CONFLICT (key) DO NOTHING;

-- PostgreSQL doesn't support :: cast in CREATE INDEX — use expression index without it
-- The daily report query uses created_at::date, but we index created_at directly
CREATE INDEX IF NOT EXISTS idx_invoices_daily_date
    ON invoices(created_at, total_amount)
    WHERE total_amount > 0;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name = 'chk_expense_amount_pos' AND table_name = 'expenses') THEN
        ALTER TABLE expenses ADD CONSTRAINT chk_expense_amount_pos CHECK (amount >= 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name = 'chk_debt_amount_pos' AND table_name = 'customer_debts') THEN
        ALTER TABLE customer_debts ADD CONSTRAINT chk_debt_amount_pos CHECK (amount >= 0);
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_national_id_unique
    ON patients(national_id) WHERE national_id IS NOT NULL AND national_id != '';
