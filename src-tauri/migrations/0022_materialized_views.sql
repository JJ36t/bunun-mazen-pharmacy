-- Migration 0022: Materialized views for reports
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_monthly_sales AS
SELECT DATE_TRUNC('month', created_at) AS month, user_role,
    COUNT(id) AS invoice_count, COALESCE(SUM(total_amount), 0) AS total_sales,
    COALESCE(SUM(profit_amount), 0) AS total_profit, COALESCE(SUM(discount_amount), 0) AS total_discount
FROM invoices WHERE is_archived = FALSE OR is_archived IS NULL
GROUP BY DATE_TRUNC('month', created_at), user_role;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_monthly_sales_month_role ON mv_monthly_sales(month, user_role);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_daily_sales AS
SELECT created_at::date AS day, user_role,
    COUNT(id) AS invoice_count, COALESCE(SUM(total_amount), 0) AS total_sales,
    COALESCE(SUM(profit_amount), 0) AS total_profit, COALESCE(SUM(discount_amount), 0) AS total_discount
FROM invoices WHERE total_amount > 0
GROUP BY created_at::date, user_role;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_daily_sales_day_role ON mv_daily_sales(day, user_role);

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_top_medicines AS
SELECT name_ar, SUM(quantity) AS total_qty, SUM(quantity * price) AS total_revenue, COUNT(*) AS sale_count
FROM invoice_items GROUP BY name_ar;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_top_medicines_name ON mv_top_medicines(name_ar);

CREATE OR REPLACE FUNCTION refresh_all_materialized_views() RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW mv_monthly_sales;
    REFRESH MATERIALIZED VIEW mv_daily_sales;
    REFRESH MATERIALIZED VIEW mv_top_medicines;
END;
$$ LANGUAGE plpgsql;
