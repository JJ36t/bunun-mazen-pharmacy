-- ========================================
-- Migration 0009: Reset Inventory, Sales, and Reports
-- ========================================
-- يصفّر كل البيانات التجريبية والاختبارية
-- يحافظ على: المستخدمين، الإعدادات، قاعدة الأدوية العالمية، التفاعلات
-- ========================================

-- ===== 1. تصفير المبيعات والفواتير =====
DELETE FROM invoice_items;
DELETE FROM invoice_payments;
DELETE FROM invoices;
DELETE FROM suspended_invoices;

-- ===== 2. تصفير المخزون =====
DELETE FROM medicine_batches;
DELETE FROM medicine_barcodes WHERE barcode_scope = 'internal';
DELETE FROM medicines;

-- ===== 3. تصفير المحاسبة =====
DELETE FROM customer_debts;
DELETE FROM expenses;
DELETE FROM customer_loyalty_transactions;

-- ===== 4. تصفير المرضى والوصفات =====
DELETE FROM prescription_items;
DELETE FROM prescriptions;
DELETE FROM patients;

-- ===== 5. تصفير الورديات والصندوق =====
DELETE FROM cash_drawer_balancing;
DELETE FROM cash_drawer_events;
DELETE FROM shifts;

-- ===== 6. تصفير الجرد والعزل =====
DELETE FROM stock_count_items;
DELETE FROM stock_counts;
DELETE FROM quarantined_stock;

-- ===== 7. تصفير التقارير والسجلات =====
DELETE FROM audit_logs;
DELETE FROM barcode_scan_logs;
DELETE FROM interaction_overrides;
DELETE FROM expiry_losses;
DELETE FROM price_history;
DELETE FROM label_print_jobs;
DELETE FROM backup_history;

-- ===== 8. تصفير الدفعات =====
DELETE FROM supplier_order_items;
DELETE FROM supplier_orders;

-- ===== 9. تصفير الجلسات =====
DELETE FROM draft_sessions;

-- ===== 10. إعادة تعيين الـ sequences =====
ALTER SEQUENCE IF EXISTS invoices_daily_receipt_number_seq RESTART WITH 1;

-- ===== 11. إعادة تعيين last_login للمستخدمين =====
UPDATE users SET last_login = NULL;

-- ===== ملاحظة =====
-- لم نحذف:
-- - users (المستخدمين)
-- - roles, permissions, role_permissions (الصلاحيات)
-- - settings (الإعدادات)
-- - payment_methods (طرق الدفع)
-- - suppliers (الموردين)
-- - refund_reasons (أسباب المرتجع)
-- - expiry_sale_rules (قواعد الانتهاء)
-- - feature_flags (الميزات)
-- - parent_drug_groups (مجموعات الأدوية)
-- - global_medicines (9,375 دواء عالمي)
-- - drug_interactions (1,051 تفاعل)
-- - ledger_accounts (الحسابات المحاسبية)
-- - ledger_entries (فارغة أصلاً)

SELECT 'Reset complete. Inventory, sales, and reports cleared.' as message;
SELECT COUNT(*) as users_count FROM users;
SELECT COUNT(*) as global_medicines_count FROM global_medicines;
SELECT COUNT(*) as drug_interactions_count FROM drug_interactions;
