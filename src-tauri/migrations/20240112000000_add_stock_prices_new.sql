-- ========================================
-- Migration 12: Add stock + prices + expiry (NEW - will run on existing DB)
-- ========================================

-- 50 كمية لكل دواء بكمية 0 أو أقل
UPDATE medicines SET quantity = 50 WHERE quantity <= 0 AND is_deleted = FALSE;

-- تاريخ انتهاء لكل دواء بدون تاريخ
UPDATE medicines SET expiry_date = (CURRENT_DATE + INTERVAL '1 year')::date 
WHERE expiry_date IS NULL AND is_deleted = FALSE;

-- أسعار متفاوتة لكل دواء (بناءً على UUID)
UPDATE medicines SET 
    cost_price = 200 + (CAST('x' || SUBSTRING(CAST(id AS TEXT) FROM 1 FOR 2) AS INTEGER) % 48) * 100
WHERE (cost_price = 0 OR cost_price = 700) AND is_deleted = FALSE;

UPDATE medicines SET 
    price = 300 + (CAST('x' || SUBSTRING(CAST(id AS TEXT) FROM 1 FOR 2) AS INTEGER) % 47) * 100
WHERE (price = 0 OR price = 1000) AND is_deleted = FALSE;

UPDATE medicines SET 
    wholesale_price = 250 + (CAST('x' || SUBSTRING(CAST(id AS TEXT) FROM 1 FOR 2) AS INTEGER) % 48) * 100
WHERE (wholesale_price = 0 OR wholesale_price = 900) AND is_deleted = FALSE;

-- ضمان: سعر البيع > سعر التكلفة
UPDATE medicines SET price = cost_price + 200 
WHERE price <= cost_price AND is_deleted = FALSE;

-- ضمان: سعر الجملة بين التكلفة والمفرد
UPDATE medicines SET wholesale_price = (cost_price + price) / 2 
WHERE (wholesale_price < cost_price OR wholesale_price > price) AND is_deleted = FALSE;

-- دفعة لكل دواء بدون دفعة
INSERT INTO medicine_batches (medicine_id, batch_number, expiry_date, quantity)
SELECT m.id, 'BATCH-' || SUBSTRING(m.id::text, 1, 8), m.expiry_date, m.quantity
FROM medicines m
WHERE m.is_deleted = FALSE
  AND NOT EXISTS (SELECT 1 FROM medicine_batches mb WHERE mb.medicine_id = m.id);

-- تحديث كميات الدفعات
UPDATE medicine_batches SET quantity = m.quantity 
FROM medicines m 
WHERE medicine_batches.medicine_id = m.id AND m.is_deleted = FALSE;
