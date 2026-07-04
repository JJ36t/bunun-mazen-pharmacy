-- ========================================
-- Migration 10: Ensure medicines have stock + varied prices + profits
-- ========================================

UPDATE medicines SET quantity = 50 WHERE quantity = 0 AND is_deleted = FALSE;

UPDATE medicines SET expiry_date = (CURRENT_DATE + INTERVAL '1 year')::date
WHERE expiry_date IS NULL AND is_deleted = FALSE;

UPDATE medicines SET
    cost_price = 200 + (ABS(hashtext(id::text)) % 48) * 100,
    price = 300 + (ABS(hashtext(id::text || 'p')) % 47) * 100,
    wholesale_price = 250 + (ABS(hashtext(id::text || 'w')) % 48) * 100
WHERE is_deleted = FALSE;

UPDATE medicines SET price = cost_price + 200 WHERE price <= cost_price AND is_deleted = FALSE;

UPDATE medicines SET wholesale_price = (cost_price + price) / 2
WHERE (wholesale_price < cost_price OR wholesale_price > price) AND is_deleted = FALSE;

INSERT INTO medicine_batches (medicine_id, batch_number, expiry_date, quantity)
SELECT m.id, 'BATCH-' || SUBSTRING(m.id::text, 1, 8), m.expiry_date, m.quantity
FROM medicines m
WHERE m.is_deleted = FALSE
  AND NOT EXISTS (SELECT 1 FROM medicine_batches mb WHERE mb.medicine_id = m.id);

UPDATE medicine_batches SET quantity = m.quantity
FROM medicines m
WHERE medicine_batches.medicine_id = m.id AND m.is_deleted = FALSE;