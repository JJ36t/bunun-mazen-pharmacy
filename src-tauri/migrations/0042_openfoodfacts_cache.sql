-- ========================================
-- Migration 0042: OpenFoodFacts response cache
-- ========================================
-- Reduces external API calls and speeds up barcode lookups.
-- OpenFoodFacts API is free but slow (200-500ms per request); cache for 7 days.
-- ========================================

CREATE TABLE IF NOT EXISTS openfoodfacts_cache (
    barcode          TEXT PRIMARY KEY,
    product_name     TEXT,
    brand_name       TEXT,
    categories       TEXT,
    quantity         TEXT,
    image_url        TEXT,
    raw_response     JSONB NOT NULL,
    fetched_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    hit_count        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_off_cache_expires
    ON openfoodfacts_cache(expires_at);

CREATE INDEX IF NOT EXISTS idx_off_cache_barcode
    ON openfoodfacts_cache(barcode);

-- Function: get cached entry if fresh
CREATE OR REPLACE FUNCTION get_off_cache(p_barcode TEXT)
RETURNS TABLE (
    product_name TEXT,
    brand_name TEXT,
    categories TEXT,
    quantity TEXT,
    image_url TEXT,
    raw_response JSONB
) AS $$
    UPDATE openfoodfacts_cache
    SET hit_count = hit_count + 1
    WHERE barcode = p_barcode AND expires_at > NOW()
    RETURNING product_name, brand_name, categories, quantity, image_url, raw_response;
$$ LANGUAGE sql;

-- Function: upsert cache entry
CREATE OR REPLACE FUNCTION upsert_off_cache(
    p_barcode TEXT,
    p_product_name TEXT,
    p_brand_name TEXT,
    p_categories TEXT,
    p_quantity TEXT,
    p_image_url TEXT,
    p_raw_response JSONB
) RETURNS VOID AS $$
    INSERT INTO openfoodfacts_cache (barcode, product_name, brand_name, categories, quantity, image_url, raw_response, fetched_at, expires_at, hit_count)
    VALUES (p_barcode, p_product_name, p_brand_name, p_categories, p_quantity, p_image_url, p_raw_response, NOW(), NOW() + INTERVAL '7 days', 0)
    ON CONFLICT (barcode) DO UPDATE SET
        product_name = EXCLUDED.product_name,
        brand_name = EXCLUDED.brand_name,
        categories = EXCLUDED.categories,
        quantity = EXCLUDED.quantity,
        image_url = EXCLUDED.image_url,
        raw_response = EXCLUDED.raw_response,
        fetched_at = NOW(),
        expires_at = NOW() + INTERVAL '7 days';
$$ LANGUAGE sql;

-- Function: cleanup expired entries (call from cron / startup)
CREATE OR REPLACE FUNCTION cleanup_off_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM openfoodfacts_cache WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
