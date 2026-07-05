-- ========================================
-- Migration 0007: Test Data for Feature Testing
-- ========================================
-- يضيف أدوية تجريبية لاختبار كل الميزات:
-- - أدوية منتهية الصلاحية (للفحص اليومي)
-- - أدوية قاربت الانتهاء (للفحص اليومي)
-- - أدوية مخزون منخفض (للفحص اليومي)
-- - أدوية لها تفاعلات (Warfarin + Aspirin لفحص التفاعلات)
-- - أدوية عادية للبيع
-- ========================================

-- أدوية عادية للبيع (10 أدوية)
INSERT INTO medicines (name_ar, name_en, scientific_name, barcode, price, wholesale_price, cost_price, quantity, batch_number, expiry_date) VALUES
('باراسيتامول 500mg', 'Paracetamol', 'Paracetamol', '2000000000017', 500, 450, 400, 100, 'BATCH-PARA-001', '2027-12-31'),
('بنادول 500mg', 'Panadol', 'Paracetamol', '2000000000024', 1000, 900, 800, 50, 'BATCH-PANA-001', '2027-06-30'),
('ايبوبروفين 400mg', 'Ibuprofen', 'Ibuprofen', '2000000000031', 750, 700, 650, 80, 'BATCH-IBU-001', '2027-09-30'),
('بروفين 400mg', 'Brufen', 'Ibuprofen', '2000000000048', 1200, 1100, 1000, 60, 'BATCH-BRUF-001', '2027-03-31'),
('اسبرين 100mg', 'Aspirin', 'Aspirin', '2000000000055', 300, 250, 200, 40, 'BATCH-ASP-001', '2027-11-30'),
('أموكسيسيلين 500mg', 'Amoxicillin', 'Amoxicillin', '2000000000062', 1500, 1400, 1300, 30, 'BATCH-AMOX-001', '2027-08-31'),
('أوغمنتين 1g', 'Augmentin', 'Amoxicillin', '2000000000079', 3000, 2800, 2600, 25, 'BATCH-AUG-001', '2027-05-31'),
('أوميبرازول 20mg', 'Omeprazole', 'Omeprazole', '2000000000086', 800, 750, 700, 70, 'BATCH-OME-001', '2027-07-31'),
('ميتفورمين 500mg', 'Metformin', 'Metformin', '2000000000093', 600, 550, 500, 90, 'BATCH-MET-001', '2027-10-31'),
('أتورفاستاتين 20mg', 'Atorvastatin', 'Atorvastatin', '2000000000109', 2000, 1900, 1800, 45, 'BATCH-ATOR-001', '2027-04-30')
ON CONFLICT (barcode) DO NOTHING;

-- أدوية لاختبار التفاعلات (Warfarin + Aspirin = تفاعل خطير!)
INSERT INTO medicines (name_ar, name_en, scientific_name, barcode, price, wholesale_price, cost_price, quantity, batch_number, expiry_date) VALUES
('وارفارين 5mg', 'Warfarin', 'Warfarin', '2000000000116', 2500, 2300, 2100, 20, 'BATCH-WAR-001', '2027-06-30'),
('ديكلوفيناك 50mg', 'Diclofenac', 'Diclofenac', '2000000000123', 500, 450, 400, 35, 'BATCH-DIC-001', '2027-09-30')
ON CONFLICT (barcode) DO NOTHING;

-- أدوية منتهية الصلاحية (3 أدوية — لاختبار الفحص اليومي)
INSERT INTO medicines (name_ar, name_en, scientific_name, barcode, price, wholesale_price, cost_price, quantity, batch_number, expiry_date) VALUES
('فيتامين C 1000mg (منتهي)', 'Vitamin C Expired', 'Ascorbic Acid', '2000000000130', 1000, 900, 800, 15, 'BATCH-VITC-OLD', '2025-01-01'),
('كالسيوم 600mg (منتهي)', 'Calcium Expired', 'Calcium Carbonate', '2000000000147', 1500, 1400, 1300, 10, 'BATCH-CAL-OLD', '2025-03-01'),
('زنك 50mg (منتهي)', 'Zinc Expired', 'Zinc', '2000000000154', 800, 700, 600, 8, 'BATCH-ZINC-OLD', '2025-02-01')
ON CONFLICT (barcode) DO NOTHING;

-- أدوية قاربت الانتهاء (3 أدوية — تنتهي خلال 30 يوم)
INSERT INTO medicines (name_ar, name_en, scientific_name, barcode, price, wholesale_price, cost_price, quantity, batch_number, expiry_date) VALUES
('سيتريزين 10mg (قارب الانتهاء)', 'Cetirizine Soon', 'Cetirizine', '2000000000161', 600, 550, 500, 25, 'BATCH-CET-SOON', CURRENT_DATE + 15),
('لوراتادين 10mg (قارب الانتهاء)', 'Loratadine Soon', 'Loratadine', '2000000000178', 700, 650, 600, 18, 'BATCH-LOR-SOON', CURRENT_DATE + 20),
('رانيتيدين 150mg (قارب الانتهاء)', 'Ranitidine Soon', 'Ranitidine', '2000000000185', 500, 450, 400, 22, 'BATCH-RAN-SOON', CURRENT_DATE + 25)
ON CONFLICT (barcode) DO NOTHING;

-- أدوية مخزون منخفض (3 أدوية — أقل من 20 وحدة)
INSERT INTO medicines (name_ar, name_en, scientific_name, barcode, price, wholesale_price, cost_price, quantity, batch_number, expiry_date) VALUES
('فوروسيميد 40mg (مخزون منخفض)', 'Furosemide Low', 'Furosemide', '2000000000192', 400, 350, 300, 5, 'BATCH-FUR-LOW', '2027-12-31'),
('ليفوثيروكسين 50mcg (مخزون منخفض)', 'Levothyroxine Low', 'Levothyroxine', '2000000000208', 1800, 1700, 1600, 3, 'BATCH-LEV-LOW', '2027-11-30'),
('بريدنيزولون 5mg (مخزون منخفض)', 'Prednisolone Low', 'Prednisolone', '2000000000215', 900, 850, 800, 8, 'BATCH-PRED-LOW', '2027-10-31')
ON CONFLICT (barcode) DO NOTHING;

-- إضافة الباركودات لجدول medicine_barcodes
INSERT INTO medicine_barcodes (medicine_id, barcode, barcode_type, barcode_scope, learned_at)
SELECT id, barcode, 'EAN13', 'internal', NOW()
FROM medicines
WHERE barcode IS NOT NULL AND barcode LIKE '200%'
  AND NOT EXISTS (SELECT 1 FROM medicine_barcodes mb WHERE mb.barcode = medicines.barcode)
ON CONFLICT (barcode, barcode_type) DO NOTHING;

-- إضافة دفعات للأدوية
INSERT INTO medicine_batches (medicine_id, batch_number, expiry_date, quantity)
SELECT id, batch_number, expiry_date, quantity
FROM medicines
WHERE batch_number IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM medicine_batches mb WHERE mb.medicine_id = medicines.id AND mb.batch_number = medicines.batch_number)
ON CONFLICT DO NOTHING;

-- ملاحظة: هذا الـ migration آمن للتشغيل المتكرر (ON CONFLICT DO NOTHING)
