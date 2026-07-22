-- ========================================
-- Migration 0034: Add missing performance indexes
-- ========================================
-- Root cause: many hot query paths had no indexes, causing full table scans.
-- ========================================

-- invoices.user_role (cashier daily reports)
CREATE INDEX IF NOT EXISTS idx_invoices_user_role ON invoices(user_role);

-- audit_logs.user_role (what did user X do?)
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_role ON audit_logs(user_role, created_at DESC);

-- expenses.created_at + expenses.category
CREATE INDEX IF NOT EXISTS idx_expenses_created ON expenses(created_at);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- customer_debts.created_at (debt aging reports)
CREATE INDEX IF NOT EXISTS idx_debts_created ON customer_debts(created_at);

-- prescriptions.patient_id (cascade DELETE performance)
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient ON prescriptions(patient_id);

-- prescription_items.prescription_id (cascade DELETE + item lookup)
CREATE INDEX IF NOT EXISTS idx_presc_items_presc ON prescription_items(prescription_id);

-- cash_drawer_events.shift_id
CREATE INDEX IF NOT EXISTS idx_cde_shift ON cash_drawer_events(shift_id);

-- stock_count_items.stock_count_id + medicine_id
CREATE INDEX IF NOT EXISTS idx_sci_count ON stock_count_items(stock_count_id);
CREATE INDEX IF NOT EXISTS idx_sci_medicine ON stock_count_items(medicine_id);

-- quarantined_stock.medicine_id + status
CREATE INDEX IF NOT EXISTS idx_qs_medicine ON quarantined_stock(medicine_id);
CREATE INDEX IF NOT EXISTS idx_qs_status ON quarantined_stock(status) WHERE status = 'quarantined';

-- expiry_losses.medicine_id
CREATE INDEX IF NOT EXISTS idx_el_medicine ON expiry_losses(medicine_id);

-- medicine_batches.batch_number
CREATE INDEX IF NOT EXISTS idx_batches_batch_number ON medicine_batches(batch_number);

-- mobile_pairing_sessions.is_active (active pairings lookup)
CREATE INDEX IF NOT EXISTS idx_pairing_active ON mobile_pairing_sessions(is_active) WHERE is_active = TRUE;
