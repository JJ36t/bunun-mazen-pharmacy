-- ========================================
-- Migration 10: Ensure medicines have stock + varied prices + profits
-- ========================================

-- إضافة 50 كمية لكل دواء بكمية 0
UPDATE medicines SET quantity = 50 WHERE quantity = 0 AND is_deleted = FALSE;

-- إضافة دفعة لكل دواء ليس له دفعة
INSERT INTO medicine_batches (medicine_id, batch_number, expiry_date, quantity)
SELECT m.id, COALESCE(m.batch_number, 'BATCH-' || SUBSTRING(m.id::text, 1, 8)), 
       COALESCE(m.expiry_date, (CURRENT_DATE + INTERVAL '1 year')::date),
       50
FROM medicines m
WHERE m.is_deleted = FALSE
  AND NOT EXISTS (SELECT 1 FROM medicine_batches mb WHERE mb.medicine_id = m.id);

-- تحديث تاريخ الانتهاء للأدوية التي لا تملك تاريخاً
UPDATE medicines SET expiry_date = (CURRENT_DATE + INTERVAL '1 year')::date 
WHERE expiry_date IS NULL AND is_deleted = FALSE;

-- تفاوت الأسعار: إذا كان السعر 0 أو متساوٍ لكل الأدوية، وزّع أسعاراً متفاوتة
-- السعر بين 500 و 50000 د.ع
UPDATE medicines SET 
    price = 500 + (CAST(SUBSTRING(CAST(m.id AS TEXT) FROM 1 FOR 2) AS INTEGER) % 100) * 500,
    wholesale_price = 400 + (CAST(SUBSTRING(CAST(m.id AS TEXT) FROM 1 FOR 2) AS INTEGER) % 100) * 400,
    cost_price = 300 + (CAST(SUBSTRING(CAST(m.id AS TEXT) FROM 1 FOR 2) AS INTEGER) % 100) * 300
FROM medicines m
WHERE medicines.id = m.id 
  AND medicines.is_deleted = FALSE
  AND (medicines.price = 0 OR medicines.price = 1000);

-- تحديث دفعات الأدوية بالكميات الجديدة
UPDATE medicine_batches SET quantity = m.quantity 
FROM medicines m 
WHERE medicine_batches.medicine_id = m.id AND m.is_deleted = FALSE;
