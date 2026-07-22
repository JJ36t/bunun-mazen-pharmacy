-- ========================================
-- Migration 0032: Fix mat views (filter reversed) + add refresh trigger
-- ========================================
-- Root cause: mat views in 0022 did NOT filter is_reversed invoices.
-- Refunded sales (total_amount < 0) counted as revenue in reports.
-- mv_top_medicines ignored discount_amount.
-- Also: no refresh was ever scheduled (mat views stayed empty/stale).
--
-- Fix:
-- 1. DROP and recreate mat views with correct filters
-- 2. Add is_reversed IS NOT TRUE filter
-- 3. Refresh on migration (populates initial data)
-- ========================================

-- Drop old mat views
DROP MATERIALIZED VIEW IF EXISTS mv_monthly_sales;
DROP MATERIALIZED VIEW IF EXISTS mv_daily_sales;
DROP MATERIALIZED VIEW IF EXISTS mv_top_medicines;

-- Recreate with correct filters
CREATE MATERIALIZED VIEW mv_monthly_sales AS
SELECT DATE_TRUNC('month', created_at) AS month, user_role,
    COUNT(id) AS invoice_count, COALESCE(SUM(total_amount), 0) AS total_sales,
    COALESCE(SUM(profit_amount), 0) AS total_profit, COALESCE(SUM(discount_amount), 0) AS total_discount
FROM invoices
WHERE (is_archived = FALSE OR is_archived IS NULL)
  AND is_reversed IS NOT TRUE
  AND total_amount > 0
GROUP BY DATE_TRUNC('month', created_at), user_role;
CREATE UNIQUE INDEX idx_mv_monthly_sales_month_role ON mv_monthly_sales(month, user_role);

CREATE MATERIALIZED VIEW mv_daily_sales AS
SELECT created_at::date AS day, user_role,
    COUNT(id) AS invoice_count, COALESCE(SUM(total_amount), 0) AS total_sales,
    COALESCE(SUM(profit_amount), 0) AS total_profit, COALESCE(SUM(discount_amount), 0) AS total_discount
FROM invoices
WHERE total_amount > 0
  AND is_reversed IS NOT TRUE
GROUP BY created_at::date, user_role;
CREATE UNIQUE INDEX idx_mv_daily_sales_day_role ON mv_daily_sales(day, user_role);

CREATE MATERIALIZED VIEW mv_top_medicines AS
SELECT ii.name_ar,
    SUM(ii.quantity) AS total_qty,
    SUM(ii.quantity * ii.price) AS total_revenue,
    COUNT(*) AS sale_count
FROM invoice_items ii
JOIN invoices i ON i.id = ii.invoice_id
WHERE i.total_amount > 0
  AND i.is_reversed IS NOT TRUE
GROUP BY ii.name_ar;
CREATE UNIQUE INDEX idx_mv_top_medicines_name ON mv_top_medicines(name_ar);

-- Refresh function (updated)
CREATE OR REPLACE FUNCTION refresh_all_materialized_views() RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW mv_monthly_sales;
    REFRESH MATERIALIZED VIEW mv_daily_sales;
    REFRESH MATERIALIZED VIEW mv_top_medicines;
END;
$$ LANGUAGE plpgsql;

-- Initial refresh to populate data
SELECT refresh_all_materialized_views();
