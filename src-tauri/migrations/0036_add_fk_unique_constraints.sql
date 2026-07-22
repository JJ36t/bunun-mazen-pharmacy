-- ========================================
-- Migration 0036: Add missing FK constraints + UNIQUE constraints
-- ========================================
-- Root cause: many tables had bare UUID columns without FK constraints.
-- Orphan records could accumulate. Duplicate receipt numbers allowed.
-- ========================================

-- ===== FOREIGN KEYS =====

-- invoice_payments.payment_method_id → payment_methods
DO $$ BEGIN
    ALTER TABLE invoice_payments ADD CONSTRAINT fk_pay_method
        FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- medicine_barcodes.supplier_id → suppliers
DO $$ BEGIN
    ALTER TABLE medicine_barcodes ADD CONSTRAINT fk_barcode_supplier
        FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- print_jobs.related_invoice_id → invoices
DO $$ BEGIN
    ALTER TABLE print_jobs ADD CONSTRAINT fk_pj_invoice
        FOREIGN KEY (related_invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- interaction_overrides.invoice_id → invoices (0006 had no FK, 0014 duplicate had no FK)
DO $$ BEGIN
    ALTER TABLE interaction_overrides ADD CONSTRAINT fk_io_invoice
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- scan_audit_logs.matched_medicine_id → medicines
DO $$ BEGIN
    ALTER TABLE scan_audit_logs ADD CONSTRAINT fk_sal_medicine
        FOREIGN KEY (matched_medicine_id) REFERENCES medicines(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- barcode_scan_logs.matched_medicine_id → medicines
DO $$ BEGIN
    ALTER TABLE barcode_scan_logs ADD CONSTRAINT fk_bsl_medicine
        FOREIGN KEY (matched_medicine_id) REFERENCES medicines(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===== UNIQUE CONSTRAINTS =====

-- Unique daily receipt number per day (prevent duplicate receipt numbers)
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_daily_receipt_unique
    ON invoices(daily_receipt_number, created_at::date)
    WHERE daily_receipt_number IS NOT NULL;

-- Unique medicine_batches per medicine (prevent duplicate batch numbers for same medicine)
CREATE UNIQUE INDEX IF NOT EXISTS idx_batches_med_batch_unique
    ON medicine_batches(medicine_id, batch_number)
    WHERE batch_number IS NOT NULL;
