-- ========================================
-- Database Cleanup Script
-- ========================================
-- يُشغّل في PostgreSQL قبل إعادة تشغيل المشروع
-- يحل مشكلة numeric field overflow و migration الفاشل

-- تحذير: هذا سكريبت يحذف الجداول الناقصة ويعيد إنشائها
-- تأكد من عمل نسخة احتياطية أولاً!

-- ===== 1. حذف سجل migration الفاشل =====
DELETE FROM _sqlx_migrations WHERE version >= 20240102000000;

-- ===== 2. حذف الجداول الجديدة (إذا كانت موجودة جزئياً) =====

-- PharmIQ Complete Tables (Migration 4)
DROP TABLE IF EXISTS refund_reasons CASCADE;
DROP TABLE IF EXISTS supplier_pricing_history CASCADE;
DROP TABLE IF EXISTS supplier_returns CASCADE;
DROP TABLE IF EXISTS expiry_losses CASCADE;
DROP TABLE IF EXISTS expiry_transfer_suggestions CASCADE;
DROP TABLE IF EXISTS stop_purchase_suggestions CASCADE;
DROP TABLE IF EXISTS cash_drawer_events CASCADE;
DROP TABLE IF EXISTS cash_drawer_balancing CASCADE;
DROP TABLE IF EXISTS label_print_jobs CASCADE;
DROP TABLE IF EXISTS scan_mode_config CASCADE;
DROP TABLE IF EXISTS demand_forecast_models CASCADE;
DROP TABLE IF EXISTS parent_drug_groups CASCADE;
DROP TABLE IF EXISTS dosage_compatibility CASCADE;
DROP TABLE IF EXISTS gs1_parsed_barcodes CASCADE;
DROP TABLE IF EXISTS multi_pack_barcodes CASCADE;
DROP TABLE IF EXISTS profit_calculations CASCADE;

-- PharmIQ Intelligence Tables (Migration 3)
DROP TABLE IF EXISTS drug_master CASCADE;
DROP TABLE IF EXISTS drug_aliases CASCADE;
DROP TABLE IF EXISTS drug_substitutes CASCADE;
DROP TABLE IF EXISTS drug_interactions CASCADE;
DROP TABLE IF EXISTS drug_recalls CASCADE;
DROP TABLE IF EXISTS drug_pack_sizes CASCADE;
DROP TABLE IF EXISTS medicine_barcodes CASCADE;
DROP TABLE IF EXISTS barcode_scan_logs CASCADE;
DROP TABLE IF EXISTS pricing_tiers CASCADE;
DROP TABLE IF EXISTS medicine_pricing CASCADE;
DROP TABLE IF EXISTS supplier_orders CASCADE;
DROP TABLE IF EXISTS purchase_suggestions CASCADE;
DROP TABLE IF EXISTS demand_forecasts CASCADE;
DROP TABLE IF EXISTS dead_stock_analysis CASCADE;
DROP TABLE IF EXISTS expiry_risk_assessment CASCADE;
DROP TABLE IF EXISTS hardware_devices CASCADE;
DROP TABLE IF EXISTS branches CASCADE;
DROP TABLE IF EXISTS task_queue CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS payment_methods CASCADE;
DROP TABLE IF EXISTS invoice_payments CASCADE;
DROP TABLE IF EXISTS customer_loyalty_transactions CASCADE;
DROP TABLE IF EXISTS prescriptions CASCADE;
DROP TABLE IF EXISTS prescription_items CASCADE;
DROP TABLE IF EXISTS stock_counts CASCADE;
DROP TABLE IF EXISTS stock_count_items CASCADE;

-- Enterprise Enhancement Tables (Migration 2) - حذف الأعمدة الإضافية
ALTER TABLE users DROP COLUMN IF EXISTS role_id;
ALTER TABLE users DROP COLUMN IF EXISTS branch_id;
ALTER TABLE medicines DROP COLUMN IF EXISTS branch_id;
ALTER TABLE invoices DROP COLUMN IF EXISTS branch_id;
ALTER TABLE invoices DROP COLUMN IF EXISTS shift_id;
ALTER TABLE invoices DROP COLUMN IF EXISTS patient_id;
ALTER TABLE invoices DROP COLUMN IF EXISTS undo_reason;
ALTER TABLE invoices DROP COLUMN IF EXISTS discount_percentage;
ALTER TABLE invoices DROP COLUMN IF EXISTS refund_reason_code;
ALTER TABLE invoices DROP COLUMN IF EXISTS refund_approved_by;
ALTER TABLE invoices DROP COLUMN IF EXISTS refund_notes;
ALTER TABLE shifts DROP COLUMN IF EXISTS branch_id;
ALTER TABLE invoice_items DROP COLUMN IF EXISTS is_refund;
ALTER TABLE invoice_items DROP COLUMN IF EXISTS batch_id;
ALTER TABLE patients DROP COLUMN IF EXISTS loyalty_points;
ALTER TABLE patients DROP COLUMN IF EXISTS total_purchases;
ALTER TABLE patients DROP COLUMN IF EXISTS is_chronic;
ALTER TABLE patients DROP COLUMN IF EXISTS chronic_medicines;
ALTER TABLE suppliers DROP COLUMN IF EXISTS reliability_score;
ALTER TABLE suppliers DROP COLUMN IF EXISTS total_orders;
ALTER TABLE suppliers DROP COLUMN IF EXISTS delayed_orders;
ALTER TABLE suppliers DROP COLUMN IF EXISTS returned_orders;
ALTER TABLE suppliers DROP COLUMN IF EXISTS average_delivery_days;
ALTER TABLE suppliers DROP COLUMN IF EXISTS last_order_date;

-- Enterprise Enhancement Tables (Migration 2)
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS plugins CASCADE;
DROP TABLE IF EXISTS plugin_events CASCADE;
DROP TABLE IF EXISTS operation_journal CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS fraud_alerts CASCADE;
DROP TABLE IF EXISTS print_jobs CASCADE;
DROP TABLE IF EXISTS backup_history CASCADE;
DROP TABLE IF EXISTS performance_metrics CASCADE;

-- ===== 3. حذف الإعدادات الجديدة =====
DELETE FROM settings WHERE key IN (
    'theme', 'tax_enabled', 'tax_rate', 'invoice_footer', 'invoice_logo',
    'auto_backup_enabled', 'auto_backup_interval', 'max_print_retries',
    'fraud_detection_enabled', 'session_timeout', 'low_stock_threshold',
    'expiry_alert_days', 'default_pricing_tier', 'loyalty_points_per_dinar',
    'loyalty_point_value', 'antibiotic_control_enabled', 'drug_interaction_check_enabled',
    'demand_forecasting_enabled', 'auto_purchase_suggestions', 'sound_feedback_enabled',
    'default_currency', 'usd_exchange_rate', 'enable_multi_currency',
    'multi_branch_enabled', 'current_branch_id', 'refund_requires_approval',
    'refund_approval_threshold', 'cash_drawer_balance_required', 'label_default_size',
    'label_default_printer', 'scan_sound_enabled', 'expiry_loss_tracking',
    'supplier_pricing_history_days', 'stop_purchase_threshold_days',
    'demand_forecast_horizon_days', 'demand_forecast_min_data_points'
);

-- ===== 4. التحقق من نجاح التنظيف =====
SELECT 'Cleanup completed successfully!' as status;
SELECT COUNT(*) as remaining_tables FROM information_schema.tables WHERE table_schema = 'public';
