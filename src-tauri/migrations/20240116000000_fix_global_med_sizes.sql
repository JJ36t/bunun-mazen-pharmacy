-- ========================================
-- Migration 16: Fix global_medicines column sizes
-- ========================================
-- المشكلة: بعض قيم category من OpenFDA تصل لـ 84 حرف
-- لكن العمود محدود بـ VARCHAR(50)
-- الحل: توسيع الأعمدة لاستيعاب القيم الكبيرة
-- ========================================

-- توسيع category من 50 إلى 150
ALTER TABLE global_medicines ALTER COLUMN category TYPE VARCHAR(150);

-- توسيع route من 30 إلى 100 (بعض القيم مركبة)
ALTER TABLE global_medicines ALTER COLUMN route TYPE VARCHAR(100);

-- توسيع strength من 30 إلى 80 (بعض القيم مركبة)
ALTER TABLE global_medicines ALTER COLUMN strength TYPE VARCHAR(80);

-- توسيع dosage_form_ar من 50 إلى 100
ALTER TABLE global_medicines ALTER COLUMN dosage_form_ar TYPE VARCHAR(100);

-- توسيع source من 30 إلى 50
ALTER TABLE global_medicines ALTER COLUMN source TYPE VARCHAR(50);

-- توسيع dosage_form من 50 إلى 100 (بعض القيم مثل "tablet, film coated" وصلت لـ 46)
ALTER TABLE global_medicines ALTER COLUMN dosage_form TYPE VARCHAR(100);

-- اقتطاع القيم الحالية إذا كانت أطول من الحد الجديد (احتياط)
UPDATE global_medicines SET category = LEFT(category, 150) WHERE category IS NOT NULL AND LENGTH(category) > 150;
UPDATE global_medicines SET route = LEFT(route, 100) WHERE route IS NOT NULL AND LENGTH(route) > 100;
UPDATE global_medicines SET strength = LEFT(strength, 80) WHERE strength IS NOT NULL AND LENGTH(strength) > 80;
