-- Migration 0016: إضافة idempotency_key لجدول invoices (لمنع تكرار البيع عند الانهيار)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100);
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_idempotency ON invoices(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- إضافة عمود category للنفقات (كان مفقوداً لكن UI يستخدمه)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'operational';

-- إضافة عمود printer_settings JSONB للإعدادات المتقدمة
ALTER TABLE settings ADD COLUMN IF NOT EXISTS description TEXT;
