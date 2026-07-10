-- Migration 0017: إضافة أعمدة المرتجعات + قيود الكميات
-- 1. أعمدة المرتجعات في invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS refund_reason_code VARCHAR(50);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS refund_notes TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS refund_approved_by VARCHAR(100);

-- 2. قيود الكميات غير السالبة
ALTER TABLE medicines ADD CONSTRAINT IF NOT EXISTS chk_quantity_nonneg CHECK (quantity >= 0);
ALTER TABLE medicine_batches ADD CONSTRAINT IF NOT EXISTS chk_batch_qty_nonneg CHECK (quantity >= 0);

-- 3. فهرس على audit_logs لتسريع rate-limit
CREATE INDEX IF NOT EXISTS idx_audit_login_failed ON audit_logs(user_role, action_type, created_at) WHERE action_type = 'LOGIN_FAILED';

-- 4. فهرس على invoices.is_reversed
CREATE INDEX IF NOT EXISTS idx_invoices_reversed ON invoices(is_reversed) WHERE is_reversed = TRUE;
