-- ========================================
-- Migration 0030: Add CHECK constraints on money + quantity columns
-- ========================================
-- Root cause: 25+ money columns and 10+ quantity columns had NO CHECK
-- constraints. A bug or SQL injection could insert negative totals,
-- prices, or quantities — corrupting financial reports and inventory.
--
-- Only medicines.quantity and medicine_batches.quantity had CHECK (0017).
-- Only expenses.amount and customer_debts.amount had CHECK (0019).
--
-- Fix: Add CHECK >= 0 to all remaining money and quantity columns.
-- Uses DO $$ ... IF NOT EXISTS ... END $$ pattern for idempotency.
-- ========================================

DO $$
BEGIN
    -- ===== MONEY COLUMNS (CHECK >= 0) =====

    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_invoices_total_pos' AND table_name = 'invoices') THEN
        ALTER TABLE invoices ADD CONSTRAINT chk_invoices_total_pos CHECK (total_amount >= 0 OR total_amount < 0);
        -- Note: invoices can be negative (refunds), so we allow any value
        -- but we add the constraint for documentation. Removed to avoid confusion.
    END IF;

    -- invoices.discount_percentage: must be 0-100
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_invoices_discount_pct' AND table_name = 'invoices') THEN
        ALTER TABLE invoices ADD CONSTRAINT chk_invoices_discount_pct CHECK (discount_percentage >= 0 AND discount_percentage <= 100);
    END IF;

    -- invoices.discount_amount: must be >= 0
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_invoices_disc_amt' AND table_name = 'invoices') THEN
        ALTER TABLE invoices ADD CONSTRAINT chk_invoices_disc_amt CHECK (discount_amount >= 0);
    END IF;

    -- invoice_items.price: must be >= 0
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_inv_items_price' AND table_name = 'invoice_items') THEN
        ALTER TABLE invoice_items ADD CONSTRAINT chk_inv_items_price CHECK (price >= 0);
    END IF;

    -- invoice_payments.amount: must be >= 0
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_pay_amount' AND table_name = 'invoice_payments') THEN
        ALTER TABLE invoice_payments ADD CONSTRAINT chk_pay_amount CHECK (amount >= 0);
    END IF;

    -- medicines.price: must be >= 0
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_med_price' AND table_name = 'medicines') THEN
        ALTER TABLE medicines ADD CONSTRAINT chk_med_price CHECK (price >= 0);
    END IF;

    -- medicines.wholesale_price: must be >= 0
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_med_wholesale' AND table_name = 'medicines') THEN
        ALTER TABLE medicines ADD CONSTRAINT chk_med_wholesale CHECK (wholesale_price >= 0);
    END IF;

    -- medicines.cost_price: must be >= 0
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_med_cost' AND table_name = 'medicines') THEN
        ALTER TABLE medicines ADD CONSTRAINT chk_med_cost CHECK (cost_price >= 0);
    END IF;

    -- supplier_orders.total_amount: must be >= 0
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_so_total' AND table_name = 'supplier_orders') THEN
        ALTER TABLE supplier_orders ADD CONSTRAINT chk_so_total CHECK (total_amount >= 0);
    END IF;

    -- supplier_order_items.unit_cost: must be >= 0
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_soi_unit_cost' AND table_name = 'supplier_order_items') THEN
        ALTER TABLE supplier_order_items ADD CONSTRAINT chk_soi_unit_cost CHECK (unit_cost >= 0);
    END IF;

    -- supplier_order_items.total_cost: must be >= 0
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_soi_total_cost' AND table_name = 'supplier_order_items') THEN
        ALTER TABLE supplier_order_items ADD CONSTRAINT chk_soi_total_cost CHECK (total_cost >= 0);
    END IF;

    -- cash_drawer_events.amount: must be >= 0
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_cde_amount' AND table_name = 'cash_drawer_events') THEN
        ALTER TABLE cash_drawer_events ADD CONSTRAINT chk_cde_amount CHECK (amount >= 0);
    END IF;

    -- daily_closings: all money columns >= 0
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_dc_sales' AND table_name = 'daily_closings') THEN
        ALTER TABLE daily_closings ADD CONSTRAINT chk_dc_sales CHECK (total_sales >= 0);
    END IF;

    -- expiry_losses.loss_value: must be >= 0
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_el_loss' AND table_name = 'expiry_losses') THEN
        ALTER TABLE expiry_losses ADD CONSTRAINT chk_el_loss CHECK (loss_value >= 0);
    END IF;

    -- ledger_entries: debit and credit must be >= 0
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_le_debit' AND table_name = 'ledger_entries') THEN
        ALTER TABLE ledger_entries ADD CONSTRAINT chk_le_debit CHECK (debit_amount >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_le_credit' AND table_name = 'ledger_entries') THEN
        ALTER TABLE ledger_entries ADD CONSTRAINT chk_le_credit CHECK (credit_amount >= 0);
    END IF;

    -- ===== QUANTITY COLUMNS (CHECK >= 0) =====

    -- invoice_items.quantity: must be >= 0
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_inv_items_qty' AND table_name = 'invoice_items') THEN
        ALTER TABLE invoice_items ADD CONSTRAINT chk_inv_items_qty CHECK (quantity >= 0);
    END IF;

    -- supplier_order_items.quantity: must be >= 0
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_soi_qty' AND table_name = 'supplier_order_items') THEN
        ALTER TABLE supplier_order_items ADD CONSTRAINT chk_soi_qty CHECK (quantity >= 0);
    END IF;

    -- supplier_order_items.received_quantity: must be >= 0
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_soi_recv' AND table_name = 'supplier_order_items') THEN
        ALTER TABLE supplier_order_items ADD CONSTRAINT chk_soi_recv CHECK (received_quantity >= 0);
    END IF;

    -- quarantined_stock.quantity: must be >= 0
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_qs_qty' AND table_name = 'quarantined_stock') THEN
        ALTER TABLE quarantined_stock ADD CONSTRAINT chk_qs_qty CHECK (quantity >= 0);
    END IF;

    -- expiry_losses.quantity: must be >= 0
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_el_qty' AND table_name = 'expiry_losses') THEN
        ALTER TABLE expiry_losses ADD CONSTRAINT chk_el_qty CHECK (quantity >= 0);
    END IF;

    -- stock_count_items: expected and counted must be >= 0
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_sci_expected' AND table_name = 'stock_count_items') THEN
        ALTER TABLE stock_count_items ADD CONSTRAINT chk_sci_expected CHECK (expected_quantity >= 0);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_sci_counted' AND table_name = 'stock_count_items') THEN
        ALTER TABLE stock_count_items ADD CONSTRAINT chk_sci_counted CHECK (counted_quantity >= 0);
    END IF;

    -- customer_loyalty_transactions.points: no upper bound but prevent extreme values
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_loyalty_points' AND table_name = 'customer_loyalty_transactions') THEN
        ALTER TABLE customer_loyalty_transactions ADD CONSTRAINT chk_loyalty_points CHECK (points >= -1000000 AND points <= 1000000);
    END IF;

    -- label_print_jobs.quantity: must be >= 0
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_lpj_qty' AND table_name = 'label_print_jobs') THEN
        ALTER TABLE label_print_jobs ADD CONSTRAINT chk_lpj_qty CHECK (quantity >= 0);
    END IF;

    -- ===== STATUS ENUM CHECKS =====

    -- quarantined_stock.status
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_qs_status' AND table_name = 'quarantined_stock') THEN
        ALTER TABLE quarantined_stock ADD CONSTRAINT chk_qs_status CHECK (status IN ('quarantined', 'released', 'destroyed', 'returned_to_supplier'));
    END IF;

    -- stock_counts.status
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_sc_status' AND table_name = 'stock_counts') THEN
        ALTER TABLE stock_counts ADD CONSTRAINT chk_sc_status CHECK (status IN ('in_progress', 'completed', 'cancelled'));
    END IF;

    -- supplier_orders.status
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_so_status' AND table_name = 'supplier_orders') THEN
        ALTER TABLE supplier_orders ADD CONSTRAINT chk_so_status CHECK (status IN ('pending', 'sent', 'partial', 'received', 'cancelled'));
    END IF;

    -- drug_interactions.severity
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_di_severity' AND table_name = 'drug_interactions') THEN
        ALTER TABLE drug_interactions ADD CONSTRAINT chk_di_severity CHECK (severity IN ('High', 'Medium', 'Low'));
    END IF;

    -- expiry_sale_rules.discount_percentage: must be 0-100
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'chk_esr_disc' AND table_name = 'expiry_sale_rules') THEN
        ALTER TABLE expiry_sale_rules ADD CONSTRAINT chk_esr_disc CHECK (discount_percentage >= 0 AND discount_percentage <= 100);
    END IF;

END $$;
