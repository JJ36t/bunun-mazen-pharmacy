-- ========================================
-- Migration 0011: Mobile Scanner — Enhanced Barcodes + Audit Logs
-- ========================================

-- ===== 1. تحسين جدول medicine_barcodes =====
ALTER TABLE medicine_barcodes ADD COLUMN IF NOT EXISTS normalized_barcode VARCHAR(100);
ALTER TABLE medicine_barcodes ADD COLUMN IF NOT EXISTS package_code VARCHAR(50);
ALTER TABLE medicine_barcodes ADD COLUMN IF NOT EXISTS package_type VARCHAR(30);
ALTER TABLE medicine_barcodes ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE;
ALTER TABLE medicine_barcodes ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_barcodes_normalized ON medicine_barcodes (normalized_barcode);

-- ===== 2. جدول أزواج الموبايل (Pairing Sessions) =====
CREATE TABLE IF NOT EXISTS mobile_pairing_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pairing_token VARCHAR(64) UNIQUE NOT NULL,
    device_name VARCHAR(100),
    device_ip VARCHAR(45),
    is_active BOOLEAN DEFAULT TRUE,
    paired_at TIMESTAMP DEFAULT NOW(),
    last_seen TIMESTAMP,
    expires_at TIMESTAMP
);

-- ===== 3. سجل عمليات المسح (Scan Audit Logs) =====
CREATE TABLE IF NOT EXISTS scan_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_name VARCHAR(100),
    device_ip VARCHAR(45),
    user_role VARCHAR(50),
    barcode_scanned VARCHAR(100) NOT NULL,
    barcode_type VARCHAR(30),
    normalized_barcode VARCHAR(100),
    scan_result VARCHAR(20),
    matched_medicine_id UUID,
    matched_medicine_name VARCHAR(200),
    scan_duration_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scan_audit_created ON scan_audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_scan_audit_barcode ON scan_audit_logs (normalized_barcode);

-- ===== 4. إعداد منفذ WebSocket =====
INSERT INTO settings (key, value, description) VALUES
    ('mobile_scanner_port', '8080', 'منفذ WebSocket لسيرفر الموبايل'),
    ('mobile_scanner_enabled', 'true', 'تفعيل سيرفر المسح اللاسلكي')
ON CONFLICT (key) DO NOTHING;

-- ===== 5. تحديث الباركودات الموجودة بـ normalized_barcode =====
UPDATE medicine_barcodes
SET normalized_barcode = barcode
WHERE normalized_barcode IS NULL AND barcode IS NOT NULL;
