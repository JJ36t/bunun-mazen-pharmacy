-- ========================================
-- Migration 0031: Audit log tamper-proof triggers
-- ========================================
-- Root cause: audit_logs had NO triggers to prevent DELETE or UPDATE.
-- Any DB user could wipe or modify audit entries — violating pharmacy
-- compliance requirements (audit trail must be immutable).
--
-- Fix: Add BEFORE DELETE and BEFORE UPDATE triggers that raise exceptions.
-- Only the system (via SECURITY DEFINER function) can modify audit_logs.
--
-- Note: This is defense-in-depth. The app role should also have
-- REVOKE DELETE ON audit_logs FROM the app DB user.
-- ========================================

-- Create a function that prevents modification of audit_logs
CREATE OR REPLACE FUNCTION prevent_audit_log_modification() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'لا يمكن تعديل أو حذف سجلات التدقيق. هذا مخالف للامتثال الصيدلي.';
END;
$$ LANGUAGE plpgsql;

-- BEFORE DELETE trigger
DROP TRIGGER IF EXISTS trg_prevent_audit_delete ON audit_logs;
CREATE TRIGGER trg_prevent_audit_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_log_modification();

-- BEFORE UPDATE trigger
DROP TRIGGER IF EXISTS trg_prevent_audit_update ON audit_logs;
CREATE TRIGGER trg_prevent_audit_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_log_modification();
