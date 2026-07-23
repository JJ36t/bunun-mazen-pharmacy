-- ========================================
-- Migration 0033: Add batch_id to invoice_items for FEFO tracking
-- ========================================
-- Root cause: invoice_items had no batch_id column. When a sale deducted
-- from medicine_batches (FEFO), the link was lost. Refunds and invoice
-- deletions restored quantities to the WRONG batch (latest or nearest
-- expiry instead of the original).
--
-- Fix: Add batch_id column to invoice_items. record_sale_db will store
-- which batch each item was deducted from. Refunds/deletions restore
-- to that exact batch.
-- ========================================

ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS batch_id UUID;

-- Index for faster batch-based queries
CREATE INDEX IF NOT EXISTS idx_invoice_items_batch ON invoice_items(batch_id) WHERE batch_id IS NOT NULL;

-- FK constraint (deferred — batch may be deleted later)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_inv_items_batch' AND table_name = 'invoice_items'
    ) THEN
        ALTER TABLE invoice_items ADD CONSTRAINT fk_inv_items_batch
            FOREIGN KEY (batch_id) REFERENCES medicine_batches(id) ON DELETE SET NULL;
    END IF;
END $$;
